import Joi from 'joi';

/**
 * Validation schema for subscription acceptance submission
 * All fields are required for legal enforceability
 */
export const createSubscriptionAcceptanceSchema = Joi.object()
  .keys({
    // Customer Information (Required)
    legalEntityName: Joi.string().min(2).max(255).required().messages({
      'string.empty': 'Legal entity/practice name is required',
      'any.required': 'Legal entity/practice name is required',
      'string.min': 'Legal entity name must be at least 2 characters',
      'string.max': 'Legal entity name must not exceed 255 characters',
    }),
    signerName: Joi.string().min(2).max(255).required().messages({
      'string.empty': 'Signer name is required',
      'any.required': 'Signer name is required',
      'string.min': 'Signer name must be at least 2 characters',
      'string.max': 'Signer name must not exceed 255 characters',
    }),
    signerEmail: Joi.string().email().required().messages({
      'string.empty': 'Signer email is required',
      'any.required': 'Signer email is required',
      'string.email': 'Must be a valid email address',
    }),
    signerTitle: Joi.string().min(2).max(100).required().messages({
      'string.empty': 'Signer title is required',
      'any.required': 'Signer title is required',
      'string.min': 'Signer title must be at least 2 characters',
      'string.max': 'Signer title must not exceed 100 characters',
    }),

    // Pricing Information
    pricingTier: Joi.string()
      .valid('starter', 'professional', 'enterprise', 'graduated')
      .required()
      .messages({
        'string.empty': 'Pricing tier is required',
        'any.required': 'Pricing tier is required',
        'any.only': 'Pricing tier must be starter, professional, enterprise, or graduated',
      }),
    providerCount: Joi.number().integer().min(1).required().messages({
      'number.base': 'Provider count must be a number',
      'number.integer': 'Provider count must be an integer',
      'number.min': 'Provider count must be at least 1',
      'any.required': 'Provider count is required',
    }),
    pricePerProvider: Joi.number().positive().required().messages({
      'number.base': 'Price per provider must be a number',
      'number.positive': 'Price per provider must be positive',
      'any.required': 'Price per provider is required',
    }),
    totalSubscriptionPrice: Joi.number().positive().required().messages({
      'number.base': 'Total subscription price must be a number',
      'number.positive': 'Total subscription price must be positive',
      'any.required': 'Total subscription price is required',
    }),
    billingFrequency: Joi.string().valid('monthly', 'annual').required().messages({
      'string.empty': 'Billing frequency is required',
      'any.required': 'Billing frequency is required',
      'any.only': 'Billing frequency must be monthly or annual',
    }),

    // Subscription Terms
    subscriptionStartDate: Joi.date().iso().required().messages({
      'date.base': 'Subscription start date must be a valid date',
      'date.format': 'Subscription start date must be in ISO format',
      'any.required': 'Subscription start date is required',
    }),

    // Explicit Consent (MANDATORY)
    termsAccepted: Joi.boolean().valid(true).required().messages({
      'any.only': 'You must accept the Terms of Service and Subscription Agreement',
      'any.required': 'Terms acceptance is required',
      'boolean.base': 'Terms acceptance must be a boolean',
    }),

    // Optional Fields (will be populated server-side if not provided)
    clinicId: Joi.string().uuid().optional(),
    subscriptionId: Joi.string().uuid().optional(),
    userId: Joi.string().uuid().optional(),
    termsVersion: Joi.string().max(50).optional(),
    agreementVersion: Joi.string().max(50).optional(),
    stripeCheckoutSessionId: Joi.string().max(255).optional(),
    stripeCustomerId: Joi.string().max(255).optional(),
  })
  .required();

/**
 * Query schema for retrieving acceptance records
 */
export const getSubscriptionAcceptancesQuerySchema = Joi.object().keys({
  clinicId: Joi.string().uuid().optional(),
  subscriptionId: Joi.string().uuid().optional(),
  signerEmail: Joi.string().email().optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  sortColumn: Joi.string().default('acceptanceTimestamp'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
});

/**
 * Param schema for getting single acceptance record
 */
export const getSubscriptionAcceptanceParamsSchema = Joi.object().keys({
  id: Joi.string().uuid().required(),
});
