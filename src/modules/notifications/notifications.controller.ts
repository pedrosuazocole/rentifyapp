// src/modules/notifications/notifications.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse } from '../../types';
import { TelegramService } from '../../services/telegram.service';
import { CallMeBotService } from '../../services/callmebot.service';

export const notificationsController = {
  /** GET /api/notifications/config */
  async getConfig(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      let config = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
      if (!config) config = await prisma.notificationConfig.create({ data: {} });
      const telegramConfigured = TelegramService.isConfigured();
      const botInfo = telegramConfigured ? await TelegramService.getMe() : null;
      res.json(successResponse({ ...config, telegramConfigured, botUsername: botInfo?.username }));
    } catch (err) { next(err); }
  },

  /** PUT /api/notifications/config */
  async updateConfig(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        reminderEnabled, receiptEnabled, lateNoticeEnabled, renewalEnabled,
        reminderDaysBefore, renewalDaysBefore, sendHour, sendMinute, ccNumbers,
        debitNoteEnabled,
      } = req.body;

      if (sendHour !== undefined && (sendHour < 0 || sendHour > 23)) {
        throw new AppError('La hora debe estar entre 0 y 23.', 400);
      }

      let config = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
      const data = {
        ...(reminderEnabled    !== undefined && { reminderEnabled }),
        ...(receiptEnabled     !== undefined && { receiptEnabled }),
        ...(lateNoticeEnabled  !== undefined && { lateNoticeEnabled }),
        ...(renewalEnabled     !== undefined && { renewalEnabled }),
        ...(debitNoteEnabled   !== undefined && { debitNoteEnabled }),
        ...(reminderDaysBefore !== undefined && { reminderDaysBefore }),
        ...(renewalDaysBefore  !== undefined && { renewalDaysBefore }),
        ...(sendHour           !== undefined && { sendHour }),
        ...(sendMinute         !== undefined && { sendMinute }),
        ...(ccNumbers          !== undefined && { ccNumbers }),
        updatedById: req.user!.id,
      };

      config = config
        ? await prisma.notificationConfig.update({ where: { id: config.id }, data })
        : await prisma.notificationConfig.create({ data });

      res.json(successResponse(config, 'Configuración guardada.'));
    } catch (err) { next(err); }
  },

  /** POST /api/notifications/test — prueba Telegram o CallMeBot */
  async sendTest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { chatId, phone, apiKey, channel } = req.body;

      if (channel === 'callmebot' || (!chatId && phone && apiKey)) {
        // Prueba CallMeBot
        if (!phone || !apiKey) throw new AppError('Número y API Key son requeridos para CallMeBot.', 400);
        const result = await CallMeBotService.sendTest(phone, apiKey);
        await prisma.notificationLog.create({
          data: { type: 'TEST', status: result.success ? 'SENT' : 'FAILED', toPhone: phone, tenantName: 'Prueba CallMeBot', message: '🧪 Prueba CallMeBot', errorMessage: result.error },
        });
        res.json(successResponse(result, result.success ? '✅ Mensaje WhatsApp enviado.' : `❌ ${result.error}`));
      } else {
        // Prueba Telegram (default)
        if (!chatId) throw new AppError('El Chat ID de Telegram es requerido.', 400);
        if (!TelegramService.isConfigured()) throw new AppError('Agregá TELEGRAM_BOT_TOKEN en Railway → Variables.', 400);
        const result = await TelegramService.sendTest(chatId);
        await prisma.notificationLog.create({
          data: { type: 'TEST', status: result.success ? 'SENT' : 'FAILED', toPhone: chatId, tenantName: 'Prueba Telegram', message: '🧪 Prueba Telegram', errorMessage: result.error },
        });
        res.json(successResponse(result, result.success ? '✅ Mensaje Telegram enviado.' : `❌ ${result.error}`));
      }
    } catch (err) { next(err); }
  },

  /** GET /api/notifications/logs */
  async getLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page   = parseInt(req.query.page as string) || 1;
      const limit  = parseInt(req.query.limit as string) || 20;
      const type   = req.query.type as string;
      const status = req.query.status as string;
      const skip   = (page - 1) * limit;
      const where: Record<string, unknown> = {};
      if (type)   where.type   = type;
      if (status) where.status = status;
      const [logs, total] = await Promise.all([
        prisma.notificationLog.findMany({ where, orderBy: { sentAt: 'desc' }, skip, take: limit }),
        prisma.notificationLog.count({ where }),
      ]);
      res.json(successResponse({ logs, total, page, totalPages: Math.ceil(total / limit) }));
    } catch (err) { next(err); }
  },

  /** DELETE /api/notifications/logs */
  async clearLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { olderThanDays = 30 } = req.body;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - olderThanDays);
      const { count } = await prisma.notificationLog.deleteMany({ where: { sentAt: { lt: cutoff } } });
      res.json(successResponse({ deleted: count }, `${count} registros eliminados.`));
    } catch (err) { next(err); }
  },

  /** GET /api/notifications/status */
  async getStatus(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const telegramConfigured = TelegramService.isConfigured();
      const botInfo = telegramConfigured ? await TelegramService.getMe() : null;
      const [totalSent, totalFailed, lastSent] = await Promise.all([
        prisma.notificationLog.count({ where: { status: 'SENT' } }),
        prisma.notificationLog.count({ where: { status: 'FAILED' } }),
        prisma.notificationLog.findFirst({ orderBy: { sentAt: 'desc' }, where: { status: 'SENT' } }),
      ]);
      const in3days = new Date();
      in3days.setDate(in3days.getDate() + 3);
      const nextReminders = await prisma.payment.count({
        where: { status: 'PENDING', dueDate: { gte: new Date(), lte: in3days } },
      });
      const tenantsWithoutNotif = await prisma.tenant.count({
        where: { isActive: true, telegramChatId: null, callMeBotApiKey: null },
      });
      const tenantsWithCallMeBot = await prisma.tenant.count({
        where: { isActive: true, callMeBotApiKey: { not: null } },
      });
      const tenantsWithTelegram = await prisma.tenant.count({
        where: { isActive: true, telegramChatId: { not: null } },
      });
      res.json(successResponse({
        telegramConfigured, botUsername: botInfo?.username,
        stats: { totalSent, totalFailed, lastSentAt: lastSent?.sentAt || null, nextReminders, tenantsWithoutNotif, tenantsWithTelegram, tenantsWithCallMeBot },
      }));
    } catch (err) { next(err); }
  },

  /** GET /api/notifications/telegram-updates */
  async getTelegramUpdates(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!TelegramService.isConfigured()) throw new AppError('Telegram no configurado.', 400);
      const updates = await TelegramService.getUpdates();
      res.json(successResponse(updates));
    } catch (err) { next(err); }
  },

  /** POST /api/notifications/send-cxc-report — enviar reporte CxC manualmente */
  async sendCxcReport(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const config = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
      if (!config?.ccNumbers) {
        throw new AppError('No hay números CC configurados. Agregalos en la pantalla de Notificaciones.', 400);
      }
      const { sendCuentasPorCobrarReport } = await import('../../jobs/notification.job');
      await sendCuentasPorCobrarReport();
      res.json(successResponse(null, '✅ Reporte de cuentas por cobrar enviado a los números CC.'));
    } catch (err) { next(err); }
  },
};
