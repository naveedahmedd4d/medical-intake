module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { UUID, UUIDV4, STRING, TEXT, INTEGER, DATE } = Sequelize;
    await queryInterface.createTable('TemplateQuestions', {
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
      questionIdentifier: {
        type: STRING,
        allowNull: false,
      },
      questionText: {
        type: TEXT,
        allowNull: false,
      },
      questionType: {
        type: STRING,
        allowNull: false,
      },
      parentQuestionId: {
        type: UUID,
        allowNull: true,
        references: {
          model: 'TemplateQuestions',
          key: 'id',
        },
      },
      showCondition: {
        type: TEXT,
        allowNull: true,
      },
      options: {
        type: TEXT,
        allowNull: true,
      },
      position: {
        type: INTEGER,
        allowNull: false,
      },
      category: {
        type: STRING,
        allowNull: false,
      },
      createdAt: {
        allowNull: false,
        type: DATE,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('TemplateQuestions');
  },
};
