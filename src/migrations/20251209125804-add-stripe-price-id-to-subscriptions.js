export const up = async (queryInterface, Sequelize) => {
  await queryInterface.addColumn('Subscriptions', 'stripePriceId', {
    type: Sequelize.STRING,
    allowNull: true,
  });
};

export const down = async (queryInterface) => {
  await queryInterface.removeColumn('Subscriptions', 'stripePriceId');
};
