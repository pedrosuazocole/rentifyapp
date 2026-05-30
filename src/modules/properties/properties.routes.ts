// src/modules/properties/properties.routes.ts
import { Router } from 'express';
import { body } from 'express-validator';
import { propertiesController } from './properties.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';

const router = Router();
router.use(authenticate);

router.get('/', propertiesController.list);
router.get('/:id', propertiesController.getOne);

router.post('/',
  body('name').notEmpty().withMessage('El nombre de la propiedad es requerido.'),
  body('address').notEmpty().withMessage('La dirección es requerida.'),
  validate,
  propertiesController.create
);

router.put('/:id', propertiesController.update);
router.delete('/:id', propertiesController.remove);

// Unidades
router.post('/:id/units',
  body('number').notEmpty().withMessage('El número de unidad es requerido.'),
  validate,
  propertiesController.createUnit
);
router.put('/:id/units/:unitId', propertiesController.updateUnit);

export default router;
