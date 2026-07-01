// src/services/exchange-rate.service.ts
// Obtiene la tasa de cambio diaria HNL/USD (tasa de VENTA) desde la
// página pública de Ficohsa: https://www.ficohsa.hn/tasas-de-cambio
//
// Ficohsa publica "Dólar / Compra: L XX.XXXX / Venta: L XX.XXXX"
// como texto plano en HTML estático renderizado en el servidor — sin
// login, sin JavaScript, sin Puppeteer. Un simple axios.get() lo lee.
//
// Motivo del cambio vs Banpaís: Banpaís carga los valores del dólar
// con JavaScript (widget dinámico), por lo que axios no lo puede leer.
// Ficohsa sí lo renderiza en el HTML estático.
import axios from 'axios';
import { prisma } from '../config/database';

const FICOHSA_URL = 'https://www.ficohsa.hn/tasas-de-cambio';

// Estructura real del HTML de Ficohsa (confirmada):
//   "Dólar $  Compra  L 26.4600  Venta  L 26.5923"
// El regex trabaja sobre texto plano (sin tags HTML).
const PRECIO_DOLAR_REGEX =
  /D[oó]lar[\s\S]{0,80}?Compra\s+L\s*([\d.,]+)\s+Venta\s+L\s*([\d.,]+)/i;

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
}

function parseNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/,/g, ''));
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.'));
  }
  return parseFloat(cleaned);
}

export class ExchangeRateService {
  /**
   * Obtiene la tasa de VENTA de hoy desde la BD.
   * Si no existe, o si el registro viene de una fuente vieja
   * (ej. "ExchangeRate-API", "Banpaís"), lo vuelve a descargar
   * de Ficohsa y sobreescribe — evita quedarse pegado con un
   * valor residual de una fuente anterior.
   */
  static async getTodayRate(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.exchangeRate.findUnique({ where: { date: today } });
    const fuentesValidas = ['Ficohsa', 'Manual'];
    if (existing && fuentesValidas.includes(existing.source)) {
      return parseFloat(existing.rate.toString());
    }

    return await this.fetchAndSave();
  }

  /**
   * Descarga la tasa de VENTA desde Ficohsa y la guarda en el
   * historial diario (upsert — actualiza si ya existe).
   * Llamado desde el cron job (7am) y como fallback en getTodayRate.
   */
  static async fetchAndSave(): Promise<number> {
    try {
      const { compra, venta } = await this.scrapeFicohsa();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.exchangeRate.upsert({
        where: { date: today },
        update: { rate: venta, rateCompra: compra, source: 'Ficohsa' },
        create: { date: today, rate: venta, rateCompra: compra, source: 'Ficohsa' },
      });

      console.log(`💱 Tasa de venta Ficohsa actualizada: L ${venta} por USD (compra: L ${compra})`);
      return venta;
    } catch (err) {
      console.error('⚠️ Error al obtener tipo de cambio de Ficohsa:', err instanceof Error ? err.message : err);

      // Fallback: usar la última tasa guardada en la BD
      const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
      if (latest) {
        console.log(`💱 Usando última tasa conocida: L ${latest.rate}`);
        return parseFloat(latest.rate.toString());
      }
      throw new Error(
        'No se pudo obtener el tipo de cambio de Ficohsa y no hay tasa previa registrada. ' +
        'Ingresála manualmente desde Configuración → Tipo de Cambio.'
      );
    }
  }

  /**
   * Descarga y parsea el HTML público de Ficohsa.
   * Lanza un error descriptivo si la página cambia de estructura.
   */
  private static async scrapeFicohsa(): Promise<{ compra: number; venta: number }> {
    const { data: html } = await axios.get<string>(FICOHSA_URL, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const texto = stripHtmlTags(html);
    const match = texto.match(PRECIO_DOLAR_REGEX);

    if (!match) {
      throw new Error(
        'No se encontró el bloque "Dólar / Compra / Venta" en la página de Ficohsa. ' +
        'La estructura de la página puede haber cambiado.'
      );
    }

    const compra = parseNumber(match[1]);
    const venta  = parseNumber(match[2]);

    if (!compra || !venta || compra <= 0 || venta <= 0) {
      throw new Error(`Valores inválidos extraídos de Ficohsa (compra="${match[1]}", venta="${match[2]}")`);
    }
    if (venta < compra) {
      throw new Error(`Tasa inconsistente: venta (${venta}) menor que compra (${compra})`);
    }
    if (venta < 15 || venta > 50) {
      throw new Error(`Tasa de venta fuera del rango esperado para Lempiras: ${venta}`);
    }

    return { compra, venta };
  }

  /**
   * Obtiene la tasa de VENTA de una fecha específica.
   * Si no existe esa fecha exacta (ej. fin de semana, feriado),
   * usa la más cercana anterior disponible en el historial.
   * Garantiza que facturas y pagos queden con la tasa del día
   * en que se emitieron, no la tasa de hoy.
   */
  static async getRateForDate(date: Date): Promise<number> {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const rate = await prisma.exchangeRate.findFirst({
      where: { date: { lte: d } },
      orderBy: { date: 'desc' },
    });

    if (rate) return parseFloat(rate.rate.toString());

    // No hay ningún registro previo — primer arranque del sistema
    return await this.fetchAndSave();
  }

  /** Historial de tasas con paginación */
  static async getHistory(page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [rates, total] = await Promise.all([
      prisma.exchangeRate.findMany({ orderBy: { date: 'desc' }, skip, take: limit }),
      prisma.exchangeRate.count(),
    ]);
    return { rates, total };
  }
}
