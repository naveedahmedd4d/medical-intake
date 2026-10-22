import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING }) => {
  class UserRole extends Model {
    static associate(models) {
      UserRole.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });
    }
  }

  UserRole.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      userId: {
        type: UUID,
        allowNull: false,
      },
      role: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['super_admin', 'clinic_admin', 'provider']],
        },
      },
    },
    {
      sequelize,
      modelName: 'UserRole',
      tableName: 'UserRoles',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['userId', 'role'],
          name: 'unique_user_role',
        },
      ],
    }
  );

  return UserRole;
};
