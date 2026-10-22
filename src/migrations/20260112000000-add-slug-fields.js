module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Clinics', 'clinicSlug', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });

    await queryInterface.addColumn('Users', 'providerSlug', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Clinics', 'clinicSlug');
    await queryInterface.removeColumn('Users', 'providerSlug');
  },
};
