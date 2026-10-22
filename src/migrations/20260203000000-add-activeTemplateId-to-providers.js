'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn(
      'Providers',
      'activeTemplateId',
      {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Templates',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      }
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Providers', 'activeTemplateId');
  },
};
