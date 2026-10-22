import Joi from 'joi';

export const submitIntakeSchema = Joi.object({
  templateId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid templateId format',
    'any.required': 'templateId is required',
  }),
  // providerId is optional and can be null, empty, or any string value
  providerId: Joi.string().allow('', null).optional(),
  firstName: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'First name is required',
    'string.min': 'First name must be at least 1 character',
    'string.max': 'First name cannot exceed 100 characters',
    'any.required': 'First name is required',
  }),
  lastName: Joi.string().min(1).max(100).required().messages({
    'string.empty': 'Last name is required',
    'string.min': 'Last name must be at least 1 character',
    'string.max': 'Last name cannot exceed 100 characters',
    'any.required': 'Last name is required',
  }),
  dateOfBirth: Joi.date().iso().max('now').required().messages({
    'date.base': 'Invalid date of birth format',
    'date.max': 'Date of birth cannot be in the future',
    'any.required': 'Date of birth is required',
  }),
  phoneNumber: Joi.string()
    .pattern(/^[+]?[\d\s()-]{10,20}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid phone number format',
      'any.required': 'Phone number is required',
    }),
  appointmentDate: Joi.date().iso().required().messages({
    'date.base': 'Invalid appointment date format',
    'any.required': 'Appointment date is required',
  }),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').required().messages({
    'any.only': 'Gender must be one of: male, female, other, prefer_not_to_say',
    'any.required': 'Gender is required',
  }),
  responses: Joi.array()
    .items(
      Joi.object({
        templateQuestionId: Joi.string().uuid().required().messages({
          'string.guid': 'Invalid templateQuestionId format',
          'any.required': 'templateQuestionId is required',
        }),
        responseData: Joi.alternatives()
          .try(Joi.object(), Joi.array(), Joi.string(), Joi.boolean(), Joi.number())
          .required()
          .messages({
            'any.required': 'responseData is required',
          }),
      })
    )
    .min(1)
    .required()
    .messages({
      'array.min': 'At least one response is required',
      'any.required': 'Responses array is required',
    }),
});

export const getTemplateQuestionsSchema = Joi.object({
  templateId: Joi.string().uuid().required().messages({
    'string.guid': 'Invalid templateId format',
    'any.required': 'templateId is required',
  }),
  providerId: Joi.string().uuid().optional().allow(null, '').messages({
    'string.guid': 'Invalid providerId format',
  }),
});
