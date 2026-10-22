import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, TEXT, JSON, INTEGER }) => {
  class TemplateQuestion extends Model {
    static associate(models) {
      TemplateQuestion.belongsTo(models.Template, {
        foreignKey: 'templateId',
        as: 'template',
      });
      TemplateQuestion.belongsTo(models.TemplateQuestion, {
        foreignKey: 'parentQuestionId',
        as: 'parentQuestion',
      });
      TemplateQuestion.hasMany(models.TemplateQuestion, {
        foreignKey: 'parentQuestionId',
        as: 'childQuestions',
      });
      TemplateQuestion.hasMany(models.IntakeResponse, {
        foreignKey: 'templateQuestionId',
        as: 'responses',
      });
    }
  }

  TemplateQuestion.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      templateId: {
        type: UUID,
        allowNull: false,
      },
      questionIdentifier: {
        type: STRING,
        allowNull: false,
      },
      questionText: {
        type: TEXT,
        allowNull: false,
      },
      questionType: {
        type: STRING,
        allowNull: false,
      },
      parentQuestionId: {
        type: UUID,
        allowNull: true,
      },
      showCondition: {
        type: JSON,
        allowNull: true,
      },
      options: {
        type: JSON,
        allowNull: true,
      },
      position: {
        type: INTEGER,
        allowNull: false,
      },
      category: {
        type: STRING,
        allowNull: false,
      },
      systemComponent: {
        type: STRING,
        allowNull: true,
        comment:
          'Name of system component for questionType: system-component (e.g., multi-area-assessment)',
      },
    },
    {
      sequelize,
      modelName: 'TemplateQuestion',
      timestamps: true,
      updatedAt: false,
    }
  );
  return TemplateQuestion;
};
