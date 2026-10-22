module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn('BillingEvents', 'occurredAt', 'createdAt');
  },

  async down(queryInterface) {
    await queryInterface.renameColumn('BillingEvents', 'createdAt', 'occurredAt');
  },
};
