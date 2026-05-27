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

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      res.json(successResponse({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, baseCurrency: user.baseCurrency },
      }, 'Sesión iniciada correctamente.'));
    } catch (err) {
      next(err);
    }
  },

  /** POST /api/auth/register (solo ADMIN puede crear usuarios) */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, name, phone, role, baseCurrency } = req.body;

      const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (exists) throw new AppError('Ya existe una cuenta con ese correo.', 409);

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: { email: email.toLowerCase(), passwordHash, name, phone, role, baseCurrency },
        select: { id: true, email: true, name: true, role: true, baseCurrency: true },
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
};
