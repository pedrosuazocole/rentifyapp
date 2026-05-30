// src/services/callmebot.service.ts
// Servicio de notificaciones vía CallMeBot WhatsApp API
// Gratuito, sin ventana de 24h, sin aprobación de Meta
// Límite: 3 mensajes/minuto por número (suficiente para notificaciones)
import { formatMoney } from '../utils/money';
import { Currency } from '../types';

interface SendResult {
  success: boolean;
  error?: string;
}

export class CallMeBotService {
  private static readonly API_URL = 'https://api.callmebot.com/whatsapp.php';

  /**
   * Envía un mensaje de texto vía CallMeBot a un número de WhatsApp.
   * @param phone Número en formato internacional +504XXXXXXXX
   * @param apiKey API Key personal del destinatario (obtenida al activar CallMeBot)
   * @param message Texto del mensaje (se codifica automáticamente)
   */
  static async send(phone: string, apiKey: string, message: string): Promise<SendResult> {
    if (!phone || !apiKey) {
      return { success: false, error: 'Número o API Key de CallMeBot no configurado' };
    }

    try {
      const params = new URLSearchParams({
        phone:   phone.replace(/\s/g, ''),
        apikey:  apiKey,
        text:    message,
      });

      const url = `${this.API_URL}?${params.toString()}`;
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
      const text = await res.text();

      // CallMeBot responde "Message queued. Thank you" si fue exitoso
      if (res.ok && (text.toLowerCase().includes('queued') || text.toLowerCase().includes('thank'))) {
        console.log(`📱 CallMeBot enviado a ${phone}`);
        return { success: true };
      }

      console.error(`❌ CallMeBot error para ${phone}:`, text);
      return { success: false, error: text.slice(0, 100) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ CallMeBot fetch error para ${phone}:`, msg);
      return { success: false, error: msg };
    }
  }

  /** Mensaje de prueba */
  static async sendTest(phone: string, apiKey: string): Promise<SendResult> {
    const now = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' });
    return this.send(phone, apiKey,
      `🧪 *Rentify App — Prueba CallMeBot*\n\n` +
      `✅ WhatsApp via CallMeBot funcionando correctamente.\n\n` +
      `📅 Fecha: ${now}\n🇭🇳 Zona: America/Tegucigalpa`
    );
  }

  /** Recordatorio de pago */
  static async sendPaymentReminder(params: {
    phone: string; apiKey: string; tenantName: string;
    propertyUnit: string; amount: number; currency: Currency; dueDate: Date;
  }): Promise<SendResult> {
    const fecha = params.dueDate.toLocaleDateString('es-HN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return this.send(params.phone, params.apiKey,
      `🏠 *Rentify App — Recordatorio de Pago*\n\n` +
      `Hola *${params.tenantName}*, tu pago vence pronto.\n\n` +
      `📍 Unidad: ${params.propertyUnit}\n` +
      `💰 Monto: ${formatMoney(params.amount, params.currency)}\n` +
      `📅 Fecha límite: ${fecha}\n\n` +
      `Por favor realizá tu pago a tiempo para evitar mora. 🙏`
    );
  }

  /** Recibo de pago */
  static async sendPaymentReceipt(params: {
    phone: string; apiKey: string; tenantName: string;
    propertyUnit: string; amount: number; currency: Currency;
    receiptNumber: string; receiptUrl: string; paymentDate: Date;
  }): Promise<SendResult> {
    const fecha = params.paymentDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    return this.send(params.phone, params.apiKey,
      `✅ *Rentify App — Recibo de Pago*\n\n` +
      `¡Gracias *${params.tenantName}*! Tu pago fue registrado.\n\n` +
      `📍 Unidad: ${params.propertyUnit}\n` +
      `💰 Monto: ${formatMoney(params.amount, params.currency)}\n` +
      `📅 Fecha: ${fecha}\n` +
      `🧾 Recibo N°: ${params.receiptNumber}\n\n` +
      `📄 Descargá tu recibo: ${params.receiptUrl}`
    );
  }

  /** Aviso de mora */
  static async sendLatePaymentNotice(params: {
    phone: string; apiKey: string; tenantName: string;
    propertyUnit: string; amountDue: number; lateFee: number;
    totalDue: number; currency: Currency; daysLate: number;
  }): Promise<SendResult> {
    return this.send(params.phone, params.apiKey,
      `⚠️ *Rentify App — Aviso de Mora*\n\n` +
      `Hola *${params.tenantName}*, tu pago está atrasado.\n\n` +
      `📍 Unidad: ${params.propertyUnit}\n` +
      `📌 Días de atraso: ${params.daysLate}\n` +
      `💰 Alquiler: ${formatMoney(params.amountDue, params.currency)}\n` +
      `🔴 Mora: ${formatMoney(params.lateFee, params.currency)}\n` +
      `💳 *Total: ${formatMoney(params.totalDue, params.currency)}*\n\n` +
      `Por favor regularizá tu situación a la brevedad.`
    );
  }

  /** Aviso de renovación */
  static async sendRenewalNotice(params: {
    phone: string; apiKey: string; tenantName: string;
    propertyUnit: string; contractEndDate: Date;
    monthlyRent: number; currency: Currency;
  }): Promise<SendResult> {
    const fechaFin = params.contractEndDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    return this.send(params.phone, params.apiKey,
      `📋 *Rentify App — Aviso de Renovación*\n\n` +
      `Hola *${params.tenantName}*, tu contrato vence pronto.\n\n` +
      `📍 Unidad: ${params.propertyUnit}\n` +
      `📅 Vence: ${fechaFin}\n` +
      `💰 Renta mensual: ${formatMoney(params.monthlyRent, params.currency)}\n\n` +
      `Comunicate con tu arrendador para renovar. 😊`
    );
  }
}
