import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, JSON, DATE }) => {
  class IntakeResponse extends Model {
    static associate(models) {
      IntakeResponse.belongsTo(models.IntakeSession, {
        foreignKey: 'sessionId',
        as: 'session',
      });
      IntakeResponse.belongsTo(models.TemplateQuestion, {
        foreignKey: 'templateQuestionId',
        as: 'question',
      });
      IntakeResponse.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
    }
  }

  IntakeResponse.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      sessionId: {
        type: UUID,
        allowNull: false,
      },
      templateQuestionId: {
        type: UUID,
        allowNull: false,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      responseData: {
        type: JSON,
        allowNull: false,
      },
      answeredAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
    },
    {
      sequelize,
      modelName: 'IntakeResponse',
      timestamps: false,
    }
  );
  return IntakeResponse;
};
