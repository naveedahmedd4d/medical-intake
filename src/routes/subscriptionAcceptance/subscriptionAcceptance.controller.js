import express from 'express';
import debugObj from 'debug';
import { Op } from 'sequelize';
import models from '../../models';
import stripe from '../../utils/stripe';
import { STATUS_CODES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../utils/constants';
import { BadRequestError, SuccessResponse } from '../../utils/helper';
import { Request, RequestBodyValidator, AuditLog, SwaggerDoc } from '../../utils/decorators';

const debug = debugObj('api:subscriptionAcceptance');
import {
  createSubscriptionAcceptanceSchema,
  getSubscriptionAcceptancesQuerySchema,
  getSubscriptionAcceptanceParamsSchema,
} from './validationSchemas';

const { SubscriptionAcceptance, Clinic, Subscription, User } = models;

/**
 * SubscriptionAcceptanceController
 *
 * Handles legally enforceable subscription acceptance logging.
 * All acceptance records are immutable and append-only for compliance.
 */
class SubscriptionAcceptanceController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.post('/', this.createSubscriptionAcceptance);
    this.router.get('/', this.getSubscriptionAcceptances);
    this.router.get('/by-session/:sessionId', this.getByCheckoutSession);
    this.router.get('/:id', this.getSubscriptionAcceptanceById);
    return this.router;
  }

  /**
   * Create Subscription Acceptance Record
   *
   * Records a legally binding acceptance of subscription terms.
   * This endpoint MUST be called before or during checkout completion.
   *
   * IMPORTANT: Records are immutable and cannot be updated or deleted.
   */
  @SwaggerDoc({
    tags: ['Subscription Acceptance'],
    description:
      'Create an immutable subscription acceptance record for legal compliance. Required before subscription activation.',
    security: [],
  })
  @RequestBodyValidator(createSubscriptionAcceptanceSchema)
  @AuditLog({
    action: AUDIT_ACTIONS.SUBSCRIPTION_ACCEPTANCE_CREATED,
    resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION_ACCEPTANCE,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({
      legalEntityName: req.body?.legalEntityName,
      signerName: req.body?.signerName,
      signerEmail: req.body?.signerEmail,
      pricingTier: req.body?.pricingTier,
      totalSubscriptionPrice: req.body?.totalSubscriptionPrice,
      acceptanceId: result?.id,
    }),
  })
  @Request
  static async createSubscriptionAcceptance(req, res) {
    const {
      legalEntityName,
      signerName,
      signerEmail,
      signerTitle,
      pricingTier,
      providerCount,
      pricePerProvider,
      totalSubscriptionPrice,
      billingFrequency,
      subscriptionStartDate,
      termsAccepted,
      clinicId,
      subscriptionId,
      userId,
      termsVersion,
      agreementVersion,
      stripeCheckoutSessionId,
      stripeCustomerId,
    } = req.body;

    // Validate that termsAccepted is explicitly true
    if (termsAccepted !== true) {
      return BadRequestError(
        'Terms of Service and Subscription Agreement must be explicitly accepted',
        STATUS_CODES.INVALID_INPUT
      );
    }

    // Validate pricing tier and provider count match
    const tierValidation = validatePricingTier(pricingTier, providerCount);
    if (!tierValidation.valid) {
      return BadRequestError(tierValidation.error, STATUS_CODES.INVALID_INPUT);
    }

    // If clinicId provided, verify it exists
    console.log('clinicId:', clinicId);
    if (clinicId) {
      const clinic = await Clinic.findByPk(clinicId);
      if (!clinic) {
        return BadRequestError('Clinic not found', STATUS_CODES.NOTFOUND);
      }
    }

    // If subscriptionId provided, verify it exists
    if (subscriptionId) {
      const subscription = await Subscription.findByPk(subscriptionId);
      if (!subscription) {
        return BadRequestError('Subscription not found', STATUS_CODES.NOTFOUND);
      }
    }

    // Capture server-side metadata
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip;
    const userAgent = req.headers['user-agent'];
    const acceptanceTimestamp = new Date(); // Server-side timestamp (UTC)

    // Create immutable acceptance record
    const acceptanceRecord = await SubscriptionAcceptance.create({
      // Foreign keys
      clinicId: clinicId || null,
      subscriptionId: subscriptionId || null,
      userId: userId || req.auth?.id || null,

      // Customer information
      legalEntityName,
      signerName,
      signerEmail,
      signerTitle,

      // Pricing snapshot
      pricingTier,
      providerCount,
      pricePerProvider,
      totalSubscriptionPrice,
      billingFrequency,

      // Subscription terms
      subscriptionStartDate,

      // Consent
      termsAccepted,
      acceptanceTimestamp,

      // Technical metadata
      ipAddress,
      userAgent,

      // Document versions
      termsVersion: termsVersion || process.env.TERMS_VERSION || '1.0',
      agreementVersion: agreementVersion || process.env.AGREEMENT_VERSION || '1.0',

      // Stripe integration
      stripeCheckoutSessionId: stripeCheckoutSessionId || null,
      stripeCustomerId: stripeCustomerId || null,
    });

    SuccessResponse(res, {
      id: acceptanceRecord.id,
      acceptanceTimestamp: acceptanceRecord.acceptanceTimestamp,
      message: 'Subscription acceptance recorded successfully',
    });

    return acceptanceRecord;
  }

  /**
   * Get Subscription Acceptance Records
   *
   * Retrieve acceptance records with filtering and pagination.
   * Supports filtering by clinic, subscription, email, and date range.
   */
  @SwaggerDoc({
    tags: ['Subscription Acceptance'],
    description:
      'Retrieve subscription acceptance records with optional filtering by clinic, subscription, email, or date range.',
  })
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_SUBSCRIPTION_ACCEPTANCES,
    resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION_ACCEPTANCE,
    getResourceId: () => null,
    getChanges: (req) => ({
      filters: {
        clinicId: req.query?.clinicId,
        subscriptionId: req.query?.subscriptionId,
        signerEmail: req.query?.signerEmail,
        startDate: req.query?.startDate,
        endDate: req.query?.endDate,
      },
    }),
  })
  @Request
  static async getSubscriptionAcceptances(req, res) {
    // Validate query parameters
    const { error, value } = getSubscriptionAcceptancesQuerySchema.validate(req.query);
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const {
      clinicId,
      subscriptionId,
      signerEmail,
      startDate,
      endDate,
      page,
      pageSize,
      sortColumn,
      sortOrder,
    } = value;

    // Build where clause
    const where = {};

    // Apply multi-tenancy: non-super_admin users can only see their own clinic's records
    if (req.auth.role !== 'super_admin') {
      where.clinicId = req.auth.clinicId;
    } else if (clinicId) {
      where.clinicId = clinicId;
    }

    if (subscriptionId) {
      where.subscriptionId = subscriptionId;
    }

    if (signerEmail) {
      where.signerEmail = { [Op.like]: `%${signerEmail}%` };
    }

    if (startDate || endDate) {
      where.acceptanceTimestamp = {};
      if (startDate) {
        where.acceptanceTimestamp[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        where.acceptanceTimestamp[Op.lte] = new Date(endDate);
      }
    }

    // Calculate pagination
    const offset = (page - 1) * pageSize;

    // Fetch records
    const { count, rows } = await SubscriptionAcceptance.findAndCountAll({
      where,
      limit: pageSize,
      offset,
      order: [[sortColumn, sortOrder]],
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'clinicName'],
        },
        {
          model: Subscription,
          as: 'subscription',
          attributes: ['id', 'stripeSubscriptionId', 'status'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
      ],
    });

    SuccessResponse(res, {
      totalRecords: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
      acceptances: rows,
    });

    return { totalRecords: count, acceptances: rows };
  }

  /**
   * Get Single Subscription Acceptance Record by ID
   *
   * Retrieve a specific acceptance record by its ID.
   */
  @SwaggerDoc({
    tags: ['Subscription Acceptance'],
    description: 'Retrieve a specific subscription acceptance record by ID.',
  })
  @AuditLog({
    action: AUDIT_ACTIONS.VIEW_SUBSCRIPTION_ACCEPTANCE,
    resourceType: AUDIT_RESOURCE_TYPES.SUBSCRIPTION_ACCEPTANCE,
    getResourceId: (result) => result?.id,
    getChanges: (req, result) => ({
      acceptanceId: req.params?.id,
      legalEntityName: result?.legalEntityName,
    }),
  })
  @Request
  static async getSubscriptionAcceptanceById(req, res) {
    // Validate params
    const { error } = getSubscriptionAcceptanceParamsSchema.validate(req.params);
    if (error) {
      return BadRequestError(error.details[0].message, STATUS_CODES.INVALID_INPUT);
    }

    const { id } = req.params;

    // Build where clause with multi-tenancy
    const where = { id };
    if (req.auth.role !== 'super_admin') {
      where.clinicId = req.auth.clinicId;
    }

    const acceptanceRecord = await SubscriptionAcceptance.findOne({
      where,
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'clinicName', 'practiceType'],
        },
        {
          model: Subscription,
          as: 'subscription',
          attributes: ['id', 'stripeSubscriptionId', 'status', 'planType'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'email', 'firstName', 'lastName'],
        },
      ],
    });

    if (!acceptanceRecord) {
      return BadRequestError('Subscription acceptance record not found', STATUS_CODES.NOTFOUND);
    }

    SuccessResponse(res, { acceptance: acceptanceRecord });
    return acceptanceRecord;
  }

  /**
   * Get Subscription Acceptance by Checkout Session ID
   *
   * Public endpoint to retrieve acceptance record after successful checkout.
   * Used by the subscription agreement page before user signs in.
   */
  @SwaggerDoc({
    tags: ['Subscription Acceptance'],
    description:
      'Retrieve subscription acceptance record by Stripe checkout session ID. Public endpoint for post-checkout agreement page.',
    security: [],
  })
  static async getByCheckoutSession(req, res) {
    const { sessionId } = req.params;

    if (!sessionId) {
      return BadRequestError('Checkout session ID is required', STATUS_CODES.INVALID_INPUT);
    }

    const acceptanceRecord = await SubscriptionAcceptance.findOne({
      where: { stripeCheckoutSessionId: sessionId },
      include: [
        {
          model: Clinic,
          as: 'clinic',
          attributes: ['id', 'clinicName', 'practiceType'],
        },
        {
          model: Subscription,
          as: 'subscription',
          attributes: ['id', 'stripeSubscriptionId', 'status', 'planType'],
        },
      ],
    });

    if (!acceptanceRecord) {
      return BadRequestError(
        'Subscription acceptance record not found for this checkout session',
        STATUS_CODES.NOTFOUND
      );
    }

    let stripeCheckoutDetails = null;
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['total_details', 'invoice'],
      });
      let amountTotal = session.amount_total;
      let amountSubtotal = session.amount_subtotal;
      let amountDiscount = 0;
      const currency = session.currency || 'usd';

      if (amountTotal == null && session.mode === 'subscription' && session.invoice) {
        const invoice =
          typeof session.invoice === 'object'
            ? session.invoice
            : await stripe.invoices.retrieve(session.invoice);
        amountTotal = invoice.amount_paid ?? invoice.total ?? invoice.amount_due;
        amountSubtotal = invoice.subtotal ?? amountTotal;
        if (invoice.total_discount_amounts?.length) {
          amountDiscount = invoice.total_discount_amounts.reduce(
            (sum, d) => sum + (d.amount || 0),
            0
          );
        } else if (amountSubtotal != null && amountTotal != null) {
          amountDiscount = Math.max(0, amountSubtotal - amountTotal);
        }
      } else if (session.total_details?.amount_discount != null) {
        amountDiscount = session.total_details.amount_discount;
      } else if (Array.isArray(session.total_details?.breakdown?.discounts)) {
        amountDiscount = session.total_details.breakdown.discounts.reduce(
          (sum, d) => sum + (d.amount || 0),
          0
        );
      }

      if (amountTotal != null) {
        stripeCheckoutDetails = {
          amountTotal: amountTotal / 100,
          amountSubtotal: amountSubtotal != null ? amountSubtotal / 100 : null,
          amountDiscount: amountDiscount / 100,
          currency,
        };
      }
    } catch (err) {
      debug('Could not fetch Stripe session for checkout details: %s', err.message);
    }

    const response = {
      acceptance: acceptanceRecord,
      ...(stripeCheckoutDetails && { stripeCheckoutDetails }),
    };

    SuccessResponse(res, response);
    return acceptanceRecord;
  }
}

/**
 * Helper function to validate pricing tier against provider count
 */
function validatePricingTier(pricingTier, providerCount) {
  const tierRules = {
    starter: { min: 1, max: 10 },
    professional: { min: 11, max: 50 },
    enterprise: { min: 51, max: Infinity },
    graduated: { min: 1, max: Infinity },
  };

  const rules = tierRules[pricingTier];
  if (!rules) {
    return { valid: false, error: 'Invalid pricing tier' };
  }

  if (providerCount < rules.min || providerCount > rules.max) {
    return {
      valid: false,
      error: `Pricing tier '${pricingTier}' requires ${rules.min}-${
        rules.max === Infinity ? 'unlimited' : rules.max
      } providers`,
    };
  }

  return { valid: true };
}

export default SubscriptionAcceptanceController;
