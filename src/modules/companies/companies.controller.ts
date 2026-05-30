// src/modules/companies/companies.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse, paginatedResponse } from '../../types';

export const companiesController = {
  /** GET /api/companies */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page  = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip  = (page - 1) * limit;

      const [companies, total] = await Promise.all([
        prisma.company.findMany({
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { users: true, properties: true } },
          },
        }),
        prisma.company.count(),
      ]);

      res.json(paginatedResponse(companies, page, limit, total));
    } catch (err) { next(err); }
  },

  /** GET /api/companies/:id */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: req.params.id },
        include: {
          users: {
            select: { id: true, name: true, email: true, role: true, isActive: true },
          },
          properties: {
            select: { id: true, name: true, city: true, isActive: true,
              _count: { select: { units: true } } },
          },
        },
      });
      if (!company) throw new AppError('Empresa no encontrada.', 404);
      res.json(successResponse(company));
    } catch (err) { next(err); }
  },

  /** POST /api/companies */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, rtn, email, phone, address, city, department, notes } = req.body;
      const company = await prisma.company.create({
        data: { name, rtn, email, phone, address, city, department, notes },
      });
      res.status(201).json(successResponse(company, 'Empresa creada correctamente.'));
    } catch (err) { next(err); }
  },

  /** PUT /api/companies/:id */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const exists = await prisma.company.findUnique({ where: { id: req.params.id } });
      if (!exists) throw new AppError('Empresa no encontrada.', 404);

      const { name, rtn, email, phone, address, city, department, notes, isActive } = req.body;
      const company = await prisma.company.update({
        where: { id: req.params.id },
        data: { name, rtn, email, phone, address, city, department, notes, isActive },
      });
      res.json(successResponse(company, 'Empresa actualizada.'));
    } catch (err) { next(err); }
  },

  /** DELETE /api/companies/:id — desactivar */
  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const company = await prisma.company.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { users: true, properties: true } } },
      });
      if (!company) throw new AppError('Empresa no encontrada.', 404);

      const total = company._count.users + company._count.properties;
      if (total > 0) {
        throw new AppError(
          `No podés eliminar una empresa con ${company._count.users} usuario(s) y ${company._count.properties} propiedad(es) asignados.`,
          400
        );
      }

      await prisma.company.update({ where: { id: req.params.id }, data: { isActive: false } });
      res.json(successResponse(null, 'Empresa desactivada correctamente.'));
    } catch (err) { next(err); }
  },

  /** PUT /api/companies/:id/assign-user — asignar usuario a empresa */
  async assignUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.body;
      const company = await prisma.company.findUnique({ where: { id: req.params.id } });
      if (!company) throw new AppError('Empresa no encontrada.', 404);

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('Usuario no encontrado.', 404);

      await prisma.user.update({ where: { id: userId }, data: { companyId: req.params.id } });
      res.json(successResponse(null, `Usuario asignado a ${company.name}.`));
    } catch (err) { next(err); }
  },
};
