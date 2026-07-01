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
// NOTA SOBRE LA TASA:
//  Ambas fuentes dan la tasa de MERCADO USD/HNL (ej. 26.76), que es la
//  tasa oficial del BCH que publican todos los bancos. La tasa de VENTA
//  bancaria de Ficohsa/BAC agrega un pequeño margen (~0.10-0.15 HNL).
//  Podés usar "Editar manualmente" para ajustar si necesitás la tasa de
//  venta exacta de tu banco. El cron actualiza automáticamente cada día.
import axios from 'axios';
import { prisma } from '../config/database';
import { env } from '../config/env';

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; RentifyApp/1.0)',
  'Accept': 'application/json',
};

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
   * Descarga la tasa actual desde fuentes en cascada y guarda en BD.
   */
  static async fetchAndSave(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
          const venta = Number(hnl);
          await prisma.exchangeRate.upsert({
            where: { date: today },
            update: { rate: venta, source: 'ExchangeRate-API' },
            create: { date: today, rate: venta, source: 'ExchangeRate-API' },
          });
          console.log(`💱 Tasa ExchangeRate-API: L ${venta} por USD`);
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
        const venta = Number(hnl);
        await prisma.exchangeRate.upsert({
          where: { date: today },
          update: { rate: venta, source: 'Frankfurter' },
          create: { date: today, rate: venta, source: 'Frankfurter' },
        });
        console.log(`💱 Tasa Frankfurter: L ${venta} por USD`);
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
