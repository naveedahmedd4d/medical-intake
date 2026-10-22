module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, INTEGER, DATE }) => {
    await queryInterface.createTable('Clinics', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicName: {
        type: STRING,
        allowNull: false,
      },
      practiceType: {
        type: STRING,
        allowNull: true,
      },
      primaryColor: {
        type: STRING,
        allowNull: true,
      },
      secondaryColor: {
        type: STRING,
        allowNull: true,
      },
      stripeCustomerId: {
        type: STRING,
        allowNull: true,
      },
      subscriptionStatus: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['trial', 'active', 'cancelled', 'past_due', 'trial_expired', 'suspended']],
        },
      },
      accountStatus: {
        type: STRING,
        allowNull: false,
        defaultValue: 'pending_payment',
        validate: {
          isIn: [['pending_payment', 'active', 'suspended', 'deactivated']],
        },
      },
      trialDaysRemaining: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 2,
      },
      trialEndsAt: {
        type: DATE,
        allowNull: true,
      },
      selectedPlan: {
        type: STRING,
        allowNull: true,
        validate: {
          isIn: [['starter', 'professional', 'enterprise']],
        },
      },
      providerCount: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      createdAt: {
        allowNull: false,
        type: DATE,
      },
      updatedAt: {
        allowNull: false,
        type: DATE,
      },
      deletedAt: {
        type: DATE,
        allowNull: true,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Clinics');
  },
};
