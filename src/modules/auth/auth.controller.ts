// src/modules/auth/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../middlewares/error.middleware';
import { successResponse } from '../../types';

export const authController = {
  /** POST /api/auth/login */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;

      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user || !user.isActive) {
        throw new AppError('Credenciales incorrectas.', 401);
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) throw new AppError('Credenciales incorrectas.', 401);

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const token = (jwt.sign as any)(
        { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      res.json(successResponse({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, baseCurrency: user.baseCurrency, companyId: user.companyId },
      }, 'Sesión iniciada correctamente.'));
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/register (solo ADMIN puede crear usuarios) */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name, phone, role, baseCurrency, companyId } = req.body;

      const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (exists) throw new AppError('Ya existe una cuenta con ese correo.', 409);

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash, name, phone, role, baseCurrency, companyId: companyId || null },
        select: { id: true, email: true, name: true, role: true, baseCurrency: true, companyId: true },
      });

      res.status(201).json(successResponse(user, 'Usuario creado correctamente.'));
    } catch (err) {
      next(err);
    }
  },

  /** GET /api/auth/me */
  async me(req: Request & { user?: { id: string } }, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, name: true, role: true, baseCurrency: true, printPreview: true, phone: true },
      });
      if (!user) throw new AppError('Usuario no encontrado.', 404);
      res.json(successResponse(user));
    } catch (err) {
      next(err);
    }
  },

  /** PUT /api/auth/me — actualizar perfil propio */
  async updateMe(req: Request & { user?: { id: string } }, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, phone, baseCurrency, printPreview } = req.body;
      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: { name, phone, baseCurrency, printPreview },
        select: { id: true, email: true, name: true, role: true, baseCurrency: true, printPreview: true },
      });
      res.json(successResponse(user, 'Perfil actualizado.'));
    } catch (err) {
      next(err);
    }
  },

  /** PUT /api/auth/change-password */
  async changePassword(req: Request & { user?: { id: string } }, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!user) throw new AppError('Usuario no encontrado.', 404);

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) throw new AppError('La contraseña actual es incorrecta.', 400);

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

      res.json(successResponse(null, 'Contraseña actualizada correctamente.'));
    } catch (err) {
      next(err);
    }
  },
  /** GET /api/auth/users — listar todos los usuarios (solo ADMIN) */
  async listUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true, email: true, name: true, phone: true,
          role: true, baseCurrency: true, isActive: true,
          companyId: true, lastLoginAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      res.json(successResponse(users));
    } catch (err) { next(err); }
  },

  /** PUT /api/auth/users/:id — actualizar cualquier usuario (solo ADMIN) */
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, phone, role, isActive, companyId } = req.body;
      const user = await prisma.user.update({
        where: { id: req.params.id },
        data: {
          ...(name !== undefined && { name }),
          ...(phone !== undefined && { phone }),
          ...(role !== undefined && { role }),
          ...(isActive !== undefined && { isActive }),
          ...(companyId !== undefined && { companyId: companyId || null }),
        },
        select: { id: true, email: true, name: true, role: true, isActive: true, companyId: true },
      });
      res.json(successResponse(user, 'Usuario actualizado correctamente.'));
    } catch (err) { next(err); }
  },
};
