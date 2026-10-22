import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, INTEGER, DATE }) => {
  class Subscription extends Model {
    static associate(models) {
      Subscription.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
      Subscription.hasMany(models.BillingEvent, {
        foreignKey: 'subscriptionId',
        as: 'billingEvents',
      });
    }
  }

  Subscription.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      planType: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['starter', 'professional', 'enterprise', 'graduated']],
        },
      },
      providerCount: {
        type: INTEGER,
        allowNull: false,
      },
      stripeSubscriptionId: {
        type: STRING,
        allowNull: false,
        unique: true,
      },
      stripePriceId: {
        type: STRING,
        allowNull: true,
      },
      status: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [
            [
              'active',
              'trialing',
              'cancelled',
              'past_due',
              'incomplete',
              'incomplete_expired',
              'unpaid',
            ],
          ],
        },
      },
      currentPeriodStart: {
        type: DATE,
        allowNull: false,
      },
      currentPeriodEnd: {
        type: DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'Subscription',
      timestamps: true,
    }
  );
  return Subscription;
};
