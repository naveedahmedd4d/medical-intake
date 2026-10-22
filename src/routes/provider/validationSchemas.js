import Joi from 'joi';

export const inviteProviderSchema = Joi.object().keys({
  email: Joi.string().email().required(),
  firstName: Joi.string().min(2).max(100).required(),
  lastName: Joi.string().min(2).max(100).required(),
});

export const acceptInvitationSchema = Joi.object().keys({
  token: Joi.string().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.pattern.base':
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
    }),
});

export const listProvidersQuerySchema = Joi.object().keys({
  search: Joi.string().allow('', null),
  status: Joi.string().valid('active', 'invited').allow('', null),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  sortColumn: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
});

export const updateProviderProfileSchema = Joi.object().keys({
  firstName: Joi.string().min(2).max(100).optional(),
  lastName: Joi.string().min(2).max(100).optional(),
  phone: Joi.string()
    .pattern(/^[\d\s\-+()]+$/)
    .min(10)
    .max(20)
    .optional()
    .allow(null, '')
    .messages({
      'string.pattern.base':
        'Phone number can only contain digits, spaces, hyphens, parentheses, and plus sign',
      'string.min': 'Phone number must be at least 10 characters',
      'string.max': 'Phone number must not exceed 20 characters',
    }),
  specialty: Joi.string().max(200).optional().allow(null, ''),
  licenseNumber: Joi.string().max(100).optional().allow(null, ''),
});

export const providersByClinicParamsSchema = Joi.object().keys({
  clinic_id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

export const resendInvitationSchema = Joi.object().keys({
  providerId: Joi.string().uuid().required(),
});

export const publicProviderInfoQuerySchema = Joi.object()
  .keys({
    clinicSlug: Joi.string().trim().optional().allow(null, ''),
    providerSlug: Joi.string().trim().optional().allow(null, ''),
  })
  .or('clinicSlug', 'providerSlug');

export const autoCreateProviderSchema = Joi.object().keys({
  clinicId: Joi.string().uuid().required(),
  firstName: Joi.string().min(2).max(100).required(),
  lastName: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
});

export const setActiveTemplateSchema = Joi.object().keys({
  templateId: Joi.string().uuid().required(),
});