import Joi from "joi";
import { QUESTION_TYPES } from "../../utils/constants";

export const createTemplateSchema = Joi.object().keys({
  name: Joi.string().min(2).max(200).required().example("Custom Template"),
  description: Joi.string()
    .max(500)
    .optional()
    .allow(null, "")
    .example("Template description"),
});

export const addQuestionsToTemplateSchema = Joi.object().keys({
  templateName: Joi.string().min(2).max(200).optional(),
  description: Joi.string().max(500).optional().allow(null, ""),
  questions: Joi.array()
    .items(
      Joi.object().keys({
        questionIdentifier: Joi.string()
          .min(2)
          .max(100)
          .pattern(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
          .required()
          .example("pain-location")
          .messages({
            "string.pattern.base":
              "Question ID must be lowercase letters, numbers, hyphens (-), or underscores (_) only. No spaces or special characters.",
            "string.min": "Question ID must be at least 2 characters",
            "string.max": "Question ID must be less than 100 characters",
          }),
        questionText: Joi.string()
          .required()
          .example("Where is your pain located?"),
        questionType: Joi.string()
          .valid(
            QUESTION_TYPES.YES_NO,
            QUESTION_TYPES.SELECT,
            QUESTION_TYPES.MULTI_SELECT,
            QUESTION_TYPES.TEXT,
            QUESTION_TYPES.SYSTEM_COMPONENT,
          )
          .required(),
        category: Joi.string()
          .valid(
            "medical_history",
            "pain",
            "medications",
            "procedures",
            "treatments",
            "diagnostics",
            "goals",
          )
          .required(),
        position: Joi.number().integer().min(1).required(),
        parentQuestionIdentifier: Joi.string().optional().allow(null, ""),
        showCondition: Joi.any().optional(),
        options: Joi.any().optional(),
        systemComponent: Joi.string().optional().allow(null, ""),
      }),
    )
    .optional(),
});

export const updateTemplateQuestionSchema = Joi.object().keys({
  questionIdentifier: Joi.string()
    .min(2)
    .max(100)
    .pattern(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
    .optional()
    .example("pain-location")
    .messages({
      "string.pattern.base":
        "Question ID must be lowercase letters, numbers, hyphens (-), or underscores (_) only. No spaces or special characters.",
      "string.min": "Question ID must be at least 2 characters",
      "string.max": "Question ID must be less than 100 characters",
    }),
  questionText: Joi.string().optional().example("Where is your pain located?"),
  questionType: Joi.string()
    .valid(
      QUESTION_TYPES.YES_NO,
      QUESTION_TYPES.SELECT,
      QUESTION_TYPES.MULTI_SELECT,
      QUESTION_TYPES.TEXT,
      QUESTION_TYPES.SYSTEM_COMPONENT,
    )
    .optional(),
  category: Joi.string()
    .valid(
      "medical_history",
      "pain",
      "medications",
      "procedures",
      "treatments",
      "diagnostics",
      "goals",
    )
    .optional(),
  position: Joi.number().integer().min(1).optional(),
  parentQuestionIdentifier: Joi.string().optional().allow(null, ""),
  showCondition: Joi.any().optional(),
  options: Joi.any().optional(),
});

export const setDefaultTemplateSchema = Joi.object().keys({
  isDefault: Joi.boolean().required().example(true),
});

export const setTemplateVisibleSchema = Joi.object().keys({
  active: Joi.boolean().required(),
});

export const reorderTemplateQuestionsSchema = Joi.object().keys({
  questionIds: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .min(1)
    .required(),
});

export const restoreTemplateVersionSchema = Joi.object().keys({
  versionId: Joi.string().guid({ version: "uuidv4" }).required(),
});
