/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('Subscriptions', 'monthlyRatePerProvider');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('Subscriptions', 'monthlyRatePerProvider', {
      type: Sequelize.DECIMAL(6, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },
};
