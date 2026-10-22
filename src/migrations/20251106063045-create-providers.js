module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, DATE }) => {
    await queryInterface.createTable('Providers', {
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
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      clinicId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      specialty: {
        type: STRING,
        allowNull: true,
      },
      licenseNumber: {
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
      createdAt: {
        allowNull: false,
        type: DATE,
      },
      updatedAt: {
        allowNull: false,
        type: DATE,
      },
      deletedAt: {
        type: DATE,
        allowNull: true,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Providers');
  },
};
