import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, JSON, DATEONLY, DATE }) => {
  class IntakeSession extends Model {
    static associate(models) {
      IntakeSession.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
      IntakeSession.belongsTo(models.Template, {
        foreignKey: 'templateId',
        as: 'template',
      });
      IntakeSession.belongsTo(models.Provider, {
        foreignKey: 'providerId',
        as: 'provider',
      });
      IntakeSession.hasMany(models.IntakeResponse, {
        foreignKey: 'sessionId',
        as: 'responses',
      });
      IntakeSession.hasOne(models.PatientSummary, {
        foreignKey: 'intakeSessionId',
        as: 'patientSummary',
      });
    }
  }

  IntakeSession.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      templateId: {
        type: UUID,
        allowNull: false,
      },
      providerId: {
        type: UUID,
        allowNull: true,
      },
      patientIdentifier: {
        type: STRING,
        allowNull: false,
      },
      patientName: {
        type: STRING,
        allowNull: false,
      },
      dateOfBirth: {
        type: DATEONLY,
        allowNull: false,
      },
      phoneNumber: {
        type: STRING,
        allowNull: false,
      },
      appointmentDate: {
        type: DATEONLY,
        allowNull: false,
      },
      gender: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['male', 'female', 'other', 'prefer_not_to_say']],
        },
      },
      status: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['in_progress', 'completed', 'abandoned']],
        },
      },
      startedAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
      completedAt: {
        type: DATE,
        allowNull: true,
      },
      metadata: {
        type: JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'IntakeSession',
      timestamps: true,
      paranoid: true,
    }
  );
  return IntakeSession;
};
