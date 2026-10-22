import debugObj from 'debug';
import { Op } from 'sequelize';
import models from '../models';
import { logFailedAttempt } from '../utils/auditHelpers';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../utils/constants';

const debug = debugObj('api:subscription-middleware');
const { Clinic, Subscription } = models;

export const requireActiveSubscription = async (req, res, next) => {
  if (!req.auth) {
    return next();
  }

  const { clinicId, role, email } = req.auth;

  if (role === 'super_admin') {
    return next();
  }

  if (!clinicId) {
    await logFailedAttempt({
      action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
      resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
      email,
      reason: 'Missing clinicId in JWT token',
      req,
      additionalChanges: {
        attemptedPath: req.path,
        attemptedMethod: req.method,
        userRole: role,
      },
    });

    return res.status(403).json({
      status: 'error',
      message: 'Invalid authentication credentials',
      code: 'MISSING_CLINIC_ID',
    });
  }

  try {
    const clinic = await Clinic.findByPk(clinicId, {
      attributes: ['id', 'accountStatus', 'subscriptionStatus'],
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
      await logFailedAttempt({
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
        resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
        email,
        reason: 'Clinic not found',
        req,
        additionalChanges: {
          attemptedPath: req.path,
          attemptedMethod: req.method,
          clinicId,
        },
      });

      return res.status(403).json({
        status: 'error',
        message: 'Clinic not found',
        code: 'CLINIC_NOT_FOUND',
      });
    }

    const subscription = clinic.subscriptions?.[0];
    const hasValidSubscription =
      clinic.accountStatus === 'active' &&
      subscription &&
      ['active', 'trialing'].includes(subscription.status);

    if (!hasValidSubscription) {
      await logFailedAttempt({
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
        resourceType: AUDIT_RESOURCE_TYPES.CLINIC,
        email,
        reason: 'No active subscription',
        req,
        additionalChanges: {
          attemptedPath: req.path,
          attemptedMethod: req.method,
          clinicId,
          accountStatus: clinic.accountStatus,
          subscriptionStatus: subscription?.status || 'none',
        },
      });

      debug(
        'Blocked access for clinic %s: accountStatus=%s, subscriptionStatus=%s',
        clinicId,
        clinic.accountStatus,
        subscription?.status || 'none'
      );

      let message = 'Active subscription required to access this resource';
      let code = 'SUBSCRIPTION_REQUIRED';

      if (clinic.accountStatus === 'pending_payment') {
        message = 'Please complete payment setup to access this resource';
        code = 'PAYMENT_REQUIRED';
      } else if (subscription?.status === 'past_due') {
        message = 'Payment failed. Please update your payment method to continue.';
        code = 'PAYMENT_PAST_DUE';
      } else if (subscription?.status === 'unpaid') {
        message = 'Unpaid invoices found. Please resolve payment issues to continue.';
        code = 'PAYMENT_UNPAID';
      }

      return res.status(402).json({
        status: 'error',
        message,
        code,
        requiresPayment: true,
      });
    }

    req.subscription = subscription;
    req.clinic = clinic;

    return next();
  } catch (error) {
    debug('Subscription middleware error: %O', error);

    return res.status(500).json({
      status: 'error',
      message: 'Failed to validate subscription',
      code: 'SUBSCRIPTION_CHECK_FAILED',
    });
  }
};

export default {
  requireActiveSubscription,
};
