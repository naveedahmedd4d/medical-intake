module.exports = {
  up: async (queryInterface, { BOOLEAN }) => {
    await queryInterface.addColumn('Templates', 'isActive', {
      type: BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn('Templates', 'isActive');
  },
};
