module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, INTEGER, DECIMAL, DATE }) => {
    await queryInterface.createTable('Subscriptions', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      planType: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['starter', 'professional', 'enterprise']],
        },
      },
      providerCount: {
        type: INTEGER,
        allowNull: false,
      },
      monthlyRatePerProvider: {
        type: DECIMAL(6, 2),
        allowNull: false,
      },
      stripeSubscriptionId: {
        type: STRING,
        allowNull: false,
        unique: true,
      },
      status: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['active', 'cancelled', 'past_due']],
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
      createdAt: {
        allowNull: false,
        type: DATE,
      },
      updatedAt: {
        allowNull: false,
        type: DATE,
      },
    });

    await queryInterface.addIndex('Subscriptions', ['clinicId', 'status'], {
      name: 'unique_active_subscription',
      unique: true,
      where: {
        status: 'active',
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Subscriptions');
  },
};
