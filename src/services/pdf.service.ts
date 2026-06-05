// src/services/pdf.service.ts
// Genera recibos PDF en memoria usando pdfkit
import PDFDocument from 'pdfkit';
import { formatMoney } from '../utils/money';
import { Currency } from '../types';

interface ReceiptData {
  receiptNumber: string;
  tenantName: string;
  tenantPhone: string;
  propertyName: string;
  unitNumber: string;
  periodMonth: number;
  periodYear: number;
  amountPaid: number;
  paymentCurrency: Currency;
  paymentDate: Date;
  lateFeeAmount: number;
  isLate: boolean;
  exchangeRateUsed?: number;
  notes?: string;
}

const MONTHS_ES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export class PdfService {
  /**
   * Genera un recibo de pago en formato PDF como Buffer.
   * Retorna el buffer para guardarlo o enviarlo directamente.
   */
  static async generateReceipt(data: ReceiptData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const {
        receiptNumber, tenantName, propertyName, unitNumber,
        periodMonth, periodYear, amountPaid, paymentCurrency,
        paymentDate, lateFeeAmount, isLate, exchangeRateUsed, notes,
      } = data;

      // ── Encabezado ──────────────────────────────────────────────
      doc.fontSize(22).font('Helvetica-Bold').text('RENTIFY APP', { align: 'center' });
      doc.fontSize(12).font('Helvetica').text('Sistema de Control de Alquileres', { align: 'center' });
      doc.fontSize(10).text('Honduras', { align: 'center' });

      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      // ── Título del recibo ───────────────────────────────────────
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#1a1a2e')
        .text('RECIBO DE PAGO DE ALQUILER', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').fillColor('#555555')
        .text(`Recibo N°: ${receiptNumber}`, { align: 'center' });
      doc.moveDown(1);

      // ── Datos del inquilino ─────────────────────────────────────
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a2e').text('DATOS DEL INQUILINO');
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').fillColor('#333333');
      doc.text(`Nombre: ${tenantName}`);
      doc.text(`Propiedad: ${propertyName} — ${unitNumber}`);
      doc.text(`Período: ${MONTHS_ES[periodMonth]} ${periodYear}`);
      doc.moveDown(1);

      // ── Detalle del pago ────────────────────────────────────────
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a2e').text('DETALLE DEL PAGO');
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').fillColor('#333333');

      const fechaPago = paymentDate.toLocaleDateString('es-HN', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
      doc.text(`Fecha de pago: ${fechaPago}`);
      doc.text(`Monto pagado: ${formatMoney(amountPaid, paymentCurrency)}`);

      if (isLate && lateFeeAmount > 0) {
        doc.fillColor('#cc0000')
          .text(`Cargo por mora: ${formatMoney(lateFeeAmount, paymentCurrency)}`);
        doc.fillColor('#333333');
      }

      if (exchangeRateUsed) {
        doc.text(`Tipo de cambio aplicado: L ${exchangeRateUsed.toFixed(4)} por USD`);
      }

      if (notes) {
        doc.moveDown(0.5);
        doc.text(`Notas: ${notes}`);
      }

      doc.moveDown(1);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);

      // ── Firma ───────────────────────────────────────────────────
      doc.fontSize(10).fillColor('#888888')
        .text('Este documento es un recibo digital generado automáticamente por Rentify App.', {
          align: 'center',
        });
      doc.text(`Generado el: ${new Date().toLocaleString('es-HN')}`, { align: 'center' });

      doc.end();
    });
  }

  // ══════════════════════════════════════════════════════════════
  // RECIBO DE NOTA DE DÉBITO
  // ══════════════════════════════════════════════════════════════
  static async generateDebitNoteReceipt(data: {
    noteId:       string;
    tenantName:   string;
    tenantPhone:  string;
    propertyName: string;
    unitNumber:   string;
    periodMonth:  number;
    periodYear:   number;
    serviceType:  string;
    description:  string;
    amount:       number;
    currency:     Currency;
    invoiceRef?:  string;
    invoiceDate?: Date;
    notes?:       string;
    issuedAt:     Date;
  }): Promise<Buffer> {
    const SERVICE_LABELS: Record<string, string> = {
      AGUA: 'Agua (SANAA)', LUZ: 'Energía Eléctrica (ENEE)',
      GAS: 'Gas', INTERNET: 'Internet / Cable',
      BASURA: 'Recolección de Basura', OTRO: 'Otro Cargo',
    };

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Encabezado ────────────────────────────────────────────
      doc.rect(50, 50, 495, 80).fillAndStroke('#1A4B3A', '#1A4B3A');
      doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
        .text('Rentify App', 70, 68);
      doc.fontSize(10).font('Helvetica')
        .text('NOTA DE DÉBITO — CARGO POR SERVICIO', 70, 95);
      doc.fillColor('#F5A623').fontSize(11).font('Helvetica-Bold')
        .text(`N° ${data.noteId.slice(-8).toUpperCase()}`, 370, 78)
        .fillColor('#ffffff').font('Helvetica').fontSize(9)
        .text(data.issuedAt.toLocaleDateString('es-HN'), 370, 95);

      doc.moveDown(4);
      doc.fillColor('#333333');

      // ── Datos del inquilino ───────────────────────────────────
      const infoY = 150;
      doc.rect(50, infoY, 495, 90).fillAndStroke('#f8f8f8', '#e0e0e0');
      doc.fillColor('#1A4B3A').fontSize(9).font('Helvetica-Bold')
        .text('DATOS DEL INQUILINO', 65, infoY + 10);
      doc.font('Helvetica').fillColor('#333333').fontSize(10);
      doc.text(`Nombre:     ${data.tenantName}`,        65, infoY + 25);
      doc.text(`Teléfono:   ${data.tenantPhone || '—'}`, 65, infoY + 40);
      doc.text(`Propiedad:  ${data.propertyName} — Unidad ${data.unitNumber}`, 65, infoY + 55);
      doc.text(`Período:    ${MONTHS_ES[data.periodMonth]} ${data.periodYear}`, 65, infoY + 70);

      doc.y = infoY + 105;

      // ── Detalle del cargo ─────────────────────────────────────
      doc.fillColor('#1A4B3A').fontSize(11).font('Helvetica-Bold')
        .text('DETALLE DEL CARGO', 50);
      doc.moveDown(0.4);

      // Tabla
      const tableY = doc.y;
      doc.rect(50, tableY, 495, 28).fillAndStroke('#1A4B3A', '#1A4B3A');
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      doc.text('SERVICIO',     60,  tableY + 9, { width: 180 });
      doc.text('DESCRIPCIÓN',  240, tableY + 9, { width: 190 });
      doc.text('MONTO',        440, tableY + 9, { width: 90, align: 'right' });

      const rowY = tableY + 28;
      doc.rect(50, rowY, 495, 34).fillAndStroke('#ffffff', '#e0e0e0');
      doc.fillColor('#333333').fontSize(10).font('Helvetica');
      doc.text(SERVICE_LABELS[data.serviceType] || data.serviceType, 60, rowY + 6, { width: 175 });
      doc.text(data.description, 240, rowY + 6, { width: 185 });
      doc.font('Helvetica-Bold').fillColor('#1A4B3A')
        .text(formatMoney(data.amount, data.currency), 440, rowY + 12, { width: 90, align: 'right' });

      // Total
      doc.y = rowY + 50;
      doc.moveTo(350, doc.y).lineTo(545, doc.y).stroke('#1A4B3A');
      doc.moveDown(0.3);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1A4B3A')
        .text('TOTAL A PAGAR:', 350, doc.y, { width: 100 });
      doc.text(formatMoney(data.amount, data.currency), 350, doc.y - 15, { width: 185, align: 'right' });

      doc.moveDown(2);

      // ── Referencia de factura ─────────────────────────────────
      if (data.invoiceRef || data.invoiceDate) {
        doc.fillColor('#555555').fontSize(9).font('Helvetica');
        if (data.invoiceRef)  doc.text(`Factura del servicio N°: ${data.invoiceRef}`);
        if (data.invoiceDate) doc.text(`Fecha de la factura: ${data.invoiceDate.toLocaleDateString('es-HN')}`);
        doc.moveDown(0.5);
      }

      if (data.notes) {
        doc.fillColor('#555555').fontSize(9).font('Helvetica')
          .text(`Notas: ${data.notes}`);
        doc.moveDown(0.5);
      }

      // ── Aviso ─────────────────────────────────────────────────
      doc.moveDown(1);
      doc.rect(50, doc.y, 495, 42).fillAndStroke('#fff8e8', '#F5A623');
      doc.fillColor('#7a5800').fontSize(9).font('Helvetica')
        .text(
          'Este cargo será incluido en su próximo cobro de alquiler. ' +
          'Para consultas comuníquese con su arrendador.',
          60, doc.y + 8, { width: 475 }
        );

      doc.moveDown(4);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#cccccc');
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#aaaaaa')
        .text('Nota de débito generada automáticamente por Rentify App.', { align: 'center' })
        .text(`Emitida el ${new Date().toLocaleString('es-HN')}`, { align: 'center' });

      doc.end();
    });
  }
}
