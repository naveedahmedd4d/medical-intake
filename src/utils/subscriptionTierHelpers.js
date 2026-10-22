import { SUBSCRIPTION_STATUSES } from './constants';

export const getClinicSubscriptionStatusUpdate = (subscription) => {
  const updateData = {};

  switch (subscription.status) {
    case SUBSCRIPTION_STATUSES.ACTIVE:
      updateData.subscriptionStatus = SUBSCRIPTION_STATUSES.ACTIVE;
      break;

    case SUBSCRIPTION_STATUSES.PAST_DUE:
      updateData.subscriptionStatus = SUBSCRIPTION_STATUSES.PAST_DUE;
      break;

    case SUBSCRIPTION_STATUSES.UNPAID:
      updateData.subscriptionStatus = SUBSCRIPTION_STATUSES.UNPAID;
      break;

    case SUBSCRIPTION_STATUSES.CANCELLED:
      updateData.subscriptionStatus = SUBSCRIPTION_STATUSES.CANCELLED;
      break;

    case SUBSCRIPTION_STATUSES.INCOMPLETE:
    case SUBSCRIPTION_STATUSES.INCOMPLETE_EXPIRED:
      updateData.subscriptionStatus = subscription.status;
      break;

    default:
      break;
  }

  return updateData;
};
