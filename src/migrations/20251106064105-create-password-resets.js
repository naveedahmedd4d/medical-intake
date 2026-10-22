module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, BOOLEAN, DATE }) => {
    await queryInterface.createTable('PasswordResets', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      userId: {
        type: UUID,
        allowNull: false,
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
      token: {
        type: STRING,
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DATE,
        allowNull: false,
      },
      used: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      usedAt: {
        type: DATE,
        allowNull: true,
      },
      ipAddress: {
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
    await queryInterface.dropTable('PasswordResets');
  },
};
