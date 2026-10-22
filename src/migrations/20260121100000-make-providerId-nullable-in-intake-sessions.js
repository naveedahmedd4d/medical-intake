module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Make providerId nullable in IntakeSessions
    await queryInterface.changeColumn('IntakeSessions', 'providerId', {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert providerId to NOT NULL in IntakeSessions
    await queryInterface.changeColumn('IntakeSessions', 'providerId', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};


