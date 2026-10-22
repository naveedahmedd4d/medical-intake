module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, BOOLEAN, DATE }) => {
    await queryInterface.createTable('Templates', {
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
      name: {
        type: STRING,
        allowNull: false,
      },
      isDefault: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
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
    await queryInterface.dropTable('Templates');
  },
};
