import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, BOOLEAN, DATE }) => {
  class PasswordReset extends Model {
    static associate(models) {
      PasswordReset.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });
      PasswordReset.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
    }
  }

  PasswordReset.init(
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
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      token: {
        type: STRING,
        allowNull: false,
        unique: true,
      },
      expiresAt: {
        type: DATE,
        allowNull: false,
      },
      used: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      usedAt: {
        type: DATE,
        allowNull: true,
      },
      ipAddress: {
        type: STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'PasswordReset',
      timestamps: true,
      updatedAt: false,
    }
  );
  return PasswordReset;
};
