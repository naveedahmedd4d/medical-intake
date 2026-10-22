import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, BOOLEAN, DATE }) => {
  class UserInvitation extends Model {
    static associate(models) {
      UserInvitation.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
      UserInvitation.belongsTo(models.User, {
        foreignKey: 'invitedByUserId',
        as: 'invitedBy',
      });
    }
  }

  UserInvitation.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: false,
      },
      email: {
        type: STRING,
        allowNull: false,
      },
      role: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['provider']],
        },
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
      accepted: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      invitedByUserId: {
        type: UUID,
        allowNull: false,
      },
      acceptedAt: {
        type: DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'UserInvitation',
      timestamps: true,
      updatedAt: false,
    }
  );
  return UserInvitation;
};
