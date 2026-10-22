module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create UserRoles table
    await queryInterface.createTable("UserRoles", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      role: {
        type: Sequelize.STRING,
        allowNull: false,
        validate: {
          isIn: [["super_admin", "clinic_admin", "provider"]],
        },
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Add unique constraint to prevent duplicate role assignments
    await queryInterface.addConstraint("UserRoles", {
      fields: ["userId", "role"],
      type: "unique",
      name: "unique_user_role",
    });

    // Migrate existing roles from Users table to UserRoles table
    await queryInterface.sequelize.query(`
      INSERT INTO "UserRoles" (id, "userId", role, "createdAt", "updatedAt")
      SELECT gen_random_uuid(), id, role, NOW(), NOW()
      FROM "Users"
      WHERE role IS NOT NULL AND "deletedAt" IS NULL
    `);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("UserRoles");
  },
};
