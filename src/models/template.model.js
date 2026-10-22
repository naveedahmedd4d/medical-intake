import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, BOOLEAN }) => {
  class Template extends Model {
    static associate(models) {
      Template.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
      Template.hasMany(models.TemplateQuestion, {
        foreignKey: 'templateId',
        as: 'questions',
      });
      Template.hasMany(models.IntakeSession, {
        foreignKey: 'templateId',
        as: 'intakeSessions',
      });
      Template.hasMany(models.TemplateVersion, {
        foreignKey: 'templateId',
        as: 'versions',
      });
    }
  }

  Template.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: true,
      },
      name: {
        type: STRING,
        allowNull: false,
      },
      description: {
        type: STRING,
        allowNull: true,
      },
      isDefault: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      isActive: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'Template',
      timestamps: true,
      paranoid: true,
    }
  );
  return Template;
};
