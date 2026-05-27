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
}
