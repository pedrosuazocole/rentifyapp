// src/jobs/notification.job.ts
// Envía notificaciones en paralelo por Telegram y CallMeBot (WhatsApp)
import cron from 'node-cron';
import { prisma } from '../config/database';
import { TelegramService } from '../services/telegram.service';
import { CallMeBotService } from '../services/callmebot.service';
import { calcLateFee, addMoney, toNumber } from '../utils/money';
import { Currency } from '../types';

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
  const cfg = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
  return cfg || DEFAULT_CONFIG;
}

// ── Helpers para enviar por todos los canales disponibles ──────
async function sendAll(params: {
  telegramChatId?: string | null;
  phone?: string;
  callMeBotApiKey?: string | null;
  ccNumbers?: string | null;
  type: 'REMINDER' | 'RECEIPT' | 'LATE' | 'RENEWAL' | 'TEST';
  tenantName: string;
  contractId?: string;
  paymentId?: string;
  telegramFn: () => Promise<{ success: boolean; error?: string }>;
  callMeBotFn: () => Promise<{ success: boolean; error?: string }>;
  ccMessage: string;
}) {
  const results: Array<{ channel: string; success: boolean; error?: string }> = [];

  // 1. Telegram
  if (params.telegramChatId) {
    const r = await params.telegramFn().catch(e => ({ success: false, error: String(e) }));
    results.push({ channel: 'telegram', ...r });
    await saveLog({
      type: params.type, status: r.success ? 'SENT' : 'FAILED',
      toPhone: params.telegramChatId, tenantName: params.tenantName,
      message: `[Telegram] ${params.ccMessage}`,
      errorMessage: r.error, contractId: params.contractId, paymentId: params.paymentId,
    });
  }

  // 2. CallMeBot (WhatsApp)
  if (params.phone && params.callMeBotApiKey) {
    // Esperar 400ms entre mensajes para respetar el límite de 3/min de CallMeBot
    if (results.length > 0) await sleep(400);
    const r = await params.callMeBotFn().catch(e => ({ success: false, error: String(e) }));
    results.push({ channel: 'callmebot', ...r });
    await saveLog({
      type: params.type, status: r.success ? 'SENT' : 'FAILED',
      toPhone: params.phone, tenantName: params.tenantName,
      message: `[WhatsApp] ${params.ccMessage}`,
      errorMessage: r.error, contractId: params.contractId, paymentId: params.paymentId,
    });
  }

  // 3. Números CC (solo Telegram si están configurados como chatIds)
  if (params.ccNumbers) {
    const ccList = params.ccNumbers.split(',').map(n => n.trim()).filter(Boolean);
    for (const cc of ccList) {
      await sleep(300);
      // Los CC pueden ser chatIds de Telegram o números de WhatsApp con apikey (formato chatId:apikey)
      if (cc.includes(':')) {
        const [ccPhone, ccApiKey] = cc.split(':');
        const r = await CallMeBotService.send(ccPhone, ccApiKey, params.ccMessage)
          .catch(e => ({ success: false, error: String(e) }));
        await saveLog({
          type: params.type, status: r.success ? 'SENT' : 'FAILED',
          toPhone: ccPhone, tenantName: `CC — ${params.tenantName}`,
          message: `[CC-WA] ${params.ccMessage}`, errorMessage: r.error,
        });
      } else if (TelegramService.isConfigured()) {
        // CC es un chatId de Telegram
        const r = await TelegramService.sendTest(cc).catch(() => ({ success: false }));
        await saveLog({
          type: params.type, status: r.success ? 'SENT' : 'FAILED',
          toPhone: cc, tenantName: `CC — ${params.tenantName}`,
          message: `[CC-TG] ${params.ccMessage}`,
        });
      }
    }
  }

  return results;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  // Actualizar tipo de cambio a las 7:00 AM
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

  console.log('✅ Cron jobs registrados (Telegram + CallMeBot + CC)');
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

async function sendPaymentReminders(today: Date, config: typeof DEFAULT_CONFIG): Promise<void> {
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + config.reminderDaysBefore);

  const payments = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      dueDate: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) },
    },
    include: {
      contract: { include: { tenant: true, unit: { include: { property: true } } } },
    },
  });

  for (const payment of payments) {
    const { tenant, unit } = payment.contract;
    const tenantName   = `${tenant.firstName} ${tenant.lastName}`;
    const propertyUnit = `${unit.property.name} — ${unit.number}`;
    const amount       = toNumber(payment.amountDue);
    const currency     = payment.contract.currency as Currency;

    if (!tenant.telegramChatId && !tenant.callMeBotApiKey) {
      await saveLog({ type: 'REMINDER', status: 'SKIPPED', toPhone: tenant.phone, tenantName, message: 'Sin Telegram ni CallMeBot configurado', contractId: payment.contractId, paymentId: payment.id });
      continue;
    }

    await sendAll({
      telegramChatId: tenant.telegramChatId,
      phone: tenant.phone,
      callMeBotApiKey: tenant.callMeBotApiKey,
      ccNumbers: config.ccNumbers,
      type: 'REMINDER', tenantName,
      contractId: payment.contractId, paymentId: payment.id,
      ccMessage: `Recordatorio pago — ${tenantName} — ${propertyUnit}`,
      telegramFn: () => TelegramService.sendPaymentReminder({ chatId: tenant.telegramChatId!, tenantName, propertyUnit, amount, currency, dueDate: payment.dueDate }),
      callMeBotFn: () => CallMeBotService.sendPaymentReminder({ phone: tenant.phone, apiKey: tenant.callMeBotApiKey!, tenantName, propertyUnit, amount, currency, dueDate: payment.dueDate }),
    });
  }

  if (payments.length > 0) console.log(`📨 [CRON] Recordatorios: ${payments.length}`);
}

async function sendLatePaymentNotices(today: Date, config: typeof DEFAULT_CONFIG): Promise<void> {
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE' },
    include: { tenant: true, unit: { include: { property: true } }, payments: { where: { status: 'LATE' } } },
  });

  for (const contract of contracts) {
    if (!contract.tenant.telegramChatId && !contract.tenant.callMeBotApiKey) continue;

    for (const payment of contract.payments) {
      const graceDue = new Date(payment.dueDate);
      graceDue.setDate(graceDue.getDate() + contract.gracePeriodDays + 1);
      if (today.getTime() !== graceDue.getTime()) continue;

      const amountDue  = toNumber(payment.amountDue);
      const lateFee    = parseFloat(calcLateFee(amountDue, toNumber(contract.lateFeePercent)));
      const total      = parseFloat(addMoney(amountDue, lateFee));
      const tenantName = `${contract.tenant.firstName} ${contract.tenant.lastName}`;
      const currency   = contract.currency as Currency;
      const propertyUnit = `${contract.unit.property.name} — ${contract.unit.number}`;

      await sendAll({
        telegramChatId: contract.tenant.telegramChatId,
        phone: contract.tenant.phone,
        callMeBotApiKey: contract.tenant.callMeBotApiKey,
        ccNumbers: config.ccNumbers,
        type: 'LATE', tenantName, contractId: contract.id, paymentId: payment.id,
        ccMessage: `Aviso mora — ${tenantName} — ${payment.daysLate} días`,
        telegramFn: () => TelegramService.sendLatePaymentNotice({ chatId: contract.tenant.telegramChatId!, tenantName, propertyUnit, amountDue, lateFee, totalDue: total, currency, daysLate: payment.daysLate }),
        callMeBotFn: () => CallMeBotService.sendLatePaymentNotice({ phone: contract.tenant.phone, apiKey: contract.tenant.callMeBotApiKey!, tenantName, propertyUnit, amountDue, lateFee, totalDue: total, currency, daysLate: payment.daysLate }),
      });
    }
  }
}

async function sendRenewalNotices(today: Date, config: typeof DEFAULT_CONFIG): Promise<void> {
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + config.renewalDaysBefore);

  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE', endDate: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) }, renewalNoticeSentAt: null },
    include: { tenant: true, unit: { include: { property: true } } },
  });

  for (const contract of contracts) {
    if (!contract.tenant.telegramChatId && !contract.tenant.callMeBotApiKey) continue;

    const tenantName   = `${contract.tenant.firstName} ${contract.tenant.lastName}`;
    const propertyUnit = `${contract.unit.property.name} — ${contract.unit.number}`;
    const currency     = contract.currency as Currency;

    const results = await sendAll({
      telegramChatId: contract.tenant.telegramChatId,
      phone: contract.tenant.phone,
      callMeBotApiKey: contract.tenant.callMeBotApiKey,
      ccNumbers: config.ccNumbers,
      type: 'RENEWAL', tenantName, contractId: contract.id,
      ccMessage: `Aviso renovación — ${tenantName} — vence ${contract.endDate.toLocaleDateString('es-HN')}`,
      telegramFn: () => TelegramService.sendRenewalNotice({ chatId: contract.tenant.telegramChatId!, tenantName, propertyUnit, contractEndDate: contract.endDate, monthlyRent: toNumber(contract.monthlyRent), currency }),
      callMeBotFn: () => CallMeBotService.sendRenewalNotice({ phone: contract.tenant.phone, apiKey: contract.tenant.callMeBotApiKey!, tenantName, propertyUnit, contractEndDate: contract.endDate, monthlyRent: toNumber(contract.monthlyRent), currency }),
    });

    if (results.some(r => r.success)) {
      await prisma.contract.update({ where: { id: contract.id }, data: { renewalNoticeSentAt: new Date() } });
    }
  }

  if (contracts.length > 0) console.log(`📋 [CRON] Renovaciones: ${contracts.length}`);
}

async function markLatePayments(today: Date): Promise<void> {
  const pending = await prisma.payment.findMany({ where: { status: 'PENDING' }, include: { contract: true } });
  let marked = 0;
  for (const payment of pending) {
    const graceDue = new Date(payment.dueDate);
    graceDue.setDate(graceDue.getDate() + payment.contract.gracePeriodDays);
    if (today > graceDue) {
      const daysLate = Math.floor((today.getTime() - graceDue.getTime()) / 86400000);
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'LATE', isLate: true, daysLate, lateFeeAmount: parseFloat(calcLateFee(toNumber(payment.amountDue), toNumber(payment.contract.lateFeePercent))) },
      });
      marked++;
    }
  }
  if (marked > 0) console.log(`🔴 [CRON] Pagos en mora: ${marked}`);
}
