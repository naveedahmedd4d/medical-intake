module.exports = {
  up: async (queryInterface, Sequelize) => {
    const { UUID, UUIDV4, DATE, TEXT } = Sequelize;
    await queryInterface.createTable('IntakeResponses', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      sessionId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'IntakeSessions',
          key: 'id',
        },
      },
      templateQuestionId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'TemplateQuestions',
          key: 'id',
        },
      },
      clinicId: {
        type: UUID,
        allowNull: false,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      responseData: {
        type: TEXT,
        allowNull: false,
      },
      answeredAt: {
        type: DATE,
        allowNull: false,
        defaultValue: DATE,
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('IntakeResponses');
  },
};
