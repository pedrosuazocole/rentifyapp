// src/modules/properties/properties.controller.ts
import { Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../middlewares/error.middleware';
import { AuthenticatedRequest, successResponse, paginatedResponse } from '../../types';

export const propertiesController = {
  /** GET /api/properties */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const where = req.user!.role === 'ADMIN'
        ? {}
        : { ownerId: req.user!.id };

      const [properties, total] = await Promise.all([
        prisma.property.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { units: true } },
            units: { select: { id: true, isOccupied: true } },
          },
        }),
        prisma.property.count({ where }),
      ]);

      res.json(paginatedResponse(properties, page, limit, total));
    } catch (err) { next(err); }
  },

  /** GET /api/properties/:id */
  async getOne(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const property = await prisma.property.findFirst({
        where: {
          id: req.params.id,
          ...(req.user!.role !== 'ADMIN' ? { ownerId: req.user!.id } : {}),
        },
        include: {
          units: {
            include: {
              contracts: {
                where: { status: 'ACTIVE' },
                include: { tenant: true },
              },
            },
          },
        },
      });

      if (!property) throw new AppError('Propiedad no encontrada.', 404);
      res.json(successResponse(property));
    } catch (err) { next(err); }
  },

  /** POST /api/properties */
  async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, address, city, department, description } = req.body;
      const property = await prisma.property.create({
        data: {
          name, address,
          city: city || 'Tegucigalpa',
          department: department || 'Francisco Morazán',
          description,
          ownerId: req.user!.id,
        },
      });
      res.status(201).json(successResponse(property, 'Propiedad creada correctamente.'));
    } catch (err) { next(err); }
  },

  /** PUT /api/properties/:id */
  async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await prisma.property.findFirst({
        where: { id: req.params.id, ...(req.user!.role !== 'ADMIN' ? { ownerId: req.user!.id } : {}) },
      });
      if (!existing) throw new AppError('Propiedad no encontrada.', 404);

      const { name, address, city, department, description, isActive } = req.body;
      const property = await prisma.property.update({
        where: { id: req.params.id },
        data: { name, address, city, department, description, isActive },
      });
      res.json(successResponse(property, 'Propiedad actualizada.'));
    } catch (err) { next(err); }
  },

  /** DELETE /api/properties/:id */
  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const existing = await prisma.property.findFirst({
        where: { id: req.params.id, ...(req.user!.role !== 'ADMIN' ? { ownerId: req.user!.id } : {}) },
        include: { units: { include: { contracts: { where: { status: 'ACTIVE' } } } } },
      });
      if (!existing) throw new AppError('Propiedad no encontrada.', 404);

      const activeContracts = existing.units.flatMap((u: { contracts: unknown[] }) => u.contracts);
      if (activeContracts.length > 0) {
        throw new AppError('No podés eliminar una propiedad con contratos activos.', 400);
      }

      await prisma.property.update({ where: { id: req.params.id }, data: { isActive: false } });
      res.json(successResponse(null, 'Propiedad desactivada correctamente.'));
    } catch (err) { next(err); }
  },

  // ── Unidades ──────────────────────────────────────────────────

  /** POST /api/properties/:id/units */
  async createUnit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const property = await prisma.property.findFirst({
        where: { id: req.params.id, ...(req.user!.role !== 'ADMIN' ? { ownerId: req.user!.id } : {}) },
      });
      if (!property) throw new AppError('Propiedad no encontrada.', 404);

      const { number, floor, bedrooms, bathrooms, squareMeters, description } = req.body;
      const unit = await prisma.unit.create({
        data: { propertyId: req.params.id, number, floor, bedrooms, bathrooms, squareMeters, description },
      });
      res.status(201).json(successResponse(unit, 'Unidad creada correctamente.'));
    } catch (err) { next(err); }
  },

  /** PUT /api/properties/:id/units/:unitId */
  async updateUnit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const unit = await prisma.unit.findFirst({
        where: { id: req.params.unitId, propertyId: req.params.id },
      });
      if (!unit) throw new AppError('Unidad no encontrada.', 404);

      const { number, floor, bedrooms, bathrooms, squareMeters, description } = req.body;
      const updated = await prisma.unit.update({
        where: { id: req.params.unitId },
        data: { number, floor, bedrooms, bathrooms, squareMeters, description },
      });
      res.json(successResponse(updated, 'Unidad actualizada.'));
    } catch (err) { next(err); }
  },
};
