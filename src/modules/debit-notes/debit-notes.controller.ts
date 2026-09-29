// src/modules/debit-notes/debit-notes.controller.ts
// Notas de débito por servicios públicos — accesible para ADMIN, OWNER y VIEWER (contador)
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse, Currency } from '../../types';
import { TextMeBotService } from '../../services/textmebot.service';
import { CallMeBotService } from '../../services/callmebot.service';
import { toNumber, formatMoney } from '../../utils/money';
import { env } from '../../config/env';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Tipos de servicio disponibles
export const SERVICE_TYPES: Record<string, string> = {
  AGUA:     'Agua (SANAA)',
  LUZ:      'Energía eléctrica (ENEE)',
  GAS:      'Gas',
  INTERNET: 'Internet / Cable',
  BASURA:   'Recolección de basura',
  OTRO:     'Otro cargo',
};

const includeContract = {
  contract: {
    include: {
      tenant: true,
      unit: { include: { property: true } },
    },
  },
};

/** Envía una notificación de texto (sin adjunto) al inquilino y a los CC de TextMeBot. */
async function notifyTenantAndCC(params: {
  tenant: { phone: string; textMeBotApiKey: string | null; callMeBotApiKey: string | null };
  msgInquilino: string;
  msgCC: string;
}): Promise<void> {
  try {
    const notifConfig = await prisma.notificationConfig.findFirst({ where: { companyId: null } });

    const tmbKeyTenant = params.tenant.textMeBotApiKey?.trim() || notifConfig?.textMeBotSenderKey?.trim();
    if (tmbKeyTenant) {
      await TextMeBotService.send(params.tenant.phone, tmbKeyTenant, params.msgInquilino)
        .catch(e => console.error('⚠️ TextMeBot inquilino (nota débito):', e));
      await new Promise(r => setTimeout(r, 9000)); // TextMeBot exige mínimo 8 seg entre mensajes
    } else if (params.tenant.callMeBotApiKey?.trim()) {
      await CallMeBotService.send(params.tenant.phone, params.tenant.callMeBotApiKey, params.msgInquilino)
        .catch(e => console.error('⚠️ CallMeBot inquilino (nota débito):', e));
    }

    if (notifConfig?.textMeBotSenderKey?.trim() && notifConfig?.ccNumbersTextMeBot) {
      const recipients = notifConfig.ccNumbersTextMeBot.split(',').map((n: string) => n.trim()).filter(Boolean);
      for (const phone of recipients) {
        await new Promise(r => setTimeout(r, 9000));
        await TextMeBotService.send(phone, notifConfig.textMeBotSenderKey as string, params.msgCC)
          .catch(e => console.error('⚠️ TextMeBot CC (nota débito):', e));
      }
    }
  } catch (err) {
    console.error('⚠️ Error notificando nota de débito:', err);
  }
}

export const debitNotesController = {
  /** GET /api/debit-notes?month=&year= */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const now   = new Date();
      const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
      const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();

      const where: Record<string, unknown> = { periodMonth: month, periodYear: year };
      if (req.user!.role !== 'ADMIN') where.contract = { companyId: req.user!.companyId };

      const notes = await prisma.debitNote.findMany({
        where,
        include: includeContract,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      });

      res.json(successResponse(notes));
    } catch (err) { next(err); }
  },

  /** GET /api/debit-notes/summary?month=&year= */
  async summary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const now   = new Date();
      const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
      const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();

      const where: Record<string, unknown> = { periodMonth: month, periodYear: year, status: 'PENDING' };
      if (req.user!.role !== 'ADMIN') where.contract = { companyId: req.user!.companyId };

      const notes = await prisma.debitNote.findMany({
        where,
        include: includeContract,
        orderBy: { createdAt: 'asc' },
      });

      // Agrupar por contrato
      const grouped: Record<string, {
        contractId: string;
        tenantName: string;
        propertyUnit: string;
        items: Array<{ id: string; serviceType: string; description: string; amount: number; currency: string }>;
        totalHNL: number;
        totalUSD: number;
      }> = {};

      for (const n of notes) {
        const key = n.contractId;
        if (!grouped[key]) {
          grouped[key] = {
            contractId: key,
            tenantName: `${n.contract.tenant.firstName} ${n.contract.tenant.lastName}`,
            propertyUnit: `${n.contract.unit.property.name} — ${n.contract.unit.number}`,
            items: [],
            totalHNL: 0,
            totalUSD: 0,
          };
        }
        const amt = toNumber(n.amount);
        grouped[key].items.push({
          id: n.id, serviceType: n.serviceType, description: n.description,
          amount: amt, currency: n.currency,
        });
        if (n.currency === 'HNL') grouped[key].totalHNL += amt;
        else grouped[key].totalUSD += amt;
      }

      res.json(successResponse({
        totalNotes: notes.length,
        contracts: Object.values(grouped),
      }));
    } catch (err) { next(err); }
  },

  /** GET /api/debit-notes/:id */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await prisma.debitNote.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'ADMIN' ? { contract: { companyId: req.user!.companyId } } : {}),
        },
        include: includeContract,
      });
      if (!note) throw new AppError('Nota de débito no encontrada.', 404);
      res.json(successResponse(note));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        contractId, periodMonth, periodYear,
        serviceType, description, amount, currency,
        invoiceRef, invoiceDate, notes,
      } = req.body;

      if (!contractId) throw new AppError('El contrato es requerido.', 400);
      if (!description?.trim()) throw new AppError('La descripción es requerida.', 400);
      if (!amount || parseFloat(amount) <= 0) throw new AppError('El monto debe ser mayor a cero.', 400);

      const contract = await prisma.contract.findFirst({
        where: {
          id: contractId,
          ...(req.user!.role !== 'ADMIN' ? { companyId: req.user!.companyId } : {}),
        },
        include: { tenant: true, unit: { include: { property: true } } },
      });
      if (!contract) throw new AppError('Contrato no encontrado.', 404);

      const created = await prisma.debitNote.create({
        data: {
          contractId,
          periodMonth: parseInt(periodMonth),
          periodYear: parseInt(periodYear),
          serviceType: serviceType || 'OTRO',
          description: description.trim(),
          amount: parseFloat(amount),
          currency: (currency || 'HNL') as Currency,
          invoiceRef: invoiceRef || undefined,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
          notes: notes || undefined,
          createdById: req.user!.id,
        },
        include: includeContract,
      });

      // Notificar al inquilino y a los CC (si está habilitado)
      const notifConfig = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
      if (notifConfig?.debitNoteEnabled !== false) {
        const tenantName   = `${contract.tenant.firstName} ${contract.tenant.lastName}`;
        const propertyUnit = `${contract.unit.property.name} — ${contract.unit.number}`;
        const montoTxt     = formatMoney(parseFloat(amount), (currency || 'HNL') as Currency);
        const svcLabel      = SERVICE_TYPES[serviceType] || serviceType || 'Cargo';

        const msgInquilino =
          `📋 *Rentify App — Nuevo Cargo*\n\n` +
          `Hola *${tenantName}*, se agregó un cargo a tu cuenta.\n\n` +
          `📍 Unidad: ${propertyUnit}\n` +
          `🔖 Servicio: ${svcLabel}\n` +
          `📝 ${description.trim()}\n` +
          `💰 Monto: *${montoTxt}*\n\n` +
          `Este cargo se incluirá en tu próximo pago.`;

        const msgCC =
          `📋 *Rentify — Nueva Nota de Débito*\n\n` +
          `👤 *${tenantName}*\n` +
          `📍 ${propertyUnit}\n` +
          `🔖 ${svcLabel}: ${description.trim()}\n` +
          `💰 Monto: *${montoTxt}*`;

        // No bloquear la respuesta esperando el envío — se hace en segundo plano
        notifyTenantAndCC({ tenant: contract.tenant, msgInquilino, msgCC }).catch(console.error);
      }

      res.status(201).json(successResponse(created, '✅ Nota de débito registrada correctamente.'));
    } catch (err) { next(err); }
  },

  /** PUT /api/debit-notes/:id */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await prisma.debitNote.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'ADMIN' ? { contract: { companyId: req.user!.companyId } } : {}),
        },
      });
      if (!existing) throw new AppError('Nota de débito no encontrada.', 404);
      if (existing.status !== 'PENDING') throw new AppError('Solo se pueden editar notas pendientes.', 400);

      const { serviceType, description, amount, currency, invoiceRef, invoiceDate, notes } = req.body;

      const updated = await prisma.debitNote.update({
        where: { id: existing.id },
        data: {
          serviceType: serviceType || existing.serviceType,
          description: description?.trim() || existing.description,
          amount: amount !== undefined ? parseFloat(amount) : undefined,
          currency: currency || undefined,
          invoiceRef: invoiceRef !== undefined ? (invoiceRef || null) : undefined,
          invoiceDate: invoiceDate !== undefined ? (invoiceDate ? new Date(invoiceDate) : null) : undefined,
          notes: notes !== undefined ? (notes || null) : undefined,
        },
        include: includeContract,
      });

      res.json(successResponse(updated, '✅ Nota de débito actualizada.'));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes/:id/cancel */
  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body;
      if (!reason?.trim()) throw new AppError('El motivo de anulación es requerido.', 400);

      const existing = await prisma.debitNote.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'ADMIN' ? { contract: { companyId: req.user!.companyId } } : {}),
        },
      });
      if (!existing) throw new AppError('Nota de débito no encontrada.', 404);
      if (existing.status === 'INCLUDED') throw new AppError('No se puede anular una nota ya cobrada.', 400);

      const updated = await prisma.debitNote.update({
        where: { id: existing.id },
        data: { status: 'CANCELLED', cancelReason: reason.trim() },
      });

      res.json(successResponse(updated, 'Nota de débito anulada.'));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes/:id/notify — reenvío manual de la notificación */
  async notify(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await prisma.debitNote.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'ADMIN' ? { contract: { companyId: req.user!.companyId } } : {}),
        },
        include: includeContract,
      });
      if (!note) throw new AppError('Nota de débito no encontrada.', 404);

      const { tenant, unit } = note.contract;
      const tenantName   = `${tenant.firstName} ${tenant.lastName}`;
      const propertyUnit = `${unit.property.name} — ${unit.number}`;
      const montoTxt     = formatMoney(toNumber(note.amount), note.currency as Currency);
      const svcLabel      = SERVICE_TYPES[note.serviceType] || note.serviceType;

      const msgInquilino =
        `📋 *Rentify App — Recordatorio de Cargo*\n\n` +
        `Hola *${tenantName}*, tenés un cargo pendiente.\n\n` +
        `📍 Unidad: ${propertyUnit}\n` +
        `🔖 Servicio: ${svcLabel}\n` +
        `📝 ${note.description}\n` +
        `💰 Monto: *${montoTxt}*`;

      const msgCC =
        `📋 *Rentify — Recordatorio Nota de Débito*\n\n` +
        `👤 *${tenantName}*\n` +
        `📍 ${propertyUnit}\n` +
        `🔖 ${svcLabel}: ${note.description}\n` +
        `💰 Monto: *${montoTxt}*`;

      const tmbKey = tenant.textMeBotApiKey?.trim();
      const notifConfig = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
      if (!tmbKey && !notifConfig?.textMeBotSenderKey?.trim() && !tenant.callMeBotApiKey?.trim()) {
        throw new AppError('El inquilino no tiene WhatsApp configurado (ni TextMeBot ni CallMeBot).', 400);
      }

      await notifyTenantAndCC({ tenant, msgInquilino, msgCC });

      res.json(successResponse(null, '✅ Notificación enviada correctamente.'));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes/:id/register-payment — marcar como cobrada */
  async registerPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { notes, proofBase64, proofMime, proofName } = req.body;

      const note = await prisma.debitNote.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'ADMIN' ? { contract: { companyId: req.user!.companyId } } : {}),
        },
        include: includeContract,
      });
      if (!note) throw new AppError('Nota de débito no encontrada.', 404);
      if (note.status !== 'PENDING') throw new AppError('Esta nota ya fue procesada.', 400);

      const updated = await prisma.debitNote.update({
        where: { id: note.id },
        data: {
          status: 'INCLUDED',
          notes: notes ? `${note.notes ? note.notes + ' | ' : ''}${notes}` : note.notes,
        },
        include: includeContract,
      });

      // ── Notificar con comprobante adjunto (si se subió) ──────────
      try {
        const { tenant, unit } = updated.contract;
        const tenantName   = `${tenant.firstName} ${tenant.lastName}`;
        const propertyUnit = `${unit.property.name} — ${unit.number}`;
        const montoTxt     = formatMoney(toNumber(updated.amount), updated.currency as Currency);
        const svcLabel      = SERVICE_TYPES[updated.serviceType] || updated.serviceType;

        let proofUrl: string | undefined;
        let fileDisp: string | undefined;
        let tmpPath: string | undefined;

        if (proofBase64 && proofMime && proofName) {
          const ext     = (proofName as string).includes('.') ? (proofName as string).split('.').pop() : 'jpg';
          const tmpName = `proof-dn-${updated.id}-${Date.now()}.${ext}`;
          tmpPath       = path.join(os.tmpdir(), tmpName);
          fileDisp      = proofName as string;
          fs.writeFileSync(tmpPath, Buffer.from(proofBase64 as string, 'base64'));
          proofUrl = `${env.APP_URL}/api/payments/proof/${tmpName}`;
        }

        const msgInquilino =
          `✅ *Rentify App — Cargo Cobrado*\n\n` +
          `Hola *${tenantName}*, tu cargo fue cobrado.\n\n` +
          `📍 Unidad: ${propertyUnit}\n` +
          `🔖 Servicio: ${svcLabel}\n` +
          `💰 Monto: *${montoTxt}*` +
          (proofUrl ? `\n\n📎 Tu comprobante se adjunta a este mensaje.` : '');

        const msgCC =
          `📎 *Rentify — Cargo Cobrado*\n\n` +
          `👤 *${tenantName}*\n` +
          `📍 ${propertyUnit}\n` +
          `🔖 ${svcLabel}\n` +
          `💰 Monto: *${montoTxt}*`;

        const notifConfig  = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
        const tmbKeyTenant = tenant.textMeBotApiKey?.trim() || notifConfig?.textMeBotSenderKey?.trim();

        if (tmbKeyTenant) {
          await TextMeBotService.send(tenant.phone, tmbKeyTenant, msgInquilino, proofUrl, fileDisp)
            .catch(e => console.error('⚠️ TextMeBot inquilino (cobro nota débito):', e));
          await new Promise(r => setTimeout(r, 9000));
        } else if (tenant.callMeBotApiKey?.trim()) {
          await CallMeBotService.send(tenant.phone, tenant.callMeBotApiKey, msgInquilino)
            .catch(e => console.error('⚠️ CallMeBot inquilino (cobro nota débito):', e));
        }

        if (notifConfig?.textMeBotSenderKey?.trim() && notifConfig?.ccNumbersTextMeBot) {
          const recipients = notifConfig.ccNumbersTextMeBot.split(',').map((n: string) => n.trim()).filter(Boolean);
          for (const phone of recipients) {
            await new Promise(r => setTimeout(r, 9000));
            await TextMeBotService.send(phone, notifConfig.textMeBotSenderKey as string, msgCC, proofUrl, fileDisp)
              .catch(e => console.error('⚠️ TextMeBot CC (cobro nota débito):', e));
          }
        }

        if (tmpPath) {
          const cleanupPath = tmpPath;
          setTimeout(() => { try { fs.unlinkSync(cleanupPath); } catch {} }, 5 * 60 * 1000);
        }
      } catch (notifErr) {
        console.error('⚠️ Error notificando cobro de nota de débito:', notifErr);
      }

      res.json(successResponse(updated, '✅ Cobro registrado correctamente.'));
    } catch (err) { next(err); }
  },
};
