export default {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ProcessedWebhookEvents', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
      },
      stripeEventId: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      eventType: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      clinicId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Clinics',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      processedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });

    await queryInterface.addIndex('ProcessedWebhookEvents', ['stripeEventId'], {
      unique: true,
      name: 'processed_webhook_events_stripe_event_id_unique',
    });

    await queryInterface.addIndex('ProcessedWebhookEvents', ['clinicId'], {
      name: 'processed_webhook_events_clinic_id_index',
    });

    await queryInterface.addIndex('ProcessedWebhookEvents', ['processedAt'], {
      name: 'processed_webhook_events_processed_at_index',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ProcessedWebhookEvents');
  },
};
