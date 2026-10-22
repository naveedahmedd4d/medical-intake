import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, TEXT, JSON, BOOLEAN, DATE }) => {
  class PatientSummary extends Model {
    static associate(models) {
      PatientSummary.belongsTo(models.IntakeSession, {
        foreignKey: 'intakeSessionId',
        as: 'intakeSession',
      });
      PatientSummary.belongsTo(models.Provider, {
        foreignKey: 'providerId',
        as: 'provider',
      });
      PatientSummary.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
    }
  }

  PatientSummary.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      intakeSessionId: {
        type: UUID,
        allowNull: false,
        unique: true,
      },
      providerId: {
        type: UUID,
        allowNull: true,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      aiGeneratedSummary: {
        type: TEXT,
        allowNull: false,
      },
      structuredData: {
        type: JSON,
        allowNull: false,
      },
      isArchived: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      generatedAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
      reviewedAt: {
        type: DATE,
        allowNull: true,
      },
      archivedAt: {
        type: DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'PatientSummary',
      timestamps: true,
    }
  );
  return PatientSummary;
};
