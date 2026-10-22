module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Clinics', 'checkoutSessionId', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Clinics', 'checkoutSessionId');
  },
};
