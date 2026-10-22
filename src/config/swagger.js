import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { getSwaggerMetadata } from '../utils/decorators';

const baseOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Mira Medical Patient Intake System API',
      version: '1.0.0',
      description:
        'Production multi-tenant medical intake platform with comprehensive patient intake workflows, template management, AI-generated summaries, subscription billing, and audit trails.',
      contact: {
        name: 'Syed Ali Hamza',
        email: 'hamza.syed9995@gmail.com',
      },
    },
    servers: [
      {
        url: process.env.SWAGGER_SERVER_URL || `http://localhost:${process.env.PORT || 3000}`,
        description:
          process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from login endpoint',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['status', 'message'],
          properties: {
            status: {
              type: 'string',
              enum: ['error'],
              description: 'Error status',
            },
            message: {
              type: 'string',
              description: 'Error message',
            },
            data: {
              type: 'object',
              description: 'Additional error data',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [],
};

const generateSwaggerSpec = () => {
  const baseSpec = swaggerJsdoc(baseOptions);
  const decoratorRoutes = getSwaggerMetadata();

  const paths = {};

  const routeMapping = {
    'UserController.getPaymentStatus': { path: '/api/payment-status', method: 'get' },
    'UserController.login': { path: '/api/users/login', method: 'post' },
    'UserController.validateEmail': { path: '/api/users/validate-email', method: 'get' },
    'ClinicController.registerClinic': { path: '/api/clinics/register', method: 'post' },
    'ClinicController.initiateOnboardingWithPayment': {
      path: '/api/clinics/onboarding/initiate',
      method: 'post',
    },
    'ClinicController.validateClinicName': { path: '/api/clinics/validate-name', method: 'get' },
    'ClinicController.getClinicProfile': { path: '/api/clinics/profile', method: 'get' },
    'ClinicController.updateClinicProfile': { path: '/api/clinics/profile', method: 'put' },
    'ClinicController.uploadLogo': { path: '/api/clinics/profile/logo', method: 'post' },
    'ClinicController.listClinics': { path: '/api/clinics', method: 'get' },
    'ClinicController.getClinicById': { path: '/api/clinics/{id}', method: 'get' },
    'ClinicController.deleteClinic': { path: '/api/clinics/{id}', method: 'delete' },
    'ProviderController.listProviders': { path: '/api/providers', method: 'get' },
    'ProviderController.getProfile': { path: '/api/providers/profile', method: 'get' },
    'ProviderController.updateProfile': { path: '/api/providers/profile', method: 'put' },
    'ProviderController.inviteProvider': { path: '/api/providers/invite', method: 'post' },
    'ProviderController.acceptInvitation': {
      path: '/api/providers/accept-invitation',
      method: 'post',
    },
    'ProviderController.resendInvitation': {
      path: '/api/providers/resend-invitation',
      method: 'post',
    },
    'TemplateController.listTemplates': { path: '/api/templates', method: 'get' },
    'TemplateController.createTemplate': { path: '/api/templates', method: 'post' },
    'TemplateController.addQuestionsToTemplate': {
      path: '/api/templates/{id}/questions',
      method: 'post',
    },
    'TemplateController.editTemplateQuestion': {
      path: '/api/questions/{questionId}',
      method: 'put',
    },
    'TemplateController.deleteTemplateQuestion': {
      path: '/api/questions/{questionId}',
      method: 'delete',
    },
    'TemplateController.deleteTemplate': { path: '/api/templates/{id}', method: 'delete' },
    'TemplateController.setDefaultTemplate': { path: '/api/templates/{id}/default', method: 'put' },
    'TemplateController.getTemplateVisible': { path: '/api/templates/{id}/visible', method: 'get' },
    'TemplateController.setTemplateVisible': { path: '/api/templates/{id}/visible', method: 'put' },
    'TemplateController.getTemplateActive': { path: '/api/templates/{id}/active', method: 'get' },
    'TemplateController.setTemplateActive': { path: '/api/templates/{id}/active', method: 'put' },
    'ProviderController.removeProvider': { path: '/api/providers/{id}', method: 'delete' },
    'ProviderController.getProviderByClinicId': {
      path: '/api/providers/public/{clinic_id}',
      method: 'get',
    },
    'BillingController.getCustomerPortal': { path: '/api/billing/portal', method: 'get' },
    'PatientSummaryController.listPatientSummaries': {
      path: '/api/patient-summaries',
      method: 'get',
    },
    'PatientSummaryController.updatePatientSummary': {
      path: '/api/patient-summaries/{id}',
      method: 'patch',
    },
    'PatientSummaryController.exportPatientSummariesToPDF': {
      path: '/api/patient-summaries/export/pdf',
      method: 'get',
    },
    'PatientIntakeController.getTemplateQuestions': {
      path: '/api/patient-intake/questions',
      method: 'get',
    },
    'PatientIntakeController.submitIntake': { path: '/api/patient-intake', method: 'post' },
    'PatientIntakeController.getSummary': {
      path: '/api/patient-intake/summary/{sessionId}',
      method: 'get',
    },
  };

  decoratorRoutes.forEach((route) => {
    const key = `${route.controllerName}.${route.methodName}`;
    const mapping = routeMapping[key];

    if (!mapping) {
      return;
    }

    const { path, method } = mapping;

    if (!paths[path]) {
      paths[path] = {};
    }

    const operation = {
      summary: route.summary,
      description: route.description,
      tags: route.tags,
      security: route.security,
      responses: route.responses,
    };

    if (route.requestBody) {
      operation.requestBody = route.requestBody;
    }

    const parameters = [];

    if (route.query) {
      Object.entries(route.query).forEach(([name, config]) => {
        parameters.push({
          name,
          in: 'query',
          required: false,
          schema: {
            type: config.type,
            enum: config.enum,
            default: config.default,
          },
          description: config.description,
        });
      });
    }

    if (route.params) {
      Object.entries(route.params).forEach(([name, config]) => {
        parameters.push({
          name,
          in: 'path',
          required: true,
          schema: {
            type: config.type,
            format: config.format,
          },
          description: config.description,
        });
      });
    }

    if (path.includes('{id}') && !route.params) {
      parameters.push({
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description: 'Resource ID',
      });
    }

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    paths[path][method] = operation;
  });

  baseSpec.paths = { ...baseSpec.paths, ...paths };

  return baseSpec;
};

const swaggerSpec = generateSwaggerSpec();

export { swaggerSpec, swaggerUi };
