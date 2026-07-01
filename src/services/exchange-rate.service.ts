// src/services/exchange-rate.service.ts
//
// FUENTE: API interna de Ficohsa que alimenta el widget "Cambio del día"
// de su página principal. Devuelve JSON con compra/venta del dólar.
//
// FALLBACK: API del Banco Central de Honduras (bch.hn/api/tipocambio).
//
// Si ambas fallan: usa la última tasa guardada en la BD, o pide
// ingreso manual desde Configuración → Tipo de Cambio.
import axios from 'axios';
import { prisma } from '../config/database';

// Endpoint interno de Ficohsa que alimenta el widget de tasa de cambio.
// Descubierto inspeccionando las peticiones XHR del navegador en ficohsa.hn
const FICOHSA_API_URL = 'https://www.ficohsa.hn/api/exchangeRate/getExchangeRate';

// Fallback: API del BCH (requiere fechas en formato YYYY-MM-DD)
const BCH_API_URL = 'https://www.bch.hn/api/tipocambio';

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
};

function parseRate(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.replace(',', '.'));
  return NaN;
}

function validarTasa(n: number): boolean {
  return !isNaN(n) && n >= 15 && n <= 50;
}

export class ExchangeRateService {
  /**
   * Obtiene la tasa de VENTA de hoy.
   * Si el registro de hoy viene de una fuente vieja (ej. "ExchangeRate-API",
   * "Banpaís") lo sobreescribe para corregir valores residuales.
   */
  static async getTodayRate(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.exchangeRate.findUnique({ where: { date: today } });
    const fuentesValidas = ['Ficohsa', 'BCH', 'Manual'];
    if (existing && fuentesValidas.includes(existing.source)) {
      return parseFloat(existing.rate.toString());
    }

    return await this.fetchAndSave();
  }

  /**
   * Descarga la tasa de VENTA e intenta múltiples fuentes en cascada.
   * Guarda el resultado en el historial diario (upsert).
   */
  static async fetchAndSave(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Intento 1: API interna de Ficohsa ──────────────────────────
    try {
      const { compra, venta } = await this.fetchFicohsaAPI();
      await prisma.exchangeRate.upsert({
        where: { date: today },
        update: { rate: venta, rateCompra: compra, source: 'Ficohsa' },
        create: { date: today, rate: venta, rateCompra: compra, source: 'Ficohsa' },
      });
      console.log(`💱 Tasa Ficohsa → Venta: L ${venta} | Compra: L ${compra}`);
      return venta;
    } catch (e1) {
      console.warn('⚠️ Ficohsa API falló:', (e1 as Error).message);
    }

    // ── Intento 2: API del Banco Central de Honduras ────────────────
    try {
      const { compra, venta } = await this.fetchBCH(today);
      await prisma.exchangeRate.upsert({
        where: { date: today },
        update: { rate: venta, rateCompra: compra, source: 'BCH' },
        create: { date: today, rate: venta, rateCompra: compra, source: 'BCH' },
      });
      console.log(`💱 Tasa BCH → Venta: L ${venta} | Compra: L ${compra}`);
      return venta;
    } catch (e2) {
      console.warn('⚠️ BCH API falló:', (e2 as Error).message);
    }

    // ── Fallback: última tasa guardada en la BD ─────────────────────
    const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    if (latest) {
      console.log(`💱 Usando última tasa conocida: L ${latest.rate} (${latest.source}, ${latest.date.toLocaleDateString('es-HN')})`);
      return parseFloat(latest.rate.toString());
    }

    throw new Error(
      'No se pudo obtener el tipo de cambio de ninguna fuente y no hay tasa previa registrada. ' +
      'Ingresála manualmente desde Configuración → Tipo de Cambio.'
    );
  }

  /**
   * API interna de Ficohsa que alimenta el widget "Cambio del día".
   * Devuelve la tasa oficial del día basada en el BCH.
   */
  private static async fetchFicohsaAPI(): Promise<{ compra: number; venta: number }> {
    const { data } = await axios.get(FICOHSA_API_URL, {
      timeout: 10000,
      headers: AXIOS_HEADERS,
    });

    // La respuesta puede ser un array o un objeto — probamos ambos formatos
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) throw new Error('Respuesta vacía de Ficohsa API');

    // Intentar distintos nombres de campo posibles
    const compra = parseRate(
      record.compra ?? record.purchasePrice ?? record.buyRate ??
      record.buy ?? record.precioCompra ?? record.purchase
    );
    const venta = parseRate(
      record.venta ?? record.salePrice ?? record.sellRate ??
      record.sell ?? record.precioVenta ?? record.sale
    );

    if (!validarTasa(compra) || !validarTasa(venta)) {
      throw new Error(`Valores inválidos de Ficohsa API: compra=${compra}, venta=${venta}. Respuesta: ${JSON.stringify(data).slice(0, 200)}`);
    }
    if (venta < compra) throw new Error(`Tasa inconsistente: venta (${venta}) < compra (${compra})`);

    return { compra, venta };
  }

  /**
   * API del Banco Central de Honduras.
   * URL: https://www.bch.hn/api/tipocambio?fechainicio=YYYY-MM-DD&fechafin=YYYY-MM-DD
   */
  private static async fetchBCH(date: Date): Promise<{ compra: number; venta: number }> {
    const dateStr = date.toISOString().split('T')[0];
    const url = `${BCH_API_URL}?fechainicio=${dateStr}&fechafin=${dateStr}`;

    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: AXIOS_HEADERS,
    });

    const record = Array.isArray(data) ? data[0] : data;
    if (!record) throw new Error('Respuesta vacía de BCH API');

    // El BCH puede usar distintos nombres de campo según la versión de su API
    const compra = parseRate(
      record.compra ?? record.precioCompra ?? record.buy ??
      record.tipoCambioCompra ?? record.tasaCompra
    );
    const venta = parseRate(
      record.venta ?? record.precioVenta ?? record.sell ??
      record.tipoCambioVenta ?? record.tasaVenta
    );

    if (!validarTasa(compra) || !validarTasa(venta)) {
      throw new Error(`Valores inválidos del BCH: compra=${compra}, venta=${venta}. Respuesta: ${JSON.stringify(data).slice(0, 200)}`);
    }
    if (venta < compra) throw new Error(`Tasa inconsistente BCH: venta (${venta}) < compra (${compra})`);

    return { compra, venta };
  }

  /**
   * Tasa de VENTA para una fecha específica — fija la tasa al día
   * en que se emitió la factura o se registró el pago.
   */
  static async getRateForDate(date: Date): Promise<number> {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const rate = await prisma.exchangeRate.findFirst({
      where: { date: { lte: d } },
      orderBy: { date: 'desc' },
    });

    if (rate) return parseFloat(rate.rate.toString());
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
