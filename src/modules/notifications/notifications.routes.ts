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
  body('chatId').notEmpty().withMessage('El Chat ID de Telegram es requerido.'),
  validate,
  notificationsController.sendTest
);

export default router;
