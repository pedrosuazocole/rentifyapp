// src/jobs/notification.job.ts
// Cron jobs que corren cada mañana evaluando contratos y pagos
import cron from 'node-cron';
import { prisma } from '../config/database';
import { WhatsAppService } from '../services/whatsapp.service';
import { calcLateFee, addMoney, toNumber } from '../utils/money';

/**
 * Registra todos los cron jobs del sistema.
 * Llamar una sola vez al arrancar la app.
 */
export function registerJobs(): void {
  // Corre todos los días a las 8:00 AM (hora Honduras)
  cron.schedule('0 8 * * *', () => {
    console.log('⏰ [CRON] Ejecutando notificaciones diarias...');
    runDailyNotifications().catch(console.error);
  }, { timezone: 'America/Tegucigalpa' });

  // Actualizar tipo de cambio todos los días a las 7:00 AM
  cron.schedule('0 7 * * *', async () => {
    console.log('💱 [CRON] Actualizando tipo de cambio...');
    try {
      const { ExchangeRateService } = await import('../services/exchange-rate.service');
      await ExchangeRateService.fetchAndSave();
    } catch (err) {
      console.error('❌ [CRON] Error al actualizar tipo de cambio:', err);
    }
  }, { timezone: 'America/Tegucigalpa' });

  console.log('✅ Cron jobs registrados (8:00 AM — notificaciones, 7:00 AM — tipo de cambio)');
}

async function runDailyNotifications(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await Promise.allSettled([
    sendPaymentReminders(today),
    sendLatePaymentNotices(today),
    sendRenewalNotices(today),
    markLatePayments(today),
  ]);

  console.log('✅ [CRON] Notificaciones diarias completadas.');
}

/** Recordatorios de pago: 3 días antes del vencimiento */
async function sendPaymentReminders(today: Date): Promise<void> {
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + 3);

  const payments = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      dueDate: {
        gte: targetDate,
        lt: new Date(targetDate.getTime() + 86400000),
      },
    },
    include: {
      contract: {
        include: { tenant: true, unit: { include: { property: true } } },
      },
    },
  });

  for (const payment of payments) {
    const { tenant, unit } = payment.contract;
    await WhatsAppService.sendPaymentReminder({
      phone: tenant.phone,
      tenantName: `${tenant.firstName} ${tenant.lastName}`,
      propertyUnit: `${unit.property.name} — ${unit.number}`,
      amount: toNumber(payment.amountDue),
      currency: payment.contract.currency,
      dueDate: payment.dueDate,
    }).catch(console.error);
  }

  if (payments.length > 0) {
    console.log(`📱 [CRON] Recordatorios enviados: ${payments.length}`);
  }
}

/** Avisos de mora: 1 día después de vencido el período de gracia */
async function sendLatePaymentNotices(today: Date): Promise<void> {
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE' },
    include: {
      tenant: true,
      unit: { include: { property: true } },
      payments: { where: { status: 'LATE' } },
    },
  });

  for (const contract of contracts) {
    for (const payment of contract.payments) {
      const graceDue = new Date(payment.dueDate);
      graceDue.setDate(graceDue.getDate() + contract.gracePeriodDays + 1);

      if (today.getTime() !== graceDue.getTime()) continue;

      const amountDue = toNumber(payment.amountDue);
      const lateFee = parseFloat(
        calcLateFee(amountDue, toNumber(contract.lateFeePercent))
      );
      const total = parseFloat(addMoney(amountDue, lateFee));

      await WhatsAppService.sendLatePaymentNotice({
        phone: contract.tenant.phone,
        tenantName: `${contract.tenant.firstName} ${contract.tenant.lastName}`,
        propertyUnit: `${contract.unit.property.name} — ${contract.unit.number}`,
        amountDue,
        lateFee,
        totalDue: total,
        currency: contract.currency,
        daysLate: payment.daysLate,
      }).catch(console.error);
    }
  }
}

/** Alertas de renovación: 30 días antes del fin del contrato */
async function sendRenewalNotices(today: Date): Promise<void> {
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + 30);

  const contracts = await prisma.contract.findMany({
    where: {
      status: 'ACTIVE',
      endDate: {
        gte: targetDate,
        lt: new Date(targetDate.getTime() + 86400000),
      },
      renewalNoticeSentAt: null,
    },
    include: {
      tenant: true,
      unit: { include: { property: true } },
    },
  });

  for (const contract of contracts) {
    const result = await WhatsAppService.sendRenewalNotice({
      phone: contract.tenant.phone,
      tenantName: `${contract.tenant.firstName} ${contract.tenant.lastName}`,
      propertyUnit: `${contract.unit.property.name} — ${contract.unit.number}`,
      contractEndDate: contract.endDate,
      monthlyRent: toNumber(contract.monthlyRent),
      currency: contract.currency,
    }).catch(console.error);

    if (result?.success) {
      await prisma.contract.update({
        where: { id: contract.id },
        data: { renewalNoticeSentAt: new Date() },
      });
    }
  }

  if (contracts.length > 0) {
    console.log(`📋 [CRON] Avisos de renovación enviados: ${contracts.length}`);
  }
}

/** Marcar pagos en mora automáticamente */
async function markLatePayments(today: Date): Promise<void> {
  const pendingPayments = await prisma.payment.findMany({
    where: { status: 'PENDING' },
    include: { contract: true },
  });

  let marked = 0;
  for (const payment of pendingPayments) {
    const graceDue = new Date(payment.dueDate);
    graceDue.setDate(graceDue.getDate() + payment.contract.gracePeriodDays);

    if (today > graceDue) {
      const daysLate = Math.floor(
        (today.getTime() - graceDue.getTime()) / 86400000
      );
      const lateFee = calcLateFee(
        toNumber(payment.amountDue),
        toNumber(payment.contract.lateFeePercent)
      );

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'LATE',
          isLate: true,
          daysLate,
          lateFeeAmount: parseFloat(lateFee),
        },
      });
      marked++;
    }
  }

  if (marked > 0) {
    console.log(`🔴 [CRON] Pagos marcados en mora: ${marked}`);
  }
}
