import Joi from 'joi';

export const listPatientSummariesQuerySchema = Joi.object().keys({
  search: Joi.string().allow('', null),
  dateOfBirth: Joi.date().iso().allow('', null),
  appointmentDate: Joi.date().iso().allow('', null),
  isArchived: Joi.boolean().default(false),
  providerId: Joi.string().uuid().allow('', null),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(10),
  sortColumn: Joi.string().default('generatedAt'),
  sortOrder: Joi.string().valid('ASC', 'DESC').default('DESC'),
});

export const updatePatientSummaryParamSchema = Joi.object().keys({
  id: Joi.string().uuid().required(),
});

export const updatePatientSummaryBodySchema = Joi.object().keys({
  isArchived: Joi.boolean().required(),
});
