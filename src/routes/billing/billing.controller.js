import express from 'express';
import models from '../../models';
import { STATUS_CODES, AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../utils/constants';
import { BadRequestError, SuccessResponse } from '../../utils/helper';
import { Request, AuditLog, SwaggerDoc } from '../../utils/decorators';
import stripe from '../../utils/stripe';

const { Clinic } = models;

class BillingController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.get('/portal', this.getCustomerPortal);
    return this.router;
  }

  @SwaggerDoc({
    tags: ['Billing'],
    description:
      'Get Stripe Customer Portal URL for managing subscription, payment methods, and invoices.',
  })
  @AuditLog({
    action: AUDIT_ACTIONS.ACCESS_BILLING_PORTAL,
    resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
    getResourceId: () => null,
    getChanges: (req, result) => ({
      clinicId: req.auth?.clinicId,
      portalUrl: result?.portalUrl,
    }),
  })
  @Request
  static async getCustomerPortal(req, res) {
    const clinic = await Clinic.findByPk(req.auth.clinicId);
    if (!clinic) {
      return BadRequestError('Clinic not found', STATUS_CODES.NOTFOUND);
    }

    if (!clinic.stripeCustomerId) {
      return BadRequestError(
        'No Stripe customer found for this clinic',
        STATUS_CODES.INVALID_INPUT
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: clinic.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/clinic-admin/profile`,
    });

    SuccessResponse(res, { portalUrl: portalSession.url });
    return { portalUrl: portalSession.url };
  }
}

export default BillingController;
