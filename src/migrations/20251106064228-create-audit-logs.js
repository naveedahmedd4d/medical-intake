module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { UUID, UUIDV4, STRING, DATE, TEXT } = Sequelize;
    await queryInterface.createTable('AuditLogs', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      userId: {
        type: UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id',
        },
      },
      clinicId: {
        type: UUID,
        allowNull: true,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      action: {
        type: STRING(100),
        allowNull: false,
      },
      resourceType: {
        type: STRING(100),
        allowNull: false,
      },
      resourceId: {
        type: UUID,
        allowNull: true,
      },
      changes: {
        type: TEXT,
        allowNull: true,
      },
      ipAddress: {
        type: STRING,
        allowNull: true,
      },
      userAgent: {
        type: STRING,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: DATE,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('AuditLogs');
  },
};
