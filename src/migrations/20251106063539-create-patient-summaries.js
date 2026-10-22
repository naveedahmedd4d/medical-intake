module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { UUID, UUIDV4, TEXT, BOOLEAN, DATE } = Sequelize;
    await queryInterface.createTable('PatientSummaries', {
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
        references: {
          model: 'IntakeSessions',
          key: 'id',
        },
      },
      providerId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Providers',
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
      aiGeneratedSummary: {
        type: TEXT,
        allowNull: false,
      },
      structuredData: {
        type: TEXT,
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
      createdAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
      updatedAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
    });

    await queryInterface.addIndex('PatientSummaries', ['providerId', 'clinicId', 'isArchived'], {
      name: 'idx_patient_summary_provider_clinic_archived',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeIndex(
      'PatientSummaries',
      'idx_patient_summary_provider_clinic_archived'
    );
    await queryInterface.dropTable('PatientSummaries');
  },
};
