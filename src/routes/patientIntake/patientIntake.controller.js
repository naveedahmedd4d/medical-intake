import express from 'express';
import crypto from 'crypto';
import models from '../../models';
import { STATUS_CODES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../utils/constants';
import { BadRequestError, SuccessResponse } from '../../utils/helper';
import { submitIntakeSchema, getTemplateQuestionsSchema } from './validationSchemas';
import { Request, AuditLog, SwaggerDoc, RequestBodyValidator } from '../../utils/decorators';
import { formatPatientSummary } from '../../utils/formatPatientSummary';
import { generatePatientSummary } from '../../services/aiSummaryService';
import { resolveIntakeSlugs } from '../../utils/slugHelpers';
import { listPatientSummariesQuery } from '../patientSummary/query';

const {
  IntakeSession,
  IntakeResponse,
  Template,
  TemplateQuestion,
  Provider,
  Clinic,
  PatientSummary,
  User,
  sequelize,
} = models;

class PatientIntakeController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.get('/questions', this.getTemplateQuestions);
    this.router.get('/summary/:sessionId', this.getSummary);
    this.router.post('/', this.submitIntake);
    this.router.get('/masterlinks', this.listIntakeResponses);
    this.router.get('/:clinicSlug/:providerSlug', this.getIntakeBySlug);
    return this.router;
  }

  @SwaggerDoc({
    tags: ['Patient Intake'],
    description:
      'Get template questions for patient intake form. Returns all questions ordered by position. No authentication required.',
    security: [],
    query: {
      templateId: {
        type: 'string',
        description: 'UUID of the template to fetch questions for',
      },
      providerId: {
        type: 'string',
        description: 'UUID of the provider who will use this template',
      },
    },
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.FETCH_TEMPLATE_QUESTIONS,
    resourceType: AUDIT_RESOURCE_TYPES.TEMPLATE,
    getResourceId: (result) => result?.templateId,
    getChanges: (req, result) => ({
      templateId: req.query.templateId,
      providerId: req.query.providerId,
      questionCount: result?.questions?.length || 0,
    }),
    bypassAuth: true,
  })
  static async getTemplateQuestions(req, res) {
    const { error, value } = getTemplateQuestionsSchema.validate(req.query);
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const { templateId, providerId } = value;
    const template = await Template.findByPk(templateId, {
      attributes: ['id', 'name', 'clinicId', 'isDefault', 'description', 'createdAt', 'updatedAt'],
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'clinicName', 'accountStatus'],
        },
      ],
    });

    if (!template) {
      return BadRequestError('Template not found', STATUS_CODES.NOTFOUND);
    }

    let provider = null;

    if (providerId) {
      provider = await Provider.findByPk(providerId, {
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'firstName', 'lastName'],
          },
          {
            model: Clinic,
            as: 'clinic',
            attributes: ['id', 'clinicName'],
          },
        ],
      });

      if (!provider) {
        return BadRequestError('Provider not found', STATUS_CODES.NOTFOUND);
      }

      if (provider.status !== 'active') {
        return BadRequestError('Provider is not active', STATUS_CODES.INVALID_INPUT);
      }

      const allowed =
        template.clinicId === null || template.clinicId === provider.clinicId;
      if (!allowed) {
        return BadRequestError(
          'Template does not belong to provider clinic',
          STATUS_CODES.INVALID_INPUT
        );
      }
    }

    const questions = await TemplateQuestion.findAll({
      where: { templateId },
      order: [['position', 'ASC']],
      attributes: [
        'id',
        'questionIdentifier',
        'questionText',
        'questionType',
        'parentQuestionId',
        'showCondition',
        'options',
        'position',
        'category',
        'systemComponent',
      ],
    });

    const result = {
      templateId: template.id,
      templateName: template.name,
      clinicId: template.clinicId,
      clinicName: template.clinic?.clinicName || null,
      providerId: provider?.id || null,
      providerName: provider
        ? `${provider.user?.firstName || ''} ${provider.user?.lastName || ''}`.trim() || null
        : null,
      questions: questions.map((q) => ({
        id: q.id,
        questionIdentifier: q.questionIdentifier,
        questionText: q.questionText,
        questionType: q.questionType,
        parentQuestionId: q.parentQuestionId,
        showCondition: q.showCondition,
        options: q.options,
        position: q.position,
        category: q.category,
        systemComponent: q.systemComponent,
      })),
      totalQuestions: questions.length,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ['Patient Intake'],
    description:
      'Get patient intake form using friendly URLs: /clinic-name/provider-name. Resolves to clinic and provider, then redirects to their default template. No authentication required.',
    security: [],
    parameters: [
      {
        in: 'path',
        name: 'clinicSlug',
        required: true,
        schema: { type: 'string' },
        description: 'URL-friendly clinic name (e.g., "abc-medical-clinic")',
      },
      {
        in: 'path',
        name: 'providerSlug',
        required: true,
        schema: { type: 'string' },
        description: 'URL-friendly provider name (e.g., "john-smith")',
      },
    ],
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_INTAKE_SESSION,
    resourceType: AUDIT_RESOURCE_TYPES.INTAKE_SESSION,
    getResourceId: (result) => result?.providerId,
    getChanges: (req, result) => ({
      clinicSlug: req.params.clinicSlug,
      providerSlug: req.params.providerSlug,
      resolvedClinicId: result?.clinicId,
      resolvedProviderId: result?.providerId,
    }),
    bypassAuth: true,
  })
  static async getIntakeBySlug(req, res) {
    const { clinicSlug, providerSlug } = req.params;

    try {
      // Resolve clinic and provider slugs to IDs
      const resolved = await resolveIntakeSlugs(clinicSlug, providerSlug);

      let chosenTemplate = null;

      // 1) Prefer provider's active template if set and valid
      const provider = await Provider.findByPk(resolved.providerId, {
        attributes: ['id', 'activeTemplateId', 'clinicId'],
      });
      if (provider?.activeTemplateId) {
        const activeTemplate = await Template.findByPk(provider.activeTemplateId, {
          attributes: ['id', 'name', 'clinicId'],
        });
        if (
          activeTemplate &&
          (activeTemplate.clinicId === null ||
            activeTemplate.clinicId === provider.clinicId)
        ) {
          chosenTemplate = activeTemplate;
        }
      }

      // 2) Clinic default template
      if (!chosenTemplate) {
        chosenTemplate = await Template.findOne({
          where: {
            clinicId: resolved.clinicId,
            isDefault: true,
          },
          attributes: ['id', 'name'],
        });
      }

      // 3) First clinic template
      if (!chosenTemplate) {
        chosenTemplate = await Template.findOne({
          where: { clinicId: resolved.clinicId },
          attributes: ['id', 'name'],
          order: [['createdAt', 'ASC']],
        });
      }

      // 4) First prebuild template (clinicId null)
      if (!chosenTemplate) {
        chosenTemplate = await Template.findOne({
          where: { clinicId: null },
          attributes: ['id', 'name'],
          order: [['createdAt', 'ASC']],
        });
      }

      if (!chosenTemplate) {
        return BadRequestError(
          `No templates found for clinic: ${resolved.clinic.name}`,
          STATUS_CODES.NOTFOUND
        );
      }

      const result = {
        clinicId: resolved.clinicId,
        clinicName: resolved.clinic.name,
        clinicLogoUrl: resolved.clinic.logoUrl,
        providerId: resolved.providerId,
        providerName: resolved.provider.name,
        templateId: chosenTemplate.id,
        templateName: chosenTemplate.name,
        intakeUrl: `/intake/${resolved.clinicId}/${chosenTemplate.id}/${resolved.providerId}`,
      };

      SuccessResponse(res, result);
      return result;
    } catch (error) {
      return BadRequestError(error.message, STATUS_CODES.NOTFOUND);
    }
  }

  @SwaggerDoc({
    tags: ['Patient Intake'],
    description:
      'Submit complete patient intake form with demographics and all question responses. Creates intake session and saves all responses. No authentication required.',
    security: [],
  })
  @RequestBodyValidator(submitIntakeSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.SUBMIT_PATIENT_INTAKE,
    resourceType: AUDIT_RESOURCE_TYPES.INTAKE_SESSION,
    getResourceId: (result) => result?.sessionId,
    getChanges: (req, result) => ({
      templateId: req.body.templateId,
      providerId: req.body.providerId,
      patientIdentifier: result?.patientIdentifier,
      responseCount: req.body.responses.length,
    }),
    bypassAuth: true,
  })
  @Request
  static async submitIntake(req, res) {
    const { body } = req;

    const hasProvider = !!body.providerId;

    const template = await Template.findByPk(body.templateId, {
      attributes: ['id', 'name', 'clinicId', 'isDefault', 'description', 'createdAt', 'updatedAt'],
    });
    if (!template) {
      return BadRequestError('Template not found', STATUS_CODES.NOTFOUND);
    }

    let provider = null;

    if (hasProvider) {
      provider = await Provider.findByPk(body.providerId, {
        include: [{ model: Clinic, as: 'clinic' }],
      });

      if (!provider) {
        return BadRequestError('Provider not found', STATUS_CODES.NOTFOUND);
      }

      if (provider.status !== 'active') {
        return BadRequestError('Provider is not active', STATUS_CODES.INVALID_INPUT);
      }

      const allowed =
        template.clinicId === null || template.clinicId === provider.clinicId;
      if (!allowed) {
        return BadRequestError(
          'Template does not belong to provider clinic',
          STATUS_CODES.INVALID_INPUT
        );
      }
    }

    const questionIds = body.responses.map((r) => r.templateQuestionId);
    const questions = await TemplateQuestion.findAll({
      where: { id: questionIds, templateId: body.templateId },
    });

    if (questions.length !== questionIds.length) {
      return BadRequestError(
        'One or more questions do not belong to this template',
        STATUS_CODES.INVALID_INPUT
      );
    }

    let transaction;
    try {
      transaction = await sequelize.transaction();

      const patientIdentifier = `PAT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const patientName = `${body.firstName} ${body.lastName}`;

      const newSession = await IntakeSession.create(
        {
          clinicId: provider ? provider.clinicId : template.clinicId,
          templateId: body.templateId,
          providerId: hasProvider ? body.providerId : null,
          patientIdentifier,
          patientName,
          dateOfBirth: body.dateOfBirth,
          phoneNumber: body.phoneNumber,
          appointmentDate: body.appointmentDate,
          gender: body.gender,
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
        },
        { transaction }
      );

      const responseRecords = body.responses.map((response) => ({
        sessionId: newSession.id,
        templateQuestionId: response.templateQuestionId,
        clinicId: provider ? provider.clinicId : template.clinicId,
        responseData: JSON.stringify(response.responseData),
        answeredAt: new Date(),
      }));

      const savedResponses = await IntakeResponse.bulkCreate(responseRecords, {
        transaction,
      });

      await transaction.commit();

      const allQuestions = await TemplateQuestion.findAll({
        where: { templateId: body.templateId },
      });

      const formattedSummary = formatPatientSummary(newSession, savedResponses, allQuestions);

      const aiGeneratedSummary = await generatePatientSummary(formattedSummary);

      const patientSummary = await PatientSummary.create({
        intakeSessionId: newSession.id,
        providerId: hasProvider ? body.providerId : null,
        clinicId: provider ? provider.clinicId : template.clinicId,
        aiGeneratedSummary,
        structuredData: JSON.stringify({
          formattedSummary,
          responseCount: body.responses.length,
        }),
        generatedAt: new Date(),
      });

      const result = {
        sessionId: newSession.id,
        summaryId: patientSummary.id,
        patientIdentifier: newSession.patientIdentifier,
        patientName: newSession.patientName,
        status: newSession.status,
        clinicName: provider ? provider.clinic?.clinicName : null,
        completedAt: newSession.completedAt,
        totalResponses: body.responses.length,
        message: 'Intake form submitted and summary generated successfully',
      };

      SuccessResponse(res, result);
      return result;
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  @SwaggerDoc({
    tags: ['Patient Intake'],
    description:
      'Get patient intake summary by session ID. Returns AI-generated summary with patient demographics. No authentication required.',
    security: [],
  })
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_INTAKE_SUMMARY,
    resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
    getResourceId: (result) => result?.sessionId,
    getChanges: (req, result) => ({
      sessionId: result?.sessionId,
      patientIdentifier: result?.patientId,
      patientName: result?.patientName,
    }),
  })
  @Request
  static async getSummary(req, res) {
    const { sessionId } = req.params;

    const session = await IntakeSession.findByPk(sessionId, {
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'clinicName'],
        },
      ],
    });

    if (!session) {
      return BadRequestError('Session not found', STATUS_CODES.NOTFOUND);
    }

    const summary = await PatientSummary.findOne({
      where: { intakeSessionId: sessionId },
    });

    if (!summary) {
      return BadRequestError('Summary not found', STATUS_CODES.NOTFOUND);
    }

    const age = new Date().getFullYear() - new Date(session.dateOfBirth).getFullYear();

    const result = {
      sessionId: session.id,
      patientId: session.patientIdentifier,
      patientName: session.patientName,
      dateOfBirth: session.dateOfBirth,
      age,
      gender: session.gender,
      phoneNumber: session.phoneNumber,
      appointmentDate: session.appointmentDate,
      dateOfSubmission: session.completedAt,
      clinicName: session.clinic?.clinicName,
      aiGeneratedSummary: summary.aiGeneratedSummary,
      isArchived: summary.isArchived,
      generatedAt: summary.generatedAt,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ['Patient Intake'],
    description:
      'List all patient summaries (Master Links) for the current clinic. Returns all patient summaries with associated session information. Requires provider or clinic_admin role.',
    query: {
      page: {
        type: 'number',
        description: 'Page number (default: 1)',
      },
      pageSize: {
        type: 'number',
        description: 'Items per page (default: 10)',
      },
    },
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_PATIENT_SUMMARY_LIST,
    resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
    getResourceId: () => null,
    getChanges: (req, result) => ({
      filters: {
        clinicId: req.auth?.clinicId || null,
      },
      resultCount: result?.pagination?.totalRecords || 0,
    }),
  })
  static async listIntakeResponses(req, res) {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;

    // Optional isArchived filter: true = archived only, false = active only, omitted = both
    let isArchivedFilter;
    if (req.query.isArchived !== undefined && req.query.isArchived !== '') {
      const raw = String(req.query.isArchived).toLowerCase();
      if (raw === 'true') isArchivedFilter = true;
      else if (raw === 'false') isArchivedFilter = false;
    }

    // For super_admin, don't filter by clinicId to see all records
    // For other roles, filter by their clinicId
    const clinicId = req.auth.role === 'super_admin' ? undefined : req.auth.clinicId;

    const query = await listPatientSummariesQuery({
      search: req.query.search,
      dateOfBirth: req.query.dateOfBirth,
      appointmentDate: req.query.appointmentDate,
      isArchived: isArchivedFilter === undefined ? false : isArchivedFilter,
      providerId: undefined, // Don't filter by provider - show all providers' records
      clinicId,
      sortColumn: 'generatedAt',
      sortOrder: 'DESC',
      pageNumber: page,
      pageSize,
    });

    // When no archive filter requested, show both active and archived
    if (isArchivedFilter === undefined && query.where && query.where.isArchived !== undefined) {
      delete query.where.isArchived;
    }

    const { count, rows: summaries } = await PatientSummary.findAndCountAll(query);

    const summariesData = summaries
      .filter((summary) => summary.intakeSession) // Filter out any records without IntakeSession
      .map((summary) => {
        const session = summary.intakeSession;
        /* eslint-disable indent, prettier/prettier */
        const age = session.dateOfBirth
          ? Math.floor(
            (new Date() - new Date(session.dateOfBirth)) / (365.25 * 24 * 60 * 60 * 1000)
          )
          : null;
        /* eslint-enable indent, prettier/prettier */

        return {
          id: summary.id,
          patientName: session.patientName,
          patientId: session.patientIdentifier,
          dateOfBirth: session.dateOfBirth,
          age,
          gender: session.gender,
          phone: session.phoneNumber,
          appointmentDate: session.appointmentDate,
          summaryDate: summary.generatedAt,
          time: summary.generatedAt,
          status: summary.isArchived ? 'Archived' : 'Active',
          isArchived: summary.isArchived,
          session: {
            id: session.id,
            patientIdentifier: session.patientIdentifier,
            patientName: session.patientName,
            dateOfBirth: session.dateOfBirth,
            appointmentDate: session.appointmentDate,
            completedAt: session.status,
          },
        };
      });

    const totalPages = Math.ceil(count / pageSize);

    const result = {
      data: summariesData,
      pagination: {
        page,
        pageSize,
        totalRecords: count,
        totalPages,
      },
    };

    SuccessResponse(res, result);
    return result;
  }
}

export default PatientIntakeController;
