module.exports = {
  up: async (queryInterface, { STRING }) => {
    await queryInterface.addColumn('Templates', 'description', {
      type: STRING,
      allowNull: true,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('Templates', 'description');
  },
};
