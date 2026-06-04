// src/services/telegram.service.ts
// Servicio de notificaciones vía Telegram Bot API
// Gratuito, sin límites de ventana, sin opt-in periódico
import { env } from '../config/env';
import { formatMoney } from '../utils/money';
import { Currency } from '../types';

interface SendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export class TelegramService {
  /**
   * Verifica si el bot está correctamente configurado
   */
  static isConfigured(): boolean {
    return env.TELEGRAM_BOT_TOKEN.length > 20 &&
           env.TELEGRAM_BOT_TOKEN !== '';
  }

  /**
   * Envía un mensaje de texto a un chatId específico.
   * Usa la API HTTP de Telegram directamente (sin dependencias pesadas en runtime).
   */
  private static async send(chatId: string, text: string): Promise<SendResult> {
    if (!this.isConfigured()) {
      console.warn(`⚠️ Telegram no configurado. Mensaje NO enviado a chatId ${chatId}`);
      return { success: false, error: 'TELEGRAM_BOT_TOKEN no configurado' };
    }

    try {
      const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      const data = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };

      if (!data.ok) {
        throw new Error(data.description || 'Error de Telegram API');
      }

      console.log(`📨 Telegram enviado a chatId ${chatId}: msg_id ${data.result?.message_id}`);
      return { success: true, messageId: data.result?.message_id };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ Error enviando Telegram a ${chatId}:`, msg);
      return { success: false, error: msg };
    }
  }

  /**
   * Obtiene información del bot (verifica que el token es válido)
   */
  static async getMe(): Promise<{ ok: boolean; username?: string; error?: string }> {
    if (!this.isConfigured()) return { ok: false, error: 'Token no configurado' };
    try {
      const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`;
      const res = await fetch(url);
      const data = await res.json() as { ok: boolean; result?: { username: string }; description?: string };
      if (!data.ok) return { ok: false, error: data.description };
      return { ok: true, username: data.result?.username };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  /**
   * Procesa los updates del bot — para obtener el chatId de nuevos usuarios
   * Llama a getUpdates y retorna los mensajes /start recibidos
   */
  static async getUpdates(): Promise<Array<{ chatId: string; firstName: string; username?: string; text: string }>> {
    if (!this.isConfigured()) return [];
    try {
      const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?limit=100`;
      const res = await fetch(url);
      const data = await res.json() as {
        ok: boolean;
        result: Array<{
          message?: {
            chat: { id: number; first_name: string; username?: string };
            text?: string;
          };
        }>;
      };
      if (!data.ok) return [];

      return data.result
        .filter(u => u.message?.text)
        .map(u => ({
          chatId: String(u.message!.chat.id),
          firstName: u.message!.chat.first_name,
          username: u.message!.chat.username,
          text: u.message!.text || '',
        }));
    } catch {
      return [];
    }
  }

  // ══════════════════════════════════════════════════════════════
  // MENSAJES DE NOTIFICACIÓN
  // ══════════════════════════════════════════════════════════════

  /** Mensaje de prueba */
  static async sendTest(chatId: string): Promise<SendResult> {
    const now = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' });
    const text =
      `🧪 <b>Rentify App — Mensaje de Prueba</b>\n\n` +
      `✅ Las notificaciones de Telegram están funcionando correctamente.\n\n` +
      `📅 <b>Fecha y hora:</b> ${now}\n` +
      `🇭🇳 <b>Zona horaria:</b> America/Tegucigalpa\n\n` +
      `Este mensaje fue enviado desde la configuración de Rentify.`;
    return this.send(chatId, text);
  }

  /** Recordatorio 3 días antes del vencimiento */
  static async sendPaymentReminder(params: {
    chatId: string;
    tenantName: string;
    propertyUnit: string;
    amount: number;
    currency: Currency;
    dueDate: Date;
  }): Promise<SendResult> {
    const { chatId, tenantName, propertyUnit, amount, currency, dueDate } = params;
    const fechaVencimiento = dueDate.toLocaleDateString('es-HN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const text =
      `🏠 <b>Rentify App — Recordatorio de Pago</b>\n\n` +
      `Hola <b>${tenantName}</b>, te recordamos que tu pago vence pronto.\n\n` +
      `📍 <b>Unidad:</b> ${propertyUnit}\n` +
      `💰 <b>Monto:</b> ${formatMoney(amount, currency)}\n` +
      `📅 <b>Fecha límite:</b> ${fechaVencimiento}\n\n` +
      `Por favor realizá tu pago a tiempo para evitar cargos por mora. 🙏`;
    return this.send(chatId, text);
  }

  /** Recibo digital al registrar pago */
  static async sendPaymentReceipt(params: {
    chatId: string;
    tenantName: string;
    propertyUnit: string;
    amount: number;
    currency: Currency;
    receiptNumber: string;
    receiptUrl: string;
    paymentDate: Date;
    invoiceNumber?: string;
  }): Promise<SendResult> {
    const { chatId, tenantName, propertyUnit, amount, currency, receiptNumber, receiptUrl, paymentDate, invoiceNumber } = params;
    const fecha = paymentDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const text =
      `✅ <b>Rentify App — Recibo de Pago</b>\n\n` +
      `¡Gracias <b>${tenantName}</b>! Tu pago fue registrado correctamente.\n\n` +
      `📍 <b>Unidad:</b> ${propertyUnit}\n` +
      `💰 <b>Monto pagado:</b> ${formatMoney(amount, currency)}\n` +
      `📅 <b>Fecha:</b> ${fecha}\n` +
      `🧾 <b>Recibo N°:</b> ${receiptNumber}\n` +
      (invoiceNumber ? `📋 <b>Factura N°:</b> ${invoiceNumber}\n` : '') +
      `\n📄 <a href="${receiptUrl}">Descargá tu recibo aquí</a>`;
    return this.send(chatId, text);
  }

  /** Aviso de mora */
  static async sendLatePaymentNotice(params: {
    chatId: string;
    tenantName: string;
    propertyUnit: string;
    amountDue: number;
    lateFee: number;
    totalDue: number;
    currency: Currency;
    daysLate: number;
  }): Promise<SendResult> {
    const { chatId, tenantName, propertyUnit, amountDue, lateFee, totalDue, currency, daysLate } = params;
    const text =
      `⚠️ <b>Rentify App — Aviso de Mora</b>\n\n` +
      `Hola <b>${tenantName}</b>, tu pago de alquiler está atrasado.\n\n` +
      `📍 <b>Unidad:</b> ${propertyUnit}\n` +
      `📌 <b>Días de atraso:</b> ${daysLate}\n` +
      `💰 <b>Alquiler:</b> ${formatMoney(amountDue, currency)}\n` +
      `🔴 <b>Cargo por mora:</b> ${formatMoney(lateFee, currency)}\n` +
      `💳 <b>Total a pagar: ${formatMoney(totalDue, currency)}</b>\n\n` +
      `Por favor regularizá tu situación a la brevedad. Gracias.`;
    return this.send(chatId, text);
  }

  /** Aviso de renovación */
  static async sendRenewalNotice(params: {
    chatId: string;
    tenantName: string;
    propertyUnit: string;
    contractEndDate: Date;
    monthlyRent: number;
    currency: Currency;
  }): Promise<SendResult> {
    const { chatId, tenantName, propertyUnit, contractEndDate, monthlyRent, currency } = params;
    const fechaFin = contractEndDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const text =
      `📋 <b>Rentify App — Aviso de Renovación</b>\n\n` +
      `Hola <b>${tenantName}</b>, tu contrato de alquiler está próximo a vencer.\n\n` +
      `📍 <b>Unidad:</b> ${propertyUnit}\n` +
      `📅 <b>Fecha de vencimiento:</b> ${fechaFin}\n` +
      `💰 <b>Renta mensual:</b> ${formatMoney(monthlyRent, currency)}\n\n` +
      `Para renovar tu contrato comunicáte con tu arrendador antes de esa fecha. 😊`;
    return this.send(chatId, text);
  }

  /** Notificación de factura */
  static async sendInvoiceNotification(params: {
    chatId: string;
    tenantName: string;
    invoiceNumber: string;
    total: number;
    currency: Currency;
    invoiceUrl: string;
  }): Promise<SendResult> {
    const { chatId, tenantName, invoiceNumber, total, currency, invoiceUrl } = params;
    const text =
      `🧾 <b>Rentify App — Factura Emitida</b>\n\n` +
      `Hola <b>${tenantName}</b>, se emitió tu factura de alquiler.\n\n` +
      `📋 <b>Factura N°:</b> ${invoiceNumber}\n` +
      `💳 <b>Total:</b> ${formatMoney(total, currency)}\n\n` +
      `📄 <a href="${invoiceUrl}">Descargá tu factura aquí</a>`;
    return this.send(chatId, text);
  }
}
