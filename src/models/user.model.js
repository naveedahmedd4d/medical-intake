import { Model } from 'sequelize';

export default (sequelize, { STRING, UUID, UUIDV4, VIRTUAL }) => {
  class User extends Model {
    static associate(models) {
      User.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
      User.hasOne(models.Provider, {
        foreignKey: 'userId',
        as: 'provider',
        onDelete: 'CASCADE',
      });
      User.hasMany(models.UserInvitation, {
        foreignKey: 'invitedByUserId',
        as: 'sentInvitations',
      });
      User.hasMany(models.PasswordReset, {
        foreignKey: 'userId',
        as: 'passwordResets',
        onDelete: 'CASCADE',
      });
      User.hasMany(models.AuditLog, {
        foreignKey: 'userId',
        as: 'auditLogs',
      });
      User.hasMany(models.UserRole, {
        foreignKey: 'userId',
        as: 'roles',
      });
    }

    // Helper method to check if user has a specific role
    async hasRole(roleName) {
      const roles = await this.getRoles();
      return roles.some((role) => role.role === roleName);
    }

    // Helper method to get all role names
    async getRoleNames() {
      const roles = await this.getRoles();
      return roles.map((role) => role.role);
    }
  }

  User.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicId: {
        type: UUID,
        allowNull: true,
      },
      email: {
        type: STRING,
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      password: {
        type: STRING,
        allowNull: false,
      },
      role: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [['super_admin', 'clinic_admin', 'provider']],
        },
      },
      firstName: {
        type: STRING,
        allowNull: false,
      },
      lastName: {
        type: STRING,
        allowNull: false,
      },
      phone: {
        type: STRING,
        allowNull: true,
      },
      providerSlug: {
        type: STRING,
        allowNull: true,
        unique: true,
      },
      fullName: {
        type: VIRTUAL,
        get() {
          return `${this.firstName} ${this.lastName}`;
        },
        set() {
          throw new Error('Do not try to set the `fullName` value!');
        },
      },
    },
    {
      sequelize,
      modelName: 'User',
      timestamps: true,
      paranoid: true,
      validate: {
        superAdminClinicCheck() {
          if (this.role === 'super_admin' && this.clinicId !== null) {
            throw new Error('super_admin users cannot have a clinicId');
          }
          if (this.role !== 'super_admin' && this.clinicId === null) {
            throw new Error('Non super_admin users must have a clinicId');
          }
        },
      },
    }
  );
  return User;
};
