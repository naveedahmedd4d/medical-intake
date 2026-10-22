module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Clinics', 'logoUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Clinics', 'logoUrl');
  },
};
