// src/modules/payments/payments.routes.ts
import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { paymentsController } from './payments.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();

// ── Endpoint público para servir comprobantes temporales (sin autenticación)
// TextMeBot necesita descargar el archivo desde esta URL
router.get('/proof/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename); // sanitizar
  const filePath = path.join(os.tmpdir(), filename);

  if (!filename.startsWith('proof-') || !fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Archivo no encontrado o expirado.' });
  }

  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
  };
  res.setHeader('Content-Type', mimeMap[ext || ''] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(filePath).pipe(res);
});

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
