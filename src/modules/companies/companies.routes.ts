// src/modules/companies/companies.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { companiesController } from './companies.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN')); // Solo ADMIN gestiona empresas

router.get('/',    companiesController.list);
router.get('/:id', companiesController.getOne);

router.post('/',
  body('name').notEmpty().withMessage('El nombre de la empresa es requerido.'),
  validate,
  companiesController.create
);

router.put('/:id',  companiesController.update);
router.delete('/:id', companiesController.remove);

router.put('/:id/assign-user',
  body('userId').notEmpty().withMessage('El ID del usuario es requerido.'),
  validate,
  companiesController.assignUser
);

export default router;
