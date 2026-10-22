module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Make providerId nullable in PatientSummaries
    await queryInterface.changeColumn('PatientSummaries', 'providerId', {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert providerId to NOT NULL in PatientSummaries
    await queryInterface.changeColumn('PatientSummaries', 'providerId', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};


