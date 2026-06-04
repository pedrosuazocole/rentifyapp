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
  body('startDate').isISO8601().withMessage('Fecha de inicio inválida. Usá el formato YYYY-MM-DD.'),
  body('endDate').isISO8601().withMessage('Fecha de fin inválida. Usá el formato YYYY-MM-DD.'),
  body('paymentDayOfMonth').isInt({ min: 1, max: 31 }).withMessage('Día de pago debe ser entre 1 y 31.'),
  body('monthlyRent').isFloat({ min: 1 }).withMessage('El monto mensual debe ser mayor a 0.'),
  body('currency').isIn(['HNL', 'USD']).withMessage('Moneda inválida. Seleccioná HNL o USD.'),
  body('depositAmount').isFloat({ min: 0 }).withMessage('El depósito debe ser un número válido.'),
  body('depositCurrency').isIn(['HNL', 'USD']).withMessage('Moneda del depósito inválida.'),
  validate,
  contractsController.create
);

router.put('/:id',
  body('endDate').optional().isISO8601().withMessage('Fecha de fin inválida. Usá el formato YYYY-MM-DD.'),
  body('paymentDayOfMonth').optional().isInt({ min: 1, max: 31 }).withMessage('Día de pago debe ser entre 1 y 31.'),
  body('monthlyRent').optional().isFloat({ min: 1 }).withMessage('El monto mensual debe ser mayor a 0.'),
  body('currency').optional().isIn(['HNL', 'USD']).withMessage('Moneda inválida.'),
  body('depositAmount').optional().isFloat({ min: 0 }).withMessage('El depósito debe ser un número válido.'),
  body('depositCurrency').optional().isIn(['HNL', 'USD']).withMessage('Moneda del depósito inválida.'),
  validate,
  contractsController.update
);

router.post('/:id/terminate',
  body('reason').notEmpty().withMessage('El motivo de rescisión es requerido.'),
  validate,
  contractsController.terminate
);

export default router;
