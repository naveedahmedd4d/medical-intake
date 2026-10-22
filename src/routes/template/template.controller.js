import express from "express";
import models from "../../models";
import {
  STATUS_CODES,
  AUDIT_ACTIONS,
  AUDIT_RESOURCE_TYPES,
} from "../../utils/constants";
import { BadRequestError, SuccessResponse } from "../../utils/helper";
import {
  createTemplateSchema,
  addQuestionsToTemplateSchema,
  updateTemplateQuestionSchema,
  setDefaultTemplateSchema,
  setTemplateVisibleSchema,
  reorderTemplateQuestionsSchema,
  restoreTemplateVersionSchema,
} from "./validationSchemas";
import {
  Request,
  AuditLog,
  SwaggerDoc,
  RequestBodyValidator,
} from "../../utils/decorators";

const {
  Template,
  Clinic,
  TemplateQuestion,
  TemplateVersion,
  Provider,
  IntakeResponse,
} = models;

class TemplateController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.get("/", this.listTemplates);
    this.router.put("/:id/questions/reorder", this.reorderTemplateQuestions);
    this.router.get("/:id/visible", this.getTemplateVisible);
    this.router.put("/:id/visible", this.setTemplateVisible);
    this.router.get("/:id/versions", this.listTemplateVersions);
    this.router.post("/:id/versions", this.saveTemplateVersion);
    this.router.post("/:id/restore", this.restoreTemplateVersion);
    this.router.put("/:id/questions/reorder", this.reorderTemplateQuestions);
    this.router.post("/:id/duplicate", this.duplicateTemplate);
    this.router.get("/:id", this.getTemplate);
    this.router.post("/", this.createTemplate);
    this.router.post("/:id/questions", this.addQuestionsToTemplate);
    this.router.put("/:id/default", this.setDefaultTemplate);
    this.router.get("/:id/active", this.getTemplateActive);
    this.router.put("/:id/active", this.setTemplateActive);
    this.router.delete("/:id", this.deleteTemplate);
    return this.router;
  }

  static getQuestionsRouter() {
    const router = express.Router();
    router.put("/:questionId", this.editTemplateQuestion);
    router.delete("/:questionId", this.deleteTemplateQuestion);
    return router;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Reorder questions within a template by updating their position field.",
    params: {
      id: {
        type: "string",
        description: "Template ID",
      },
    },
  })
  @RequestBodyValidator(reorderTemplateQuestionsSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.UPDATE_TEMPLATE,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.id,
    getChanges: (req) => ({
      templateId: req.params.id,
      questionCount: req.body.questionIds?.length || 0,
      changeType: "reorder_questions",
    }),
  })
  @Request
  static async reorderTemplateQuestions(req, res) {
    const { id } = req.params;
    const { questionIds } = req.body;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    const template = await Template.findOne({ where: whereClause });
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    const questions = await TemplateQuestion.findAll({
      where: { templateId: id },
      attributes: ["id"],
    });
    const validQuestionIds = new Set(questions.map((q) => q.id));

    const invalidId = questionIds.find((qid) => !validQuestionIds.has(qid));
    if (invalidId) {
      return BadRequestError(
        `Question ID "${invalidId}" does not belong to this template`,
        STATUS_CODES.BADREQUEST,
      );
    }

    await Promise.all(
      questionIds.map((questionId, index) =>
        TemplateQuestion.update(
          { position: index + 1 },
          {
            where: { id: questionId, templateId: id },
          },
        ),
      ),
    );

    const updatedQuestions = await TemplateQuestion.findAll({
      where: { templateId: id },
      order: [["position", "ASC"]],
    });

    const result = {
      id: template.id,
      name: template.name,
      clinicId: template.clinicId,
      description: template.description,
      isDefault: template.isDefault,
      isActive: template.isActive,
      questionCount: updatedQuestions.length,
      questions: updatedQuestions,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description: "Get list of all templates for the authenticated user clinic.",
  })
  @Request
  static async listTemplates(req, res) {
    const whereClause = {};
    if (req.auth.clinicId) {
      const { Op } = models.Sequelize;
      whereClause[Op.or] = [
        { clinicId: req.auth.clinicId },
        { clinicId: null },
      ];
    }

    const templates = await Template.findAll({
      where: whereClause,
      attributes: [
        "id",
        "name",
        "clinicId",
        "description",
        "isDefault",
        "isActive",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: TemplateQuestion,
          as: "questions",
          attributes: [
            "id",
            "questionIdentifier",
            "questionText",
            "questionType",
            "category",
            "position",
            "parentQuestionId",
            "showCondition",
            "options",
            "systemComponent",
          ],
          required: false,
        },
      ],
      order: [
        ["createdAt", "DESC"],
        [{ model: TemplateQuestion, as: "questions" }, "position", "ASC"],
      ],
    });

    const result = {
      totalRecords: templates.length,
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        clinicId: t.clinicId,
        description: t.description,
        isDefault: t.isDefault,
        isActive: t.isActive,
        questionCount: t.questions?.length || 0,
        questions: t.questions || [],
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description: "Get a single template by ID with all its questions.",
    params: {
      id: {
        type: "string",
        description: "Template ID",
      },
    },
  })
  @Request
  static async getTemplate(req, res) {
    const { id } = req.params;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      const { Op } = models.Sequelize;
      whereClause[Op.or] = [{ clinicId }, { clinicId: null }];
    }

    const template = await Template.findOne({
      where: whereClause,
      attributes: [
        "id",
        "name",
        "clinicId",
        "description",
        "isDefault",
        "isActive",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: TemplateQuestion,
          as: "questions",
          attributes: [
            "id",
            "questionIdentifier",
            "questionText",
            "questionType",
            "category",
            "position",
            "parentQuestionId",
            "showCondition",
            "options",
            "systemComponent",
          ],
          required: false,
        },
      ],
      order: [
        [{ model: TemplateQuestion, as: "questions" }, "position", "ASC"],
      ],
    });

    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    const questionsWithParentIdentifier = (template.questions || []).map(
      (question) => {
        const questionData = question.toJSON();

        if (questionData.parentQuestionId) {
          const parentQuestion = template.questions.find(
            (q) => q.id === questionData.parentQuestionId,
          );
          if (parentQuestion) {
            questionData.parentQuestionIdentifier =
              parentQuestion.questionIdentifier;
          }
        }

        return questionData;
      },
    );

    const result = {
      id: template.id,
      name: template.name,
      clinicId: template.clinicId,
      description: template.description,
      isDefault: template.isDefault,
      isActive: template.isActive,
      questionCount: template.questions?.length || 0,
      questions: questionsWithParentIdentifier,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  /**
   * Build snapshot object from template with questions (for versioning).
   * @param {Object} template - Template model instance with questions loaded (ordered by position)
   * @returns {{ name: string, description: string|null, questions: Array }}
   */
  static buildTemplateSnapshot(template) {
    const questions = (template.questions || []).map((q) => {
      const parentQuestion = template.questions.find(
        (pq) => pq.id === q.parentQuestionId,
      );
      return {
        questionIdentifier: q.questionIdentifier,
        questionText: q.questionText,
        questionType: q.questionType,
        category: q.category,
        position: q.position,
        parentQuestionIdentifier: parentQuestion
          ? parentQuestion.questionIdentifier
          : null,
        showCondition: q.showCondition,
        options: q.options,
        systemComponent: q.systemComponent ?? null,
      };
    });
    return {
      name: template.name,
      description: template.description ?? null,
      questions,
    };
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description: "List all versions for a template.",
    params: { id: { type: "string", description: "Template ID" } },
  })
  @Request
  static async listTemplateVersions(req, res) {
    const { id } = req.params;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      const { Op } = models.Sequelize;
      whereClause[Op.or] = [{ clinicId }, { clinicId: null }];
    }

    const template = await Template.findOne({
      where: whereClause,
      attributes: ["id"],
    });
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    const versions = await TemplateVersion.findAll({
      where: { templateId: id },
      attributes: [
        "id",
        "templateId",
        "versionNumber",
        "snapshot",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    const result = {
      versions: versions.map((v) => ({
        id: v.id,
        templateId: v.templateId,
        versionNumber: v.versionNumber,
        snapshot: v.snapshot,
        createdAt: v.createdAt,
      })),
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Save current template state as a new version (Save as version).",
    params: { id: { type: "string", description: "Template ID" } },
  })
  @Request
  static async saveTemplateVersion(req, res) {
    const { id } = req.params;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    const template = await Template.findOne({
      where: whereClause,
      attributes: ["id", "name", "description"],
      include: [
        {
          model: TemplateQuestion,
          as: "questions",
          attributes: [
            "id",
            "questionIdentifier",
            "questionText",
            "questionType",
            "category",
            "position",
            "parentQuestionId",
            "showCondition",
            "options",
            "systemComponent",
          ],
          required: false,
        },
      ],
      order: [
        [{ model: TemplateQuestion, as: "questions" }, "position", "ASC"],
      ],
    });

    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    const snapshot = TemplateController.buildTemplateSnapshot(template);

    const maxVersion = await TemplateVersion.max("versionNumber", {
      where: { templateId: id },
    });
    const versionNumber = (maxVersion ?? 0) + 1;

    const version = await TemplateVersion.create({
      templateId: id,
      versionNumber,
      snapshot,
    });

    const result = {
      id: version.id,
      templateId: version.templateId,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Reorder template questions by providing the new order of question IDs.",
    params: { id: { type: "string", description: "Template ID" } },
  })
  @RequestBodyValidator(reorderTemplateQuestionsSchema)
  @Request
  static async reorderTemplateQuestions(req, res) {
    const { id } = req.params;
    const { questionIds } = req.body;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    const template = await Template.findOne({
      where: whereClause,
      include: [
        { model: TemplateQuestion, as: "questions", attributes: ["id"] },
      ],
    });

    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    const templateQuestionIds = new Set(
      (template.questions || []).map((q) => q.id),
    );
    const validIds = questionIds.filter((qid) => templateQuestionIds.has(qid));
    if (
      validIds.length !== questionIds.length ||
      validIds.length !== templateQuestionIds.size
    ) {
      return BadRequestError(
        "questionIds must contain exactly the IDs of all questions belonging to this template, in the new order.",
        STATUS_CODES.BAD_REQUEST,
      );
    }

    await Promise.all(
      validIds.map((questionId, index) =>
        TemplateQuestion.update(
          { position: index },
          { where: { id: questionId, templateId: id } },
        ),
      ),
    );

    SuccessResponse(res, { message: "Questions reordered successfully" });
    return { message: "Questions reordered successfully" };
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Restore template to a previous version. Optionally saves current state as a version first.",
    params: { id: { type: "string", description: "Template ID" } },
  })
  @RequestBodyValidator(restoreTemplateVersionSchema)
  @Request
  static async restoreTemplateVersion(req, res) {
    const { id } = req.params;
    const { versionId } = req.body;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      const { Op } = models.Sequelize;
      whereClause[Op.or] = [{ clinicId }, { clinicId: null }];
    }

    const version = await TemplateVersion.findOne({
      where: { id: versionId, templateId: id },
    });
    if (!version) {
      return BadRequestError("Version not found", STATUS_CODES.NOTFOUND);
    }

    const template = await Template.findOne({
      where: whereClause,
      attributes: ["id", "name", "description"],
      include: [
        {
          model: TemplateQuestion,
          as: "questions",
          attributes: [
            "id",
            "questionIdentifier",
            "questionText",
            "questionType",
            "category",
            "position",
            "parentQuestionId",
            "showCondition",
            "options",
            "systemComponent",
          ],
          required: false,
        },
      ],
      order: [
        [{ model: TemplateQuestion, as: "questions" }, "position", "ASC"],
      ],
    });

    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    // Optional: save current state as "Before restore" version
    const currentSnapshot = TemplateController.buildTemplateSnapshot(template);
    const maxVersion = await TemplateVersion.max("versionNumber", {
      where: { templateId: id },
    });
    await TemplateVersion.create({
      templateId: id,
      versionNumber: (maxVersion ?? 0) + 1,
      snapshot: currentSnapshot,
    });

    let snapshotData = version.snapshot;
    if (typeof snapshotData === "string") {
      try {
        snapshotData = JSON.parse(snapshotData);
      } catch {
        return BadRequestError(
          "Invalid snapshot data",
          STATUS_CODES.BAD_REQUEST,
        );
      }
    }

    await template.update({
      name: snapshotData.name,
      description: snapshotData.description ?? template.description,
    });

    const snapshotIds = new Set(
      (snapshotData.questions || []).map((q) => q.questionIdentifier),
    );
    const existingQuestions = await TemplateQuestion.findAll({
      where: { templateId: id },
    });

    const identifierToId = {};
    for (const q of snapshotData.questions || []) {
      const existing = existingQuestions.find(
        (eq) => eq.questionIdentifier === q.questionIdentifier,
      );
      const payload = {
        questionText: q.questionText,
        questionType: q.questionType,
        category: q.category,
        position: q.position,
        showCondition: q.showCondition ?? null,
        options: q.options ?? null,
        systemComponent: q.systemComponent ?? null,
        parentQuestionId: null,
      };
      if (existing) {
        await existing.update(payload);
        identifierToId[q.questionIdentifier] = existing.id;
      } else {
        const created = await TemplateQuestion.create({
          templateId: id,
          questionIdentifier: q.questionIdentifier,
          ...payload,
        });
        identifierToId[q.questionIdentifier] = created.id;
      }
    }

    for (const q of snapshotData.questions || []) {
      if (
        q.parentQuestionIdentifier &&
        identifierToId[q.parentQuestionIdentifier]
      ) {
        const childId = identifierToId[q.questionIdentifier];
        const parentId = identifierToId[q.parentQuestionIdentifier];
        if (childId) {
          await TemplateQuestion.update(
            { parentQuestionId: parentId },
            { where: { id: childId, templateId: id } },
          );
        }
      }
    }

    for (const existing of existingQuestions) {
      if (!snapshotIds.has(existing.questionIdentifier)) {
        const responseCount = await IntakeResponse.count({
          where: { templateQuestionId: existing.id },
        });
        if (responseCount === 0) {
          await existing.destroy();
        }
      }
    }

    const updatedTemplate = await Template.findOne({
      where: { id },
      attributes: [
        "id",
        "name",
        "clinicId",
        "description",
        "isDefault",
        "isActive",
        "createdAt",
        "updatedAt",
      ],
      include: [
        {
          model: TemplateQuestion,
          as: "questions",
          attributes: [
            "id",
            "questionIdentifier",
            "questionText",
            "questionType",
            "category",
            "position",
            "parentQuestionId",
            "showCondition",
            "options",
            "systemComponent",
          ],
          required: false,
        },
      ],
      order: [
        [{ model: TemplateQuestion, as: "questions" }, "position", "ASC"],
      ],
    });

    const questionsWithParentIdentifier = (updatedTemplate.questions || []).map(
      (question) => {
        const questionData = question.toJSON();
        if (questionData.parentQuestionId) {
          const parentQuestion = updatedTemplate.questions.find(
            (q) => q.id === questionData.parentQuestionId,
          );
          if (parentQuestion) {
            questionData.parentQuestionIdentifier =
              parentQuestion.questionIdentifier;
          }
        }
        return questionData;
      },
    );

    const result = {
      id: updatedTemplate.id,
      name: updatedTemplate.name,
      clinicId: updatedTemplate.clinicId,
      description: updatedTemplate.description,
      isDefault: updatedTemplate.isDefault,
      isActive: updatedTemplate.isActive,
      questionCount: updatedTemplate.questions?.length || 0,
      questions: questionsWithParentIdentifier,
      createdAt: updatedTemplate.createdAt,
      updatedAt: updatedTemplate.updatedAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Create a new template for a clinic with name and optional description.",
  })
  @RequestBodyValidator(createTemplateSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.CREATE_TEMPLATE,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.id,
    getChanges: (req) => ({
      name: req.body.name,
      clinicId: req.auth.clinicId,
    }),
  })
  @Request
  static async createTemplate(req, res) {
    const { name, description } = req.body;
    const { clinicId } = req.auth;

    if (clinicId) {
      const clinic = await Clinic.findByPk(clinicId);
      if (!clinic) {
        return BadRequestError("Clinic not found", STATUS_CODES.NOTFOUND);
      }
    }

    const newTemplate = await Template.create({
      name,
      clinicId: clinicId || null,
      description: description || null,
      isDefault: false,
      isActive: false,
    });

    const result = {
      id: newTemplate.id,
      name: newTemplate.name,
      clinicId: newTemplate.clinicId,
      description: newTemplate.description,
      isDefault: newTemplate.isDefault,
      isActive: newTemplate.isActive,
      createdAt: newTemplate.createdAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description: "Duplicate an existing template (including its questions).",
    params: {
      id: {
        type: "string",
        description: "Template ID to duplicate",
      },
    },
  })
  @AuditLog({
    action: AUDIT_ACTIONS.CREATE_TEMPLATE,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.id,
    getChanges: (req) => ({
      sourceTemplateId: req.params.id,
      duplicated: true,
    }),
  })
  @Request
  static async duplicateTemplate(req, res) {
    const { id } = req.params;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      const { Op } = models.Sequelize;
      whereClause[Op.or] = [{ clinicId }, { clinicId: null }];
    }

    const template = await Template.findOne({
      where: whereClause,
      include: [
        {
          model: TemplateQuestion,
          as: "questions",
          attributes: [
            "id",
            "questionIdentifier",
            "questionText",
            "questionType",
            "category",
            "position",
            "parentQuestionId",
            "showCondition",
            "options",
            "systemComponent",
          ],
          required: false,
        },
      ],
      order: [
        [{ model: TemplateQuestion, as: "questions" }, "position", "ASC"],
      ],
    });

    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    const baseName = template.name || "Template";
    let newName = `${baseName} (Copy)`;
    if (!newName.trim()) {
      newName = "Template (Copy)";
    }

    const newTemplate = await Template.create({
      name: newName,
      clinicId: template.clinicId || clinicId || null,
      description: template.description || null,
      isDefault: false,
      isActive: false,
    });

    const originalQuestions = template.questions || [];

    // Helper to ensure options/showCondition are clean plain values for storage.
    // Handles: null, object (deep clone), or string (parse if JSON, then clone).
    const cloneJsonForStorage = (value) => {
      if (value == null) return null;
      let parsed = value;
      if (typeof value === "string") {
        try {
          parsed = JSON.parse(value);
        } catch {
          return null;
        }
      }
      try {
        return JSON.parse(JSON.stringify(parsed));
      } catch (e) {
        return null;
      }
    };

    const identifierToNewId = {};
    const createdQuestions = await Promise.all(
      originalQuestions.map(async (q) => {
        const rawOptions = typeof q.get === "function" ? q.get("options") : q.options;
        const rawShowCondition =
          typeof q.get === "function" ? q.get("showCondition") : q.showCondition;

        const created = await TemplateQuestion.create({
          templateId: newTemplate.id,
          questionIdentifier: q.questionIdentifier,
          questionText: q.questionText,
          questionType: q.questionType,
          category: q.category,
          position: q.position,
          parentQuestionId: null,
          showCondition: cloneJsonForStorage(rawShowCondition),
          options: cloneJsonForStorage(rawOptions),
          systemComponent: q.systemComponent ?? null,
        });

        identifierToNewId[q.questionIdentifier] = created.id;
        return { original: q, created };
      }),
    );

    await Promise.all(
      createdQuestions.map(async ({ original, created }) => {
        if (!original.parentQuestionId) return;

        const parent = originalQuestions.find(
          (oq) => oq.id === original.parentQuestionId,
        );
        if (!parent) return;

        const newParentId = identifierToNewId[parent.questionIdentifier];
        if (newParentId && created.parentQuestionId !== newParentId) {
          await created.update({ parentQuestionId: newParentId });
        }
      }),
    );

    const result = {
      id: newTemplate.id,
      name: newTemplate.name,
      clinicId: newTemplate.clinicId,
      description: newTemplate.description,
      isDefault: newTemplate.isDefault,
      isActive: newTemplate.isActive,
      createdAt: newTemplate.createdAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Add questions to a template. Supports parent-child relationships for follow-up questions.",
    params: {
      id: {
        type: "string",
        description: "Template ID",
      },
    },
  })
  @RequestBodyValidator(addQuestionsToTemplateSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.ADD_TEMPLATE_QUESTIONS,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.templateId,
    getChanges: (req) => ({
      templateId: req.params.id,
      questionCount: req.body.questions?.length || 0,
    }),
  })
  @Request
  static async addQuestionsToTemplate(req, res) {
    const { id } = req.params;
    const { questions, templateName, description } = req.body;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    const template = await Template.findOne({ where: whereClause });
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    if (templateName || description !== undefined) {
      const updateData = {};
      if (templateName) {
        updateData.name = templateName;
      }
      if (description !== undefined) {
        updateData.description = description;
      }
      await template.update(updateData);
    }

    const questionIdentifierMap = {};
    let createdQuestions = [];

    if (questions && questions.length > 0) {
      // Check for uniqueness of questionIdentifier within the template
      const existingQuestions = await TemplateQuestion.findAll({
        where: { templateId: id },
        attributes: ["questionIdentifier"],
      });
      const existingIdentifiers = new Set(
        existingQuestions.map((q) => q.questionIdentifier),
      );

      const incomingIdentifiers = new Set();
      const duplicateCheck = questions.some((q) => {
        if (existingIdentifiers.has(q.questionIdentifier)) {
          res.status(400).json({
            success: false,
            message: `Question ID "${q.questionIdentifier}" already exists in this template. Please use a unique identifier.`,
          });
          return true;
        }
        if (incomingIdentifiers.has(q.questionIdentifier)) {
          res.status(400).json({
            success: false,
            message: `Duplicate Question ID "${q.questionIdentifier}" found in request. Each question must have a unique identifier.`,
          });
          return true;
        }
        incomingIdentifiers.add(q.questionIdentifier);
        return false;
      });

      if (duplicateCheck) {
        return;
      }

      const questionsToCreate = questions.map((q) => {
        const questionId = models.sequelize.fn("uuid_generate_v4");
        questionIdentifierMap[q.questionIdentifier] = questionId;

        return {
          templateId: id,
          questionIdentifier: q.questionIdentifier,
          questionText: q.questionText,
          questionType: q.questionType,
          category: q.category,
          position: q.position,
          parentQuestionId: null,
          showCondition: q.showCondition || null,
          options: q.options || null,
          systemComponent: q.systemComponent ?? null,
        };
      });
      await Promise.all(
        questionsToCreate.map(async (qItem, i) => {
          const originalQuestion = questions[i];
          if (originalQuestion.parentQuestionIdentifier) {
            const parentQuestion = await TemplateQuestion.findOne({
              where: {
                templateId: id,
                questionIdentifier: originalQuestion.parentQuestionIdentifier,
              },
            });

            if (parentQuestion) {
              // eslint-disable-next-line no-param-reassign
              qItem.parentQuestionId = parentQuestion.id;
            }
          }
        }),
      );

      createdQuestions = await TemplateQuestion.bulkCreate(questionsToCreate);

      if (template.clinicId) {
        const templatesWithQuestions = await Template.count({
          distinct: true,
          include: [
            {
              model: TemplateQuestion,
              as: "questions",
              required: true,
            },
          ],
          where: {
            clinicId: template.clinicId,
            "$questions.id$": { [models.Sequelize.Op.ne]: null },
          },
        });

        if (templatesWithQuestions === 1) {
          await template.update({ isDefault: true });
        }
      }

      await Promise.all(
        createdQuestions.map(async (createdQ, i) => {
          const originalQuestion = questions[i];
          if (originalQuestion.parentQuestionIdentifier) {
            const parentInNewBatch = createdQuestions.find(
              (q) =>
                q.questionIdentifier ===
                originalQuestion.parentQuestionIdentifier,
            );

            if (parentInNewBatch && !questionsToCreate[i].parentQuestionId) {
              await createdQ.update({
                parentQuestionId: parentInNewBatch.id,
              });
            }
          }
        }),
      );
    }

    const result = {
      templateId: id,
      templateName: template.name,
      templateDescription: template.description,
      questionsAdded: createdQuestions.length,
      questions: createdQuestions.map((q) => ({
        id: q.id,
        questionIdentifier: q.questionIdentifier,
        questionText: q.questionText,
        questionType: q.questionType,
        category: q.category,
        position: q.position,
        parentQuestionId: q.parentQuestionId,
        showCondition: q.showCondition,
        options: q.options,
        templateId: id,
        templateName: template.name,
      })),
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description: "Delete a template by ID.",
    params: {
      id: {
        type: "string",
        description: "Template ID",
      },
    },
  })
  @AuditLog({
    action: AUDIT_ACTIONS.DELETE_TEMPLATE,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.id,
    getChanges: (req) => ({
      templateId: req.params.id,
    }),
  })
  @Request
  static async deleteTemplate(req, res) {
    const { id } = req.params;
    const { clinicId } = req.auth;

    const whereClause = { id };
    if (clinicId) {
      whereClause.clinicId = clinicId;
    }

    const template = await Template.findOne({ where: whereClause });
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    await template.destroy();

    const result = {
      id: template.id,
      name: template.name,
    };

    SuccessResponse(res, {
      message: "Template deleted successfully",
      template: result,
    });
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description: "Delete a template question by ID.",
    params: {
      questionId: {
        type: "string",
        description: "Question ID",
      },
    },
  })
  @AuditLog({
    action: AUDIT_ACTIONS.DELETE_TEMPLATE_QUESTION,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.templateId,
    getChanges: (req) => ({
      questionId: req.params.questionId,
    }),
  })
  @Request
  static async deleteTemplateQuestion(req, res) {
    const { questionId } = req.params;
    const { clinicId } = req.auth;

    const question = await TemplateQuestion.findByPk(questionId, {
      include: [
        {
          model: Template,
          as: "template",
          attributes: ["id", "clinicId"],
        },
      ],
    });

    if (!question) {
      return BadRequestError("Question not found", STATUS_CODES.NOTFOUND);
    }

    if (clinicId && question.template?.clinicId !== clinicId) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    const responseCount = await IntakeResponse.count({
      where: { templateQuestionId: questionId },
    });
    if (responseCount > 0) {
      return BadRequestError(
        `Cannot delete question: it has ${responseCount} existing intake response(s). Remove or reassign those responses first.`,
        STATUS_CODES.BAD_REQUEST,
      );
    }

    const { templateId } = question;
    await question.destroy();
    const result = {
      templateId,
      questionId: question.id,
      message: "Question deleted successfully",
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description: "Edit a template question by ID.",
    params: {
      questionId: {
        type: "string",
        description: "Question ID",
      },
    },
  })
  @RequestBodyValidator(updateTemplateQuestionSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.UPDATE_TEMPLATE_QUESTION,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.templateId,
    getChanges: (req) => ({
      questionId: req.params.questionId,
      updates: req.body,
    }),
  })
  @Request
  static async editTemplateQuestion(req, res) {
    const { questionId } = req.params;
    const updates = req.body;
    const { clinicId } = req.auth;

    const question = await TemplateQuestion.findByPk(questionId, {
      include: [
        {
          model: Template,
          as: "template",
          attributes: ["id", "clinicId"],
        },
      ],
    });

    if (!question) {
      return BadRequestError("Question not found", STATUS_CODES.NOTFOUND);
    }

    if (clinicId && question.template?.clinicId !== clinicId) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }

    // Check for questionIdentifier uniqueness if it's being updated
    if (
      updates.questionIdentifier &&
      updates.questionIdentifier !== question.questionIdentifier
    ) {
      const existingQuestion = await TemplateQuestion.findOne({
        where: {
          templateId: question.templateId,
          questionIdentifier: updates.questionIdentifier,
        },
      });

      if (existingQuestion && existingQuestion.id !== questionId) {
        return res.status(400).json({
          success: false,
          message: `Question ID "${updates.questionIdentifier}" already exists in this template. Please use a unique identifier.`,
        });
      }
    }

    if (updates.parentQuestionIdentifier !== undefined) {
      if (
        updates.parentQuestionIdentifier === null ||
        updates.parentQuestionIdentifier === ""
      ) {
        updates.parentQuestionId = null;
      } else {
        const parentQuestion = await TemplateQuestion.findOne({
          where: {
            templateId: question.templateId,
            questionIdentifier: updates.parentQuestionIdentifier,
          },
        });

        if (parentQuestion) {
          updates.parentQuestionId = parentQuestion.id;
        } else {
          return BadRequestError(
            "Parent question not found",
            STATUS_CODES.NOTFOUND,
          );
        }
      }
      delete updates.parentQuestionIdentifier;
    }

    await question.update(updates);

    const result = {
      templateId: question.templateId,
      questionId: question.id,
      questionIdentifier: question.questionIdentifier,
      questionText: question.questionText,
      questionType: question.questionType,
      category: question.category,
      position: question.position,
      parentQuestionId: question.parentQuestionId,
      showCondition: question.showCondition,
      options: question.options,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Set or unset a template as default for the clinic. If setting as default, ensures only one default template exists per clinic.",
    params: {
      id: {
        type: "string",
        description: "Template ID",
      },
    },
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              isDefault: {
                type: "boolean",
                description:
                  "Set to true to make default, false to unset default",
              },
            },
            required: ["isDefault"],
          },
        },
      },
    },
  })
  @RequestBodyValidator(setDefaultTemplateSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.UPDATE_TEMPLATE,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.id,
    getChanges: (req) => ({
      templateId: req.params.id,
      isDefault: req.body.isDefault,
    }),
  })
  @Request
  static async setDefaultTemplate(req, res) {
    const { id } = req.params;
    const { isDefault } = req.body;
    const { clinicId } = req.auth;
    const isDefaultValue = !!isDefault;

    const whereClause = { id };
    if (clinicId) {
      const { Op } = models.Sequelize;
      whereClause[Op.or] = [{ clinicId }, { clinicId: null }];
    }

    const template = await Template.findOne({
      where: whereClause,
      include: [
        {
          model: TemplateQuestion,
          as: "questions",
        },
      ],
    });

    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }
    if (
      isDefaultValue &&
      (!template.questions || template.questions.length === 0)
    ) {
      return BadRequestError(
        "Cannot set template as default: Template has no questions",
        STATUS_CODES.BAD_REQUEST,
      );
    }
    await models.sequelize.transaction(async (t) => {
      if (isDefaultValue) {
        const { Op } = models.Sequelize;
        await Template.update(
          { isDefault: false },
          {
            where: {
              clinicId: template.clinicId,
              id: { [Op.ne]: id },
            },
            transaction: t,
          },
        );
      }

      await template.update({ isDefault: isDefaultValue }, { transaction: t });
    });

    await template.reload();
    const defaultCount = await Template.count({
      where: {
        clinicId: template.clinicId,
        isDefault: true,
      },
    });

    if (defaultCount > 1) {
      if (isDefaultValue) {
        const { Op } = models.Sequelize;
        await Template.update(
          { isDefault: false },
          {
            where: {
              clinicId: template.clinicId,
              id: { [Op.ne]: template.id },
              isDefault: true,
            },
          },
        );
      }
    }

    // When a provider sets/unsets default, keep Provider.activeTemplateId in sync
    const provider = await Provider.findOne({
      where: { userId: req.auth.id },
      attributes: ["id", "activeTemplateId", "clinicId"],
    });
    if (provider) {
      if (isDefaultValue) {
        await provider.update({ activeTemplateId: id });
      } else if (provider.activeTemplateId === id) {
        await provider.update({ activeTemplateId: null });
      }
    }

    const result = {
      id: template.id,
      name: template.name,
      isDefault: !!template.isDefault,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Get whether the given template is active/visible to providers (super_admin only). Returns template isActive.",
    params: {
      id: { type: "string", description: "Template ID" },
    },
  })
  @Request
  static async getTemplateVisible(req, res) {
    if (req.auth.role !== "super_admin") {
      return res.status(STATUS_CODES.FORBIDDEN).json({
        status: "error",
        message: "Forbidden",
      });
    }
    const { id } = req.params;
    const template = await Template.findByPk(id, {
      attributes: ["id", "isActive"],
    });
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }
    const active = !!template.isActive;
    SuccessResponse(res, { active });
    return { active };
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Set template active/visible to providers (super_admin only). Updates Template.isActive.",
    params: {
      id: { type: "string", description: "Template ID" },
    },
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              active: {
                type: "boolean",
                description:
                  "true = active (isActive 1), false = inactive (isActive 0)",
              },
            },
            required: ["active"],
          },
        },
      },
    },
  })
  @RequestBodyValidator(setTemplateVisibleSchema)
  @Request
  static async setTemplateVisible(req, res) {
    if (req.auth.role !== "super_admin") {
      return res.status(STATUS_CODES.FORBIDDEN).json({
        status: "error",
        message: "Forbidden",
      });
    }
    const { id } = req.params;
    const { active } = req.body;
    const template = await Template.findByPk(id);
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }
    await template.update({ isActive: !!active });
    await template.reload();
    const result = {
      active: !!template.isActive,
      templateId: template.id,
    };
    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Get whether the given template is the current provider's active template.",
    params: {
      id: { type: "string", description: "Template ID" },
    },
  })
  @Request
  static async getTemplateActive(req, res) {
    const { id } = req.params;
    const provider = await Provider.findOne({
      where: { userId: req.auth.id },
      attributes: ["id", "activeTemplateId"],
    });
    const active = !!provider && provider.activeTemplateId === id;
    SuccessResponse(res, { active });
    return { active };
  }

  @SwaggerDoc({
    tags: ["Templates"],
    description:
      "Set the given template as the current provider’s active template.",
    params: {
      id: { type: "string", description: "Template ID" },
    },
  })
  @Request
  static async setTemplateActive(req, res) {
    const { id } = req.params;
    const provider = await Provider.findOne({
      where: { userId: req.auth.id },
      attributes: ["id", "clinicId", "activeTemplateId"],
    });
    if (!provider) {
      return BadRequestError(
        "Only providers can set an active template",
        STATUS_CODES.BAD_REQUEST,
      );
    }
    const { Op } = models.Sequelize;
    const whereClause =
      provider.clinicId === null
        ? { id }
        : {
            id,
            [Op.or]: [{ clinicId: provider.clinicId }, { clinicId: null }],
          };
    const template = await Template.findOne({ where: whereClause });
    if (!template) {
      return BadRequestError("Template not found", STATUS_CODES.NOTFOUND);
    }
    await provider.update({ activeTemplateId: id });
    SuccessResponse(res, { active: true, templateId: id });
    return { active: true, templateId: id };
  }
}

export default TemplateController;
