// src/modules/invoices/invoices.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse } from '../../types';
import { InvoiceService } from '../../services/invoice.service';
import { WhatsAppService } from '../../services/whatsapp.service';
import { env } from '../../config/env';

export const invoicesController = {
  /** GET /api/invoices */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { companyId, month, year, status } = req.query;
      const invoices = await InvoiceService.list({
        companyId: companyId as string,
        month: month ? parseInt(month as string) : undefined,
        year: year ? parseInt(year as string) : undefined,
        status: status as string,
      });
      res.json(successResponse(invoices));
    } catch (err) { next(err); }
  },

  /** GET /api/invoices/:id */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { company: true, payment: true },
      });
      if (!invoice) throw new AppError('Factura no encontrada.', 404);
      res.json(successResponse(invoice));
    } catch (err) { next(err); }
  },

  /** POST /api/invoices — crear factura SAR */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await InvoiceService.createInvoice({
        ...req.body,
        expiresAt: new Date(req.body.expiresAt),
      });
      res.status(201).json(successResponse(invoice, 'Factura emitida correctamente.'));
    } catch (err) { next(err); }
  },

  /** GET /api/invoices/:id/pdf — descargar PDF */
  async downloadPdf(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
      if (!invoice) throw new AppError('Factura no encontrada.', 404);

      const pdfBuffer = await InvoiceService.generateInvoicePdf(req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="factura-${invoice.invoiceNumber}.pdf"`);
      res.end(pdfBuffer);
    } catch (err) { next(err); }
  },

  /** POST /api/invoices/:id/send-whatsapp — enviar factura por WhatsApp */
  async sendWhatsApp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: req.params.id },
        include: { payment: { include: { contract: { include: { tenant: true } } } } },
      });
      if (!invoice) throw new AppError('Factura no encontrada.', 404);

      const phone = req.body.phone || invoice.payment?.contract?.tenant?.phone;
      if (!phone) throw new AppError('No hay número de teléfono para enviar la factura.', 400);

      const invoiceUrl = `${env.APP_URL}/api/invoices/${invoice.id}/pdf`;

      const result = await WhatsAppService.sendInvoiceNotification({
        phone,
        tenantName: invoice.receiverName,
        invoiceNumber: invoice.invoiceNumber,
        cai: invoice.cai,
        total: parseFloat(invoice.total.toString()),
        currency: invoice.currency,
        invoiceUrl,
      });

      if (result.success) {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { waSentAt: new Date(), pdfUrl: invoiceUrl },
        });
      }

      res.json(successResponse(result, result.success ? 'Factura enviada por WhatsApp.' : 'No se pudo enviar.'));
    } catch (err) { next(err); }
  },

  /** POST /api/invoices/:id/cancel — anular factura */
  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body;
      if (!reason) throw new AppError('El motivo de anulación es requerido.', 400);
      const invoice = await InvoiceService.cancel(req.params.id, reason);
      res.json(successResponse(invoice, 'Factura anulada correctamente.'));
    } catch (err) { next(err); }
  },

  /** GET /api/invoices/report — reporte fiscal del período */
  async report(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { month, year, companyId } = req.query;
      const where: Record<string, unknown> = { status: 'ISSUED' };
      if (month) where.periodMonth = parseInt(month as string);
      if (year) where.periodYear = parseInt(year as string);
      if (companyId) where.companyId = companyId;

      const invoices = await prisma.invoice.findMany({
        where,
        orderBy: { invoiceNumber: 'asc' },
      });

      let totalSubtotal = 0;
      let totalISV = 0;
      let totalGeneral = 0;

      for (const inv of invoices) {
        totalSubtotal += parseFloat(inv.subtotal.toString());
        totalISV      += parseFloat(inv.isvAmount.toString());
        totalGeneral  += parseFloat(inv.total.toString());
      }

      res.json(successResponse({
        period: { month, year },
        summary: {
          totalInvoices: invoices.length,
          totalSubtotal: totalSubtotal.toFixed(2),
          totalISV:      totalISV.toFixed(2),
          totalGeneral:  totalGeneral.toFixed(2),
        },
        invoices,
      }));
    } catch (err) { next(err); }
  },
};
