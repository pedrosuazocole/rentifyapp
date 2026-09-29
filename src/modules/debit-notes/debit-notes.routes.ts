// src/modules/debit-notes/debit-notes.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { debitNotesController } from './debit-notes.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();

router.use(authenticate);

// Lectura — cualquier rol autenticado (ADMIN, OWNER, VIEWER/contador)
router.get('/summary', debitNotesController.summary);
router.get('/', debitNotesController.list);
router.get('/:id', debitNotesController.getOne);

// Crear — incluye VIEWER (el contador puede registrar cargos)
router.post('/',
  body('contractId').notEmpty().withMessage('Contrato requerido.'),
  body('periodMonth').isInt({ min: 1, max: 12 }).withMessage('Mes inválido.'),
  body('periodYear').isInt({ min: 2020, max: 2100 }).withMessage('Año inválido.'),
  body('description').notEmpty().withMessage('Descripción requerida.'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Monto inválido.'),
  validate,
  debitNotesController.create
);

// Editar — ADMIN, OWNER
router.put('/:id', authorize('ADMIN', 'OWNER'), debitNotesController.update);

// Anular — ADMIN, OWNER
router.post('/:id/cancel',
  authorize('ADMIN', 'OWNER'),
  body('reason').notEmpty().withMessage('El motivo de anulación es requerido.'),
  validate,
  debitNotesController.cancel
);

// Notificar — cualquier rol autenticado
router.post('/:id/notify', debitNotesController.notify);

// Registrar cobro — cualquier rol autenticado (igual que /payments/:id/register)
router.post('/:id/register-payment', debitNotesController.registerPayment);

export default router;
