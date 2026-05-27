// src/services/whatsapp.service.ts
// Gestión de mensajes de WhatsApp vía Twilio SDK
import twilio from 'twilio';
import { env } from '../config/env';
import { formatMoney } from '../utils/money';
import { Currency } from '../types';

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

interface SendMessageResult {
  success: boolean;
  sid?: string;
  error?: string;
}

export class WhatsAppService {
  private static async send(to: string, body: string): Promise<SendMessageResult> {
    try {
      // Asegurar formato correcto del número
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
      `Hola ${tenantName}, te recordamos que el pago de tu alquiler está próximo a vencer.\n\n` +
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
  }): Promise<SendMessageResult> {
    const { phone, tenantName, propertyUnit, amount, currency, receiptNumber, receiptUrl, paymentDate } = params;
    const fecha = paymentDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const body =
      `✅ *Rentify App — Recibo de Pago*\n\n` +
      `¡Gracias ${tenantName}! Tu pago fue registrado correctamente.\n\n` +
      `📍 Unidad: ${propertyUnit}\n` +
      `💰 Monto pagado: ${formatMoney(amount, currency)}\n` +
      `📅 Fecha: ${fecha}\n` +
      `🧾 Recibo N°: ${receiptNumber}\n\n` +
      `📄 Descargá tu recibo aquí:\n${receiptUrl}`;
    return this.send(phone, body);
  }

  /** Aviso de mora: 1 día después de vencido el plazo de gracia */
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
      `💳 Total a pagar: ${formatMoney(totalDue, currency)}\n\n` +
      `Te pedimos que regularices tu situación a la brevedad posible. Para consultas contactá al arrendador.`;
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
      `📋 *Rentify App — Aviso de Renovación de Contrato*\n\n` +
      `Hola ${tenantName}, tu contrato de alquiler está próximo a vencer.\n\n` +
      `📍 Unidad: ${propertyUnit}\n` +
      `📅 Fecha de vencimiento: ${fechaFin}\n` +
      `💰 Renta mensual actual: ${formatMoney(monthlyRent, currency)}\n\n` +
      `Si deseás renovar tu contrato, por favor comunicate con nosotros antes de la fecha de vencimiento. 😊`;
    return this.send(phone, body);
  }
}
