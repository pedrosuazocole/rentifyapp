// src/modules/payments/payments.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { paymentsController } from './payments.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);

router.get('/', paymentsController.list);
router.get('/cxc-report', paymentsController.cxcReport);
router.get('/report', paymentsController.report);
router.get('/:id/receipt', paymentsController.downloadReceipt);
router.get('/:id', paymentsController.getOne);

router.post('/generate',
  authorize('ADMIN', 'OWNER'),
  body('month').optional().isInt({ min: 1, max: 12 }),
  body('year').optional().isInt({ min: 2020, max: 2100 }),
  validate,
  paymentsController.generateMonthly
);

/** POST /api/payments/create-manual — crear un pago manual para un contrato y período */
router.post('/create-manual',
  authorize('ADMIN', 'OWNER'),
  body('contractId').notEmpty().withMessage('Contrato requerido.'),
  body('periodMonth').isInt({ min: 1, max: 12 }).withMessage('Mes inválido.'),
  body('periodYear').isInt({ min: 2020, max: 2100 }).withMessage('Año inválido.'),
  body('amountDue').optional().isFloat({ min: 0 }),
  validate,
  paymentsController.createManual
);

/** PUT /api/payments/:id — editar datos del pago */
router.put('/:id',
  authorize('ADMIN', 'OWNER'),
  paymentsController.update
);

router.post('/:id/register',
  body('amountPaid').isFloat({ min: 0 }).withMessage('El monto pagado debe ser un número válido.'),
  body('paymentCurrency').isIn(['HNL', 'USD']).withMessage('Moneda inválida.'),
  validate,
  paymentsController.register
);

export default router;
