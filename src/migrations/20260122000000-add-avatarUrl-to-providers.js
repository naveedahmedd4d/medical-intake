module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Providers', 'avatarUrl', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Providers', 'avatarUrl');
  },
};
