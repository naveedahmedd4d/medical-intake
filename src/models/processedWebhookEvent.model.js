import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, DATE }) => {
  class ProcessedWebhookEvent extends Model {
    static associate(models) {
      ProcessedWebhookEvent.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
    }
  }

  ProcessedWebhookEvent.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      stripeEventId: {
        type: STRING,
        allowNull: false,
        unique: true,
      },
      eventType: {
        type: STRING,
        allowNull: false,
      },
      clinicId: {
        type: UUID,
        allowNull: true,
      },
      processedAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
    },
    {
      sequelize,
      modelName: 'ProcessedWebhookEvent',
      timestamps: true,
      updatedAt: false,
    }
  );
  return ProcessedWebhookEvent;
};
