// src/modules/contracts/contracts.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { contractsController } from './contracts.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);

router.get('/', contractsController.list);
router.get('/expiring', contractsController.expiring);
router.get('/:id', contractsController.getOne);

router.post('/',
  body('unitId').notEmpty().withMessage('La unidad es requerida.'),
  body('tenantId').notEmpty().withMessage('El inquilino es requerido.'),
  body('startDate').isISO8601().withMessage('Fecha de inicio inválida.'),
  body('endDate').isISO8601().withMessage('Fecha de fin inválida.'),
  body('paymentDayOfMonth').isInt({ min: 1, max: 28 }).withMessage('Día de pago debe ser entre 1 y 28.'),
  body('monthlyRent').isFloat({ min: 1 }).withMessage('El monto de alquiler debe ser mayor a 0.'),
  body('currency').isIn(['HNL', 'USD']).withMessage('Moneda inválida (HNL o USD).'),
  body('depositAmount').isFloat({ min: 0 }).withMessage('El depósito debe ser un número válido.'),
  body('depositCurrency').isIn(['HNL', 'USD']).withMessage('Moneda del depósito inválida.'),
  validate,
  contractsController.create
);

router.post('/:id/terminate',
  body('reason').notEmpty().withMessage('El motivo de rescisión es requerido.'),
  validate,
  contractsController.terminate
);

export default router;
