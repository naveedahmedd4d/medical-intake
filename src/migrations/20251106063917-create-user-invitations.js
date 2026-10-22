module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, BOOLEAN, DATE }) => {
    await queryInterface.createTable('UserInvitations', {
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
      email: {
        type: STRING,
        allowNull: false,
      },
      role: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['provider']],
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
      accepted: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      invitedByUserId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id',
        },
      },
      acceptedAt: {
        type: DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: DATE,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('UserInvitations');
  },
};
