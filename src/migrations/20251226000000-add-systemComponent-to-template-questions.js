module.exports = {
  up: async (queryInterface, { STRING }) => {
    await queryInterface.addColumn('TemplateQuestions', 'systemComponent', {
      type: STRING,
      allowNull: true,
      comment:
        'Name of system component for questionType: system-component (e.g., multi-area-assessment)',
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('TemplateQuestions', 'systemComponent');
  },
};
