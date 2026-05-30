// src/modules/contracts/contracts.controller.ts
import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse, paginatedResponse } from '../../types';

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export const contractsController = {
  /** GET /api/contracts */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;
      const status = req.query.status as string;

      const where: Record<string, unknown> = {};
      if (status) where.status = status;

      // Si no es ADMIN, filtrar solo contratos de sus propiedades
      if (req.user!.role !== 'ADMIN') {
        where.unit = { property: { ownerId: req.user!.id } };
      }

      const [contracts, total] = await Promise.all([
        prisma.contract.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            tenant: true,
            unit: { include: { property: true } },
            _count: { select: { payments: true } },
          },
        }),
        prisma.contract.count({ where }),
      ]);

      res.json(paginatedResponse(contracts, page, limit, total));
    } catch (err) { next(err); }
  },

  /** GET /api/contracts/:id */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const contract = await prisma.contract.findUnique({
        where: { id: req.params.id },
        include: {
          tenant: true,
          unit: { include: { property: true } },
          payments: { orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] },
        },
      });
      if (!contract) throw new AppError('Contrato no encontrado.', 404);
      res.json(successResponse(contract));
    } catch (err) { next(err); }
  },

  /** POST /api/contracts — OPERACIÓN ATÓMICA */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        unitId, tenantId, startDate, endDate, paymentDayOfMonth,
        monthlyRent, currency, depositAmount, depositCurrency,
        lateFeePercent, gracePeriodDays, notes,
      } = req.body;

      // Validar que la unidad esté disponible
      const unit = await prisma.unit.findUnique({
        where: { id: unitId },
        include: { contracts: { where: { status: 'ACTIVE' } } },
      });
      if (!unit) throw new AppError('Unidad no encontrada.', 404);
      if (unit.isOccupied || unit.contracts.length > 0) {
        throw new AppError('La unidad ya tiene un contrato activo.', 400);
      }

      // Validar que el inquilino no tenga otro contrato activo en la misma propiedad
      const tenantActive = await prisma.contract.findFirst({
        where: { tenantId, status: 'ACTIVE', unitId },
      });
      if (tenantActive) {
        throw new AppError('El inquilino ya tiene un contrato activo en esa unidad.', 400);
      }

      // OPERACIÓN ATÓMICA: crear contrato + marcar unidad como ocupada
      const contract = await prisma.$transaction(async (tx: PrismaTx) => {
        const c = await tx.contract.create({
          data: {
            unitId, tenantId,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            paymentDayOfMonth,
            monthlyRent,
            currency,
            depositAmount,
            depositCurrency,
            lateFeePercent: lateFeePercent || 5,
            gracePeriodDays: gracePeriodDays || 5,
            notes,
          },
          include: { tenant: true, unit: { include: { property: true } } },
        });

        await tx.unit.update({ where: { id: unitId }, data: { isOccupied: true } });
        return c;
      });

      res.status(201).json(successResponse(contract, 'Contrato creado correctamente.'));
    } catch (err) { next(err); }
  },

  /** POST /api/contracts/:id/terminate */
  async terminate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { reason } = req.body;
      const contract = await prisma.contract.findUnique({
        where: { id: req.params.id },
        include: { unit: true },
      });
      if (!contract) throw new AppError('Contrato no encontrado.', 404);
      if (contract.status !== 'ACTIVE') {
        throw new AppError('Solo se pueden rescindir contratos activos.', 400);
      }

      await prisma.$transaction(async (tx: PrismaTx) => {
        await tx.contract.update({
          where: { id: contract.id },
          data: { status: 'TERMINATED', terminatedAt: new Date(), terminationReason: reason },
        });
        await tx.unit.update({ where: { id: contract.unitId }, data: { isOccupied: false } });
      });

      res.json(successResponse(null, 'Contrato rescindido correctamente.'));
    } catch (err) { next(err); }
  },

  /** GET /api/contracts/expiring — contratos por vencer en N días */
  async expiring(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      const contracts = await prisma.contract.findMany({
        where: {
          status: 'ACTIVE',
          endDate: { lte: futureDate, gte: new Date() },
        },
        include: {
          tenant: true,
          unit: { include: { property: true } },
        },
        orderBy: { endDate: 'asc' },
      });

      res.json(successResponse(contracts));
    } catch (err) { next(err); }
  },
};
