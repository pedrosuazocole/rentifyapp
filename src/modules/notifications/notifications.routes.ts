// src/modules/notifications/notifications.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { notificationsController } from './notifications.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);

router.get('/status',          notificationsController.getStatus);
router.get('/config',          authorize('ADMIN'), notificationsController.getConfig);
router.put('/config',          authorize('ADMIN'), notificationsController.updateConfig);
router.get('/logs',            authorize('ADMIN', 'OWNER'), notificationsController.getLogs);
router.delete('/logs',         authorize('ADMIN'), notificationsController.clearLogs);
router.get('/telegram-updates', authorize('ADMIN'), notificationsController.getTelegramUpdates);

router.post('/test',
  authorize('ADMIN'),
  body('chatId').if(body('channel').equals('telegram')).notEmpty().withMessage('El Chat ID de Telegram es requerido.'),
  body('phone').if(body('channel').equals('callmebot')).notEmpty().withMessage('El número es requerido para CallMeBot.'),
  body('apiKey').if(body('channel').equals('callmebot')).notEmpty().withMessage('La API Key es requerida para CallMeBot.'),
  validate,
  notificationsController.sendTest
);

// Enviar reporte CxC manualmente
router.post('/send-cxc-report', authorize('ADMIN'), notificationsController.sendCxcReport);

export default router;
