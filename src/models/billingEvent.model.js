import { Model } from 'sequelize';
import { BILLING_EVENT_TYPES } from '../utils/constants';

export default (sequelize, { UUID, UUIDV4, STRING, JSON, DECIMAL }) => {
  class BillingEvent extends Model {
    static associate(models) {
      BillingEvent.belongsTo(models.Subscription, {
        foreignKey: 'subscriptionId',
        as: 'subscription',
      });
      BillingEvent.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
    }
  }

  BillingEvent.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      subscriptionId: {
        type: UUID,
        allowNull: true,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      eventType: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [Object.values(BILLING_EVENT_TYPES)],
        },
      },
      eventData: {
        type: JSON,
        allowNull: false,
      },
      amountChange: {
        type: DECIMAL(8, 2),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'BillingEvent',
      timestamps: true,
      updatedAt: false,
    }
  );
  return BillingEvent;
};
