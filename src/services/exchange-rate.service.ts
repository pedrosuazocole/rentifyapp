// src/services/exchange-rate.service.ts
//
// Obtiene la tasa de cambio HNL/USD de fuentes públicas que funcionan
// desde Railway (sin bloqueo por datacenter).
//
// FUENTES EN CASCADA:
//  1. ExchangeRate-API (v6.exchangerate-api.com) — ya usada en el proyecto,
//     requiere EXCHANGE_RATE_API_KEY en Railway Variables.
//  2. Frankfurter (api.frankfurter.app) — 100% gratis, sin key, mantenida
//     por el Banco Central Europeo.
//
// NOTA SOBRE COMPRA vs VENTA:
//  Ninguna de las dos fuentes anteriores distingue compra/venta — ambas
//  devuelven la tasa MEDIA de mercado (interbancaria), que es más baja
//  que la tasa de VENTA que publican los bancos hondureños (Banpaís, BAC,
//  Ficohsa). La diferencia (margen/spread) es la ganancia del banco.
//
//  Para acercar el número a la venta real, sumamos un margen fijo a la
//  tasa media. Ese margen se configura en Railway → Variables con:
//
//      EXCHANGE_RATE_VENTA_SPREAD=0.15
//
//  Cómo calibrarlo: entrá a la web de Banpaís, mirá su tasa de VENTA de
//  hoy, y restale la tasa que muestra este sistema en "Editar manualmente"
//  (que es la media, antes de aplicar el margen — la ves en el campo
//  "rateCompra" guardado). Esa diferencia es el spread correcto.
//  Si no se configura, se usa 0.15 como valor por defecto.
//
//  El botón "Editar manualmente" siempre tiene prioridad — usalo cualquier
//  día que el número automático no coincida con lo que ves en el banco.
import axios from 'axios';
import { prisma } from '../config/database';
import { env } from '../config/env';

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; RentifyApp/1.0)',
  'Accept': 'application/json',
};

// Margen que se suma a la tasa media para aproximar la tasa de VENTA.
// Configurable en Railway → Variables → EXCHANGE_RATE_VENTA_SPREAD
function getVentaSpread(): number {
  const raw = process.env.EXCHANGE_RATE_VENTA_SPREAD;
  const parsed = raw ? parseFloat(raw) : NaN;
  return !isNaN(parsed) && parsed >= 0 && parsed <= 2 ? parsed : 0.15;
}

function validar(n: number): boolean {
  return !isNaN(n) && n >= 15 && n <= 50;
}

export class ExchangeRateService {
  /**
   * Tasa de HOY. Si el registro ya viene de fuente válida, lo devuelve
   * sin volver a consultar. Si viene de una fuente vieja, lo actualiza.
   */
  static async getTodayRate(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.exchangeRate.findUnique({ where: { date: today } });
    const fuentesValidas = ['ExchangeRate-API', 'Frankfurter', 'Manual'];
    if (existing && fuentesValidas.includes(existing.source)) {
      return parseFloat(existing.rate.toString());
    }

    return await this.fetchAndSave();
  }

  /**
   * Descarga la tasa media actual desde fuentes en cascada, le suma el
   * margen de venta configurado, y guarda ambos valores en BD:
   *   - rate       → tasa de VENTA estimada (media + spread) — la que
   *                  usa todo el sistema para conversiones.
   *   - rateCompra → tasa media/interbancaria cruda (sin margen), solo
   *                  como referencia para calibrar el spread.
   */
  static async fetchAndSave(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const spread = getVentaSpread();

    // ── Fuente 1: ExchangeRate-API ──────────────────────────────────
    const apiKey = env.EXCHANGE_RATE_API_KEY?.trim();
    if (apiKey) {
      try {
        const { data } = await axios.get(
          `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
          { timeout: 10000, headers: AXIOS_HEADERS }
        );
        const hnl = data?.conversion_rates?.HNL ?? data?.rates?.HNL;
        if (hnl && validar(Number(hnl))) {
          const media = Number(hnl);
          const venta = parseFloat((media + spread).toFixed(4));
          await prisma.exchangeRate.upsert({
            where: { date: today },
            update: { rate: venta, rateCompra: media, source: 'ExchangeRate-API' },
            create: { date: today, rate: venta, rateCompra: media, source: 'ExchangeRate-API' },
          });
          console.log(`💱 Tasa ExchangeRate-API: media L ${media} + spread ${spread} = venta L ${venta}`);
          return venta;
        }
      } catch (e1) {
        console.warn('⚠️ ExchangeRate-API falló:', (e1 as Error).message);
      }
    }

    // ── Fuente 2: Frankfurter (ECB, sin key) ───────────────────────
    try {
      const { data } = await axios.get(
        'https://api.frankfurter.app/latest?from=USD&to=HNL',
        { timeout: 10000, headers: AXIOS_HEADERS }
      );
      const hnl = data?.rates?.HNL;
      if (hnl && validar(Number(hnl))) {
        const media = Number(hnl);
        const venta = parseFloat((media + spread).toFixed(4));
        await prisma.exchangeRate.upsert({
          where: { date: today },
          update: { rate: venta, rateCompra: media, source: 'Frankfurter' },
          create: { date: today, rate: venta, rateCompra: media, source: 'Frankfurter' },
        });
        console.log(`💱 Tasa Frankfurter: media L ${media} + spread ${spread} = venta L ${venta}`);
        return venta;
      }
    } catch (e2) {
      console.warn('⚠️ Frankfurter falló:', (e2 as Error).message);
    }

    // ── Fallback: última tasa en BD ─────────────────────────────────
    const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
    if (latest) {
      console.log(`💱 Usando última tasa conocida: L ${latest.rate} (${latest.source})`);
      return parseFloat(latest.rate.toString());
    }

    throw new Error(
      'No se pudo obtener la tasa de cambio. ' +
      'Ingresála manualmente desde Configuración → Tipo de Cambio, ' +
      'o asegurate de tener EXCHANGE_RATE_API_KEY configurada en Railway.'
    );
  }

  /**
   * Tasa de una fecha específica — para fijar la conversión al día
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
