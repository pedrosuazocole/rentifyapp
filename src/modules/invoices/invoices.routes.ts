// src/modules/invoices/invoices.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { invoicesController } from './invoices.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);

router.get('/',           invoicesController.list);
router.get('/report',     invoicesController.report);
router.get('/:id',        invoicesController.getOne);
router.get('/:id/pdf',    invoicesController.downloadPdf);

router.post('/',
  authorize('ADMIN', 'OWNER'),
  body('issuerName').notEmpty().withMessage('El nombre del emisor es requerido.'),
  body('issuerRtn').notEmpty().withMessage('El RTN del emisor es requerido.'),
  body('issuerAddress').notEmpty().withMessage('La dirección del emisor es requerida.'),
  body('receiverName').notEmpty().withMessage('El nombre del receptor es requerido.'),
  body('cai').notEmpty().withMessage('El CAI es requerido.'),
  body('invoiceRange').notEmpty().withMessage('El rango de factura es requerido.'),
  body('invoiceNumber').notEmpty().withMessage('El número de factura es requerido.'),
  body('expiresAt').isISO8601().withMessage('La fecha límite de emisión es requerida.'),
  body('subtotal').isFloat({ min: 0 }).withMessage('El subtotal debe ser un número válido.'),
  body('description').notEmpty().withMessage('El concepto es requerido.'),
  validate,
  invoicesController.create
);

router.post('/:id/send-whatsapp', invoicesController.sendWhatsApp);

router.post('/:id/cancel',
  authorize('ADMIN'),
  body('reason').notEmpty().withMessage('El motivo de anulación es requerido.'),
  validate,
  invoicesController.cancel
);

export default router;
