/* eslint-disable prettier/prettier */
import debug from 'debug';
import j2s from 'joi-to-swagger';
import { BadRequestError, getErrorMessages } from './helper';
import { STATUS_CODES } from './constants';
import models from '../models';

const log = debug('api:decorators:audit');
const swaggerMetadata = new Map();

const Request = (target, key, descriptor) => {
  const controllerFunc = descriptor.value;
  // eslint-disable-next-line no-param-reassign
  descriptor.value = async (...args) => {
    try {
      const result = await controllerFunc.apply(this, args);
      return result;
    } catch (error) {
      const [, , next] = args;
      next(error);
    }
  };
  return descriptor;
};

const RequestBodyValidator = (schema) => {
  const actualDecorator = (target, key, descriptor) => {
    const controllerFunc = descriptor.value;
    const controllerName = target.name || target.constructor.name;
    const metadataKey = `${controllerName}.${key}`;
    if (!swaggerMetadata.has(metadataKey)) {
      swaggerMetadata.set(metadataKey, {});
    }
    const metadata = swaggerMetadata.get(metadataKey);
    metadata.requestSchema = schema;
    metadata.methodName = key;
    metadata.controllerName = controllerName;
    // eslint-disable-next-line no-param-reassign
    descriptor.value = (...args) => {
      const [req] = args;
      const result = schema.validate(req.body);
      if (result.error) {
        return BadRequestError(getErrorMessages(result), STATUS_CODES.INVALID_INPUT);
      }
      return controllerFunc.apply(target, args);
    };
    return descriptor;
  };
  return actualDecorator;
};

const AuditLog = (config) => {
  const actualDecorator = (target, key, descriptor) => {
    const controllerFunc = descriptor.value;
    // eslint-disable-next-line no-param-reassign
    descriptor.value = async (...args) => {
      const [req, res] = args;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const userAgent = req.get('user-agent');
      const userId = req.auth?.id || null;
      const clinicId = req.auth?.clinicId || null;

      const result = await controllerFunc.apply(target, args);

      try {
        const { AuditLog: AuditLogModel } = models;

        let resourceId = null;
        try {
          resourceId = config.getResourceId ? config.getResourceId(result, req, res) : null;
        } catch (resourceIdError) {
          log('getResourceId failed: %O', resourceIdError);
        }

        let changes = {};
        try {
          changes = config.getChanges ? config.getChanges(req, result, res) : {};
        } catch (changesError) {
          log('getChanges failed: %O', changesError);
        }

        await AuditLogModel.create({
          userId,
          clinicId,
          action: config.action,
          resourceType: config.resourceType,
          resourceId,
          ipAddress,
          userAgent,
          changes: {
            ...changes,
            timestamp: new Date(),
          },
        });
      } catch (auditError) {
        log('Audit log creation failed for %s: %s', config.action, auditError.message);
      }

      return result;
    };
    return descriptor;
  };
  return actualDecorator;
};

const SwaggerDoc = (config = {}) => {
  const actualDecorator = (target, key, descriptor) => {
    const controllerName = target.name || target.constructor.name;
    const metadataKey = `${controllerName}.${key}`;
    if (!swaggerMetadata.has(metadataKey)) {
      swaggerMetadata.set(metadataKey, {});
    }
    const metadata = swaggerMetadata.get(metadataKey);
    Object.assign(metadata, config);
    metadata.methodName = key;
    metadata.controllerName = controllerName;
    return descriptor;
  };
  return actualDecorator;
};

const getSwaggerMetadata = () => {
  const routes = [];
  swaggerMetadata.forEach((metadata) => {
    const requestSwagger = metadata.requestSchema ? j2s(metadata.requestSchema).swagger : null;
    routes.push({
      summary: metadata.summary,
      description: metadata.description || '',
      tags: metadata.tags,
      query: metadata.query,
      params: metadata.params,
      requestBody:
        metadata.requestBody ||
        (requestSwagger
          ? {
            required: true,
            content: {
              'application/json': {
                schema: requestSwagger,
              },
            },
          }
          : null),
      responses: metadata.responses || {
        200: { description: 'Success' },
        400: {
          description: 'Bad Request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        404: {
          description: 'Not Found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        422: {
          description: 'Validation Error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        500: {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
      security: metadata.security !== undefined ? metadata.security : [{ bearerAuth: [] }],
      methodName: metadata.methodName,
      controllerName: metadata.controllerName,
    });
  });
  return routes;
};

export { Request, RequestBodyValidator, AuditLog, SwaggerDoc, getSwaggerMetadata };
