import debugObj from 'debug';
import stripe from './stripe';
import models from '../models';
import { SUBSCRIPTION_STATUSES, BILLING_EVENT_TYPES } from './constants';

const debug = debugObj('api:subscription-quantity');
const { Subscription, Clinic, BillingEvent } = models;

/**
 * Get active subscription for a clinic
 * @param {string} clinicId - The clinic UUID
 * @returns {Promise<Object|null>} Subscription object with Stripe subscription item ID
 */
export const getActiveSubscription = async (clinicId) => {
  const subscription = await Subscription.findOne({
    where: {
      clinicId,
      status: SUBSCRIPTION_STATUSES.ACTIVE,
    },
    include: [
      {
        model: Clinic,
        as: 'clinic',
        attributes: ['stripeCustomerId'],
      },
    ],
  });

  if (!subscription) {
    return null;
  }

  // Retrieve Stripe subscription to get the subscription item ID
  const stripeSubscription = await stripe.subscriptions.retrieve(
    subscription.stripeSubscriptionId,
    {
      expand: ['items.data'],
    }
  );

  if (!stripeSubscription.items.data || stripeSubscription.items.data.length === 0) {
    throw new Error(
      `No subscription items found for Stripe subscription ${subscription.stripeSubscriptionId}`
    );
  }

  return {
    ...subscription.toJSON(),
    stripeSubscriptionItemId: stripeSubscription.items.data[0].id,
    stripeSubscription,
  };
};

/**
 * Update subscription quantity in Stripe
 * @param {string} clinicId - The clinic UUID
 * @param {number} newQuantity - New provider count
 * @param {Object} options - Additional options
 * @param {string} options.reason - Reason for quantity change (for logging)
 * @param {Object} options.transaction - Sequelize transaction (optional)
 * @returns {Promise<Object>} Updated subscription details
 */
export const updateSubscriptionQuantity = async (clinicId, newQuantity, options = {}) => {
  const { reason = 'Provider count changed', transaction = null } = options;

  debug(
    'Updating subscription quantity for clinic %s to %d (reason: %s)',
    clinicId,
    newQuantity,
    reason
  );

  // Get active subscription
  const subscriptionData = await getActiveSubscription(clinicId);

  if (!subscriptionData) {
    debug('⚠️ No active subscription found for clinic %s', clinicId);
    throw new Error(`No active subscription found for clinic ${clinicId}`);
  }

  const { stripeSubscriptionId, stripeSubscriptionItemId, stripeSubscription } = subscriptionData;
  const oldQuantity = stripeSubscription.items.data[0].quantity;

  // Skip if quantity hasn't changed
  if (oldQuantity === newQuantity) {
    debug('Quantity unchanged (%d), skipping Stripe update', newQuantity);
    return {
      success: true,
      quantityChanged: false,
      oldQuantity,
      newQuantity,
    };
  }

  try {
    // Update Stripe subscription quantity
    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [
        {
          id: stripeSubscriptionItemId,
          quantity: newQuantity,
        },
      ],
      proration_behavior: 'create_prorations',
      metadata: {
        ...stripeSubscription.metadata,
        lastQuantityUpdate: new Date().toISOString(),
        quantityUpdateReason: reason,
      },
    });

    debug(
      '✅ Stripe subscription %s quantity updated: %d → %d (tiered pricing applies automatically)',
      stripeSubscriptionId,
      oldQuantity,
      newQuantity
    );

    await Subscription.update(
      {
        providerCount: newQuantity,
      },
      {
        where: { id: subscriptionData.id },
        transaction,
      }
    );

    debug('✅ Local subscription record updated with providerCount: %d', newQuantity);

    // Log billing event
    const eventData = {
      stripeSubscriptionId,
      stripeSubscriptionItemId,
      oldQuantity,
      newQuantity,
      quantityChange: newQuantity - oldQuantity,
      reason,
      prorationCreated: true,
      timestamp: new Date().toISOString(),
      note: 'Stripe automatically applies tiered pricing based on quantity',
    };

    await BillingEvent.create(
      {
        clinicId,
        subscriptionId: subscriptionData.id,
        eventType:
          newQuantity > oldQuantity
            ? BILLING_EVENT_TYPES.PROVIDER_ADDED
            : BILLING_EVENT_TYPES.PROVIDER_REMOVED,
        eventData: JSON.stringify(eventData),
      },
      { transaction }
    );

    return {
      success: true,
      quantityChanged: true,
      oldQuantity,
      newQuantity,
      quantityChange: newQuantity - oldQuantity,
      updatedSubscription,
    };
  } catch (error) {
    debug(
      '❌ Failed to update Stripe subscription quantity for clinic %s: %s',
      clinicId,
      error.message
    );

    // Log failure event
    try {
      await BillingEvent.create(
        {
          clinicId,
          subscriptionId: subscriptionData.id,
          eventType: BILLING_EVENT_TYPES.WEBHOOK_PROCESSING_FAILED,
          eventData: JSON.stringify({
            error: error.message,
            attemptedQuantity: newQuantity,
            oldQuantity,
            reason,
            stack: error.stack,
          }),
        },
        { transaction }
      );
    } catch (logError) {
      debug('Failed to log billing event error: %s', logError.message);
    }

    throw error;
  }
};

/**
 * Sync subscription quantity from Stripe to database
 * Called by webhook handlers when subscription is updated
 * @param {string} stripeSubscriptionId - Stripe subscription ID
 * @param {number} newQuantity - New quantity from Stripe
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<void>}
 */
export const syncSubscriptionQuantityFromStripe = async (
  stripeSubscriptionId,
  newQuantity,
  transaction
) => {
  debug('Syncing subscription quantity from Stripe: %s → %d', stripeSubscriptionId, newQuantity);

  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId },
    transaction,
  });

  if (!subscription) {
    debug('⚠️ Subscription not found for Stripe ID: %s', stripeSubscriptionId);
    return;
  }

  const clinic = await Clinic.findByPk(subscription.clinicId, { transaction });

  if (!clinic) {
    debug('⚠️ Clinic not found for subscription: %s', subscription.id);
    return;
  }

  // Update subscription record
  await subscription.update(
    {
      providerCount: newQuantity,
    },
    { transaction }
  );

  // Update clinic provider count if different
  if (clinic.providerCount !== newQuantity) {
    debug(
      'Syncing clinic provider count: %d → %d (clinic: %s)',
      clinic.providerCount,
      newQuantity,
      clinic.id
    );

    await clinic.update(
      {
        providerCount: newQuantity,
      },
      { transaction }
    );
  }

  debug('✅ Subscription quantity synced successfully');
};

/**
 * Reconcile provider count between database and Stripe
 * Useful for fixing discrepancies
 * @param {string} clinicId - The clinic UUID
 * @param {boolean} dryRun - If true, only report differences without updating
 * @returns {Promise<Object>} Reconciliation result
 */
export const reconcileSubscriptionQuantity = async (clinicId, dryRun = false) => {
  debug('Reconciling subscription quantity for clinic %s (dryRun: %s)', clinicId, dryRun);

  const clinic = await Clinic.findByPk(clinicId);

  if (!clinic) {
    throw new Error(`Clinic ${clinicId} not found`);
  }

  const subscriptionData = await getActiveSubscription(clinicId);

  if (!subscriptionData) {
    return {
      success: false,
      error: 'No active subscription found',
      clinicId,
    };
  }

  const { stripeSubscription } = subscriptionData;
  const stripeQuantity = stripeSubscription.items.data[0].quantity;
  const dbQuantity = clinic.providerCount || 0;

  const result = {
    clinicId,
    clinicName: clinic.clinicName,
    stripeSubscriptionId: subscriptionData.stripeSubscriptionId,
    stripeQuantity,
    dbQuantity,
    difference: stripeQuantity - dbQuantity,
    needsReconciliation: stripeQuantity !== dbQuantity,
    dryRun,
  };

  if (result.needsReconciliation) {
    debug(
      '⚠️ Quantity mismatch detected: Stripe=%d, DB=%d (difference: %d)',
      stripeQuantity,
      dbQuantity,
      result.difference
    );

    if (!dryRun) {
      // Update Stripe to match database (database is source of truth)
      await updateSubscriptionQuantity(clinicId, dbQuantity, {
        reason: 'Reconciliation: syncing Stripe with database',
      });

      result.reconciled = true;
      result.action = 'Updated Stripe to match database';
      debug('✅ Reconciliation complete: Stripe updated to %d', dbQuantity);
    } else {
      result.reconciled = false;
      result.action = 'Dry run - no changes made';
      debug('Dry run complete - no changes made');
    }
  } else {
    debug('✅ Quantities already in sync: %d', stripeQuantity);
    result.reconciled = true;
    result.action = 'No reconciliation needed';
  }

  return result;
};

/**
 * Bulk reconcile all subscriptions
 * @param {boolean} dryRun - If true, only report differences without updating
 * @returns {Promise<Array>} Array of reconciliation results
 */
export const reconcileAllSubscriptions = async (dryRun = false) => {
  debug('Starting bulk reconciliation (dryRun: %s)', dryRun);

  const subscriptions = await Subscription.findAll({
    where: {
      status: SUBSCRIPTION_STATUSES.ACTIVE,
    },
    include: [
      {
        model: Clinic,
        as: 'clinic',
        attributes: ['id', 'clinicName', 'providerCount'],
      },
    ],
  });

  debug('Found %d active subscriptions to reconcile', subscriptions.length);

  // Process reconciliations in parallel to avoid await-in-loop
  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const result = await reconcileSubscriptionQuantity(subscription.clinicId, dryRun);
        return result;
      } catch (error) {
        debug('❌ Failed to reconcile clinic %s: %s', subscription.clinicId, error.message);
        return {
          clinicId: subscription.clinicId,
          success: false,
          error: error.message,
        };
      }
    })
  );

  const summary = {
    total: results.length,
    inSync: results.filter((r) => !r.needsReconciliation).length,
    needsReconciliation: results.filter((r) => r.needsReconciliation).length,
    reconciled: results.filter((r) => r.reconciled).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };

  debug('Bulk reconciliation complete: %o', {
    total: summary.total,
    inSync: summary.inSync,
    needsReconciliation: summary.needsReconciliation,
    reconciled: summary.reconciled,
    failed: summary.failed,
  });

  return summary;
};
