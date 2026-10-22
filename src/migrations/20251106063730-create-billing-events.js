module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { UUID, UUIDV4, STRING, DECIMAL, DATE, TEXT } = Sequelize;
    await queryInterface.createTable('BillingEvents', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      subscriptionId: {
        type: UUID,
        allowNull: true,
        references: {
          model: 'Subscriptions',
          key: 'id',
        },
      },
      clinicId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      eventType: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [
            [
              'subscription_created',
              'provider_added',
              'provider_removed',
              'payment_succeeded',
              'payment_failed',
            ],
          ],
        },
      },
      eventData: {
        type: TEXT,
        allowNull: false,
      },
      amountChange: {
        type: DECIMAL(8, 2),
        allowNull: true,
      },
      occurredAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('BillingEvents');
  },
};
