import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, INTEGER, DATE, JSON }) => {
  class TemplateVersion extends Model {
    static associate(models) {
      TemplateVersion.belongsTo(models.Template, {
        foreignKey: 'templateId',
        as: 'template',
      });
    }
  }

  TemplateVersion.init(
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
      versionNumber: {
        type: INTEGER,
        allowNull: false,
      },
      snapshot: {
        type: JSON,
        allowNull: false,
      },
      createdAt: {
        type: DATE,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'TemplateVersion',
      timestamps: true,
      updatedAt: false,
    }
  );
  return TemplateVersion;
};
