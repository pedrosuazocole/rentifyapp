// src/jobs/notification.job.ts
// Canal: TextMeBot (PDF adjunto) con fallback a CallMeBot
// Cron jobs:
//   - Diario a la hora configurada: recordatorios, mora, renovaciones
//   - Lunes 3:00 PM: reporte de cuentas por cobrar a números CC
import cron from 'node-cron';
import { prisma } from '../config/database';
import { CallMeBotService } from '../services/callmebot.service';
import { TextMeBotService } from '../services/textmebot.service';
import { PdfService } from '../services/pdf.service';
import { ExchangeRateService } from '../services/exchange-rate.service';
import { calcLateFee, addMoney, toNumber, formatMoney } from '../utils/money';
import { Currency } from '../types';
import { env } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  textMeBotSenderKey: null as string | null,
  ccNumbersTextMeBot: null as string | null,
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
// ── Enviar a un inquilino — prioriza la API Key GLOBAL de TextMeBot ──
// (una sola key tuya puede enviarle a CUALQUIER número, sin que el
// inquilino necesite activar nada) y solo usa CallMeBot si el
// inquilino tiene su propia key individual configurada.
async function sendToTenant(params: {
  phone: string;
  textMeBotSenderKey: string | null;  // key GLOBAL (de Notificaciones)
  callMeBotApiKey: string | null;     // key individual del inquilino
  type: 'REMINDER' | 'RECEIPT' | 'LATE' | 'RENEWAL';
  tenantName: string;
  message: string;
  contractId?: string;
  paymentId?: string;
  textFn: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  callFn: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const tmbKey = params.textMeBotSenderKey?.trim();
  const cmbKey = params.callMeBotApiKey?.trim();

  if (!tmbKey && !cmbKey) {
    await saveLog({ type: params.type, status: 'SKIPPED', toPhone: params.phone, tenantName: params.tenantName, message: 'Sin canal configurado', errorMessage: 'Sin TextMeBot (global) ni CallMeBot configurado para este inquilino', contractId: params.contractId, paymentId: params.paymentId });
    return;
  }

  const canal  = tmbKey ? 'TextMeBot' : 'CallMeBot';
  const result = tmbKey
    ? await params.textFn(tmbKey).catch(e => ({ success: false, error: String(e) }))
    : await params.callFn(cmbKey!).catch(e => ({ success: false, error: String(e) }));

  await saveLog({ type: params.type, status: result.success ? 'SENT' : 'FAILED', toPhone: params.phone, tenantName: params.tenantName, message: `[${canal}] ${params.message}`, errorMessage: result.error, contractId: params.contractId, paymentId: params.paymentId });
}

// ── Enviar a CC por TextMeBot (una sola API key del remitente → varios destinatarios) ──
async function sendToCCByTextMeBot(senderKey: string, ccNumbers: string, message: string): Promise<void> {
  const list = ccNumbers.split(',').map(n => n.trim()).filter(Boolean);
  for (const raw of list) {
    await sleep(9000); // TextMeBot exige mínimo 8 seg entre mensajes
    // Tolerante: si por error pegaron formato CallMeBot (+504...:apikey), usamos solo el número
    const phone = raw.includes(':') ? raw.split(':')[0].trim() : raw;
    const r = await TextMeBotService.send(phone, senderKey, message).catch(e => ({ success: false, error: String(e) }));
    await saveLog({ type: 'REMINDER', status: r.success ? 'SENT' : 'FAILED', toPhone: phone, tenantName: 'CC-TextMeBot', message: `[CC-TMB] ${message.slice(0, 60)}`, errorMessage: r.error });
  }
}

// ── Enviar a CC por CallMeBot (cada número tiene su propia API key NUMÉRICA) ──
async function sendToCCByCallMeBot(ccNumbers: string, message: string): Promise<void> {
  const list = ccNumbers.split(',').map(n => n.trim()).filter(Boolean);
  for (const cc of list) {
    await sleep(500);
    if (!cc.includes(':')) continue; // formato sin ":apikey" — no es CallMeBot, se ignora

    const [phoneRaw, apiKeyRaw] = cc.split(':');
    const phone  = phoneRaw.trim();
    const apiKey = (apiKeyRaw || '').trim();

    if (!apiKey) {
      await saveLog({ type: 'REMINDER', status: 'SKIPPED', toPhone: phone, tenantName: 'CC-CallMeBot', message: 'Formato inválido', errorMessage: `Falta la API Key después de ":" en "${cc}"` });
      continue;
    }
    if (!/^\d+$/.test(apiKey)) {
      // CallMeBot usa keys numéricas — esta key parece ser de TextMeBot puesta en el campo equivocado
      await saveLog({ type: 'REMINDER', status: 'SKIPPED', toPhone: phone, tenantName: 'CC-CallMeBot', message: 'Key no numérica', errorMessage: `La key "${apiKey}" no es numérica. ¿La pegaste en el campo de CallMeBot CC por error? Esa key va en "Tu API Key de TextMeBot".` });
      continue;
    }

    const r = await CallMeBotService.send(phone, apiKey, message).catch(e => ({ success: false, error: String(e) }));
    await saveLog({ type: 'REMINDER', status: r.success ? 'SENT' : 'FAILED', toPhone: phone, tenantName: 'CC-CallMeBot', message: `[CC-CMB] ${message.slice(0, 60)}`, errorMessage: r.error });
  }
}

// ── Enviar a todos los CC (TextMeBot primero, luego CallMeBot) ──
async function sendToCCNumbers(message: string, config: typeof DEFAULT_CONFIG): Promise<void> {
  // TextMeBot: una key del remitente, múltiples destinatarios
  if (config.textMeBotSenderKey && config.ccNumbersTextMeBot) {
    await sendToCCByTextMeBot(config.textMeBotSenderKey, config.ccNumbersTextMeBot, message);
  }
  // CallMeBot: cada número tiene su propia key
  if (config.ccNumbers) {
    await sendToCCByCallMeBot(config.ccNumbers, message);
  }
}

export function registerJobs(): void {
  // ── Actualizar tipo de cambio (tasa de VENTA, Banpaís) — 7:00 AM diario ──
  cron.schedule('0 7 * * *', async () => {
    console.log('💱 [CRON] Actualizando tipo de cambio desde Banpaís...');
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
      phone: tenant.phone,
      textMeBotSenderKey: config.textMeBotSenderKey,
      callMeBotApiKey: tenant.callMeBotApiKey,
      type: 'REMINDER', tenantName,
      message: `Recordatorio pago — ${propertyUnit}`,
      contractId: payment.contractId, paymentId: payment.id,
      textFn: (apiKey) => TextMeBotService.sendPaymentReminder({ phone: tenant.phone, apiKey, tenantName, propertyUnit, amount, currency, dueDate: payment.dueDate }),
      callFn: (apiKey) => CallMeBotService.sendPaymentReminder({ phone: tenant.phone, apiKey, tenantName, propertyUnit, amount, currency, dueDate: payment.dueDate }),
    });
    await sleep(400);
  }

  if (payments.length > 0) console.log(`📱 [CRON] Recordatorios: ${payments.length}`);
}

async function sendLatePaymentNotices(today: Date, config: typeof DEFAULT_CONFIG): Promise<void> {
  const contracts = await prisma.contract.findMany({
    where: { status: 'ACTIVE' },
    include: { tenant: true, unit: { include: { property: true } }, payments: { where: { status: 'LATE' } } },
  });

  for (const contract of contracts) {
    if (!config.textMeBotSenderKey?.trim() && !contract.tenant.callMeBotApiKey?.trim()) continue;
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
        phone: contract.tenant.phone,
        textMeBotSenderKey: config.textMeBotSenderKey,
        callMeBotApiKey: contract.tenant.callMeBotApiKey,
        type: 'LATE', tenantName, contractId: contract.id, paymentId: payment.id,
        message: `Mora — ${payment.daysLate} días`,
        textFn: (apiKey) => TextMeBotService.sendLatePaymentNotice({ phone: contract.tenant.phone, apiKey, tenantName, propertyUnit, amountDue, lateFee, totalDue: total, currency, daysLate: payment.daysLate }),
        callFn: (apiKey) => CallMeBotService.sendLatePaymentNotice({ phone: contract.tenant.phone, apiKey, tenantName, propertyUnit, amountDue, lateFee, totalDue: total, currency, daysLate: payment.daysLate }),
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
    const tmbKey = config.textMeBotSenderKey?.trim();
    const cmbKey = contract.tenant.callMeBotApiKey?.trim();
    if (!tmbKey && !cmbKey) continue;

    const tenantName   = `${contract.tenant.firstName} ${contract.tenant.lastName}`;
    const propertyUnit = `${contract.unit.property.name} — ${contract.unit.number}`;
    const currency     = contract.currency as Currency;
    const canal        = tmbKey ? 'TextMeBot' : 'CallMeBot';

    const r = tmbKey
      ? await TextMeBotService.sendRenewalNotice({ phone: contract.tenant.phone, apiKey: tmbKey, tenantName, propertyUnit, contractEndDate: contract.endDate, monthlyRent: toNumber(contract.monthlyRent), currency })
      : await CallMeBotService.sendRenewalNotice({ phone: contract.tenant.phone, apiKey: cmbKey!, tenantName, propertyUnit, contractEndDate: contract.endDate, monthlyRent: toNumber(contract.monthlyRent), currency });

    await saveLog({ type: 'RENEWAL', status: r.success ? 'SENT' : 'FAILED', toPhone: contract.tenant.phone, tenantName, message: `[${canal}] Renovación — vence ${contract.endDate.toLocaleDateString('es-HN')}`, errorMessage: r.error, contractId: contract.id });

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
  // La config (TextMeBot sender key + números CC) SIEMPRE es la de la
  // empresa principal — todas las empresas comparten esa misma key.
  const config = await getConfig();

  if (!config.textMeBotSenderKey && !config.ccNumbers) {
    console.log('📊 [CRON] Sin números CC — reporte no enviado.');
    return;
  }

  const hoy    = new Date();
  const semana = hoy.toLocaleDateString('es-HN', { year: 'numeric', month: 'long', day: 'numeric' });
  const bchRate = await ExchangeRateService.getTodayRate();

  const fmtHNL = (n: number) =>
    `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const MESES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // ── Empresas a procesar: la principal (companyId null) + cada empresa activa ──
  const empresas = await prisma.company.findMany({ where: { isActive: true } });
  const scopes: Array<{ companyId: string | null; label: string | null }> = [
    { companyId: null, label: null }, // Empresa principal — sin etiqueta, igual que antes
    ...empresas.map(e => ({ companyId: e.id, label: e.name })),
  ];

  let enviados = 0;

  for (const scope of scopes) {
    // ── 1. Pagos pendientes de ESTA empresa con notas de débito ──
    const pendientes = await prisma.payment.findMany({
      where: {
        status: { in: ['PENDING', 'LATE', 'PARTIAL'] },
        contract: { companyId: scope.companyId },
      },
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

    if (pendientes.length === 0) continue; // nada pendiente en esta empresa — no se envía reporte vacío

    // ── 2. Agrupar por inquilino ────────────────────────────────
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

    // ── 3. Total de ESTA empresa ──────────────────────────────────
    let grandTotalHNL = 0;
    let countMora     = 0;
    let countParcial  = 0;

    for (const g of byTenant.values()) grandTotalHNL += g.subtotalHNL;
    for (const p of pendientes) {
      if (p.status === 'LATE')    countMora++;
      if (p.status === 'PARTIAL') countParcial++;
    }

    // ── 4. Mensaje corto (intro) — etiquetado con la empresa si aplica ──
    const tituloEmpresa = scope.label ? ` — ${scope.label.toUpperCase()}` : '';
    let introMsg = `📊 *RENTIFY — CUENTAS POR COBRAR${tituloEmpresa}*\n`;
    introMsg += `📅 ${semana}\n`;
    introMsg += `💱 Tasa BCH: *L ${bchRate.toFixed(4)}* por USD\n`;
    introMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    introMsg += `📌 Registros pendientes: *${pendientes.length}*\n`;
    introMsg += `👥 Clientes con saldo: *${byTenant.size}*\n`;
    if (countMora    > 0) introMsg += `🔴 En mora: *${countMora}* pago(s)\n`;
    if (countParcial > 0) introMsg += `🟡 Abonados: *${countParcial}* pago(s)\n`;
    introMsg += `\n💰 *TOTAL${tituloEmpresa}: ${fmtHNL(grandTotalHNL)}*\n`;
    introMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    introMsg += `📎 Detalle completo por cliente en el PDF adjunto.`;

    // ── 5. Generar PDF de ESTA empresa ───────────────────────────
    const pdfClientes = Array.from(byTenant.values()).map(g => ({
      nombre: g.nombre,
      phone: g.phone,
      subtotalHNL: g.subtotalHNL,
      items: g.pagos.map(p => {
        const due  = toNumber(p.amountDue);
        const paid = toNumber(p.amountPaid);
        const bal  = Math.max(0, due - paid);
        const dns  = (p.contract.debitNotes || []).filter(
          dn => dn.periodMonth === p.periodMonth && dn.periodYear === p.periodYear
        );
        const dnHNL = dns.reduce((s, dn) => {
          const amt = toNumber(dn.amount);
          return s + (dn.currency === 'HNL' ? amt : amt * bchRate);
        }, 0);
        const balHNL = (p.contract.currency === 'HNL' ? bal : bal * bchRate) + dnHNL;
        return {
          propiedad:   `${p.contract.unit.property.name} - ${p.contract.unit.number}`,
          periodo:     `${MESES[p.periodMonth] || ''} ${p.periodYear}`,
          estado:      p.status,
          montoHNL:    balHNL,
          vencimiento: p.dueDate.toLocaleDateString('es-HN', { month: 'short', day: 'numeric' }),
        };
      }),
    }));

    const pdfBuffer = await PdfService.generateCxcReport({
      fecha: hoy,
      bchRate,
      totalRegistros: pendientes.length,
      totalClientes: byTenant.size,
      countMora,
      countParcial,
      grandTotalHNL,
      companyLabel: scope.label || undefined,
      clientes: pdfClientes,
    });

    const pdfName = `proof-cxc-report-${scope.companyId || 'main'}-${Date.now()}.pdf`;
    const pdfPath = path.join(os.tmpdir(), pdfName);
    fs.writeFileSync(pdfPath, pdfBuffer);
    const pdfUrl = `${env.APP_URL}/api/payments/proof/${pdfName}`;
    const pdfFilename = scope.label
      ? `reporte-cxc-${scope.label.toLowerCase().replace(/\s+/g, '-')}.pdf`
      : 'reporte-cxc-rentify.pdf';

    // ── 6. Enviar por TextMeBot — SIEMPRE con la key global ──────
    if (config.textMeBotSenderKey?.trim() && config.ccNumbersTextMeBot) {
      const recipients = config.ccNumbersTextMeBot.split(',').map(n => n.trim()).filter(Boolean);
      for (const raw of recipients) {
        await sleep(9000); // TextMeBot exige mínimo 8 seg entre mensajes
        const phone = raw.includes(':') ? raw.split(':')[0].trim() : raw;
        const r = await TextMeBotService.send(phone, config.textMeBotSenderKey!, introMsg, pdfUrl, pdfFilename)
          .catch(e => ({ success: false, error: String(e) }));
        await saveLog({ type: 'REMINDER', status: r.success ? 'SENT' : 'FAILED', toPhone: phone, tenantName: scope.label ? `CC-TextMeBot (${scope.label})` : 'CC-TextMeBot', message: `[CC-TMB] Reporte CxC${tituloEmpresa} con PDF adjunto`, errorMessage: r.error });
      }
    }

    // ── 7. Enviar por CallMeBot (solo texto) ─────────────────────
    if (config.ccNumbers) {
      let detallMsg = `📋 *DETALLE POR CLIENTE${tituloEmpresa}:*\n`;
      for (const [, g] of byTenant) {
        const bloque = `\n👤 *${g.nombre}*${g.phone?' · '+g.phone:''}\n` +
          g.pagos.map(p => {
            const bal   = Math.max(0, toNumber(p.amountDue) - toNumber(p.amountPaid));
            const balHNL = p.contract.currency === 'HNL' ? bal : bal * bchRate;
            const vence = p.dueDate.toLocaleDateString('es-HN', { month: 'short', day: 'numeric' });
            return `  • ${p.contract.unit.property.name}-${p.contract.unit.number} · ${fmtHNL(balHNL)} · ${vence}`;
          }).join('\n') +
          `\n  📌 Subtotal: *${fmtHNL(g.subtotalHNL)}*\n`;

        if ((detallMsg + bloque).length > 3500) {
          detallMsg += `\n_(... y más clientes. Ver Rentify App)_`;
          break;
        }
        detallMsg += bloque;
      }
      detallMsg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL${tituloEmpresa}: ${fmtHNL(grandTotalHNL)}*`;

      await sendToCCByCallMeBot(config.ccNumbers, introMsg);
      await sleep(1000);
      await sendToCCByCallMeBot(config.ccNumbers, detallMsg);
    }

    // Limpiar el PDF temporal de esta empresa después de 5 minutos
    setTimeout(() => { try { fs.unlinkSync(pdfPath); } catch {} }, 5 * 60 * 1000);

    enviados++;
    console.log(`📊 [CRON] Reporte CxC enviado${tituloEmpresa || ' (empresa principal)'} — ${pendientes.length} pago(s) pendiente(s).`);
  }

  if (enviados === 0) {
    console.log('📊 [CRON] Ninguna empresa tenía pagos pendientes — no se envió ningún reporte.');
  }
}
