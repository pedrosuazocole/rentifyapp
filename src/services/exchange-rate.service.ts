// src/services/exchange-rate.service.ts
// Obtiene y guarda la tasa de cambio diaria HNL/USD desde ExchangeRate-API
import axios from 'axios';
import { prisma } from '../config/database';
import { env } from '../config/env';

export class ExchangeRateService {
  /**
   * Obtiene la tasa más reciente de la BD.
   * Si no hay para hoy, la descarga de la API y la guarda.
   */
  static async getTodayRate(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar tasa del día en la BD
    const existing = await prisma.exchangeRate.findUnique({ where: { date: today } });
    if (existing) return parseFloat(existing.rate.toString());

    // No existe: descargar de la API
    return await this.fetchAndSave();
  }

  /**
   * Descarga la tasa oficial y la guarda en el historial.
   * Se llama desde el cron job diario y como fallback en getTodayRate.
   */
  static async fetchAndSave(): Promise<number> {
    try {
      const url = `https://v6.exchangerate-api.com/v6/${env.EXCHANGE_RATE_API_KEY}/pair/USD/HNL`;
      const { data } = await axios.get(url, { timeout: 10000 });

      if (data.result !== 'success') {
        throw new Error('Respuesta inválida de ExchangeRate-API');
      }

      const rate: number = data.conversion_rate;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await prisma.exchangeRate.upsert({
        where: { date: today },
        update: { rate, source: 'ExchangeRate-API' },
        create: { date: today, rate, source: 'ExchangeRate-API' },
      });

      console.log(`💱 Tasa de cambio actualizada: L ${rate} por USD`);
      return rate;
    } catch (err) {
      console.error('⚠️ Error al obtener tipo de cambio:', err);
      // Fallback: usar la última tasa disponible en la BD
      const latest = await prisma.exchangeRate.findFirst({ orderBy: { date: 'desc' } });
      if (latest) {
        console.log(`💱 Usando última tasa conocida: L ${latest.rate}`);
        return parseFloat(latest.rate.toString());
      }
      throw new Error('No hay tipo de cambio disponible. Configurá tu EXCHANGE_RATE_API_KEY.');
    }
  }

  /**
   * Obtiene la tasa de un día específico (para historial de pagos).
   * Si no existe ese día, usa la más cercana anterior.
   */
  static async getRateForDate(date: Date): Promise<number> {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);

    const rate = await prisma.exchangeRate.findFirst({
      where: { date: { lte: d } },
      orderBy: { date: 'desc' },
    });

    if (!rate) throw new Error('No hay tipo de cambio registrado para esa fecha.');
    return parseFloat(rate.rate.toString());
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
