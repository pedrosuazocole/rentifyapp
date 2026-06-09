// src/modules/debit-notes/debit-notes.controller.ts
// Notas de débito por servicios públicos — accesible para ADMIN, OWNER y VIEWER (contador)
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse } from '../../types';
import { CallMeBotService } from '../../services/callmebot.service';
import { toNumber } from '../../utils/money';
import { Currency } from '../../types';

// Tipos de servicio disponibles
export const SERVICE_TYPES: Record<string, string> = {
  AGUA:     '💧 Agua (SANAA)',
  LUZ:      '⚡ Energía eléctrica (ENEE)',
  GAS:      '🔥 Gas',
  INTERNET: '🌐 Internet / Cable',
  BASURA:   '🗑️ Recolección de basura',
  OTRO:     '📋 Otro cargo',
};

// ── Helper: enviar notificación de nota de débito ──────────────
async function notifyDebitNote(noteId: string): Promise<void> {
  try {
    // Verificar si las notificaciones de notas de débito están activas
    const config = await prisma.notificationConfig.findFirst({ where: { companyId: null } });
    if (config && config.debitNoteEnabled === false) return;

    const note = await prisma.debitNote.findUnique({
      where: { id: noteId },
      include: {
        contract: {
          include: {
            tenant: true,
            unit: { include: { property: true } },
          },
        },
      },
    });

    if (!note || !note.contract.tenant.callMeBotApiKey) return;

    const { tenant, unit } = note.contract;
    await CallMeBotService.sendDebitNoteNotice({
      phone:       tenant.phone,
      apiKey:      tenant.callMeBotApiKey as string,
      tenantName:  `${tenant.firstName} ${tenant.lastName}`,
      propertyUnit:`${unit.property.name} — ${unit.number}`,
      serviceType: note.serviceType,
      description: note.description,
      amount:      toNumber(note.amount),
      currency:    note.currency as Currency,
      periodMonth: note.periodMonth,
      periodYear:  note.periodYear,
      invoiceRef:  note.invoiceRef || undefined,
    });

    // Guardar en el log
    await prisma.notificationLog.create({
      data: {
        type:       'RECEIPT',
        status:     'SENT',
        toPhone:    tenant.phone,
        tenantName: `${tenant.firstName} ${tenant.lastName}`,
        message:    `Nota débito — ${note.serviceType} — ${note.description}`,
        contractId: note.contractId,
      },
    });
  } catch (err) {
    console.error('⚠️ Error enviando notificación de nota de débito:', err);
  }
}

export const debitNotesController = {

  /** GET /api/debit-notes — listar con filtros */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const contractId = req.query.contractId as string;
      const month      = req.query.month ? parseInt(req.query.month as string) : undefined;
      const year       = req.query.year  ? parseInt(req.query.year  as string) : undefined;
      const status     = req.query.status as string;

      const where: Record<string, unknown> = {};
      if (contractId) where.contractId  = contractId;
      if (month)      where.periodMonth = month;
      if (year)       where.periodYear  = year;
      if (status)     where.status      = status;

      const notes = await prisma.debitNote.findMany({
        where,
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }],
        include: {
          contract: {
            include: {
              tenant: { select: { id: true, firstName: true, lastName: true, phone: true } },
              unit:   { include: { property: { select: { id: true, name: true } } } },
            },
          },
        },
      });

      res.json(successResponse(notes));
    } catch (err) { next(err); }
  },

  /** GET /api/debit-notes/:id */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await prisma.debitNote.findUnique({
        where: { id: req.params.id },
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
            },
          },
        },
      });
      if (!note) throw new AppError('Nota de débito no encontrada.', 404);
      res.json(successResponse(note));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes — crear nota de débito */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        contractId, periodMonth, periodYear,
        serviceType, description, amount, currency,
        invoiceRef, invoiceDate, notes,
      } = req.body;

      // Verificar que el contrato existe y está activo
      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw new AppError('Contrato no encontrado.', 404);
      if (contract.status !== 'ACTIVE') {
        throw new AppError('Solo se pueden agregar notas a contratos activos.', 400);
      }

      if (!SERVICE_TYPES[serviceType]) {
        throw new AppError(`Tipo de servicio inválido. Opciones: ${Object.keys(SERVICE_TYPES).join(', ')}`, 400);
      }

      const note = await prisma.debitNote.create({
        data: {
          contractId,
          periodMonth: parseInt(periodMonth),
          periodYear:  parseInt(periodYear),
          serviceType,
          description,
          amount:      parseFloat(amount),
          currency:    currency || contract.currency,
          invoiceRef:  invoiceRef  || null,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
          notes:       notes || null,
          createdById: req.user!.id,
        },
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
            },
          },
        },
      });

      res.status(201).json(successResponse(note, 'Nota de débito registrada correctamente.'));

      // Enviar notificación automática (no bloqueante)
      notifyDebitNote(note.id).catch(console.error);
    } catch (err) { next(err); }
  },

  /** PUT /api/debit-notes/:id — editar (solo si está PENDING) */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await prisma.debitNote.findUnique({ where: { id: req.params.id } });
      if (!note) throw new AppError('Nota de débito no encontrada.', 404);
      if (note.status !== 'PENDING') {
        throw new AppError('Solo se pueden editar notas pendientes.', 400);
      }

      const { serviceType, description, amount, currency, invoiceRef, invoiceDate, notes } = req.body;

      const updated = await prisma.debitNote.update({
        where: { id: req.params.id },
        data: {
          ...(serviceType  && { serviceType }),
          ...(description  && { description }),
          ...(amount       && { amount: parseFloat(amount) }),
          ...(currency     && { currency }),
          ...(invoiceRef   !== undefined && { invoiceRef }),
          ...(invoiceDate  !== undefined && { invoiceDate: invoiceDate ? new Date(invoiceDate) : null }),
          ...(notes        !== undefined && { notes }),
        },
      });

      res.json(successResponse(updated, 'Nota de débito actualizada.'));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes/:id/cancel — anular */
  async cancel(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body;
      const note = await prisma.debitNote.findUnique({ where: { id: req.params.id } });
      if (!note) throw new AppError('Nota de débito no encontrada.', 404);
      if (note.status === 'CANCELLED') throw new AppError('La nota ya está anulada.', 400);
      if (note.status === 'INCLUDED')  throw new AppError('No se puede anular una nota ya cobrada.', 400);

      const updated = await prisma.debitNote.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED', cancelReason: reason || 'Anulada por el usuario' },
      });

      res.json(successResponse(updated, 'Nota de débito anulada.'));
    } catch (err) { next(err); }
  },

  /** GET /api/debit-notes/summary — resumen por contrato del mes */
  async summary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const month = req.query.month ? parseInt(req.query.month as string) : new Date().getMonth() + 1;
      const year  = req.query.year  ? parseInt(req.query.year  as string) : new Date().getFullYear();

      const notes = await prisma.debitNote.findMany({
        where: { periodMonth: month, periodYear: year, status: 'PENDING' },
        include: {
          contract: {
            include: {
              tenant: { select: { firstName: true, lastName: true, phone: true } },
              unit:   { include: { property: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      // Agrupar por contrato
      const grouped: Record<string, {
        contractId: string;
        tenantName: string;
        propertyUnit: string;
        items: typeof notes;
        totalHNL: number;
        totalUSD: number;
      }> = {};

      for (const n of notes) {
        const key = n.contractId;
        if (!grouped[key]) {
          grouped[key] = {
            contractId:  n.contractId,
            tenantName:  `${n.contract.tenant.firstName} ${n.contract.tenant.lastName}`,
            propertyUnit: `${n.contract.unit.property.name} — ${n.contract.unit.number}`,
            items:    [],
            totalHNL: 0,
            totalUSD: 0,
          };
        }
        grouped[key].items.push(n);
        if (n.currency === 'HNL') grouped[key].totalHNL += parseFloat(n.amount.toString());
        else                       grouped[key].totalUSD += parseFloat(n.amount.toString());
      }

      res.json(successResponse({
        month, year,
        totalNotes: notes.length,
        contracts: Object.values(grouped),
      }));
    } catch (err) { next(err); }
  },

  /** GET /api/debit-notes/service-types — catálogo de tipos de servicio */
  async getServiceTypes(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(successResponse(SERVICE_TYPES));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes/:id/notify — enviar notificación manual */
  async sendNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await prisma.debitNote.findUnique({
        where: { id: req.params.id },
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
            },
          },
        },
      });

      if (!note) throw new AppError('Nota de débito no encontrada.', 404);

      const { tenant, unit } = note.contract;

      if (!tenant.callMeBotApiKey) {
        throw new AppError(
          `El inquilino ${tenant.firstName} ${tenant.lastName} no tiene CallMeBot configurado. ` +
          `Editá su perfil y agrega la API Key.`,
          400
        );
      }

      const result = await CallMeBotService.sendDebitNoteNotice({
        phone:        tenant.phone,
        apiKey:       tenant.callMeBotApiKey,
        tenantName:   `${tenant.firstName} ${tenant.lastName}`,
        propertyUnit: `${unit.property.name} — ${unit.number}`,
        serviceType:  note.serviceType,
        description:  note.description,
        amount:       toNumber(note.amount),
        currency:     note.currency as Currency,
        periodMonth:  note.periodMonth,
        periodYear:   note.periodYear,
        invoiceRef:   note.invoiceRef || undefined,
      });

      // Guardar en log
      await prisma.notificationLog.create({
        data: {
          type:       'RECEIPT',
          status:     result.success ? 'SENT' : 'FAILED',
          toPhone:    tenant.phone,
          tenantName: `${tenant.firstName} ${tenant.lastName}`,
          message:    `[Manual] Nota débito — ${note.serviceType} — ${note.description}`,
          errorMessage: result.error,
          contractId: note.contractId,
        },
      });

      res.json(successResponse(
        result,
        result.success
          ? `✅ Notificación enviada a ${tenant.firstName} ${tenant.lastName} (${tenant.phone})`
          : `❌ Error al enviar: ${result.error}`
      ));
    } catch (err) { next(err); }
  },

  /** POST /api/debit-notes/:id/register-payment — registrar cobro */
  async registerPayment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await prisma.debitNote.findUnique({
        where: { id: req.params.id },
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
            },
          },
        },
      });

      if (!note) throw new AppError('Nota de débito no encontrada.', 404);
      if (note.status === 'CANCELLED') throw new AppError('No se puede cobrar una nota anulada.', 400);
      if (note.status === 'INCLUDED')  throw new AppError('Esta nota ya fue cobrada.', 400);

      const updated = await prisma.debitNote.update({
        where: { id: note.id },
        data: {
          status: 'INCLUDED',
          notes:  req.body.notes || note.notes || undefined,
        },
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
            },
          },
        },
      });

      // Notificación CallMeBot
      const { tenant, unit } = updated.contract;
      if (tenant.callMeBotApiKey) {
        const MONTHS_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const periodo = `${MONTHS_ES[note.periodMonth]} ${note.periodYear}`;
        const monto   = toNumber(note.amount).toLocaleString('es-HN', { minimumFractionDigits: 2 });
        const msg =
          `✅ *Rentify App — Cargo Cobrado*\n\n` +
          `Hola *${tenant.firstName} ${tenant.lastName}*, tu cargo fue registrado como cobrado.\n\n` +
          `📍 Unidad: ${unit.property.name} — ${unit.number}\n` +
          `📅 Período: ${periodo}\n` +
          `🔖 Servicio: ${note.description}\n` +
          `💰 Monto: *${monto} ${note.currency}*\n\n` +
          `Gracias por tu pago. 🙏`;

        CallMeBotService.send(tenant.phone, tenant.callMeBotApiKey as string, msg)
          .catch(console.error);

        prisma.notificationLog.create({
          data: {
            type: 'RECEIPT', status: 'SENT',
            toPhone: tenant.phone,
            tenantName: `${tenant.firstName} ${tenant.lastName}`,
            message: `Nota débito cobrada — ${note.serviceType}`,
            contractId: note.contractId,
          },
        }).catch(console.error);
      }

      res.json(successResponse(updated, '✅ Nota de débito registrada como cobrada.'));
    } catch (err) { next(err); }
  },

  /** GET /api/debit-notes/:id/receipt — recibo HTML imprimible */
  async downloadReceipt(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const note = await prisma.debitNote.findUnique({
        where: { id: req.params.id },
        include: {
          contract: {
            include: {
              tenant: true,
              unit: { include: { property: true } },
            },
          },
        },
      });

      if (!note) throw new AppError('Nota de débito no encontrada.', 404);

      const MONTHS_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      const SERVICE_LABELS: Record<string,string> = {
        AGUA:'Agua (SANAA)', LUZ:'Energía Eléctrica (ENEE)',
        GAS:'Gas', INTERNET:'Internet / Cable',
        BASURA:'Recolección de Basura', OTRO:'Otro Cargo',
      };

      const { tenant, unit } = note.contract;
      const periodo  = `${MONTHS_ES[note.periodMonth]} ${note.periodYear}`;
      const servicio = SERVICE_LABELS[note.serviceType] || note.serviceType;
      const monto    = toNumber(note.amount).toLocaleString('es-HN', { minimumFractionDigits: 2 });
      const estado   = note.status === 'INCLUDED' ? 'Cobrada' : note.status === 'CANCELLED' ? 'Anulada' : 'Pendiente';
      const fecha    = new Date(note.createdAt).toLocaleDateString('es-HN');

      const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Nota de Débito — ${note.id.slice(-8).toUpperCase()}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;font-size:13px;color:#333;padding:30px}
.header{background:#1A4B3A;color:#fff;padding:18px 24px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:22px;font-weight:900}.header h1 span{color:#F5A623}
.header .right{text-align:right;font-size:11px;opacity:.8}
.box{background:#f8f8f8;border:1px solid #ddd;border-radius:6px;padding:14px 18px;margin-bottom:16px}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}
.row:last-child{border:none}
.label{color:#888;font-size:11px}
.value{font-weight:600}
.total{background:#f0faf5;border:2px solid #1A4B3A;border-radius:6px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.total .amount{font-size:18px;font-weight:900;color:#1A4B3A}
.notice{background:#fff8e8;border:1px solid #F5A623;border-radius:6px;padding:10px 14px;font-size:11px;color:#7a5800;margin-bottom:16px}
.footer{text-align:center;color:#aaa;font-size:9px;margin-top:16px;border-top:1px solid #eee;padding-top:10px}
@media print{body{padding:10px}}
</style></head><body>
<div class="header">
  <div><h1>Rent<span>ify</span></h1><div style="font-size:10px;opacity:.7;letter-spacing:2px">SISTEMA DE ALQUILERES</div></div>
  <div class="right"><div style="font-size:13px;font-weight:bold;color:#F5A623">NOTA DE DÉBITO</div><div>N° ${note.id.slice(-8).toUpperCase()}</div><div>${fecha}</div></div>
</div>
<div class="box">
  <div class="row"><span class="label">Inquilino</span><span class="value">${tenant.firstName} ${tenant.lastName}</span></div>
  <div class="row"><span class="label">Propiedad / Unidad</span><span class="value">${unit.property.name} — ${unit.number}</span></div>
  <div class="row"><span class="label">Período</span><span class="value">${periodo}</span></div>
  <div class="row"><span class="label">Servicio</span><span class="value">${servicio}</span></div>
  <div class="row"><span class="label">Descripción</span><span class="value">${note.description}</span></div>
  ${note.invoiceRef ? `<div class="row"><span class="label">N° Factura servicio</span><span class="value">${note.invoiceRef}</span></div>` : ''}
  <div class="row"><span class="label">Estado</span><span class="value">${estado}</span></div>
</div>
<div class="total">
  <span style="font-weight:700;color:#1A4B3A">TOTAL A PAGAR</span>
  <span class="amount">${note.currency} ${monto}</span>
</div>
<div class="notice">⚠️ Este cargo será incluido en su próximo cobro de alquiler. Para consultas comuníquese con su arrendador.</div>
<div class="footer">Generado por Rentify App · ${new Date().toLocaleString('es-HN')}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) { next(err); }
  },
};
