// src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { authController } from './auth.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();

router.post('/login',
  body('email').isEmail().withMessage('Ingresá un correo válido.'),
  body('password').notEmpty().withMessage('La contraseña es requerida.'),
  validate,
  authController.login
);

router.post('/register',
  authenticate,
  authorize('ADMIN'),
  body('email').isEmail().withMessage('Correo inválido.'),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  body('name').notEmpty().withMessage('El nombre es requerido.'),
  body('role').isIn(['ADMIN', 'OWNER', 'VIEWER']).withMessage('Rol inválido.'),
  validate,
  authController.register
);

router.get('/me', authenticate, authController.me);
router.put('/me', authenticate, authController.updateMe);
router.put('/change-password',
  authenticate,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres.'),
  validate,
  authController.changePassword
);

export default router;
