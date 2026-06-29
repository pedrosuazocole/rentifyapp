// src/services/textmebot.service.ts
// Servicio de notificaciones vía TextMeBot WhatsApp API.
// Ventaja sobre CallMeBot: soporta documentos/imágenes adjuntos (&document=)
// y usa una sola API Key global (no una por destinatario).
//
// API: https://api.textmebot.com/send.php
// Activación: el número de WhatsApp que envía los mensajes debe estar
// vinculado en textmebot.com (Linked Devices).
//
// Notas importantes del formato de la URL (confirmadas en producción):
//  - recipient: número con %2B en vez de "+" (ej: %2B504XXXXXXXX)
//  - document:  va en texto plano, SIN encodeURIComponent
//  - filename:  sí va con encodeURIComponent
//  - text:      sí va con encodeURIComponent
//  - TextMeBot exige mínimo 8 segundos entre mensajes (usamos 9s de margen
//    en los puntos donde se llama, fuera de este servicio)
import { formatMoney } from '../utils/money';
import { Currency } from '../types';

interface SendResult {
  success: boolean;
  error?: string;
}

function normalizarTelefono(phone: string): string {
  // Deja solo dígitos (sin "+", espacios ni guiones); el "+" se agrega como %2B en la URL
  return (phone || '').replace(/[^0-9]/g, '');
}

export class TextMeBotService {
  private static readonly API_URL = 'https://api.textmebot.com/send.php';

  /**
   * Envía un mensaje de texto, opcionalmente con un documento/imagen adjunto.
   * @param phone    Número destino, con o sin "+" (ej: +504XXXXXXXX)
   * @param apiKey   API Key de TextMeBot (global del sistema)
   * @param message  Texto del mensaje
   * @param fileUrl  URL pública del archivo adjunto — opcional
   * @param fileName Nombre de archivo a mostrar — opcional
   */
  static async send(
    phone: string,
    apiKey: string,
    message: string,
    fileUrl?: string,
    fileName?: string
  ): Promise<SendResult> {
    if (!phone || !apiKey?.trim()) {
      return { success: false, error: 'Número o API Key de TextMeBot no configurado' };
    }

    const tel = normalizarTelefono(phone);
    if (!tel) {
      return { success: false, error: `Número de teléfono inválido: ${phone}` };
    }

    let url = `${this.API_URL}?recipient=%2B${tel}&apikey=${apiKey.trim()}`;

    if (fileUrl) {
      // IMPORTANTE: fileUrl va en texto plano, SIN encodeURIComponent
      url += `&document=${fileUrl}`;
      if (fileName) url += `&filename=${encodeURIComponent(fileName)}`;
    }
    if (message) {
      url += `&text=${encodeURIComponent(message)}`;
    }
    url += `&json=yes`;

    try {
      const res = await fetch(url, { method: 'GET' });
      const body = await res.text();

      let parsed: any;
      try { parsed = JSON.parse(body); } catch { parsed = null; }

      const ok = res.ok && (parsed?.status === 'success' || /success/i.test(body));
      if (ok) {
        console.log(`📱 TextMeBot enviado a ${tel}${fileUrl ? ' (con adjunto)' : ''}`);
        return { success: true };
      }

      console.error(`❌ TextMeBot error para ${tel}:`, body.slice(0, 200));
      return { success: false, error: body.slice(0, 200) };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌ TextMeBot fetch error para ${tel}:`, msg);
      return { success: false, error: msg };
    }
  }

  /** Mensaje de prueba */
  static async sendTest(phone: string, apiKey: string): Promise<SendResult> {
    const now = new Date().toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' });
    return this.send(phone, apiKey,
      `🧪 *Rentify App — Prueba TextMeBot*\n\n` +
      `✅ WhatsApp via TextMeBot funcionando correctamente.\n\n` +
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

  /**
   * Recibo de pago. Si se pasa receiptPdfUrl (o cualquier otro adjunto a
   * través de fileUrl), el documento se adjunta directamente al mensaje
   * de WhatsApp en vez de solo mandar el link.
   */
  static async sendPaymentReceipt(params: {
    phone: string; apiKey: string; tenantName: string;
    propertyUnit: string; amount: number; currency: Currency;
    receiptNumber: string; receiptUrl: string; paymentDate: Date;
    invoiceNumber?: string;
    fileUrl?: string;
    fileName?: string;
  }): Promise<SendResult> {
    const fecha = params.paymentDate.toLocaleDateString('es-HN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const body =
      `✅ *Rentify App — Recibo de Pago*\n\n` +
      `¡Gracias *${params.tenantName}*! Tu pago fue registrado.\n\n` +
      `📍 Unidad: ${params.propertyUnit}\n` +
      `💰 Monto: ${formatMoney(params.amount, params.currency)}\n` +
      `📅 Fecha: ${fecha}\n` +
      `🧾 Recibo N°: ${params.receiptNumber}\n` +
      (params.invoiceNumber ? `📋 Factura N°: ${params.invoiceNumber}\n` : '') +
      `\n📄 Descargá tu recibo: ${params.receiptUrl}`;
    return this.send(params.phone, params.apiKey, body, params.fileUrl, params.fileName);
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

  /** Notificación de factura emitida */
  static async sendInvoiceNotification(params: {
    phone: string; apiKey: string; tenantName: string;
    invoiceNumber: string; cai: string; total: number;
    currency: Currency; invoiceUrl: string;
    fileUrl?: string; fileName?: string;
  }): Promise<SendResult> {
    const body =
      `🧾 *Rentify App — Factura Emitida*\n\n` +
      `Hola *${params.tenantName}*, se emitió tu factura de alquiler.\n\n` +
      `📋 Factura N°: ${params.invoiceNumber}\n` +
      `🔑 CAI: ${params.cai}\n` +
      `💳 Total: ${formatMoney(params.total, params.currency)}\n\n` +
      `📄 Descargá tu factura: ${params.invoiceUrl}`;
    return this.send(params.phone, params.apiKey, body, params.fileUrl, params.fileName);
  }
}
