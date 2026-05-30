// src/jobs/notification.job.ts
// Cron jobs diarios — usa Telegram como canal principal de notificaciones
import cron from 'node-cron';
import { prisma } from '../config/database';
import { TelegramService } from '../services/telegram.service';
import { calcLateFee, addMoney, toNumber } from '../utils/money';

const DEFAULT_CONFIG = {
  reminderEnabled:    true,
  receiptEnabled:     true,
  lateNoticeEnabled:  true,
  renewalEnabled:     true,
  reminderDaysBefore: 3,
  renewalDaysBefore:  30,
  sendHour:           8,
  sendMinute:         0,
  ccNumbers:          null as string | null,
};

async function getConfig() {
  const config = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
  return config || DEFAULT_CONFIG;
}

async function saveLog(data: {
  type: 'REMINDER' | 'RECEIPT' | 'LATE' | 'RENEWAL' | 'INVOICE' | 'TEST';
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  toPhone: string;
  tenantName?: string;
  message: string;
  twilioSid?: string;
  errorMessage?: string;
  contractId?: string;
  paymentId?: string;
}) {
  try {
    await prisma.notificationLog.create({ data });
  } catch (e) {
    console.error('⚠️ Error guardando log:', e);
  }
}

export function registerJobs(): void {
  // Actualizar tipo de cambio todos los días a las 7:00 AM
  cron.schedule('0 7 * * *', async () => {
    console.log('💱 [CRON] Actualizando tipo de cambio...');
    try {
      const { ExchangeRateService } = await import('../services/exchange-rate.service');
      await ExchangeRateService.fetchAndSave();
    } catch (err) {
      console.error('❌ [CRON] Error tipo de cambio:', err);
    }
  }, { timezone: 'America/Tegucigalpa' });

  // Notificaciones — evalúa cada minuto si es la hora configurada
  cron.schedule('* * * * *', async () => {
    try {
      const config = await getConfig();
      const now = new Date();
      const hn  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Tegucigalpa' }));
      if (hn.getHours() === config.sendHour && hn.getMinutes() === config.sendMinute) {
        console.log(`⏰ [CRON] Notificaciones (${config.sendHour}:${String(config.sendMinute).padStart(2,'0')})...`);
        await runDailyNotifications(config);
      }
    } catch (err) {
      console.error('❌ [CRON] Error scheduler:', err);
    }
  }, { timezone: 'America/Tegucigalpa' });

  console.log('✅ Cron jobs registrados');
}

async function runDailyNotifications(config: typeof DEFAULT_CONFIG): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await Promise.allSettled([
    config.reminderEnabled   ? sendPaymentReminders(today, config)   : Promise.resolve(),
    config.lateNoticeEnabled ? sendLatePaymentNotices(today, config) : Promise.resolve(),
    config.renewalEnabled    ? sendRenewalNotices(today, config)     : Promise.resolve(),
    markLatePayments(today),
  ]);

  console.log('✅ [CRON] Notificaciones completadas.');
}

/** Recordatorios de pago */
async function sendPaymentReminders(today: Date, config: typeof DEFAULT_CONFIG): Promise<void> {
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + config.reminderDaysBefore);

  const payments = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      dueDate: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) },
    },
    include: {
      contract: {
        include: { tenant: true, unit: { include: { property: true } } },
      },
    },
  });

  for (const payment of payments) {
    const { tenant, unit } = payment.contract;
    const tenantName   = `${tenant.firstName} ${tenant.lastName}`;
    const propertyUnit = `${unit.property.name} — ${unit.number}`;

    // Solo enviar si tiene telegramChatId configurado
    if (!tenant.telegramChatId) {
      await saveLog({
        type: 'REMINDER', status: 'SKIPPED',
        toPhone: tenant.phone, tenantName,
        message: 'Sin Telegram Chat ID configurado',
        contractId: payment.contractId, paymentId: payment.id,
      });
      continue;
    }

    const result = await TelegramService.sendPaymentReminder({
      chatId: tenant.telegramChatId,
      tenantName, propertyUnit,
      amount: toNumber(payment.amountDue),
      currency: payment.contract.currency,
      dueDate: payment.dueDate,
    });

    await saveLog({
      type: 'REMINDER',
      status: result.success ? 'SENT' : 'FAILED',
      toPhone: tenant.telegramChatId,
      tenantName,
      message: `Recordatorio — ${propertyUnit}`,
      errorMessage: result.error,
      contractId: payment.contractId,
      paymentId: payment.id,
    });
  }

  if (payments.length > 0) console.log(`📨 [CRON] Recordatorios: ${payments.length}`);
}

/** Avisos de mora */
async function sendLatePaymentNotices(today: Date, _config: typeof DEFAULT_CONFIG): Promise<void> {
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE' },
    include: {
      tenant: true,
      unit: { include: { property: true } },
      payments: { where: { status: 'LATE' } },
    },
  });

  for (const contract of contracts) {
    if (!contract.tenant.telegramChatId) continue;

    for (const payment of contract.payments) {
      const graceDue = new Date(payment.dueDate);
      graceDue.setDate(graceDue.getDate() + contract.gracePeriodDays + 1);
      if (today.getTime() !== graceDue.getTime()) continue;

      const amountDue  = toNumber(payment.amountDue);
      const lateFee    = parseFloat(calcLateFee(amountDue, toNumber(contract.lateFeePercent)));
      const total      = parseFloat(addMoney(amountDue, lateFee));
      const tenantName = `${contract.tenant.firstName} ${contract.tenant.lastName}`;

      const result = await TelegramService.sendLatePaymentNotice({
        chatId: contract.tenant.telegramChatId,
        tenantName,
        propertyUnit: `${contract.unit.property.name} — ${contract.unit.number}`,
        amountDue, lateFee, totalDue: total,
        currency: contract.currency,
        daysLate: payment.daysLate,
      });

      await saveLog({
        type: 'LATE',
        status: result.success ? 'SENT' : 'FAILED',
        toPhone: contract.tenant.telegramChatId,
        tenantName,
        message: `Mora — ${payment.daysLate} días`,
        errorMessage: result.error,
        contractId: contract.id,
        paymentId: payment.id,
      });
    }
  }
}

/** Alertas de renovación */
async function sendRenewalNotices(today: Date, config: typeof DEFAULT_CONFIG): Promise<void> {
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + config.renewalDaysBefore);

  const contracts = await prisma.contract.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) },
      renewalNoticeSentAt: null,
    },
    include: { tenant: true, unit: { include: { property: true } } },
  });

  for (const contract of contracts) {
    if (!contract.tenant.telegramChatId) continue;

    const tenantName = `${contract.tenant.firstName} ${contract.tenant.lastName}`;
    const result = await TelegramService.sendRenewalNotice({
      chatId: contract.tenant.telegramChatId,
      tenantName,
      propertyUnit: `${contract.unit.property.name} — ${contract.unit.number}`,
      contractEndDate: contract.endDate,
      monthlyRent: toNumber(contract.monthlyRent),
      currency: contract.currency,
    });

    await saveLog({
      type: 'RENEWAL',
      status: result.success ? 'SENT' : 'FAILED',
      toPhone: contract.tenant.telegramChatId,
      tenantName,
      message: `Renovación — vence ${contract.endDate.toLocaleDateString('es-HN')}`,
      errorMessage: result.error,
      contractId: contract.id,
    });

    if (result.success) {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { renewalNoticeSentAt: new Date() },
      });
    }
  }
}

/** Marcar pagos en mora */
async function markLatePayments(today: Date): Promise<void> {
  const pending = await prisma.payment.findMany({
    where: { status: 'PENDING' },
    include: { contract: true },
  });

  let marked = 0;
  for (const payment of pending) {
    const graceDue = new Date(payment.dueDate);
    graceDue.setDate(graceDue.getDate() + payment.contract.gracePeriodDays);
    if (today > graceDue) {
      const daysLate = Math.floor((today.getTime() - graceDue.getTime()) / 86400000);
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'LATE', isLate: true, daysLate,
          lateFeeAmount: parseFloat(calcLateFee(
            toNumber(payment.amountDue),
            toNumber(payment.contract.lateFeePercent)
          )),
        },
      });
      marked++;
    }
  }
  if (marked > 0) console.log(`🔴 [CRON] Pagos en mora: ${marked}`);
}
