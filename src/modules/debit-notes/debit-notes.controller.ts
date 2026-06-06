// src/modules/debit-notes/debit-notes.controller.ts
// Notas de débito por servicios públicos — accesible para ADMIN, OWNER y VIEWER (contador)
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse } from '../../types';

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

    const { CallMeBotService } = await import('../../services/callmebot.service');
    const { toNumber }         = await import('../../utils/money');

    const { tenant, unit } = note.contract;
    await CallMeBotService.sendDebitNoteNotice({
      phone:        tenant.phone,
      apiKey:       tenant.callMeBotApiKey as string,
      tenantName:   `${tenant.firstName} ${tenant.lastName}`,
      propertyUnit: `${unit.property.name} — ${unit.number}`,
      serviceType:  note.serviceType,
      description:  note.description,
      amount:       toNumber(note.amount),
      currency:     note.currency as 'HNL' | 'USD',
      periodMonth:  note.periodMonth,
      periodYear:   note.periodYear,
      invoiceRef:   note.invoiceRef || undefined,
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

  /** POST /api/debit-notes/:id/register-payment — registrar cobro de la nota */
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
      if (note.status === 'CANCELLED')  throw new AppError('No se puede cobrar una nota anulada.', 400);
      if (note.status === 'INCLUDED')   throw new AppError('Esta nota ya fue cobrada.', 400);

      const { paymentDate, notes: payNotes } = req.body;

      // Marcar la nota como cobrada
      const updated = await prisma.debitNote.update({
        where: { id: note.id },
        data: {
          status:    'INCLUDED',
          notes:     payNotes || note.notes,
          updatedAt: new Date(),
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

      // Enviar notificación por CallMeBot si el inquilino tiene API Key
      const { tenant, unit } = updated.contract;
      if (tenant.callMeBotApiKey) {
        try {
          const { CallMeBotService } = await import('../../services/callmebot.service');
          const { toNumber } = await import('../../utils/money');
          const MONTHS_ES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
          const SERVICE_ICONS: Record<string,string> = { AGUA:'💧', LUZ:'⚡', GAS:'🔥', INTERNET:'🌐', BASURA:'🗑️', OTRO:'📋' };
          const icono  = SERVICE_ICONS[note.serviceType] || '📋';
          const periodo = `${MONTHS_ES[note.periodMonth]} ${note.periodYear}`;
          const monto   = parseFloat(note.amount.toString()).toLocaleString('es-HN', { minimumFractionDigits: 2 });

          await CallMeBotService.send(
            tenant.phone,
            tenant.callMeBotApiKey as string,
            `${icono} *Rentify App — Cargo Cobrado*\n\n` +
            `Hola *${tenant.firstName} ${tenant.lastName}*, tu cargo de servicio fue registrado como cobrado.\n\n` +
            `📍 Unidad: ${unit.property.name} — ${unit.number}\n` +
            `📅 Período: ${periodo}\n` +
            `🔖 Servicio: ${note.description}\n` +
            `💰 Monto cobrado: *${monto} ${note.currency}*\n\n` +
            `Gracias por tu pago. 🙏`
          );

          void toNumber; // suprimir unused warning

          await prisma.notificationLog.create({
            data: {
              type:       'RECEIPT',
              status:     'SENT',
              toPhone:    tenant.phone,
              tenantName: `${tenant.firstName} ${tenant.lastName}`,
              message:    `Nota débito cobrada — ${note.serviceType} — ${note.description}`,
              contractId: note.contractId,
            },
          });
        } catch (notifErr) {
          console.error('⚠️ Error enviando notificación de cobro:', notifErr);
        }
      }

      res.json(successResponse(updated, '✅ Nota de débito registrada como cobrada.'));
    } catch (err) { next(err); }
  },
  async getServiceTypes(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json(successResponse(SERVICE_TYPES));
    } catch (err) { next(err); }
  },

  /** GET /api/debit-notes/:id/receipt — descargar PDF del recibo */
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

      const { PdfService } = await import('../../services/pdf.service');
      const buffer = await PdfService.generateDebitNoteReceipt({
        noteId:       note.id,
        tenantName:   `${note.contract.tenant.firstName} ${note.contract.tenant.lastName}`,
        tenantPhone:  note.contract.tenant.phone,
        propertyName: note.contract.unit.property.name,
        unitNumber:   note.contract.unit.number,
        periodMonth:  note.periodMonth,
        periodYear:   note.periodYear,
        serviceType:  note.serviceType,
        description:  note.description,
        amount:       parseFloat(note.amount.toString()),
        currency:     note.currency as 'HNL' | 'USD',
        invoiceRef:   note.invoiceRef || undefined,
        invoiceDate:  note.invoiceDate || undefined,
        notes:        note.notes || undefined,
        issuedAt:     note.createdAt,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="nota-debito-${note.id.slice(-8)}.pdf"`);
      res.end(buffer);
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

      const { CallMeBotService } = await import('../../services/callmebot.service');
      const { toNumber }         = await import('../../utils/money');

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
        currency:     note.currency as 'HNL' | 'USD',
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
};
