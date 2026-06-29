// src/services/exchange-rate.service.ts
// Obtiene y guarda la tasa de cambio diaria HNL/USD (tasa de VENTA) desde
// la página pública de Banpaís: https://www.corporacionbi.com/hn/banpais/
//
// La página publica el bloque "Precio Dólar — Compra: X.XXXX | Venta: Y.YYYY"
// como texto plano renderizado en el servidor (sin login, sin JavaScript),
// así que se extrae con una expresión regular sobre el HTML — no requiere
// navegador headless ni credenciales bancarias.
import axios from 'axios';
import { prisma } from '../config/database';

const BANPAIS_URL = 'https://www.corporacionbi.com/hn/banpais/';

// Regex simple sobre TEXTO PLANO (después de quitar etiquetas HTML).
// Mucho más robusto que intentar matchear tags directamente, ya que
// no importa cuántos <div>/<span>/<strong> haya entre "Compra:" y el número.
const PRECIO_DOLAR_REGEX =
  /Precio\s*D[oó]lar[\s\S]{0,200}?Compra:?\s*([\d.,]+)[\s\S]{0,100}?Venta:?\s*([\d.,]+)/i;

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
}

function parseNumber(raw: string): number {
  // Normaliza "26,8553" -> 26.8553 y descarta separadores de miles si los hubiera
  const cleaned = raw.trim().replace(/\s/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Formato con miles: 1,234.56
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.'));
  }
  return parseFloat(cleaned);
}

export class ExchangeRateService {
  /**
   * Obtiene la tasa (VENTA) más reciente de la BD.
   * Si no hay para hoy, la descarga de Banpaís y la guarda.
   */
  static async getTodayRate(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.exchangeRate.findUnique({ where: { date: today } });
    if (existing) return parseFloat(existing.rate.toString());

    return await this.fetchAndSave();
  }

  /**
   * Descarga la tasa de VENTA desde la página pública de Banpaís y la
   * guarda en el historial diario. Se llama desde el cron job (7am) y
   * como fallback en getTodayRate.
   */
  static async fetchAndSave(): Promise<number> {
    try {
      const { compra, venta } = await this.scrapeBanpais();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.exchangeRate.upsert({
        where: { date: today },
        update: { rate: venta, rateCompra: compra, source: 'Banpaís' },
        create: { date: today, rate: venta, rateCompra: compra, source: 'Banpaís' },
      });

      console.log(`💱 Tasa de venta Banpaís actualizada: L ${venta} por USD (compra: L ${compra})`);
      return venta;
    } catch (err) {
      console.error('⚠️ Error al obtener tipo de cambio de Banpaís:', err instanceof Error ? err.message : err);
      // Fallback: usar la última tasa disponible en la BD
      const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
      if (latest) {
        console.log(`💱 Usando última tasa conocida: L ${latest.rate}`);
        return parseFloat(latest.rate.toString());
      }
      throw new Error(
        'No se pudo obtener el tipo de cambio de Banpaís y no hay tasa previa registrada. ' +
        'Podés ingresarla manualmente desde Configuración → Tipo de Cambio.'
      );
    }
  }

  /**
   * Descarga el HTML público de Banpaís y extrae Compra/Venta del dólar.
   * Lanza un error descriptivo si la página cambia de estructura.
   */
  private static async scrapeBanpais(): Promise<{ compra: number; venta: number }> {
    const { data: html } = await axios.get<string>(BANPAIS_URL, {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const match = stripHtmlTags(html).match(PRECIO_DOLAR_REGEX);
    if (!match) {
      throw new Error('No se encontró el bloque "Precio Dólar" en la página de Banpaís (puede haber cambiado de estructura).');
    }

    const compra = parseNumber(match[1]);
    const venta = parseNumber(match[2]);

    if (!compra || !venta || venta <= 0 || compra <= 0) {
      throw new Error(`Valores de tasa inválidos extraídos de Banpaís (compra=${match[1]}, venta=${match[2]}).`);
    }
    // Sanity check: la venta debe ser mayor o igual a la compra, y ambas
    // razonablemente cerca del rango histórico del Lempira (evita guardar
    // basura si el regex agarra un número equivocado de la página).
    if (venta < compra) {
      throw new Error(`Tasa inconsistente: venta (${venta}) menor que compra (${compra}).`);
    }
    if (venta < 15 || venta > 50) {
      throw new Error(`Tasa de venta fuera de rango esperado: ${venta}`);
    }

    return { compra, venta };
  }

  /**
   * Obtiene la tasa de VENTA de un día específico (para registrar pagos
   * y facturas con la tasa vigente en esa fecha exacta).
   * Si no existe ese día (ej. fin de semana o aún no se ejecutó el cron),
   * usa la más cercana anterior disponible en el histórico.
   */
  static async getRateForDate(date: Date): Promise<number> {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const rate = await prisma.exchangeRate.findFirst({
      where: { date: { lte: d } },
      orderBy: { date: 'desc' },
    });

    if (rate) return parseFloat(rate.rate.toString());

    // No hay ninguna tasa anterior o igual a esa fecha (ej. la primera vez
    // que se usa el sistema). Como último recurso, intentamos descargar
    // la tasa de hoy para no dejar la operación sin tasa.
    return await this.fetchAndSave();
  }

  /** Lista el historial de tasas con paginación */
  static async getHistory(page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [rates, total] = await Promise.all([
      prisma.exchangeRate.findMany({ orderBy: { date: 'desc' }, skip, take: limit }),
      prisma.exchangeRate.count(),
    ]);
    return { rates, total };
  }
}
