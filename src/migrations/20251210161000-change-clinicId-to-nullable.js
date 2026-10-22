module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("Templates", "clinicId", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    const [clinics] = await queryInterface.sequelize.query(
      'SELECT id FROM "Clinics" LIMIT 1'
    );

    if (clinics.length > 0) {
      const defaultClinicId = clinics[0].id;
      await queryInterface.sequelize.query(
        `UPDATE "Templates" SET "clinicId" = '${defaultClinicId}' WHERE "clinicId" IS NULL`
      );
    }

    await queryInterface.changeColumn("Templates", "clinicId", {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};
