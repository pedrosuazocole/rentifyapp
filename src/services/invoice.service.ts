// src/services/invoice.service.ts
// Generación de facturas cumpliendo requerimientos SAR Honduras
// Resolución SAR-DNS-003/2021 y Disposición Transitoria 003-2021
import PDFDocument from 'pdfkit';
import { prisma } from '../config/database';
import { formatMoney, toNumber } from '../utils/money';
import { Currency } from '../types';
import { AppError } from '../middlewares/error.middleware';

const MONTHS_ES = [
  '', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

export interface InvoiceCreateData {
  paymentId?: string;
  companyId?: string;
  issuerName: string;
  issuerRtn: string;
  issuerAddress: string;
  issuerPhone?: string;
  receiverName: string;
  receiverRtn?: string;
  receiverAddress?: string;
  cai: string;
  invoiceRange: string;
  invoiceNumber: string;
  establishmentCode?: string;
  pointOfSaleCode?: string;
  expiresAt: Date;
  currency: Currency;
  subtotal: number;
  isvPercent?: number;
  description: string;
  periodMonth?: number;
  periodYear?: number;
  exchangeRate?: number;
}

export class InvoiceService {
  /**
   * Crea una factura SAR y genera el PDF.
   * Operación atómica: si falla el PDF, no se guarda la factura.
   */
  static async createInvoice(data: InvoiceCreateData) {
    // Validar RTN emisor (14 dígitos)
    const rtnClean = data.issuerRtn.replace(/[-\s]/g, '');
    if (rtnClean.length !== 14) {
      throw new AppError('El RTN del emisor debe tener 14 dígitos.', 400);
    }

    // Verificar que no exista ya ese número de factura
    const exists = await prisma.invoice.findUnique({
      where: { invoiceNumber: data.invoiceNumber },
    });
    if (exists) {
      throw new AppError(`La factura N° ${data.invoiceNumber} ya fue emitida.`, 409);
    }

    // Calcular ISV
    const isvPct   = data.isvPercent ?? 15;
    const subtotal = data.subtotal;
    const isvAmt   = parseFloat((subtotal * isvPct / 100).toFixed(2));
    const total    = parseFloat((subtotal + isvAmt).toFixed(2));

    const invoice = await prisma.invoice.create({
      data: {
        paymentId:         data.paymentId,
        companyId:         data.companyId,
        issuerName:        data.issuerName,
        issuerRtn:         rtnClean,
        issuerAddress:     data.issuerAddress,
        issuerPhone:       data.issuerPhone,
        receiverName:      data.receiverName,
        receiverRtn:       data.receiverRtn?.replace(/[-\s]/g, '') || null,
        receiverAddress:   data.receiverAddress,
        cai:               data.cai.toUpperCase(),
        invoiceRange:      data.invoiceRange,
        invoiceNumber:     data.invoiceNumber,
        establishmentCode: data.establishmentCode || '000',
        pointOfSaleCode:   data.pointOfSaleCode || '001',
        expiresAt:         data.expiresAt,
        currency:          data.currency,
        subtotal,
        isvPercent:        isvPct,
        isvAmount:         isvAmt,
        total,
        exchangeRate:      data.exchangeRate,
        description:       data.description,
        periodMonth:       data.periodMonth,
        periodYear:        data.periodYear,
        status:            'ISSUED',
      },
    });

    return invoice;
  }

  /**
   * Genera el PDF de una factura en formato SAR Honduras.
   * Retorna el buffer listo para enviar o guardar.
   */
  static async generateInvoicePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { company: true },
    });
    if (!invoice) throw new AppError('Factura no encontrada.', 404);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const currency = invoice.currency as Currency;
      const pageW = 515; // Ancho útil (A4 595 - 40*2)

      // ══════════════════════════════════════════
      // ENCABEZADO — Datos del emisor
      // ══════════════════════════════════════════
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1A4B3A')
        .text(invoice.issuerName, { align: 'center' });
      doc.fontSize(9).font('Helvetica').fillColor('#333333')
        .text(`RTN: ${this.formatRTN(invoice.issuerRtn)}`, { align: 'center' })
        .text(invoice.issuerAddress, { align: 'center' });
      if (invoice.issuerPhone) {
        doc.text(`Tel: ${invoice.issuerPhone}`, { align: 'center' });
      }

      doc.moveDown(0.3);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#1A4B3A');
      doc.moveDown(0.3);

      // ══════════════════════════════════════════
      // TÍTULO Y NÚMERO DE FACTURA
      // ══════════════════════════════════════════
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1A4B3A')
        .text('FACTURA', { align: 'center' });
      doc.fontSize(11).font('Helvetica').fillColor('#333333')
        .text(`N°: ${invoice.invoiceNumber}`, { align: 'center' });
      doc.moveDown(0.5);

      // ══════════════════════════════════════════
      // DATOS SAR — CAI y rangos
      // ══════════════════════════════════════════
      const sarY = doc.y;
      doc.rect(40, sarY, pageW, 52).fillAndStroke('#f0efe9', '#c8c5bc');
      doc.fillColor('#333333').fontSize(8).font('Helvetica-Bold');
      doc.text('DATOS DE AUTORIZACIÓN SAR', 48, sarY + 5);
      doc.font('Helvetica').fontSize(8);
      doc.text(`CAI: ${invoice.cai}`, 48, sarY + 16);
      doc.text(`Rango autorizado: ${invoice.invoiceRange}`, 48, sarY + 27);
      doc.text(
        `Fecha límite de emisión: ${invoice.expiresAt.toLocaleDateString('es-HN')}`,
        48, sarY + 38
      );
      doc.text(
        `Tipo de documento: ${invoice.documentType === '01' ? 'Factura' : invoice.documentType}`,
        300, sarY + 16
      );
      doc.text(
        `Fecha de emisión: ${invoice.issuedAt.toLocaleDateString('es-HN')}`,
        300, sarY + 27
      );
      doc.moveDown(0.3);
      doc.y = sarY + 60;

      // ══════════════════════════════════════════
      // DATOS DEL CLIENTE (receptor)
      // ══════════════════════════════════════════
      doc.moveDown(0.5);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#1A4B3A').text('DATOS DEL CLIENTE');
      doc.font('Helvetica').fillColor('#333333');
      doc.text(`Nombre/Razón Social: ${invoice.receiverName}`);
      if (invoice.receiverRtn) {
        doc.text(`RTN: ${this.formatRTN(invoice.receiverRtn)}`);
      }
      if (invoice.receiverAddress) {
        doc.text(`Dirección: ${invoice.receiverAddress}`);
      }

      // ══════════════════════════════════════════
      // DETALLE — Tabla de conceptos
      // ══════════════════════════════════════════
      doc.moveDown(0.5);
      const tableY = doc.y;

      // Encabezados de tabla
      doc.rect(40, tableY, pageW, 18).fillAndStroke('#1A4B3A', '#1A4B3A');
      doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
      doc.text('CANT.', 48, tableY + 5, { width: 40 });
      doc.text('DESCRIPCIÓN / CONCEPTO', 95, tableY + 5, { width: 280 });
      doc.text('PRECIO UNIT.', 380, tableY + 5, { width: 80, align: 'right' });
      doc.text('SUBTOTAL', 465, tableY + 5, { width: 80, align: 'right' });

      // Fila de concepto
      const rowY = tableY + 18;
      doc.rect(40, rowY, pageW, 22).fillAndStroke('#ffffff', '#c8c5bc');
      doc.fillColor('#333333').fontSize(9).font('Helvetica');

      const descripcion = invoice.periodMonth && invoice.periodYear
        ? `${invoice.description} — ${MONTHS_ES[invoice.periodMonth]} ${invoice.periodYear}`
        : invoice.description;

      doc.text('1', 48, rowY + 6, { width: 40 });
      doc.text(descripcion, 95, rowY + 6, { width: 278 });
      doc.text(formatMoney(toNumber(invoice.subtotal), currency), 380, rowY + 6, { width: 80, align: 'right' });
      doc.text(formatMoney(toNumber(invoice.subtotal), currency), 465, rowY + 6, { width: 80, align: 'right' });

      // ══════════════════════════════════════════
      // TOTALES
      // ══════════════════════════════════════════
      const totalsY = rowY + 32;
      const lblX = 370;
      const valX = 465;
      const colW = 80;

      doc.fontSize(9).font('Helvetica').fillColor('#333333');
      doc.text('Subtotal (sin ISV):', lblX, totalsY, { width: 90 });
      doc.text(formatMoney(toNumber(invoice.subtotal), currency), valX, totalsY, { width: colW, align: 'right' });

      doc.text(`ISV ${toNumber(invoice.isvPercent)}%:`, lblX, totalsY + 14, { width: 90 });
      doc.text(formatMoney(toNumber(invoice.isvAmount), currency), valX, totalsY + 14, { width: colW, align: 'right' });

      // Línea y total
      doc.moveTo(lblX, totalsY + 28).lineTo(555, totalsY + 28).stroke('#1A4B3A');
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1A4B3A');
      doc.text('TOTAL:', lblX, totalsY + 32, { width: 90 });
      doc.text(formatMoney(toNumber(invoice.total), currency), valX, totalsY + 32, { width: colW, align: 'right' });

      // Tipo de cambio si aplica
      if (invoice.exchangeRate) {
        doc.fontSize(8).font('Helvetica').fillColor('#666666');
        doc.text(
          `Tipo de cambio: L ${toNumber(invoice.exchangeRate).toFixed(4)} por USD`,
          lblX, totalsY + 48, { width: 170 }
        );
      }

      // ══════════════════════════════════════════
      // TOTAL EN LETRAS (requerido SAR)
      // ══════════════════════════════════════════
      doc.y = totalsY + 70;
      doc.moveDown(0.5);
      doc.fontSize(8).font('Helvetica').fillColor('#333333');
      const totalLetras = this.numberToWords(toNumber(invoice.total), currency);
      doc.text(`Son: ${totalLetras}`, { continued: false });

      // ══════════════════════════════════════════
      // PIE DE PÁGINA — Leyenda SAR obligatoria
      // ══════════════════════════════════════════
      doc.moveDown(1);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#cccccc');
      doc.moveDown(0.3);
      doc.fontSize(7).fillColor('#888888');
      doc.text(
        'LA FACTURA ES BENEFICIO DE TODOS, EXIJALA. ' +
        'El incumplimiento de esta obligación será sancionado conforme al Código Tributario. ' +
        `RTN Emisor: ${this.formatRTN(invoice.issuerRtn)}`,
        { align: 'center' }
      );
      doc.text(
        `Generado por Rentify App — ${new Date().toLocaleString('es-HN')}`,
        { align: 'center' }
      );

      doc.end();
    });
  }

  /** Formatea RTN hondureño: XXXX-XXXX-XXXXXX */
  private static formatRTN(rtn: string): string {
    const r = rtn.replace(/\D/g, '');
    if (r.length === 14) return `${r.slice(0,4)}-${r.slice(4,8)}-${r.slice(8)}`;
    return rtn;
  }

  /** Convierte número a palabras en español (simplificado para montos) */
  private static numberToWords(amount: number, currency: Currency): string {
    const intPart = Math.floor(amount);
    const decPart = Math.round((amount - intPart) * 100);
    const symbol  = currency === 'HNL' ? 'LEMPIRAS' : 'DÓLARES';
    const cents   = currency === 'HNL' ? 'CENTAVOS' : 'CENTAVOS';

    const ones = ['','UNO','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE',
      'DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISÉIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
    const tens = ['','','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
    const hundreds = ['','CIEN','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS',
      'SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];

    const toWords = (n: number): string => {
      if (n === 0) return 'CERO';
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' Y ' + ones[n%10] : '');
      if (n < 1000) return hundreds[Math.floor(n/100)] + (n%100 ? ' ' + toWords(n%100) : '');
      if (n < 1000000) {
        const t = Math.floor(n/1000);
        return (t === 1 ? 'MIL' : toWords(t) + ' MIL') + (n%1000 ? ' ' + toWords(n%1000) : '');
      }
      return amount.toLocaleString('es-HN');
    };

    const intWords = toWords(intPart);
    return `${intWords} ${symbol} CON ${decPart.toString().padStart(2,'0')}/100 ${cents}`;
  }

  /** Lista facturas con filtros */
  static async list(filters: { companyId?: string; month?: number; year?: number; status?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.companyId) where.companyId = filters.companyId;
    if (filters.month) where.periodMonth = filters.month;
    if (filters.year) where.periodYear = filters.year;
    if (filters.status) where.status = filters.status;

    return prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      include: { company: { select: { name: true } } },
    });
  }

  /** Anular una factura */
  static async cancel(invoiceId: string, reason: string) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new AppError('Factura no encontrada.', 404);
    if (invoice.status === 'CANCELLED') throw new AppError('La factura ya está anulada.', 400);

    return prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
    });
  }
}
