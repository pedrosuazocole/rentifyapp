// src/middlewares/validate.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

export function validate(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Datos inválidos. Revisá los campos marcados.',
      errors: errors.array().map((e) => e.msg),
    });
    return;
  }
  next();
}
