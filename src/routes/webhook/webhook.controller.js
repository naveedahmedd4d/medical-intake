import express from 'express';
import debugObj from 'debug';
import models from '../../models';
import stripe from '../../utils/stripe';
import { SuccessResponse } from '../../utils/helper';
import { getClinicSubscriptionStatusUpdate } from '../../utils/subscriptionTierHelpers';
import { syncSubscriptionQuantityFromStripe } from '../../utils/subscriptionQuantityManager';
import { BILLING_EVENT_TYPES } from '../../utils/constants';
import { activateClinicFromCheckoutSession } from '../../utils/activateClinicFromCheckout';

const debug = debugObj('api:webhook');
const { Clinic, Subscription, BillingEvent, ProcessedWebhookEvent, sequelize } = models;

class WebhookController {
  static router;

  static getRouter() {
    this.router = express.Router();
    this.router.post(
      '/stripe',
      express.raw({ type: 'application/json' }),
      this.handleStripeWebhook
    );
    return this.router;
  }

  static async handleStripeWebhook(req, res) {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      debug('Webhook signature verification failed: %s', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
      await WebhookController.processEvent(event);
      return SuccessResponse(res, { received: true });
    } catch (error) {
      debug('Webhook processing error for %s: %s', event.type, error.message);

      try {
        await BillingEvent.create({
          clinicId: event.data?.object?.metadata?.clinicId || null,
          eventType: BILLING_EVENT_TYPES.WEBHOOK_PROCESSING_FAILED,
          eventData: JSON.stringify({
            error: error.message,
            stack: error.stack,
            eventType: event.type,
            eventId: event.id,
            stripeCustomerId: event.data?.object?.customer || null,
          }),
        });
      } catch (logError) {
        debug('Failed to log webhook error: %s', logError.message);
      }

      return res.status(200).json({
        status: 'error',
        message: 'Webhook processing failed',
        received: true,
      });
    }
  }

  static async processEvent(event) {
    const alreadyProcessed = await ProcessedWebhookEvent.findOne({
      where: { stripeEventId: event.id },
    });

    if (alreadyProcessed) {
      return;
    }

    const allowedEvents = [
      'checkout.session.completed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.paid',
      'invoice.payment_failed',
    ];

    if (!allowedEvents.includes(event.type)) {
      return;
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookController.handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.updated':
        await WebhookController.handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await WebhookController.handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await WebhookController.handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await WebhookController.handlePaymentFailed(event.data.object);
        break;

      default:
        break;
    }

    let clinicId = event.data?.object?.metadata?.clinicId || null;

    if (!clinicId && event.type.startsWith('invoice.')) {
      clinicId =
        event.data?.object?.lines?.data?.[0]?.metadata?.clinicId ||
        event.data?.object?.subscription_details?.metadata?.clinicId ||
        null;
    }

    await ProcessedWebhookEvent.create({
      stripeEventId: event.id,
      eventType: event.type,
      clinicId,
      processedAt: new Date(),
    });
  }

  static async handleCheckoutCompleted(session) {
    await activateClinicFromCheckoutSession(session);
  }

  static async handleSubscriptionUpdate(subscription) {
    const { clinicId } = subscription.metadata;
    const existingSub = await Subscription.findOne({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (!existingSub) {
      return;
    }

    const transaction = await sequelize.transaction();

    try {
      const clinic = await Clinic.findOne({
        where: {
          id: clinicId,
          stripeCustomerId: subscription.customer,
        },
      });

      if (!clinic) {
        throw new Error(
          `Clinic ${clinicId} not found or does not own Stripe customer ${subscription.customer}`
        );
      }

      const priceId = subscription.items.data[0].price.id;
      const oldQuantity = existingSub.providerCount || 0;

      // Get quantity from Stripe subscription
      const stripeQuantity = subscription.items.data[0].quantity || clinic.providerCount || 0;
      const quantityChanged = oldQuantity !== stripeQuantity;

      // Sync quantity from Stripe to database
      await syncSubscriptionQuantityFromStripe(subscription.id, stripeQuantity, transaction);

      const updateData = {
        status: subscription.status,
        planType: 'graduated', // Single graduated pricing plan
        stripePriceId: priceId,
        providerCount: stripeQuantity,
      };

      if (subscription.current_period_start) {
        updateData.currentPeriodStart = new Date(subscription.current_period_start * 1000);
      }

      if (subscription.current_period_end) {
        updateData.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      }

      await Subscription.update(updateData, {
        where: { stripeSubscriptionId: subscription.id },
        transaction,
      });

      const clinicUpdateData = getClinicSubscriptionStatusUpdate(subscription);

      if (Object.keys(clinicUpdateData).length > 0) {
        await Clinic.update(clinicUpdateData, {
          where: { id: clinicId },
          transaction,
        });
      }

      if (quantityChanged) {
        debug(
          '✅ Provider count changed: %d → %d for clinic %s (subscription: %s)',
          oldQuantity,
          stripeQuantity,
          clinicId,
          subscription.id
        );

        await BillingEvent.create(
          {
            clinicId,
            eventType:
              stripeQuantity > oldQuantity
                ? BILLING_EVENT_TYPES.PROVIDER_ADDED
                : BILLING_EVENT_TYPES.PROVIDER_REMOVED,
            eventData: JSON.stringify({
              subscriptionId: subscription.id,
              status: subscription.status,
              oldQuantity,
              newQuantity: stripeQuantity,
              quantityChange: stripeQuantity - oldQuantity,
              pricingModel: 'graduated',
              note: 'Stripe automatically applies tiered pricing',
            }),
          },
          { transaction }
        );
      } else {
        debug(
          '✅ Subscription updated: %s for clinic %s (status: %s)',
          subscription.id,
          clinicId,
          subscription.status
        );

        await BillingEvent.create(
          {
            clinicId,
            eventType: BILLING_EVENT_TYPES.SUBSCRIPTION_UPDATED,
            eventData: JSON.stringify({
              subscriptionId: subscription.id,
              status: subscription.status,
              providerCount: stripeQuantity,
              pricingModel: 'graduated',
            }),
          },
          { transaction }
        );
      }

      await transaction.commit();
    } catch (error) {
      if (transaction && !transaction.finished) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          debug('Transaction rollback failed: %s', rollbackError.message);
        }
      }
      throw error;
    }
  }

  static async handleSubscriptionDeleted(subscription) {
    const { clinicId } = subscription.metadata;
    const transaction = await sequelize.transaction();

    try {
      const clinic = await Clinic.findOne({
        where: {
          id: clinicId,
          stripeCustomerId: subscription.customer,
        },
      });

      if (!clinic) {
        throw new Error(
          `Clinic ${clinicId} not found or does not own Stripe customer ${subscription.customer}`
        );
      }

      await Clinic.update(
        { subscriptionStatus: 'cancelled', accountStatus: 'suspended' },
        { where: { id: clinicId }, transaction }
      );

      await Subscription.update(
        { status: 'cancelled' },
        { where: { stripeSubscriptionId: subscription.id }, transaction }
      );

      await BillingEvent.create(
        {
          clinicId,
          eventType: BILLING_EVENT_TYPES.SUBSCRIPTION_CANCELLED,
          eventData: JSON.stringify({ subscriptionId: subscription.id }),
        },
        { transaction }
      );

      debug('✅ Subscription cancelled: %s for clinic %s', subscription.id, clinicId);

      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  static async handleInvoicePaid(invoice) {
    const subscriptionId =
      invoice.subscription || invoice.parent?.subscription_details?.subscription;

    if (!subscriptionId) {
      debug('⚠️ Invoice has no subscription ID: %s', invoice.id);
      return;
    }

    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (!subscription) {
      debug(
        '⚠️ Subscription not found for invoice: %s (subscription: %s). This may occur if invoice.paid fires before checkout.session.completed. Will be processed when subscription is created.',
        invoice.id,
        subscriptionId
      );
      // Don't return - still log the billing event if we can find the clinic
      // Try to find clinic from invoice metadata
      const clinicId =
        invoice.lines?.data?.[0]?.metadata?.clinicId || invoice.metadata?.clinicId || null;

      if (clinicId) {
        await BillingEvent.create({
          clinicId,
          eventType: BILLING_EVENT_TYPES.PAYMENT_SUCCEEDED,
          eventData: JSON.stringify({
            invoiceId: invoice.id,
            amountPaid: invoice.amount_paid / 100,
            subscriptionId,
            note: 'Subscription record not yet created - will be linked when subscription is created',
          }),
          amountChange: invoice.amount_paid / 100,
        });
        debug(
          '📝 Billing event logged for clinic %s (subscription will be linked later)',
          clinicId
        );
      }
      return;
    }

    await BillingEvent.create({
      clinicId: subscription.clinicId,
      subscriptionId: subscription.id,
      eventType: BILLING_EVENT_TYPES.PAYMENT_SUCCEEDED,
      eventData: JSON.stringify({
        invoiceId: invoice.id,
        amountPaid: invoice.amount_paid / 100,
      }),
      amountChange: invoice.amount_paid / 100,
    });

    debug(
      '✅ Payment succeeded: $%s for clinic %s (invoice: %s)',
      (invoice.amount_paid / 100).toFixed(2),
      subscription.clinicId,
      invoice.id
    );

    const clinic = await Clinic.findByPk(subscription.clinicId);
    if (clinic && clinic.subscriptionStatus === 'past_due') {
      await Clinic.update(
        { subscriptionStatus: 'active' },
        { where: { id: subscription.clinicId } }
      );
    }
  }

  static async handlePaymentFailed(invoice) {
    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId: invoice.subscription },
    });

    if (!subscription) {
      return;
    }

    const transaction = await sequelize.transaction();

    try {
      await Clinic.update(
        { subscriptionStatus: 'past_due' },
        { where: { id: subscription.clinicId }, transaction }
      );

      await BillingEvent.create(
        {
          clinicId: subscription.clinicId,
          subscriptionId: subscription.id,
          eventType: BILLING_EVENT_TYPES.PAYMENT_FAILED,
          eventData: JSON.stringify({
            invoiceId: invoice.id,
            attemptedAmount: invoice.amount_due / 100,
          }),
        },
        { transaction }
      );

      debug(
        '❌ Payment failed: $%s for clinic %s (invoice: %s) - marked as past_due',
        (invoice.amount_due / 100).toFixed(2),
        subscription.clinicId,
        invoice.id
      );

      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }
  }
}

export default WebhookController;
