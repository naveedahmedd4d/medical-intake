'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { UUID, UUIDV4, STRING, INTEGER, DATE, TEXT } = Sequelize;
    await queryInterface.createTable('TemplateVersions', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      templateId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Templates',
          key: 'id',
        },
      },
      versionNumber: {
        type: INTEGER,
        allowNull: false,
      },
      snapshot: {
        type: TEXT,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: DATE,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('TemplateVersions');
  },
};
