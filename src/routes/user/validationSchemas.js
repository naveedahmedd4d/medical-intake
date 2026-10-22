import Joi from 'joi';

export const userLoginSchema = Joi.object().keys({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

export const validateEmailQuerySchema = Joi.object().keys({
  email: Joi.string().email().required(),
});

export const listUsersQuerySchema = Joi.object()
  .keys({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().allow('', null),
    status: Joi.string().allow('', null),
    role: Joi.string().allow('', null),
  })
  .unknown(true);

export const userIdParamSchema = Joi.object().keys({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

export const updateUserSchema = Joi.object()
  .keys({
    firstName: Joi.string().min(1).max(100).optional(),
    lastName: Joi.string().min(1).max(100).optional(),
    email: Joi.string().email().optional(),
    role: Joi.string().valid('super_admin', 'clinic_admin', 'provider').optional(),
    clinicId: Joi.string().guid({ version: 'uuidv4' }).allow(null).optional(),
    phone: Joi.string().allow('', null).optional(),
  })
  .min(1)
  .unknown(false);
