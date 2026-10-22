import Joi from 'joi';

export const clinicOnboardingSchema = Joi.object().keys({
  clinic: Joi.object({
    clinicName: Joi.string().min(2).max(200).required(),
    practiceType: Joi.string().max(100).allow(null, ''),
  }).required(),

  admin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.pattern.base':
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
      }),
    firstName: Joi.string().min(2).max(100).required(),
    lastName: Joi.string().min(2).max(100).required(),
    phone: Joi.string().allow(null, ''),
  }).required(),

  locations: Joi.array()
    .items(
      Joi.object({
        addressLine1: Joi.string().required(),
        addressLine2: Joi.string().allow(null, ''),
        city: Joi.string().required(),
        state: Joi.string().length(2).required(),
        zipCode: Joi.string()
          .pattern(/^\d{5}(-\d{4})?$/)
          .required(),
        phone: Joi.string().required(),
      })
    )
    .min(1)
    .required(),
});

export const clinicOnboardingWithPaymentSchema = Joi.object().keys({
  clinic: Joi.object({
    clinicName: Joi.string().min(2).max(200).required(),
    practiceType: Joi.string().max(100).allow(null, ''),
  }).required(),

  admin: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .required()
      .messages({
        'string.pattern.base':
          'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
      }),
    firstName: Joi.string().min(2).max(100).required(),
    lastName: Joi.string().min(2).max(100).required(),
    phone: Joi.string().allow(null, ''),
  }).required(),

  locations: Joi.array()
    .items(
      Joi.object({
        addressLine1: Joi.string().required(),
        addressLine2: Joi.string().allow(null, ''),
        city: Joi.string().required(),
        state: Joi.string().length(2).required(),
        zipCode: Joi.string()
          .pattern(/^\d{5}(-\d{4})?$/)
          .required(),
        phone: Joi.string().required(),
      })
    )
    .min(1)
    .required(),

  payment: Joi.object({
    initialProviderCount: Joi.number().integer().min(1).default(1),
    selectedPlan: Joi.string()
      .valid('graduated', 'starter', 'professional', 'enterprise')
      .optional(),
  }).optional(),

  acceptance: Joi.object({
    legalEntityName: Joi.string().min(2).max(255).optional(),
    signerName: Joi.string().min(2).max(255).optional(),
    signerEmail: Joi.string().email().optional(),
    signerTitle: Joi.string().min(2).max(100).optional(),
    pricingTier: Joi.string()
      .valid('starter', 'professional', 'enterprise', 'graduated')
      .optional(),
    providerCount: Joi.number().integer().min(1).optional(),
    pricePerProvider: Joi.number().positive().optional(),
    totalSubscriptionPrice: Joi.number().positive().optional(),
    billingFrequency: Joi.string().valid('monthly', 'annual').optional(),
    termsAccepted: Joi.boolean().valid(true).optional(),
    termsVersion: Joi.string().max(50).optional(),
    agreementVersion: Joi.string().max(50).optional(),
  }).optional(),
});

export const listClinicsQuerySchema = Joi.object().keys({
  search: Joi.string().allow('', null),
  status: Joi.string()
    .valid('active', 'cancelled', 'past_due', 'pending_payment', 'suspended')
    .allow('', null),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  sortColumn: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
});

export const clinicIdParamSchema = Joi.object().keys({
  id: Joi.string().guid({ version: 'uuidv4' }).required(),
});

export const validateClinicNameQuerySchema = Joi.object().keys({
  clinicName: Joi.string().min(2).max(200).required(),
});

export const updateClinicProfileSchema = Joi.object().keys({
  clinicName: Joi.string().min(2).max(200).optional().example('Clinic Name'),
  practiceType: Joi.string().max(100).optional().allow(null, '').example('group practice'),
  admin: Joi.object({
    firstName: Joi.string().min(2).max(100).optional().example('string'),
    lastName: Joi.string().min(2).max(100).optional().example('string'),
    email: Joi.string().email().optional().example('string@example.com'),
    phone: Joi.string(),
  }).optional(),
  locations: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().guid({ version: 'uuidv4' }).optional(),
        addressLine1: Joi.string().required().example('123 Main Street'),
        addressLine2: Joi.string().allow(null, '').example('Suite 200'),
        city: Joi.string().required().example('Los Angeles'),
        state: Joi.string().length(2).required().example('CA'),
        zipCode: Joi.string()
          .pattern(/^\d{5}(-\d{4})?$/)
          .required()
          .example('90001'),
        phone: Joi.string().required().example('(555) 987-6543'),
        isPrimary: Joi.boolean().optional().example(true),
      })
    )
    .optional(),
});
