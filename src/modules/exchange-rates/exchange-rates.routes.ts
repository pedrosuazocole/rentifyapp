// src/modules/exchange-rates/exchange-rates.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { ExchangeRateService } from '../../services/exchange-rate.service';
import { successResponse, paginatedResponse } from '../../types';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';

const router = Router();
router.use(authenticate);

/** GET /api/exchange-rates/today */
router.get('/today', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rate = await ExchangeRateService.getTodayRate();
    res.json(successResponse({ rate, currency: 'USD/HNL', date: new Date().toISOString().split('T')[0] }));
  } catch (err) { next(err); }
});

/** GET /api/exchange-rates */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const { rates, total } = await ExchangeRateService.getHistory(page, limit);
    res.json(paginatedResponse(rates, page, limit, total));
  } catch (err) { next(err); }
});

/** GET /api/exchange-rates/bch-historical — tasas históricas del BCH via scraping/proxy */
router.get('/bch-historical', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // BCH publica tasas en: https://www.bch.hn/estadisticas-y-publicaciones/tipo-de-cambio
    // Usamos el endpoint JSON del BCH disponible públicamente
    const { days } = req.query;
    const limit = Math.min(parseInt(days as string) || 30, 90);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - limit);

    // Intentar desde la API oficial del BCH (endpoint de tipo de cambio diario)
    const bchUrl = `https://www.bch.hn/api/tipocambio?fechainicio=${start.toISOString().split('T')[0]}&fechafin=${end.toISOString().split('T')[0]}`;
    
    try {
      const axios = (await import('axios')).default;
      const { data } = await axios.get(bchUrl, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      });
      return res.json(successResponse({ source: 'BCH', rates: data }));
    } catch (_bchErr) {
      // Fallback: retornar historial guardado en nuestra BD con flag de origen
      const { rates } = await ExchangeRateService.getHistory(1, limit);
      return res.json(successResponse({
        source: 'local',
        fallback: true,
        message: 'No se pudo conectar al BCH. Mostrando historial local.',
        rates: rates.map((r: typeof rates[number]) => ({
          fecha: r.date,
          compra: parseFloat(r.rate.toString()),
          venta: parseFloat(r.rate.toString()),
          source: r.source,
        })),
      }));
    }
  } catch (err) { next(err); }
});

/** POST /api/exchange-rates/fetch — forzar actualización inmediata desde Banpaís (venta) */
router.post('/fetch', authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rate = await ExchangeRateService.fetchAndSave();
    res.json(successResponse({ rate }, `Tipo de cambio actualizado: L ${rate} por USD`));
  } catch (err) { next(err); }
});

/** POST /api/exchange-rates/manual — guardar tasa manual (fallback si Banpaís no responde) */
router.post('/manual', authorize('ADMIN', 'OWNER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { date, rate, rateCompra } = req.body;

    if (!date || !rate) throw new AppError('Fecha y tasa de venta son requeridas.', 400);
    if (parseFloat(rate) <= 0) throw new AppError('La tasa debe ser mayor a 0.', 400);

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    const saved = await prisma.exchangeRate.upsert({
      where: { date: dateObj },
      update: {
        rate: parseFloat(rate),
        ...(rateCompra && { rateCompra: parseFloat(rateCompra) }),
        source: 'Manual',
      },
      create: {
        date: dateObj,
        rate: parseFloat(rate),
        ...(rateCompra && { rateCompra: parseFloat(rateCompra) }),
        source: 'Manual',
      },
    });

    res.json(successResponse(saved, `Tasa de venta guardada: L ${rate} por USD para el ${date}`));
  } catch (err) { next(err); }
});

export default router;
