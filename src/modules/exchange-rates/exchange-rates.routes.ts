// src/modules/exchange-rates/exchange-rates.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { ExchangeRateService } from '../../services/exchange-rate.service';
import { successResponse, paginatedResponse } from '../../types';

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

/** POST /api/exchange-rates/fetch — forzar actualización manual */
router.post('/fetch', authorize('ADMIN'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rate = await ExchangeRateService.fetchAndSave();
    res.json(successResponse({ rate }, `Tipo de cambio actualizado: L ${rate} por USD`));
  } catch (err) { next(err); }
});

export default router;
