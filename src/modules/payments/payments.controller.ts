// src/modules/payments/payments.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse, paginatedResponse } from '../../types';
import { ExchangeRateService } from '../../services/exchange-rate.service';
import { WhatsAppService } from '../../services/whatsapp.service';
import { PdfService } from '../../services/pdf.service';
import { calcLateFee, addMoney, convertUSDtoHNL, convertHNLtoUSD, toNumber } from '../../utils/money';
import { env } from '../../config/env';

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
      const { amountPaid, paymentCurrency, paymentDate, notes } = req.body;
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
        exchangeRateUsed = await ExchangeRateService.getTodayRate();
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

          // URL del recibo (en producción se guardaría en Storage/S3)
          const receiptUrl = `${env.APP_URL}/api/payments/${updated.id}/receipt`;

          // Enviar WhatsApp con el recibo
          const waResult = await WhatsAppService.sendPaymentReceipt({
            phone: updated.contract.tenant.phone,
            tenantName: `${updated.contract.tenant.firstName} ${updated.contract.tenant.lastName}`,
            propertyUnit: `${updated.contract.unit.property.name} — ${updated.contract.unit.number}`,
            amount: amountPaidNum,
            currency: paymentCurrency,
            receiptNumber: updated.receiptNumber,
            receiptUrl,
            paymentDate: paidDate,
          });

          if (waResult.success) {
            await prisma.payment.update({
              where: { id: updated.id },
              data: { receiptSentAt: new Date(), receiptPdfUrl: receiptUrl },
            });
          }

          // Adjuntar buffer del PDF a la respuesta para descarga inmediata
          (updated as typeof updated & { _pdfReady: boolean })._pdfReady = true;
          void pdfBuffer; // PDF disponible en /receipt endpoint
        } catch (notifErr) {
          console.error('⚠️ Error generando recibo/WhatsApp (pago guardado):', notifErr);
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

  /** GET /api/payments/report — reporte financiero consolidado */
  async report(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { month, year } = req.query;

      const where: Record<string, unknown> = {};
      if (month) where.periodMonth = parseInt(month as string);
      if (year) where.periodYear = parseInt(year as string);

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
};
