module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, DATE }) => {
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: true,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      email: {
        type: STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: STRING,
        allowNull: false,
      },
      role: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['super_admin', 'clinic_admin', 'provider']],
        },
      },
      firstName: {
        type: STRING,
        allowNull: false,
      },
      lastName: {
        type: STRING,
        allowNull: false,
      },
      phone: {
        type: STRING,
        allowNull: true,
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
    await queryInterface.dropTable('Users');
  },
};
