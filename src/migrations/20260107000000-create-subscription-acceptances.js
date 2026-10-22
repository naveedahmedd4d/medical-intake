/**
 * Migration: Create SubscriptionAcceptances Table
 *
 * Creates an immutable, append-only table for legally enforceable subscription
 * agreement acceptance records. Required for compliance with subscription law
 * and audit requirements.
 *
 * IMPORTANT: This table has NO updatedAt field and records CANNOT be updated
 * or deleted after creation.
 */
module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, INTEGER, DECIMAL, DATE, BOOLEAN, TEXT }) => {
    await queryInterface.createTable('SubscriptionAcceptances', {
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
        references: {
          model: 'Clinics',
          key: 'id',
        },
        comment: 'Clinic/Legal Entity accepting the subscription',
      },
      subscriptionId: {
        type: UUID,
        allowNull: true,
        references: {
          model: 'Subscriptions',
          key: 'id',
        },
        comment: 'Associated Subscription record (if created at acceptance time)',
      },
      userId: {
        type: UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id',
        },
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

      // Timestamps
      createdAt: {
        allowNull: false,
        type: DATE,
        comment: 'Record creation timestamp',
      },
      // NOTE: No updatedAt field - records are immutable
    });

    // Add indexes for efficient querying
    await queryInterface.addIndex('SubscriptionAcceptances', ['clinicId'], {
      name: 'idx_subscription_acceptance_clinic_id',
    });

    await queryInterface.addIndex('SubscriptionAcceptances', ['subscriptionId'], {
      name: 'idx_subscription_acceptance_subscription_id',
    });

    await queryInterface.addIndex('SubscriptionAcceptances', ['acceptanceTimestamp'], {
      name: 'idx_subscription_acceptance_timestamp',
    });

    await queryInterface.addIndex('SubscriptionAcceptances', ['signerEmail'], {
      name: 'idx_subscription_acceptance_signer_email',
    });

    await queryInterface.addIndex('SubscriptionAcceptances', ['stripeCheckoutSessionId'], {
      name: 'idx_subscription_acceptance_checkout_session',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable('SubscriptionAcceptances');
  },
};
