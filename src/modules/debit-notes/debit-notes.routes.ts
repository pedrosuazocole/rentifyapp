// src/modules/debit-notes/debit-notes.routes.ts
// VIEWER (contador) puede crear y listar — ADMIN/OWNER pueden anular
import { Router } from 'express';
import { body } from 'express-validator';
import { debitNotesController } from './debit-notes.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);

// Todos los roles pueden leer
router.get('/service-types', debitNotesController.getServiceTypes);
router.get('/summary',       debitNotesController.summary);
router.get('/',              debitNotesController.list);
router.get('/:id',           debitNotesController.getOne);

// VIEWER (contador), OWNER y ADMIN pueden crear y editar
router.post('/',
  authorize('ADMIN', 'OWNER', 'VIEWER'),
  body('contractId').notEmpty().withMessage('El contrato es requerido.'),
  body('periodMonth').isInt({ min: 1, max: 12 }).withMessage('Mes inválido.'),
  body('periodYear').isInt({ min: 2020 }).withMessage('Año inválido.'),
  body('serviceType').notEmpty().withMessage('El tipo de servicio es requerido.'),
  body('description').notEmpty().withMessage('La descripción es requerida.'),
  body('amount').isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0.'),
  validate,
  debitNotesController.create
);

router.put('/:id',
  authorize('ADMIN', 'OWNER', 'VIEWER'),
  debitNotesController.update
);

// Solo ADMIN y OWNER pueden anular
router.post('/:id/cancel',
  authorize('ADMIN', 'OWNER'),
  debitNotesController.cancel
);

// Envío manual de notificación — ADMIN, OWNER y VIEWER
router.post('/:id/notify',
  authorize('ADMIN', 'OWNER', 'VIEWER'),
  debitNotesController.sendNotification
);

export default router;
