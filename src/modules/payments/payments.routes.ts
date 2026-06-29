// src/modules/payments/payments.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { paymentsController } from './payments.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();

// IMPORTANTE: esta ruta va ANTES de `router.use(authenticate)` porque
// TextMeBot (servicio externo) necesita descargar el archivo sin JWT.
// El nombre de archivo está validado dentro del controlador (prefijo
// "proof-" obligatorio, sin separadores de ruta) para evitar acceso
// a archivos arbitrarios del servidor.
router.get('/proof/:filename', paymentsController.serveProof);

router.use(authenticate);

router.get('/', paymentsController.list);
router.get('/report', paymentsController.report);
router.get('/:id/receipt', paymentsController.downloadReceipt);

router.post('/generate',
  authorize('ADMIN', 'OWNER'),
  body('month').optional().isInt({ min: 1, max: 12 }),
  body('year').optional().isInt({ min: 2020, max: 2100 }),
  validate,
  paymentsController.generateMonthly
);

router.post('/:id/register',
  body('amountPaid').isFloat({ min: 0 }).withMessage('El monto pagado debe ser un número válido.'),
  body('paymentCurrency').isIn(['HNL', 'USD']).withMessage('Moneda inválida.'),
  validate,
  paymentsController.register
);

export default router;
