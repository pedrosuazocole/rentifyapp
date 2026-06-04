// src/jobs/notification.job.ts
// Canal único: CallMeBot (WhatsApp gratuito, sin límites de ventana)
// Cron jobs:
//   - Diario a la hora configurada: recordatorios, mora, renovaciones
//   - Lunes 3:00 PM: reporte de cuentas por cobrar a números CC
import cron from 'node-cron';
import { prisma } from '../config/database';
import { CallMeBotService } from '../services/callmebot.service';
import { ExchangeRateService } from '../services/exchange-rate.service';
import { calcLateFee, addMoney, toNumber, formatMoney } from '../utils/money';
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveLog(data: {
  type: 'REMINDER' | 'RECEIPT' | 'LATE' | 'RENEWAL' | 'INVOICE' | 'TEST';
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  toPhone: string;
  tenantName?: string;
  message: string;
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

// ── Enviar a un inquilino por CallMeBot ────────────────────────
async function sendToTenant(params: {
  phone: string;
  callMeBotApiKey: string | null;
  type: 'REMINDER' | 'RECEIPT' | 'LATE' | 'RENEWAL';
  tenantName: string;
  message: string;
  contractId?: string;
  paymentId?: string;
  fn: () => Promise<{ success: boolean; error?: string }>;
}) {
  if (!params.callMeBotApiKey) {
    await saveLog({ type: params.type, status: 'SKIPPED', toPhone: params.phone, tenantName: params.tenantName, message: 'Sin CallMeBot API Key configurada', contractId: params.contractId, paymentId: params.paymentId });
    return;
  }
  const result = await params.fn().catch(e => ({ success: false, error: String(e) }));
  await saveLog({ type: params.type, status: result.success ? 'SENT' : 'FAILED', toPhone: params.phone, tenantName: params.tenantName, message: params.message, errorMessage: result.error, contractId: params.contractId, paymentId: params.paymentId });
}

// ── Enviar a todos los números CC ──────────────────────────────
async function sendToCCNumbers(ccNumbers: string, message: string): Promise<void> {
  const list = ccNumbers.split(',').map(n => n.trim()).filter(Boolean);
  for (const cc of list) {
    await sleep(400); // respetar límite 3 msg/min de CallMeBot
    if (cc.includes(':')) {
      // Formato: +504XXXXXXXX:apikey
      const [phone, apiKey] = cc.split(':');
      const r = await CallMeBotService.send(phone.trim(), apiKey.trim(), message).catch(e => ({ success: false, error: String(e) }));
      await saveLog({ type: 'REMINDER', status: r.success ? 'SENT' : 'FAILED', toPhone: phone.trim(), tenantName: 'CC', message: `[CC] ${message.slice(0, 60)}`, errorMessage: r.error });
    }
  }
}

export function registerJobs(): void {
  // ── Actualizar tipo de cambio — 7:00 AM diario ──────────────
  cron.schedule('0 7 * * *', async () => {
    console.log('💱 [CRON] Actualizando tipo de cambio...');
    try {
      const { ExchangeRateService } = await import('../services/exchange-rate.service');
      await ExchangeRateService.fetchAndSave();
    } catch (err) {
      console.error('❌ [CRON] Error tipo de cambio:', err);
    }
  }, { timezone: 'America/Tegucigalpa' });

  // ── Notificaciones diarias — hora configurable ───────────────
  cron.schedule('* * * * *', async () => {
    try {
      const config = await getConfig();
      const now = new Date();
      const hn  = new Date(now.toLocaleString('en-US', { timeZone: 'America/Tegucigalpa' }));
      if (hn.getHours() === config.sendHour && hn.getMinutes() === config.sendMinute) {
        console.log(`⏰ [CRON] Notificaciones diarias (${config.sendHour}:${String(config.sendMinute).padStart(2,'0')})...`);
        await runDailyNotifications(config);
      }
    } catch (err) {
      console.error('❌ [CRON] Error scheduler:', err);
    }
  }, { timezone: 'America/Tegucigalpa' });

  // ── Reporte cuentas por cobrar — Lunes 3:00 PM ──────────────
  cron.schedule('0 15 * * 1', async () => {
    console.log('📊 [CRON] Enviando reporte cuentas por cobrar...');
    try {
      await sendCuentasPorCobrarReport();
    } catch (err) {
      console.error('❌ [CRON] Error reporte CxC:', err);
    }
  }, { timezone: 'America/Tegucigalpa' });

  console.log('✅ Cron jobs registrados (diario + lunes 3PM reporte CxC)');
}

// ══════════════════════════════════════════════════════════════
// NOTIFICACIONES DIARIAS
// ══════════════════════════════════════════════════════════════

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
    where: { status: 'PENDING', dueDate: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) } },
    include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
  });

  for (const payment of payments) {
    const { tenant, unit } = payment.contract;
    const tenantName   = `${tenant.firstName} ${tenant.lastName}`;
    const propertyUnit = `${unit.property.name} — ${unit.number}`;
    const amount       = toNumber(payment.amountDue);
    const currency     = payment.contract.currency as Currency;

    await sendToTenant({
      phone: tenant.phone, callMeBotApiKey: tenant.callMeBotApiKey,
      type: 'REMINDER', tenantName,
      message: `Recordatorio pago — ${propertyUnit}`,
      contractId: payment.contractId, paymentId: payment.id,
      fn: () => CallMeBotService.sendPaymentReminder({ phone: tenant.phone, apiKey: tenant.callMeBotApiKey!, tenantName, propertyUnit, amount, currency, dueDate: payment.dueDate }),
    });
    await sleep(400);
  }

  if (payments.length > 0) console.log(`📱 [CRON] Recordatorios: ${payments.length}`);
}

async function sendLatePaymentNotices(today: Date, _config: typeof DEFAULT_CONFIG): Promise<void> {
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE' },
    include: { tenant: true, unit: { include: { property: true } }, payments: { where: { status: 'LATE' } } },
  });

  for (const contract of contracts) {
    if (!contract.tenant.callMeBotApiKey) continue;
    for (const payment of contract.payments) {
      const graceDue = new Date(payment.dueDate);
      graceDue.setDate(graceDue.getDate() + contract.gracePeriodDays + 1);
      if (today.getTime() !== graceDue.getTime()) continue;

      const amountDue  = toNumber(payment.amountDue);
      const lateFee    = parseFloat(calcLateFee(amountDue, toNumber(contract.lateFeePercent)));
      const total      = parseFloat(addMoney(amountDue, lateFee));
      const tenantName = `${contract.tenant.firstName} ${contract.tenant.lastName}`;
      const propertyUnit = `${contract.unit.property.name} — ${contract.unit.number}`;
      const currency   = contract.currency as Currency;

      await sendToTenant({
        phone: contract.tenant.phone, callMeBotApiKey: contract.tenant.callMeBotApiKey,
        type: 'LATE', tenantName, contractId: contract.id, paymentId: payment.id,
        message: `Mora — ${payment.daysLate} días`,
        fn: () => CallMeBotService.sendLatePaymentNotice({ phone: contract.tenant.phone, apiKey: contract.tenant.callMeBotApiKey!, tenantName, propertyUnit, amountDue, lateFee, totalDue: total, currency, daysLate: payment.daysLate }),
      });
      await sleep(400);
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
    if (!contract.tenant.callMeBotApiKey) continue;
    const tenantName   = `${contract.tenant.firstName} ${contract.tenant.lastName}`;
    const propertyUnit = `${contract.unit.property.name} — ${contract.unit.number}`;
    const currency     = contract.currency as Currency;

    const r = await CallMeBotService.sendRenewalNotice({ phone: contract.tenant.phone, apiKey: contract.tenant.callMeBotApiKey!, tenantName, propertyUnit, contractEndDate: contract.endDate, monthlyRent: toNumber(contract.monthlyRent), currency });
    await saveLog({ type: 'RENEWAL', status: r.success ? 'SENT' : 'FAILED', toPhone: contract.tenant.phone, tenantName, message: `Renovación — vence ${contract.endDate.toLocaleDateString('es-HN')}`, errorMessage: r.error, contractId: contract.id });

    if (r.success) {
      await prisma.contract.update({ where: { id: contract.id }, data: { renewalNoticeSentAt: new Date() } });
    }
    await sleep(400);
  }
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

// ══════════════════════════════════════════════════════════════
// REPORTE CUENTAS POR COBRAR — Lunes 3:00 PM
// Se envía a todos los números CC configurados en la pantalla
// de notificaciones.
// ══════════════════════════════════════════════════════════════

export async function sendCuentasPorCobrarReport(): Promise<void> {
  const config = await getConfig();

  if (!config.ccNumbers) {
    console.log('📊 [CRON] Sin números CC — reporte no enviado.');
    return;
  }

  const hoy    = new Date();
  const semana = hoy.toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── 1. Tasa BCH del día ─────────────────────────────────────
  const bchRate = await ExchangeRateService.getTodayRate();

  // ── 2. Pagos pendientes con notas de débito ─────────────────
  const pendientes = await prisma.payment.findMany({
    where: { status: { in: ['PENDING', 'LATE', 'PARTIAL'] } },
    include: {
      contract: {
        include: {
          tenant: true,
          unit: { include: { property: true } },
          debitNotes: { where: { status: { in: ['PENDING', 'INCLUDED'] } } },
        },
      },
    },
    orderBy: [
      { contract: { tenant: { firstName: 'asc' } } },
      { dueDate: 'asc' },
    ],
  });

  // ── 3. Agrupar por inquilino ────────────────────────────────
  const byTenant = new Map<string, {
    nombre: string;
    phone: string;
    subtotalHNL: number;
    pagos: typeof pendientes;
  }>();

  for (const p of pendientes) {
    const tid    = p.contract.tenant.id;
    const nombre = `${p.contract.tenant.firstName} ${p.contract.tenant.lastName}`;

    if (!byTenant.has(tid)) {
      byTenant.set(tid, { nombre, phone: p.contract.tenant.phone, subtotalHNL: 0, pagos: [] });
    }

    const due  = toNumber(p.amountDue);
    const paid = toNumber(p.amountPaid);
    const bal  = Math.max(0, due - paid);

    // Notas de débito del mismo período — mora siempre 0
    const dns = (p.contract.debitNotes || []).filter(
      dn => dn.periodMonth === p.periodMonth && dn.periodYear === p.periodYear
    );
    const dnHNL = dns.reduce((s, dn) => {
      const amt = toNumber(dn.amount);
      return s + (dn.currency === 'HNL' ? amt : amt * bchRate);
    }, 0);

    const balHNL = (p.contract.currency === 'HNL' ? bal : bal * bchRate) + dnHNL;

    byTenant.get(tid)!.subtotalHNL += balHNL;
    byTenant.get(tid)!.pagos.push(p);
  }

  // ── 4. Total global HNL ─────────────────────────────────────
  let grandTotalHNL = 0;
  let countMora     = 0;
  let countParcial  = 0;

  for (const g of byTenant.values()) {
    grandTotalHNL += g.subtotalHNL;
  }
  for (const p of pendientes) {
    if (p.status === 'LATE')    countMora++;
    if (p.status === 'PARTIAL') countParcial++;
  }

  // ── 5. Construir mensaje WhatsApp ───────────────────────────
  const fmtHNL = (n: number) =>
    `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  let msg = `📊 *RENTIFY — CUENTAS POR COBRAR*\n`;
  msg += `📅 ${semana}\n`;
  msg += `💱 Tasa BCH: *L ${bchRate.toFixed(4)}* por USD\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📌 Registros pendientes: *${pendientes.length}*\n`;
  msg += `👥 Clientes con saldo: *${byTenant.size}*\n`;
  if (countMora    > 0) msg += `🔴 En mora: *${countMora}* pago(s)\n`;
  if (countParcial > 0) msg += `🟡 Abonados: *${countParcial}* pago(s)\n`;
  msg += `\n💰 *TOTAL GLOBAL: ${fmtHNL(grandTotalHNL)}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // ── 6. Detalle agrupado por cliente ────────────────────────
  const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const STATUS_ICON: Record<string, string> = {
    PENDING: '🟠', PARTIAL: '🟡', LATE: '🔴',
  };

  let clienteIdx = 0;
  for (const [, g] of byTenant) {
    clienteIdx++;
    msg += `\n👤 *${g.nombre}*`;
    if (g.phone) msg += ` · ${g.phone}`;
    msg += `\n`;

    for (const p of g.pagos) {
      const due    = toNumber(p.amountDue);
      const paid   = toNumber(p.amountPaid);
      const bal    = Math.max(0, due - paid);
      const unidad = `${p.contract.unit.property.name} - ${p.contract.unit.number}`;
      const per    = `${MESES[p.periodMonth] || ''} ${p.periodYear}`;
      const vence  = p.dueDate.toLocaleDateString('es-HN', { month: 'short', day: 'numeric' });
      const icon   = STATUS_ICON[p.status] || '⚪';

      // Notas de débito del período
      const dns = (p.contract.debitNotes || []).filter(
        dn => dn.periodMonth === p.periodMonth && dn.periodYear === p.periodYear
      );
      const dnHNL = dns.reduce((s, dn) => {
        const amt = toNumber(dn.amount);
        return s + (dn.currency === 'HNL' ? amt : amt * bchRate);
      }, 0);
      const balHNL = (p.contract.currency === 'HNL' ? bal : bal * bchRate) + dnHNL;

      // Formatear monto original
      const montoOrig = p.contract.currency === 'USD'
        ? `$${bal.toFixed(2)} → ${fmtHNL(bal * bchRate)}`
        : fmtHNL(bal);

      msg += `  ${icon} ${unidad} (${per})\n`;
      msg += `     Saldo: *${montoOrig}*`;
      if (dnHNL > 0) msg += ` + ND: *${fmtHNL(dnHNL)}*`;
      msg += ` — vence ${vence}\n`;
      if (p.status === 'LATE') msg += `     ⚠️ Mora: L 0.00\n`;
    }

    msg += `  📌 Subtotal: *${fmtHNL(g.subtotalHNL)}*\n`;

    // Pausa entre clientes para no saturar el mensaje
    if (clienteIdx < byTenant.size) msg += `- - - - - - - - - - - - -\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 *TOTAL GLOBAL: ${fmtHNL(grandTotalHNL)}*\n`;
  msg += `🔗 Ver detalle completo en Rentify`;

  // ── 7. Si el mensaje supera ~4000 chars (límite WhatsApp) ──
  //       enviar resumen + detalle en mensajes separados
  if (msg.length > 3800) {
    // Mensaje 1: resumen
    let resumen = `📊 *RENTIFY — CUENTAS POR COBRAR*\n`;
    resumen += `📅 ${semana} · Tasa BCH: L ${bchRate.toFixed(4)}\n`;
    resumen += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    resumen += `📌 Registros: *${pendientes.length}* · Clientes: *${byTenant.size}*\n`;
    if (countMora    > 0) resumen += `🔴 En mora: *${countMora}*\n`;
    if (countParcial > 0) resumen += `🟡 Abonados: *${countParcial}*\n`;
    resumen += `💰 *TOTAL GLOBAL: ${fmtHNL(grandTotalHNL)}*\n`;
    resumen += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    resumen += `_(Detalle por cliente en el siguiente mensaje)_`;

    await sendToCCNumbers(config.ccNumbers, resumen);
    await sleep(1500);

    // Mensaje 2: detalle por cliente (máx 3800 chars)
    let detallMsg = `📋 *DETALLE POR CLIENTE:*\n`;
    for (const [, g] of byTenant) {
      const bloque = `\n👤 *${g.nombre}*${g.phone?' · '+g.phone:''}\n` +
        g.pagos.map(p => {
          const bal   = Math.max(0, toNumber(p.amountDue) - toNumber(p.amountPaid));
          const balHNL = p.contract.currency === 'HNL' ? bal : bal * bchRate;
          const icon  = STATUS_ICON[p.status] || '⚪';
          const vence = p.dueDate.toLocaleDateString('es-HN', { month: 'short', day: 'numeric' });
          return `  ${icon} ${p.contract.unit.property.name}-${p.contract.unit.number} · ${fmtHNL(balHNL)} · ${vence}`;
        }).join('\n') +
        `\n  📌 Subtotal: *${fmtHNL(g.subtotalHNL)}*\n`;

      if ((detallMsg + bloque).length > 3800) {
        detallMsg += `\n_(... y más clientes. Ver Rentify App)_`;
        break;
      }
      detallMsg += bloque;
    }
    detallMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL: ${fmtHNL(grandTotalHNL)}*`;

    await sendToCCNumbers(config.ccNumbers, detallMsg);
  } else {
    await sendToCCNumbers(config.ccNumbers, msg);
  }

  console.log(`📊 [CRON] Reporte CxC enviado a CC: ${config.ccNumbers}`);
}
