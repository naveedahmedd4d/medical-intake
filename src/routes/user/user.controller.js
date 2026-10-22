import passport from 'passport';
import express from 'express';
import debugObj from 'debug';
import { Op } from 'sequelize';
import models from '../../models';
import { STATUS_CODES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../utils/constants';
import { BadRequest } from '../../error';
import { BadRequestError, generateJWT, getPassportErrorMessage, SuccessResponse } from '../../utils/helper';
import {
  userLoginSchema,
  validateEmailQuerySchema,
  listUsersQuerySchema,
  userIdParamSchema,
  updateUserSchema,
} from './validationSchemas';
import { Request, AuditLog, SwaggerDoc, RequestBodyValidator } from '../../utils/decorators';
import { logFailedAttempt } from '../../utils/auditHelpers';
import { createCheckoutSession } from '../../utils/stripeHelpers';
import stripe from '../../utils/stripe';
import { activateClinicFromCheckoutSession } from '../../utils/activateClinicFromCheckout';
import { getUserByIdQuery, updateUserQuery } from './query';

const debug = debugObj('api:user');
const { User, Clinic, Subscription, sequelize } = models;

class UserController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.post('/login', this.login);
    this.router.post('/dismiss-profile-prompt', this.dismissProfilePrompt);
    this.router.get('/validate-email', this.validateEmail);
    this.router.get('/payment-status', this.getPaymentStatus);
    this.router.get('/', this.listUsers);
    this.router.get('/:id', this.getUserById);
    this.router.put('/:id', this.updateUser);
    this.router.delete('/:id', this.deleteUser);
    return this.router;
  }

  static async generateCheckoutUrl(clinic) {
    const existingSub = await Subscription.findOne({
      where: {
        clinicId: clinic.id,
        status: {
          [Op.ne]: 'cancelled',
        },
      },
    });

    if (existingSub) {
      if (existingSub.status === 'incomplete_expired') {
        debug(
          '⚠️ Found incomplete_expired subscription for clinic %s - this indicates a webhook processing issue. Cleaning up.',
          clinic.id
        );
        await Subscription.destroy({ where: { id: existingSub.id } });
      } else {
        throw new Error('Subscription already exists. Please contact support for billing issues.');
      }
    }

    if (clinic.checkoutSessionId) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(clinic.checkoutSessionId);
        const isSessionValid =
          existingSession.status === 'open' && existingSession.expires_at > Date.now() / 1000;

        if (isSessionValid) {
          return existingSession.url;
        }

        if (existingSession.status === 'complete') {
          // Checkout was completed but webhook may not have run - activate clinic now
          debug(
            'Checkout session %s complete for clinic %s - activating clinic (webhook fallback)',
            clinic.checkoutSessionId,
            clinic.id
          );
          await activateClinicFromCheckoutSession(existingSession);
          return null;
        }

        if (existingSession.status === 'open') {
          await stripe.checkout.sessions.expire(clinic.checkoutSessionId);
        }

        await Clinic.update({ checkoutSessionId: null }, { where: { id: clinic.id } });
      } catch (err) {
        // On any error, clear the checkout session ID to unblock login
        debug('Error checking checkout session: %s, clearing session ID', err.message);
        await Clinic.update({ checkoutSessionId: null }, { where: { id: clinic.id } });
      }
    }

    let trialEndsAt;
    if (clinic.trialEndsAt) {
      trialEndsAt = clinic.trialEndsAt;
    } else {
      trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 2);
      trialEndsAt.setHours(trialEndsAt.getHours() + 1);
    }
    const trialEndTimestamp = Math.floor(trialEndsAt.getTime() / 1000);

    const checkoutSession = await createCheckoutSession({
      stripeCustomerId: clinic.stripeCustomerId,
      planType: clinic.selectedPlan,
      clinicId: clinic.id,
      trialEndTimestamp,
    });

    await Clinic.update({ checkoutSessionId: checkoutSession.id }, { where: { id: clinic.id } });

    return checkoutSession.url;
  }

  @AuditLog({
    action: AUDIT_ACTIONS.USER_LOGIN,
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({ email: result?.email }),
  })
  @Request
  static async performLoginSuccess(req, res, passportUser) {
    // Fetch user roles and provider status
    const userWithRoles = await User.findByPk(passportUser.id, {
      include: [
        {
          model: models.UserRole,
          as: 'roles',
          attributes: ['role'],
        },
        {
          model: models.Provider,
          as: 'provider',
          attributes: ['id', 'status'],
        },
      ],
    });

    const roles = userWithRoles?.roles?.map((r) => r.role) || [passportUser.role];
    const primaryRole = passportUser.role || roles[0]; // Use first role if passportUser.role is undefined

    // First login = never updated since creation (createdAt === updatedAt)
    const createdAt = userWithRoles?.createdAt ? new Date(userWithRoles.createdAt).getTime() : null;
    const updatedAt = userWithRoles?.updatedAt ? new Date(userWithRoles.updatedAt).getTime() : null;
    const isFirstLogin =
      createdAt !== null &&
      updatedAt !== null &&
      Math.abs(createdAt - updatedAt) < 1000;

    const userObj = {
      id: passportUser.id,
      email: passportUser.email,
      name: passportUser.fullName,
      firstName: passportUser.firstName,
      lastName: passportUser.lastName,
      role: primaryRole, // Primary role for backward compatibility
      roles, // All roles
      clinicId: passportUser.clinicId,
      providerId: userWithRoles?.provider?.id,
      providerStatus: userWithRoles?.provider?.status, // Include provider status
      isFirstLogin,
      token: generateJWT({
        id: passportUser.id,
        email: passportUser.email,
        role: primaryRole,
        roles,
        clinicId: passportUser.clinicId,
      }),
    };
    SuccessResponse(res, userObj);
    return passportUser;
  }

  @SwaggerDoc({
    tags: ['Authentication'],
    description: 'Mark profile prompt as dismissed. Updates User.updatedAt so isFirstLogin becomes false on next login.',
    security: [{ bearerAuth: [] }],
  })
  @Request
  static async dismissProfilePrompt(req, res) {
    const userId = req.auth?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    await User.update({ updatedAt: new Date() }, { where: { id: userId } });
    SuccessResponse(res, { dismissed: true });
    return { dismissed: true };
  }

  @SwaggerDoc({
    tags: ['Authentication'],
    description: 'JWT-based authentication with HIPAA audit logging',
    security: [],
  })
  @RequestBodyValidator(userLoginSchema)
  static async login(req, res, next) {
    const { body: user } = req;

    return passport.authenticate('local', { session: false }, async (err, passportUser, info) => {
      if (err) {
        return next(err);
      }

      if (passportUser) {
        if (passportUser.role !== 'super_admin') {
          const userWithClinic = await User.findByPk(passportUser.id, {
            include: [
              {
                model: Clinic,
                as: 'clinic',
                attributes: [
                  'id',
                  'accountStatus',
                  'subscriptionStatus',
                  'selectedPlan',
                  'stripeCustomerId',
                  'checkoutSessionId',
                ],
              },
            ],
          });

          if (userWithClinic?.clinic?.accountStatus === 'pending_payment') {
            try {
              const checkoutUrl = await UserController.generateCheckoutUrl(userWithClinic.clinic);
              if (checkoutUrl === null) {
                const updatedClinic = await Clinic.findByPk(userWithClinic.clinic.id, {
                  attributes: ['accountStatus'],
                });
                if (updatedClinic?.accountStatus === 'active') {
                  return UserController.performLoginSuccess(req, res, passportUser);
                }
              }
              return res.status(402).json({
                status: 'error',
                message: 'Payment required to access account',
                checkoutUrl,
              });
            } catch (error) {
              return res.status(400).json({
                status: 'error',
                message: error.message,
              });
            }
          }

          if (userWithClinic?.clinic?.accountStatus !== 'active') {
            return res.status(403).json({
              status: 'error',
              message: 'Clinic account is not active',
            });
          }
        }

        return UserController.performLoginSuccess(req, res, passportUser);
      }

      await logFailedAttempt({
        action: AUDIT_ACTIONS.FAILED_LOGIN_ATTEMPT,
        resourceType: AUDIT_RESOURCE_TYPES.USER,
        email: user.email,
        reason: 'Invalid credentials',
        req,
      });

      return next(new BadRequest(getPassportErrorMessage(info), STATUS_CODES.INVALID_INPUT));
    })(req, res, next);
  }

  @SwaggerDoc({
    tags: ['Authentication'],
    description:
      'Validate email address availability. Public endpoint to check if an email address already exists in the system.',
    security: [],
    parameters: [
      {
        in: 'query',
        name: 'email',
        required: true,
        schema: {
          type: 'string',
          format: 'email',
        },
        description: 'Email address to validate',
      },
    ],
  })
  @Request
  static async validateEmail(req, res) {
    const { error, value } = validateEmailQuerySchema.validate(req.query);
    if (error) {
      return BadRequestError(
        error.details[0].message,
        STATUS_CODES.INVALID_INPUT
      );
    }

    const { email } = value;

    const duplicateUserConditions = {
      [Op.and]: [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('email')),
          email.toLowerCase()
        ),
      ],
      deletedAt: null,
    };

    const duplicateUser = await User.findOne({
      where: duplicateUserConditions,
      paranoid: true,
    });

    const result = {
      email,
      available: !duplicateUser,
      exists: !!duplicateUser,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ['Authentication'],
    description:
      'Check subscription validity and payment status. Returns requiresPayment flag for access control and additional subscription details.',
  })
  @Request
  static async getPaymentStatus(req, res) {
    const { clinicId, role } = req.auth;

    if (role === 'super_admin') {
      return SuccessResponse(res, {
        requiresPayment: false,
        planType: 'unlimited',
        status: 'super_admin',
      });
    }

    const clinic = await Clinic.findByPk(clinicId, {
      attributes: ['accountStatus', 'subscriptionStatus', 'selectedPlan', 'trialEndsAt'],
      include: [
        {
          model: Subscription,
          as: 'subscriptions',
          where: { status: { [Op.ne]: 'cancelled' } },
          required: false,
          order: [['createdAt', 'DESC']],
          limit: 1,
        },
      ],
    });

    if (!clinic) {
      return SuccessResponse(res, {
        requiresPayment: true,
        warning: 'Clinic not found',
      });
    }

    const subscription = clinic.subscriptions?.[0];
    const subStatus = subscription?.status;

    const hasValidSubscription =
      clinic.accountStatus === 'active' &&
      subscription &&
      ['active', 'trialing'].includes(subStatus);

    let warning = null;
    if (subStatus === 'past_due') {
      warning = 'Payment failed. Please update your payment method to avoid service interruption.';
    } else if (subStatus === 'unpaid') {
      warning = 'Payment overdue. Please resolve payment issues to continue using the platform.';
    } else if (subStatus === 'trialing' && clinic.trialEndsAt) {
      const daysLeft = Math.ceil(
        (new Date(clinic.trialEndsAt) - new Date()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft <= 2 && daysLeft > 0) {
        warning = `Trial ends in ${daysLeft} day${
          daysLeft === 1 ? '' : 's'
        }. Please add payment method.`;
      }
    }

    const response = {
      requiresPayment: !hasValidSubscription,
      planType: subscription?.planType || clinic.selectedPlan,
      status: subStatus || 'none',
      warning,
    };

    if (subStatus === 'trialing') {
      response.trialEndsAt = clinic.trialEndsAt;
    }

    return SuccessResponse(res, response);
  }

  @SwaggerDoc({
    tags: ['Users'],
    description: 'List users with pagination. Super admin sees all; others are clinic-scoped.',
    security: [{ bearerAuth: [] }],
    query: {
      page: { type: 'number', default: 1 },
      pageSize: { type: 'number', default: 10 },
      search: { type: 'string', description: 'Search by name/email' },
      status: { type: 'string' },
      role: { type: 'string' },
    },
  })
  @Request
  @AuditLog({
    action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT, // keep minimal; dedicated action can be added later
    resourceType: AUDIT_RESOURCE_TYPES.USER,
    getResourceId: () => null,
    getChanges: (req, result) => ({
      attemptedPath: req.path,
      attemptedMethod: req.method,
      resultCount: result?.totalRecords || 0,
    }),
  })
  static async listUsers(req, res) {
    const { error, value } = listUsersQuerySchema.validate(req.query, { convert: true });
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const { page, pageSize, search, role } = value;

    const where = {};

    // Multi-tenancy: only super_admin can see all clinics' users
    if (req.auth?.role !== 'super_admin' && req.auth?.clinicId) {
      where.clinicId = req.auth.clinicId;
    }

    if (role) {
      where.role = role;
    }

    if (search) {
      const likeClause = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { email: likeClause },
        sequelize.where(
          sequelize.fn('concat', sequelize.col('firstName'), ' ', sequelize.col('lastName')),
          likeClause
        ),
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      distinct: true,
      attributes: { exclude: ['password'] },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          required: false,
          attributes: ['id', 'clinicName', 'subscriptionStatus', 'accountStatus', 'selectedPlan'],
        },
      ],
      order: [['createdAt', 'DESC']],
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });

    const result = {
      totalRecords: count,
      users: rows,
    };

    SuccessResponse(res, result);
    return result;
  }

  @SwaggerDoc({
    tags: ['Users'],
    description: 'Get user by ID. Super admin can access any user; others are clinic-scoped.',
    security: [{ bearerAuth: [] }],
    params: { id: { type: 'string', format: 'uuid', description: 'User ID' } },
  })
  @Request
  static async getUserById(req, res) {
    const { error } = userIdParamSchema.validate(req.params);
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const user = await User.findOne({
      ...getUserByIdQuery({ id: req.params.id }),
      include: [
        {
          model: Clinic,
          as: 'clinic',
          required: false,
          attributes: ['id', 'clinicName', 'subscriptionStatus', 'accountStatus', 'selectedPlan'],
        },
      ],
    });

    if (!user) {
      return BadRequestError('User not found', STATUS_CODES.NOTFOUND);
    }

    if (req.auth?.role !== 'super_admin') {
      if (!req.auth?.clinicId || user.clinicId !== req.auth.clinicId) {
        return BadRequestError('Access denied', STATUS_CODES.FORBIDDEN);
      }
    }

    SuccessResponse(res, user);
    return user;
  }

  @SwaggerDoc({
    tags: ['Users'],
    description: 'Update user by ID. Super admin can update any user; others are clinic-scoped.',
    security: [{ bearerAuth: [] }],
    params: { id: { type: 'string', format: 'uuid', description: 'User ID' } },
  })
  @Request
  static async updateUser(req, res) {
    const { error: paramError } = userIdParamSchema.validate(req.params);
    if (paramError) {
      return BadRequestError(paramError.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const { error: bodyError, value } = updateUserSchema.validate(req.body, { convert: true });
    if (bodyError) {
      return BadRequestError(bodyError.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return BadRequestError('User not found', STATUS_CODES.NOTFOUND);
    }

    if (req.auth?.role !== 'super_admin') {
      if (!req.auth?.clinicId || user.clinicId !== req.auth.clinicId) {
        return BadRequestError('Access denied', STATUS_CODES.FORBIDDEN);
      }
      // Non-super-admins should never be able to change role/clinicId
      delete value.role;
      delete value.clinicId;
    }

    // Enforce model constraint: super_admin must have clinicId null, others must have clinicId
    if (value.role === 'super_admin') {
      value.clinicId = null;
    }

    await User.update(value, updateUserQuery({ id: user.id }));
    const updated = await User.findOne({
      ...getUserByIdQuery({ id: user.id }),
      include: [
        {
          model: Clinic,
          as: 'clinic',
          required: false,
          attributes: ['id', 'clinicName', 'subscriptionStatus', 'accountStatus', 'selectedPlan'],
        },
      ],
    });

    SuccessResponse(res, updated);
    return updated;
  }

  @SwaggerDoc({
    tags: ['Users'],
    description: 'Delete user by ID (soft delete). Super admin can delete any user; others are clinic-scoped.',
    security: [{ bearerAuth: [] }],
    params: { id: { type: 'string', format: 'uuid', description: 'User ID' } },
  })
  @Request
  static async deleteUser(req, res) {
    const { error } = userIdParamSchema.validate(req.params);
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const user = await User.findByPk(req.params.id);
    if (!user) {
      return BadRequestError('User not found', STATUS_CODES.NOTFOUND);
    }

    if (req.auth?.role !== 'super_admin') {
      if (!req.auth?.clinicId || user.clinicId !== req.auth.clinicId) {
        return BadRequestError('Access denied', STATUS_CODES.FORBIDDEN);
      }
    }

    await user.destroy(); // paranoid: true => soft delete
    SuccessResponse(res, { success: true });
    return { success: true };
  }
}

export default UserController;
