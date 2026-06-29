// src/modules/payments/payments.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse, paginatedResponse, errorResponse, Currency } from '../../types';
import { ExchangeRateService } from '../../services/exchange-rate.service';
import { TelegramService } from '../../services/telegram.service';
import { TextMeBotService } from '../../services/textmebot.service';
import { CallMeBotService } from '../../services/callmebot.service';
import { PdfService } from '../../services/pdf.service';
import { calcLateFee, addMoney, convertUSDtoHNL, convertHNLtoUSD, toNumber, formatMoney } from '../../utils/money';
import { env } from '../../config/env';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const paymentsController = {
  /** GET /api/payments */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;
      const status = req.query.status as string;
      const contractId = req.query.contractId as string;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (contractId) where.contractId = contractId;
      if (req.user!.role !== 'ADMIN') where.contract = { companyId: req.user!.companyId };

      const [payments, total] = await Promise.all([
        prisma.payment.findMany({
          where,
          skip,
          take: limit,
          orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
          include: {
            contract: {
              include: { tenant: true, unit: { include: { property: true } } },
            },
          },
        }),
        prisma.payment.count({ where }),
      ]);

      res.json(paginatedResponse(payments, page, limit, total));
    } catch (err) { next(err); }
  },

  /** POST /api/payments/generate — genera pagos del mes para todos los contratos activos */
  async generateMonthly(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { month, year } = req.body;
      const targetMonth = month || new Date().getMonth() + 1;
      const targetYear = year || new Date().getFullYear();

      const contracts = await prisma.contract.findMany({
        where: { status: 'ACTIVE' },
      });

      let created = 0;
      let skipped = 0;

      for (const contract of contracts) {
        const dueDate = new Date(targetYear, targetMonth - 1, contract.paymentDayOfMonth);

        // Evitar duplicados (constraint único en la BD)
        const exists = await prisma.payment.findUnique({
          where: { contractId_periodMonth_periodYear: {
            contractId: contract.id,
            periodMonth: targetMonth,
            periodYear: targetYear,
          }},
        });

        if (exists) { skipped++; continue; }

        await prisma.payment.create({
          data: {
            contractId: contract.id,
            periodMonth: targetMonth,
            periodYear: targetYear,
            amountDue: contract.monthlyRent,
            amountPaid: 0,
            paymentCurrency: contract.currency,
            dueDate,
            status: 'PENDING',
          },
        });
        created++;
      }

      res.json(successResponse(
        { created, skipped, month: targetMonth, year: targetYear },
        `Pagos generados: ${created} nuevos, ${skipped} ya existían.`
      ));
    } catch (err) { next(err); }
  },

  /**
   * POST /api/payments/:id/register — OPERACIÓN ATÓMICA
   * Registra el pago, calcula mora y conversión de moneda, genera PDF y envía WhatsApp.
   */
  async register(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { amountPaid, paymentCurrency, paymentDate, notes,
              proofBase64, proofMime, proofName, proofs } = req.body;
      // Normalizamos a un arreglo de comprobantes (máx. 5), aceptando también
      // el formato anterior de un solo archivo para no romper integraciones viejas.
      const MAX_PROOFS = 5;
      let proofList: Array<{ proofBase64: string; proofMime: string; proofName: string }> =
        Array.isArray(proofs) ? proofs.filter((p: any) => p?.proofBase64 && p?.proofMime && p?.proofName) : [];
      if (!proofList.length && proofBase64 && proofMime && proofName) {
        proofList = [{ proofBase64, proofMime, proofName }];
      }
      if (proofList.length > MAX_PROOFS) proofList = proofList.slice(0, MAX_PROOFS);
      const hasProofs = proofList.length > 0;
      const paidDate = paymentDate ? new Date(paymentDate) : new Date();

      // 1. Cargar el pago con su contrato e inquilino
      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: {
          contract: {
            include: { tenant: true, unit: { include: { property: true } } },
          },
        },
      });

      if (!payment) throw new AppError('Pago no encontrado.', 404);
      if (payment.status === 'PAID') throw new AppError('Este pago ya fue registrado.', 400);
      if (payment.status === 'WAIVED') throw new AppError('Este pago fue condonado.', 400);

      const { contract } = payment;

      // 2. Determinar mora
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const graceDue = new Date(payment.dueDate);
      graceDue.setDate(graceDue.getDate() + contract.gracePeriodDays);
      const isLate = today > graceDue;
      const daysLate = isLate
        ? Math.floor((today.getTime() - graceDue.getTime()) / 86400000)
        : 0;
      const amountDueNum = toNumber(payment.amountDue);
      const lateFeeAmount = isLate
        ? parseFloat(calcLateFee(amountDueNum, toNumber(contract.lateFeePercent)))
        : 0;

      // 3. Conversión de moneda si el pago es en moneda distinta al contrato
      let exchangeRateUsed: number | undefined;
      let amountInContractCurrency: number | undefined;

      if (paymentCurrency !== contract.currency) {
        // Usamos la tasa de VENTA vigente en la fecha del pago (no la de hoy),
        // para que la conversión quede fijada con la tasa correspondiente
        // al día en que se emite/registra el pago.
        exchangeRateUsed = await ExchangeRateService.getRateForDate(paidDate);
        if (paymentCurrency === 'HNL' && contract.currency === 'USD') {
          amountInContractCurrency = parseFloat(
            convertHNLtoUSD(amountPaid, exchangeRateUsed)
          );
        } else {
          amountInContractCurrency = parseFloat(
            convertUSDtoHNL(amountPaid, exchangeRateUsed)
          );
        }
      }

      // 4. Determinar status del pago
      const totalRequired = parseFloat(addMoney(amountDueNum, lateFeeAmount));
      const amountPaidNum = parseFloat(String(amountPaid));
      let newStatus: 'PAID' | 'PARTIAL' | 'LATE' =
        amountPaidNum >= totalRequired ? 'PAID'
        : amountPaidNum > 0 ? 'PARTIAL'
        : 'LATE';

      // 5. Guardar el pago (ATÓMICO)
      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          amountPaid: amountPaidNum,
          paymentCurrency,
          exchangeRateUsed,
          amountInContractCurrency,
          lateFeeAmount,
          isLate,
          daysLate,
          status: newStatus,
          paymentDate: paidDate,
          notes,
          registeredById: req.user!.id,
        },
        include: {
          contract: {
            include: { tenant: true, unit: { include: { property: true } } },
          },
        },
      });

      // 6. Si el pago está completo: generar PDF y enviar WhatsApp
      if (newStatus === 'PAID') {
        try {
          const pdfBuffer = await PdfService.generateReceipt({
            receiptNumber: updated.receiptNumber,
            tenantName: `${updated.contract.tenant.firstName} ${updated.contract.tenant.lastName}`,
            tenantPhone: updated.contract.tenant.phone,
            propertyName: updated.contract.unit.property.name,
            unitNumber: updated.contract.unit.number,
            periodMonth: updated.periodMonth,
            periodYear: updated.periodYear,
            amountPaid: amountPaidNum,
            paymentCurrency,
            paymentDate: paidDate,
            lateFeeAmount,
            isLate,
            exchangeRateUsed,
            notes,
          });

          // URL del recibo
          const receiptUrl = `${env.APP_URL}/api/payments/${updated.id}/receipt`;
          const tenant = updated.contract.tenant;
          const receiptParams = {
            tenantName:    `${tenant.firstName} ${tenant.lastName}`,
            propertyUnit:  `${updated.contract.unit.property.name} — ${updated.contract.unit.number}`,
            amount:        amountPaidNum,
            currency:      paymentCurrency,
            receiptNumber: updated.receiptNumber,
            receiptUrl,
            paymentDate:   paidDate,
          };

          let notified = false;

          // Telegram
          if (tenant.telegramChatId) {
            const r = await TelegramService.sendPaymentReceipt({ chatId: tenant.telegramChatId, ...receiptParams });
            if (r.success) notified = true;
          }

          // TextMeBot — prioriza key del inquilino, si no tiene usa la key GLOBAL
          const notifConfigBasic = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
          const tmbKeyBasic = (tenant.textMeBotApiKey as string)?.trim() || notifConfigBasic?.textMeBotSenderKey?.trim();
          if (tmbKeyBasic) {
            await new Promise(res => setTimeout(res, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
            const r = await TextMeBotService.sendPaymentReceipt({ phone: tenant.phone, apiKey: tmbKeyBasic, ...receiptParams });
            if (r.success) notified = true;
          } else if (tenant.callMeBotApiKey?.trim()) {
            // Fallback a CallMeBot solo si NO hay ninguna key de TextMeBot disponible
            await new Promise(res => setTimeout(res, 400));
            const r = await CallMeBotService.sendPaymentReceipt({ phone: tenant.phone, apiKey: tenant.callMeBotApiKey, ...receiptParams });
            if (r.success) notified = true;
          }

          if (notified) {
            await prisma.payment.update({
              where: { id: updated.id },
              data: { receiptSentAt: new Date(), receiptPdfUrl: receiptUrl },
            });
          }

          // CC — solo si NO hay comprobante adjunto (si lo hay, el bloque de
          // comprobante más abajo ya le avisa a los CC junto con el archivo)
          if (!hasProofs && notifConfigBasic?.textMeBotSenderKey?.trim() && notifConfigBasic?.ccNumbersTextMeBot) {
            const msgCCBasic =
              `✅ *Rentify — Pago Registrado*\n\n` +
              `👤 *${tenant.firstName} ${tenant.lastName}*\n` +
              `📍 ${updated.contract.unit.property.name} — ${updated.contract.unit.number}\n` +
              `💰 ${formatMoney(amountPaidNum, paymentCurrency)}\n` +
              `🧾 Recibo N°: ${updated.receiptNumber}`;
            const recipientsBasic = (notifConfigBasic.ccNumbersTextMeBot as string)
              .split(',').map((n: string) => n.trim()).filter(Boolean);
            for (const phone of recipientsBasic) {
              await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
              await TextMeBotService.send(phone, notifConfigBasic.textMeBotSenderKey as string, msgCCBasic)
                .catch(e => console.error('⚠️ TextMeBot CC (pago básico):', e));
            }
          }

          void pdfBuffer;
        } catch (notifErr) {
          console.error('⚠️ Error generando recibo/WhatsApp (pago guardado):', notifErr);
        }
      }

      // ── Enviar comprobante(s) adjunto(s) via TextMeBot (inquilino + CC) ──
      if (hasProofs) {
        try {
          const tenant       = updated.contract.tenant;
          const unit         = updated.contract.unit;
          const tenantName   = `${tenant.firstName} ${tenant.lastName}`;
          const propertyUnit = `${unit.property.name} — ${unit.number}`;
          const monto        = formatMoney(toNumber(updated.amountPaid), updated.paymentCurrency as Currency);
          const fecha        = paidDate.toLocaleDateString('es-HN');
          const recibo       = updated.receiptNumber;
          const totalProofs  = proofList.length;

          const notifConfig = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
          const tmbKeyTenant = (tenant.textMeBotApiKey as string)?.trim() || notifConfig?.textMeBotSenderKey?.trim();
          const recipientsCC = notifConfig?.textMeBotSenderKey && notifConfig?.ccNumbersTextMeBot
            ? (notifConfig.ccNumbersTextMeBot as string).split(',').map((n: string) => n.trim()).filter(Boolean)
            : [];

          let primerEnvio = true; // controla si ya esperamos el delay antes del primer mensaje de este bloque

          for (let i = 0; i < proofList.length; i++) {
            const { proofBase64: pBase64, proofMime: pMime, proofName: pName } = proofList[i];
            const ext      = pName.includes('.') ? pName.split('.').pop() : 'jpg';
            const tmpName  = `proof-${updated.id}-${Date.now()}-${i}.${ext}`;
            const tmpPath  = path.join(os.tmpdir(), tmpName);
            const fileDisp = pName || 'comprobante';
            fs.writeFileSync(tmpPath, Buffer.from(pBase64, 'base64'));

            // URL pública temporal que TextMeBot descarga para adjuntar
            const proofUrl = `${env.APP_URL}/api/payments/proof/${tmpName}`;
            const numeroAdjunto = totalProofs > 1 ? ` (${i + 1}/${totalProofs})` : '';

            // Mensaje para el inquilino (solo en el primer adjunto se incluye el detalle completo)
            const msgInquilino = i === 0
              ? `✅ *Rentify App — Comprobante de Pago*\n\n` +
                `Hola *${tenantName}*, tu pago fue registrado.\n\n` +
                `📍 Unidad: ${propertyUnit}\n` +
                `💰 Monto: *${monto}*\n` +
                `📅 Fecha: ${fecha}\n` +
                `🧾 Recibo N°: ${recibo}\n\n` +
                `📎 Tu comprobante${totalProofs > 1 ? 's se adjuntan' : ' se adjunta'} a este mensaje${numeroAdjunto}.`
              : `📎 Comprobante adjunto${numeroAdjunto}`;

            // Mensaje para CC
            const msgCC = i === 0
              ? `📎 *Rentify — Comprobante de Pago*\n\n` +
                `👤 *${tenantName}*\n` +
                `📍 ${propertyUnit}\n` +
                `💰 Monto: *${monto}*\n` +
                `📅 Fecha: ${fecha}\n` +
                `🧾 Recibo N°: ${recibo}${numeroAdjunto}`
              : `📎 Comprobante adjunto${numeroAdjunto}`;

            // 1. Enviar al INQUILINO — prioriza su key individual, si no tiene
            //    usa la key GLOBAL de TextMeBot (funciona para cualquier número)
            if (tmbKeyTenant) {
              if (!primerEnvio) await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
              await TextMeBotService.send(tenant.phone, tmbKeyTenant, msgInquilino, proofUrl, fileDisp)
                .catch(e => console.error('⚠️ TextMeBot inquilino:', e));
              primerEnvio = false;
            }

            // 2. Enviar a números CC
            for (const phone of recipientsCC) {
              if (!primerEnvio) await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
              await TextMeBotService.send(phone, notifConfig!.textMeBotSenderKey as string, msgCC, proofUrl, fileDisp)
                .catch(console.error);
              primerEnvio = false;
            }

            // Limpiar archivo temporal después de 5 minutos
            setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch {} }, 5 * 60 * 1000);
          }

          if (recipientsCC.length) {
            console.log(`📎 ${totalProofs} comprobante(s) enviado(s) a ${recipientsCC.length} CC`);
          }

        } catch (proofErr) {
          console.error('⚠️ Error enviando comprobante(s) adjunto(s):', proofErr);
        }
      }

      res.json(successResponse(updated, `Pago registrado como ${newStatus === 'PAID' ? 'completado' : 'parcial'}.`));
    } catch (err) { next(err); }
  },

  /** GET /api/payments/:id/receipt — descarga el PDF del recibo */
  async downloadReceipt(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: {
          contract: {
            include: { tenant: true, unit: { include: { property: true } } },
          },
        },
      });
      if (!payment) throw new AppError('Pago no encontrado.', 404);

      const pdfBuffer = await PdfService.generateReceipt({
        receiptNumber: payment.receiptNumber,
        tenantName: `${payment.contract.tenant.firstName} ${payment.contract.tenant.lastName}`,
        tenantPhone: payment.contract.tenant.phone,
        propertyName: payment.contract.unit.property.name,
        unitNumber: payment.contract.unit.number,
        periodMonth: payment.periodMonth,
        periodYear: payment.periodYear,
        amountPaid: toNumber(payment.amountPaid),
        paymentCurrency: payment.paymentCurrency,
        paymentDate: payment.paymentDate || new Date(),
        lateFeeAmount: toNumber(payment.lateFeeAmount),
        isLate: payment.isLate,
        exchangeRateUsed: payment.exchangeRateUsed ? toNumber(payment.exchangeRateUsed) : undefined,
        notes: payment.notes || undefined,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="recibo-${payment.receiptNumber}.pdf"`);
      res.end(pdfBuffer);
    } catch (err) { next(err); }
  },

  /** POST /api/payments/create-manual — crear pago manual para contrato+período específico */
  async createManual(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contractId, periodMonth, periodYear, amountDue, dueDate, notes,
              proofBase64, proofMime, proofName } = req.body;

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) {
        res.status(404).json(errorResponse('Contrato no encontrado.'));
        return;
      }

      // Verificar duplicado
      const exists = await prisma.payment.findUnique({
        where: { contractId_periodMonth_periodYear: { contractId, periodMonth, periodYear } },
      });
      if (exists) {
        res.status(409).json(errorResponse(`Ya existe un pago para este contrato en ${periodMonth}/${periodYear}.`));
        return;
      }

      const resolvedDueDate = dueDate
        ? new Date(dueDate)
        : new Date(periodYear, periodMonth - 1, contract.paymentDayOfMonth);

      const payment = await prisma.payment.create({
        data: {
          contractId,
          periodMonth,
          periodYear,
          amountDue: amountDue ?? contract.monthlyRent,
          amountPaid: 0,
          paymentCurrency: contract.currency,
          dueDate: resolvedDueDate,
          status: 'PENDING',
          notes: notes || null,
        },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
      });

      // Enviar comprobante adjunto si fue proporcionado
      if (proofBase64 && proofMime && proofName) {
        try {
          const ext      = (proofName as string).includes('.') ? (proofName as string).split('.').pop() : 'jpg';
          const tmpName  = `proof-${payment.id}-${Date.now()}.${ext}`;
          const tmpPath  = path.join(os.tmpdir(), tmpName);
          const fileDisp = (proofName as string) || 'comprobante';
          fs.writeFileSync(tmpPath, Buffer.from(proofBase64 as string, 'base64'));
          const proofUrl = `${env.APP_URL}/api/payments/proof/${tmpName}`;

          const tenant     = payment.contract.tenant;
          const unit       = payment.contract.unit;
          const tenantName = `${tenant.firstName} ${tenant.lastName}`;
          const propUnit   = `${unit.property.name} — ${unit.number}`;
          const monto      = formatMoney(toNumber(payment.amountDue), payment.paymentCurrency as Currency);

          const msgInq =
            `📎 *Rentify App — Comprobante de Pago*\n\n` +
            `Hola *${tenantName}*, adjuntamos tu comprobante.\n\n` +
            `📍 Unidad: ${propUnit}\n` +
            `💰 Monto: *${monto}*\n🧾 Recibo N°: ${payment.receiptNumber}`;

          const msgCC =
            `📎 *Rentify — Nuevo pago creado*\n\n👤 *${tenantName}*\n📍 ${propUnit}\n💰 ${monto}`;

          const notifConfig = await prisma.notificationConfig.findFirst({ where: { companyId: null } });

          const tmbKeyCreate = (tenant.textMeBotApiKey as string)?.trim() || notifConfig?.textMeBotSenderKey?.trim();
          if (tmbKeyCreate) {
            await TextMeBotService.send(tenant.phone, tmbKeyCreate, msgInq, proofUrl, fileDisp)
              .catch(e => console.error('⚠️ TextMeBot inquilino (create):', e));
            await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
          }
          if (notifConfig?.textMeBotSenderKey && notifConfig?.ccNumbersTextMeBot) {
            const recs = (notifConfig.ccNumbersTextMeBot as string).split(',').map((n: string) => n.trim()).filter(Boolean);
            for (const phone of recs) {
              await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
              await TextMeBotService.send(phone, notifConfig.textMeBotSenderKey as string, msgCC, proofUrl, fileDisp)
                .catch(console.error);
            }
          }
          setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch {} }, 5 * 60 * 1000);
        } catch (proofErr) {
          console.error('⚠️ Error enviando comprobante en createManual:', proofErr);
        }
      }

      res.status(201).json(successResponse(payment, 'Pago manual creado correctamente.'));
    } catch (err) { next(err); }
  },

  /** GET /api/payments/cxc-report — reporte de cuentas por cobrar con filtros */
  async cxcReport(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { dateFrom, dateTo, tenantId, statuses } = req.query;

      // Filtro de estados
      let statusFilter: string[] = [];
      if (statuses && statuses !== 'ALL') {
        statusFilter = Array.isArray(statuses)
          ? (statuses as string[])
          : (statuses as string).split(',').filter(Boolean);
      }

      const where: Record<string, unknown> = {};

      if (dateFrom || dateTo) {
        const dueDateFilter: Record<string, Date> = {};
        if (dateFrom) dueDateFilter.gte = new Date(dateFrom as string);
        if (dateTo) {
          const end = new Date(dateTo as string);
          end.setHours(23, 59, 59, 999);
          dueDateFilter.lte = end;
        }
        where.dueDate = dueDateFilter;
      }

      if (statusFilter.length > 0) {
        where.status = { in: statusFilter };
      }

      const contractFilter: Record<string, unknown> = {};
      if (tenantId) contractFilter.tenantId = tenantId as string;
      if (req.user!.role !== 'ADMIN') contractFilter.companyId = req.user!.companyId;
      if (Object.keys(contractFilter).length > 0) where.contract = contractFilter;

      // Tasa BCH del día para comparación y conversión USD→HNL
      const bchRate = await ExchangeRateService.getTodayRate();

      const payments = await prisma.payment.findMany({
        where,
        orderBy: [
          { contract: { tenant: { firstName: 'asc' } } },
          { dueDate: 'asc' },
        ],
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
              // Notas de débito PENDING o INCLUDED del mismo período de cada pago
              debitNotes: {
                where: { status: { in: ['PENDING', 'INCLUDED'] } },
              },
            },
          },
        },
      });

      // Calcular totales por estado y moneda (mora = 0, no se suma)
      let totalPending = 0, totalPartial = 0, totalPaid = 0, totalLate = 0, totalWaived = 0;
      let totalHNL = 0, totalUSD = 0, totalPendingHNL = 0, totalPendingUSD = 0;
      let grandTotalHNL = 0; // todo convertido a HNL

      for (const p of payments) {
        const due = toNumber(p.amountDue);
        const paid = toNumber(p.amountPaid);
        // Usar la moneda del contrato (no paymentCurrency) para determinar si es USD o HNL
        const contractCurrency = p.contract.currency;
        const balance = Math.max(0, due - paid);

        // Notas de débito del mismo período (filtradas por mes/año del pago)
        const periodDebitNotes = (p.contract.debitNotes || []).filter(
          (dn: any) => dn.periodMonth === p.periodMonth && dn.periodYear === p.periodYear
        );
        const debitHNL = periodDebitNotes
          .filter((dn: any) => dn.currency === 'HNL')
          .reduce((s: number, dn: any) => s + toNumber(dn.amount), 0);
        const debitUSD = periodDebitNotes
          .filter((dn: any) => dn.currency === 'USD')
          .reduce((s: number, dn: any) => s + toNumber(dn.amount), 0);

        const balanceHNL = contractCurrency === 'HNL' ? balance : balance * bchRate;
        const totalDebitHNL = debitHNL + debitUSD * bchRate;

        if (contractCurrency === 'HNL') totalHNL += due;
        else totalUSD += due;

        if (p.status === 'PENDING') {
          totalPending++;
          totalPendingHNL += balanceHNL + totalDebitHNL;
          grandTotalHNL   += balanceHNL + totalDebitHNL;
        } else if (p.status === 'PARTIAL') {
          totalPartial++;
          totalPendingHNL += balanceHNL + totalDebitHNL;
          grandTotalHNL   += balanceHNL + totalDebitHNL;
        } else if (p.status === 'PAID') {
          totalPaid++;
        } else if (p.status === 'LATE') {
          totalLate++;
          totalPendingHNL += balanceHNL + totalDebitHNL;
          grandTotalHNL   += balanceHNL + totalDebitHNL;
        } else if (p.status === 'WAIVED') {
          totalWaived++;
        }
      }

      // Agrupar por inquilino para el frontend
      const byTenant: Record<string, {
        tenantId: string;
        tenantName: string;
        tenantPhone: string;
        subtotalHNL: number;
        payments: typeof payments;
      }> = {};

      for (const p of payments) {
        const tid = p.contract.tenant.id;
        if (!byTenant[tid]) {
          byTenant[tid] = {
            tenantId: tid,
            tenantName: `${p.contract.tenant.firstName} ${p.contract.tenant.lastName}`,
            tenantPhone: p.contract.tenant.phone || '',
            subtotalHNL: 0,
            payments: [],
          };
        }
        const due    = toNumber(p.amountDue);
        const paid   = toNumber(p.amountPaid);
        const bal    = Math.max(0, due - paid);
        const balHNL = p.contract.currency === 'HNL' ? bal : bal * bchRate;
        const periodDebitNotes = (p.contract.debitNotes || []).filter(
          (dn: any) => dn.periodMonth === p.periodMonth && dn.periodYear === p.periodYear
        );
        const debitHNL = periodDebitNotes
          .filter((dn: any) => dn.currency === 'HNL')
          .reduce((s: number, dn: any) => s + toNumber(dn.amount), 0);
        const debitUSD = periodDebitNotes
          .filter((dn: any) => dn.currency === 'USD')
          .reduce((s: number, dn: any) => s + toNumber(dn.amount), 0);

        if (['PENDING','PARTIAL','LATE'].includes(p.status)) {
          byTenant[tid].subtotalHNL += balHNL + debitHNL + debitUSD * bchRate;
        }
        byTenant[tid].payments.push(p);
      }

      res.json(successResponse({
        filters: { dateFrom, dateTo, tenantId, statuses },
        bchRate,
        tenantGroups: Object.values(byTenant),
        summary: {
          total: payments.length,
          totalPending,
          totalPartial,
          totalPaid,
          totalLate,
          totalWaived,
          totalHNL: totalHNL.toFixed(2),
          totalUSD: totalUSD.toFixed(2),
          totalPendingHNL: totalPendingHNL.toFixed(2),
          totalPendingUSD: (totalPendingHNL / bchRate).toFixed(2),
          grandTotalHNL: grandTotalHNL.toFixed(2),
        },
        payments,
      }));
    } catch (err) { next(err); }
  },

  /** GET /api/payments/report — reporte financiero consolidado */
  async report(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { month, year } = req.query;

      const where: Record<string, unknown> = {};
      if (month) where.periodMonth = parseInt(month as string);
      if (year) where.periodYear = parseInt(year as string);
      if (req.user!.role !== 'ADMIN') where.contract = { companyId: req.user!.companyId };

      const payments = await prisma.payment.findMany({
        where: { ...where, status: { in: ['PAID', 'PARTIAL'] } },
        include: {
          contract: { include: { unit: { include: { property: true } } } },
        },
      });

      let totalHNL = 0;
      let totalUSD = 0;
      let totalLateFees = 0;

      for (const p of payments) {
        const amount = toNumber(p.amountPaid);
        const lateFee = toNumber(p.lateFeeAmount);
        if (p.paymentCurrency === 'HNL') {
          totalHNL += amount;
        } else {
          totalUSD += amount;
        }
        totalLateFees += lateFee;
      }

      res.json(successResponse({
        period: { month, year },
        summary: {
          totalPayments: payments.length,
          totalHNL: totalHNL.toFixed(2),
          totalUSD: totalUSD.toFixed(2),
          totalLateFees: totalLateFees.toFixed(2),
        },
        payments,
      }));
    } catch (err) { next(err); }
  },

  /** GET /api/payments/:id — obtener un pago por ID */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const payment = await prisma.payment.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'ADMIN' ? { contract: { companyId: req.user!.companyId } } : {}),
        },
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
            },
          },
        },
      });
      if (!payment) throw new AppError('Pago no encontrado.', 404);
      res.json(successResponse(payment));
    } catch (err) { next(err); }
  },

  /** PUT /api/payments/:id — editar datos del pago */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { periodMonth, periodYear, amountDue, dueDate, status, notes,
              proofBase64, proofMime, proofName } = req.body;

      const payment = await prisma.payment.findUnique({
        where: { id: req.params.id },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
      });
      if (!payment) throw new AppError('Pago no encontrado.', 404);

      const updated = await prisma.payment.update({
        where: { id: req.params.id },
        data: {
          ...(periodMonth !== undefined && { periodMonth: parseInt(periodMonth) }),
          ...(periodYear  !== undefined && { periodYear:  parseInt(periodYear) }),
          ...(amountDue   !== undefined && { amountDue:   parseFloat(amountDue) }),
          ...(dueDate     !== undefined && dueDate && { dueDate: new Date(dueDate) }),
          ...(status      !== undefined && { status }),
          ...(notes       !== undefined && { notes }),
        },
        include: { contract: { include: { tenant: true, unit: { include: { property: true } } } } },
      });

      // Enviar comprobante adjunto si fue proporcionado
      if (proofBase64 && proofMime && proofName) {
        try {
          const ext        = (proofName as string).includes('.') ? (proofName as string).split('.').pop() : 'jpg';
          const tmpName    = `proof-${updated.id}-${Date.now()}.${ext}`;
          const tmpPath    = path.join(os.tmpdir(), tmpName);
          const fileDisp   = (proofName as string) || 'comprobante';
          fs.writeFileSync(tmpPath, Buffer.from(proofBase64 as string, 'base64'));
          const proofUrl   = `${env.APP_URL}/api/payments/proof/${tmpName}`;

          const tenant     = updated.contract.tenant;
          const unit       = updated.contract.unit;
          const tenantName = `${tenant.firstName} ${tenant.lastName}`;
          const propUnit   = `${unit.property.name} — ${unit.number}`;
          const monto      = formatMoney(toNumber(updated.amountDue), updated.paymentCurrency as Currency);

          const msgInq =
            `📎 *Rentify App — Comprobante de Pago*\n\n` +
            `Hola *${tenantName}*, adjuntamos tu comprobante.\n\n` +
            `📍 Unidad: ${propUnit}\n` +
            `💰 Monto: *${monto}*\n` +
            `🧾 Recibo N°: ${updated.receiptNumber}`;

          const msgCC =
            `📎 *Rentify — Comprobante (editado)*\n\n` +
            `👤 *${tenantName}*\n` +
            `📍 ${propUnit}\n` +
            `💰 ${monto}\n🧾 ${updated.receiptNumber}`;

          const notifConfig = await prisma.notificationConfig.findFirst({ where: { companyId: null } });

          const tmbKeyEdit = (tenant.textMeBotApiKey as string)?.trim() || notifConfig?.textMeBotSenderKey?.trim();
          if (tmbKeyEdit) {
            await TextMeBotService.send(tenant.phone, tmbKeyEdit, msgInq, proofUrl, fileDisp)
              .catch(e => console.error('⚠️ TextMeBot inquilino (edit):', e));
            await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
          }
          if (notifConfig?.textMeBotSenderKey && notifConfig?.ccNumbersTextMeBot) {
            const recs = (notifConfig.ccNumbersTextMeBot as string).split(',').map((n: string) => n.trim()).filter(Boolean);
            for (const phone of recs) {
              await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
              await TextMeBotService.send(phone, notifConfig.textMeBotSenderKey as string, msgCC, proofUrl, fileDisp)
                .catch(console.error);
            }
          }
          setTimeout(() => { try { fs.unlinkSync(tmpPath); } catch {} }, 5 * 60 * 1000);
        } catch (proofErr) {
          console.error('⚠️ Error enviando comprobante en update:', proofErr);
        }
      }

      res.json(successResponse(updated, 'Pago actualizado correctamente.'));
    } catch (err) { next(err); }
  },
};
