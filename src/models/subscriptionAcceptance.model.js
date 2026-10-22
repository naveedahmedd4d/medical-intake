import { Model } from 'sequelize';

/**
 * SubscriptionAcceptance Model
 *
 * Immutable record of subscription agreement acceptance for legal compliance.
 * Records cannot be updated or deleted after creation (append-only).
 *
 * Required for:
 * - Legal enforceability of subscription agreements
 * - Audit trails for compliance
 * - Dispute resolution
 */
export default (sequelize, { UUID, UUIDV4, STRING, INTEGER, DECIMAL, DATE, BOOLEAN, TEXT }) => {
  class SubscriptionAcceptance extends Model {
    static associate(models) {
      SubscriptionAcceptance.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
      SubscriptionAcceptance.belongsTo(models.Subscription, {
        foreignKey: 'subscriptionId',
        as: 'subscription',
      });
      SubscriptionAcceptance.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });
    }
  }

  SubscriptionAcceptance.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      // Foreign Keys
      clinicId: {
        type: UUID,
        allowNull: true,
        comment: 'Clinic/Legal Entity accepting the subscription',
      },
      subscriptionId: {
        type: UUID,
        allowNull: true,
        comment: 'Associated Subscription record (if created at acceptance time)',
      },
      userId: {
        type: UUID,
        allowNull: true,
        comment: 'User who performed the acceptance (if authenticated)',
      },

      // Customer Information (Required)
      legalEntityName: {
        type: STRING(255),
        allowNull: false,
        comment: 'Legal business/practice name',
      },
      signerName: {
        type: STRING(255),
        allowNull: false,
        comment: 'Full name of person signing the agreement',
      },
      signerEmail: {
        type: STRING(255),
        allowNull: false,
        validate: {
          isEmail: true,
        },
        comment: 'Email address of the signer',
      },
      signerTitle: {
        type: STRING(100),
        allowNull: false,
        comment: 'Job title/role of the signer (e.g., Owner, CEO, Practice Manager)',
      },

      // Pricing Details (Snapshot at time of acceptance)
      pricingTier: {
        type: STRING(50),
        allowNull: false,
        validate: {
          isIn: [['starter', 'professional', 'enterprise', 'graduated']],
        },
        comment: 'Subscription tier at time of acceptance',
      },
      providerCount: {
        type: INTEGER,
        allowNull: false,
        comment: 'Number of providers included in subscription',
      },
      pricePerProvider: {
        type: DECIMAL(8, 2),
        allowNull: false,
        comment: 'Price per provider at time of acceptance',
      },
      totalSubscriptionPrice: {
        type: DECIMAL(10, 2),
        allowNull: false,
        comment: 'Total recurring subscription fee',
      },
      billingFrequency: {
        type: STRING(20),
        allowNull: false,
        validate: {
          isIn: [['monthly', 'annual']],
        },
        comment: 'Billing frequency (monthly or annual)',
      },

      // Subscription Terms
      subscriptionStartDate: {
        type: DATE,
        allowNull: false,
        comment: 'Effective start date of the subscription',
      },

      // Consent & Acceptance
      termsAccepted: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
        validate: {
          isTrue(value) {
            if (value !== true) {
              throw new Error('Terms must be explicitly accepted');
            }
          },
        },
        comment:
          'Explicit confirmation that Terms of Service and Subscription Agreement were accepted',
      },
      acceptanceTimestamp: {
        type: DATE,
        allowNull: false,
        comment: 'Exact UTC timestamp when acceptance was recorded (server-side)',
      },

      // Technical Metadata for Legal Verification
      ipAddress: {
        type: STRING(45),
        allowNull: true,
        comment: 'IP address of the accepting party (IPv4 or IPv6)',
      },
      userAgent: {
        type: TEXT,
        allowNull: true,
        comment: 'Browser/client user agent string',
      },

      // Document Version Tracking
      termsVersion: {
        type: STRING(50),
        allowNull: true,
        comment: 'Version identifier of Terms of Service at time of acceptance',
      },
      agreementVersion: {
        type: STRING(50),
        allowNull: true,
        comment: 'Version identifier of Subscription Agreement at time of acceptance',
      },

      // Stripe Integration
      stripeCheckoutSessionId: {
        type: STRING(255),
        allowNull: true,
        comment: 'Stripe Checkout Session ID if payment initiated',
      },
      stripeCustomerId: {
        type: STRING(255),
        allowNull: true,
        comment: 'Stripe Customer ID',
      },
    },
    {
      sequelize,
      modelName: 'SubscriptionAcceptance',
      tableName: 'SubscriptionAcceptances',
      timestamps: true,
      updatedAt: false, // No updates allowed - immutable record
      paranoid: false, // No soft deletes - records must never be deleted
      hooks: {
        // Prevent any updates after creation
        beforeUpdate: () => {
          throw new Error('SubscriptionAcceptance records are immutable and cannot be updated');
        },
        // Prevent deletion
        beforeDestroy: () => {
          throw new Error('SubscriptionAcceptance records cannot be deleted');
        },
      },
      indexes: [
        {
          fields: ['clinicId'],
          name: 'idx_subscription_acceptance_clinic_id',
        },
        {
          fields: ['subscriptionId'],
          name: 'idx_subscription_acceptance_subscription_id',
        },
        {
          fields: ['acceptanceTimestamp'],
          name: 'idx_subscription_acceptance_timestamp',
        },
        {
          fields: ['signerEmail'],
          name: 'idx_subscription_acceptance_signer_email',
        },
        {
          fields: ['stripeCheckoutSessionId'],
          name: 'idx_subscription_acceptance_checkout_session',
        },
      ],
    }
  );

  return SubscriptionAcceptance;
};
