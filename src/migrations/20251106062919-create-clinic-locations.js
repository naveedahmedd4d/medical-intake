module.exports = {
  up: async (queryInterface, { UUID, UUIDV4, STRING, BOOLEAN, DATE }) => {
    await queryInterface.createTable('ClinicLocations', {
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
        onDelete: 'NO ACTION',
      },
      addressLine1: {
        type: STRING,
        allowNull: false,
      },
      addressLine2: {
        type: STRING,
        allowNull: true,
      },
      city: {
        type: STRING,
        allowNull: false,
      },
      state: {
        type: STRING,
        allowNull: false,
      },
      zipCode: {
        type: STRING,
        allowNull: false,
      },
      phone: {
        type: STRING,
        allowNull: false,
      },
      isPrimary: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      createdAt: {
        allowNull: false,
        type: DATE,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('ClinicLocations');
  },
};
