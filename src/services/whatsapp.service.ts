// src/services/whatsapp.service.ts
// Gestión de mensajes de WhatsApp vía Twilio SDK
// Inicialización LAZY: el cliente se crea solo cuando se necesita enviar,
// evitando crash al arrancar si las credenciales son placeholders.
import { env } from '../config/env';
import { formatMoney } from '../utils/money';
import { Currency } from '../types';

interface SendMessageResult {
  success: boolean;
  sid?: string;
  error?: string;
}

export class WhatsAppService {
  private static getClient() {
    // Validar que las credenciales son reales antes de instanciar
    if (
      !env.TWILIO_ACCOUNT_SID.startsWith('AC') ||
      env.TWILIO_AUTH_TOKEN === 'tu_auth_token_de_twilio' ||
      env.TWILIO_AUTH_TOKEN.length < 20
    ) {
      throw new Error('Credenciales de Twilio no configuradas. Actualizá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en Railway Variables.');
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    return twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }

  static isConfigured(): boolean {
    return (
      env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
      env.TWILIO_AUTH_TOKEN !== 'tu_auth_token_de_twilio' &&
      env.TWILIO_AUTH_TOKEN.length >= 20 &&
      env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
    );
  }

  private static async send(to: string, body: string): Promise<SendMessageResult> {
    if (!this.isConfigured()) {
      console.warn(`⚠️ WhatsApp no configurado. Mensaje NO enviado a ${to}`);
      return { success: false, error: 'Twilio no configurado' };
    }

    try {
      const client = this.getClient();
      const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
      const message = await client.messages.create({
        from: env.TWILIO_WHATSAPP_FROM,
        to: toFormatted,
        body,
      });
      console.log(`📱 WhatsApp enviado a ${to}: ${message.sid}`);
      return { success: true, sid: message.sid };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error enviando WhatsApp a ${to}:`, msg);
      return { success: false, error: msg };
    }
  }

  /** Recordatorio 3 días antes del vencimiento */
  static async sendPaymentReminder(params: {
    phone: string;
    tenantName: string;
    propertyUnit: string;
    amount: number;
    currency: Currency;
    dueDate: Date;
  }): Promise<SendMessageResult> {
    const { phone, tenantName, propertyUnit, amount, currency, dueDate } = params;
    const fechaVencimiento = dueDate.toLocaleDateString('es-HN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const body =
      `🏠 *Rentify App — Recordatorio de Pago*\n\n` +
      `Hola ${tenantName}, te recordamos que el pago de tu alquiler vence pronto.\n\n` +
      `📍 Unidad: ${propertyUnit}\n` +
      `💰 Monto: ${formatMoney(amount, currency)}\n` +
      `📅 Fecha límite: ${fechaVencimiento}\n\n` +
      `Por favor realizá tu pago a tiempo para evitar cargos por mora. 🙏`;
    return this.send(phone, body);
  }

  /** Recibo digital inmediato al registrar un pago */
  static async sendPaymentReceipt(params: {
    phone: string;
    tenantName: string;
    propertyUnit: string;
    amount: number;
    currency: Currency;
    receiptNumber: string;
    receiptUrl: string;
    paymentDate: Date;
    invoiceNumber?: string;
  }): Promise<SendMessageResult> {
    const { phone, tenantName, propertyUnit, amount, currency, receiptNumber, receiptUrl, paymentDate, invoiceNumber } = params;
    const fecha = paymentDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const body =
      `✅ *Rentify App — Recibo de Pago*\n\n` +
      `¡Gracias ${tenantName}! Tu pago fue registrado correctamente.\n\n` +
      `📍 Unidad: ${propertyUnit}\n` +
      `💰 Monto pagado: ${formatMoney(amount, currency)}\n` +
      `📅 Fecha: ${fecha}\n` +
      `🧾 Recibo N°: ${receiptNumber}\n` +
      (invoiceNumber ? `📋 Factura N°: ${invoiceNumber}\n` : '') +
      `\n📄 Descargá tu recibo:\n${receiptUrl}`;
    return this.send(phone, body);
  }

  /** Aviso de mora */
  static async sendLatePaymentNotice(params: {
    phone: string;
    tenantName: string;
    propertyUnit: string;
    amountDue: number;
    lateFee: number;
    totalDue: number;
    currency: Currency;
    daysLate: number;
  }): Promise<SendMessageResult> {
    const { phone, tenantName, propertyUnit, amountDue, lateFee, totalDue, currency, daysLate } = params;
    const body =
      `⚠️ *Rentify App — Aviso de Mora*\n\n` +
      `Hola ${tenantName}, tu pago de alquiler está atrasado.\n\n` +
      `📍 Unidad: ${propertyUnit}\n` +
      `📌 Días de atraso: ${daysLate}\n` +
      `💰 Alquiler: ${formatMoney(amountDue, currency)}\n` +
      `🔴 Cargo por mora: ${formatMoney(lateFee, currency)}\n` +
      `💳 *Total a pagar: ${formatMoney(totalDue, currency)}*\n\n` +
      `Por favor regularizá tu situación a la brevedad. Gracias.`;
    return this.send(phone, body);
  }

  /** Alerta de renovación 30 días antes del fin del contrato */
  static async sendRenewalNotice(params: {
    phone: string;
    tenantName: string;
    propertyUnit: string;
    contractEndDate: Date;
    monthlyRent: number;
    currency: Currency;
  }): Promise<SendMessageResult> {
    const { phone, tenantName, propertyUnit, contractEndDate, monthlyRent, currency } = params;
    const fechaFin = contractEndDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const body =
      `📋 *Rentify App — Aviso de Renovación*\n\n` +
      `Hola ${tenantName}, tu contrato de alquiler está próximo a vencer.\n\n` +
      `📍 Unidad: ${propertyUnit}\n` +
      `📅 Fecha de vencimiento: ${fechaFin}\n` +
      `💰 Renta mensual: ${formatMoney(monthlyRent, currency)}\n\n` +
      `Para renovar tu contrato comunicate con tu arrendador antes de esa fecha. 😊`;
    return this.send(phone, body);
  }

  /** Notificación de factura emitida */
  static async sendInvoiceNotification(params: {
    phone: string;
    tenantName: string;
    invoiceNumber: string;
    cai: string;
    total: number;
    currency: Currency;
    invoiceUrl: string;
  }): Promise<SendMessageResult> {
    const { phone, tenantName, invoiceNumber, cai, total, currency, invoiceUrl } = params;
    const body =
      `🧾 *Rentify App — Factura Emitida*\n\n` +
      `Hola ${tenantName}, se emitió tu factura de alquiler.\n\n` +
      `📋 Factura N°: ${invoiceNumber}\n` +
      `🔑 CAI: ${cai}\n` +
      `💳 Total: ${formatMoney(total, currency)}\n\n` +
      `📄 Descargá tu factura:\n${invoiceUrl}`;
    return this.send(phone, body);
  }

  /** Mensaje de prueba para verificar configuración */
  static async sendTestMessage(params: { phone: string }) {
    const now = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' });
    const body =
      `🧪 *Rentify App — Mensaje de Prueba*\n\n` +
      `✅ Las notificaciones de WhatsApp están funcionando correctamente.\n\n` +
      `📅 Fecha y hora: ${now}\n` +
      `🇭🇳 Zona horaria: America/Tegucigalpa\n\n` +
      `Este mensaje fue enviado desde la configuración de notificaciones.`;
    return this.send(params.phone, body);
  }
}

