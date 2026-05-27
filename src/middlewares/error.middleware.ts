// src/middlewares/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('❌ Error:', err.message);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  if (err.message.includes('Unique constraint')) {
    res.status(409).json({
      success: false,
      message: 'Ya existe un registro con esos datos. Revisá los campos e intentá de nuevo.',
    });
    return;
  }

  res.status(500).json({
    success: false,
    message:
      env.NODE_ENV === 'development'
        ? err.message
        : 'Error interno del servidor. Intentá de nuevo más tarde.',
  });
}
