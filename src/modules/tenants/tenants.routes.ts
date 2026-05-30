// src/modules/tenants/tenants.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { tenantsController } from './tenants.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);

router.get('/', tenantsController.list);
router.get('/:id', tenantsController.getOne);
router.get('/:id/payments', tenantsController.paymentHistory);

router.post('/',
  body('firstName').notEmpty().withMessage('El nombre es requerido.'),
  body('lastName').notEmpty().withMessage('El apellido es requerido.'),
  body('phone').notEmpty().withMessage('El teléfono es requerido.')
    .matches(/^\+504\d{8}$/).withMessage('El teléfono debe estar en formato +504XXXXXXXX.'),
  validate,
  tenantsController.create
);

router.put('/:id', tenantsController.update);

export default router;
