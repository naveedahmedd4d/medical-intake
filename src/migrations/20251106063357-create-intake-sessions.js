module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { UUID, UUIDV4, STRING, BOOLEAN, DATEONLY, DATE, TEXT } = Sequelize;
    await queryInterface.createTable('IntakeSessions', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      templateId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Templates',
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
      isDeleted: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
      deletedAt: {
        type: DATE,
        allowNull: true,
      },
      metadata: {
        type: TEXT,
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
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('IntakeSessions');
  },
};
