import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING }) => {
  class Provider extends Model {
    static associate(models) {
      Provider.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });
      Provider.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
      Provider.belongsTo(models.Template, {
        foreignKey: 'activeTemplateId',
        as: 'activeTemplate',
      });
      Provider.hasMany(models.IntakeSession, {
        foreignKey: 'providerId',
        as: 'intakeSessions',
      });
      Provider.hasMany(models.PatientSummary, {
        foreignKey: 'providerId',
        as: 'patientSummaries',
      });
    }
  }

  Provider.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      userId: {
        type: UUID,
        allowNull: false,
        unique: true,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      specialty: {
        type: STRING,
        allowNull: true,
      },
      licenseNumber: {
        type: STRING,
        allowNull: true,
      },
      avatarUrl: {
        type: STRING,
        allowNull: true,
      },
      status: {
        type: STRING,
        allowNull: false,
        defaultValue: 'invited',
        validate: {
          isIn: [['invited', 'active']],
        },
      },
      activeTemplateId: {
        type: UUID,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Provider',
      timestamps: true,
      paranoid: true,
    }
  );
  return Provider;
};
