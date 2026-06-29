// src/middlewares/auth.middleware.ts
import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedRequest, UserRole } from '../types';
import { AppError } from './error.middleware';

interface JwtPayload {
  id: string;
  email: string;
  role: UserRole;
  companyId: string | null;
}

export function authenticate(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No autorizado. Iniciá sesión para continuar.', 401));
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    next();
  } catch {
    next(new AppError('Token inválido o expirado. Iniciá sesión de nuevo.', 401));
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError('No tenés permisos para realizar esta acción.', 403));
    }
    next();
  };
}
