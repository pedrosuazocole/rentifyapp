// src/modules/tenants/tenants.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse, paginatedResponse } from '../../types';

export const tenantsController = {
  /** GET /api/tenants */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const skip = (page - 1) * limit;

      const where = search ? {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' as const } },
          { lastName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
          { nationalId: { contains: search } },
        ],
      } : {};

      const [tenants, total] = await Promise.all([
        prisma.tenant.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            contracts: {
              where: { status: 'ACTIVE' },
              include: { unit: { include: { property: true } } },
            },
          },
        }),
        prisma.tenant.count({ where }),
      ]);

      res.json(paginatedResponse(tenants, page, limit, total));
    } catch (err) { next(err); }
  },

  /** GET /api/tenants/:id */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.params.id },
        include: {
          contracts: {
            include: {
              unit: { include: { property: true } },
              payments: { orderBy: { dueDate: 'desc' }, take: 6 },
            },
            orderBy: { startDate: 'desc' },
          },
        },
      });
      if (!tenant) throw new AppError('Inquilino no encontrado.', 404);
      res.json(successResponse(tenant));
    } catch (err) { next(err); }
  },

  /** POST /api/tenants */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { firstName, lastName, email, phone, nationalId, altAddress, notes } = req.body;
      const tenant = await prisma.tenant.create({
        data: { firstName, lastName, email, phone, nationalId, altAddress, notes },
      });
      res.status(201).json(successResponse(tenant, 'Inquilino registrado correctamente.'));
    } catch (err) { next(err); }
  },

  /** PUT /api/tenants/:id */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const exists = await prisma.tenant.findUnique({ where: { id: req.params.id } });
      if (!exists) throw new AppError('Inquilino no encontrado.', 404);

      const { firstName, lastName, email, phone, nationalId, altAddress, notes, isActive } = req.body;
      const tenant = await prisma.tenant.update({
        where: { id: req.params.id },
        data: { firstName, lastName, email, phone, nationalId, altAddress, notes, isActive },
      });
      res.json(successResponse(tenant, 'Inquilino actualizado.'));
    } catch (err) { next(err); }
  },

  /** GET /api/tenants/:id/payments — historial de pagos del inquilino */
  async paymentHistory(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
      if (!tenant) throw new AppError('Inquilino no encontrado.', 404);

      const payments = await prisma.payment.findMany({
        where: { contract: { tenantId: req.params.id } },
        include: {
          contract: { include: { unit: { include: { property: true } } } },
        },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      });

      res.json(successResponse(payments));
    } catch (err) { next(err); }
  },
};
