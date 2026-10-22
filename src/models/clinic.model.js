import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, INTEGER, DATE }) => {
  class Clinic extends Model {
    static associate(models) {
      Clinic.hasMany(models.User, {
        foreignKey: 'clinicId',
        as: 'users',
      });
      Clinic.hasMany(models.Provider, {
        foreignKey: 'clinicId',
        as: 'providers',
      });
      Clinic.hasMany(models.ClinicLocation, {
        foreignKey: 'clinicId',
        as: 'locations',
      });
      Clinic.hasMany(models.Template, {
        foreignKey: 'clinicId',
        as: 'templates',
      });
      Clinic.hasMany(models.IntakeSession, {
        foreignKey: 'clinicId',
        as: 'intakeSessions',
      });
      Clinic.hasMany(models.Subscription, {
        foreignKey: 'clinicId',
        as: 'subscriptions',
      });
      Clinic.hasMany(models.UserInvitation, {
        foreignKey: 'clinicId',
        as: 'userInvitations',
      });
      Clinic.hasMany(models.AuditLog, {
        foreignKey: 'clinicId',
        as: 'auditLogs',
      });
    }
  }

  Clinic.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      clinicName: {
        type: STRING,
        allowNull: false,
      },
      clinicSlug: {
        type: STRING,
        allowNull: true,
        unique: true,
      },
      logoUrl: {
        type: STRING,
        allowNull: true,
      },
      practiceType: {
        type: STRING,
        allowNull: true,
      },
      primaryColor: {
        type: STRING,
        allowNull: true,
      },
      secondaryColor: {
        type: STRING,
        allowNull: true,
      },
      stripeCustomerId: {
        type: STRING,
        allowNull: true,
      },
      subscriptionStatus: {
        type: STRING,
        allowNull: false,
        validate: {
          isIn: [
            [
              'pending_payment',
              'trial',
              'trialing',
              'active',
              'cancelled',
              'past_due',
              'trial_expired',
              'suspended',
            ],
          ],
        },
      },
      accountStatus: {
        type: STRING,
        allowNull: false,
        defaultValue: 'pending_payment',
        validate: {
          isIn: [['pending_payment', 'active', 'suspended', 'deactivated']],
        },
      },
      trialDaysRemaining: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 2,
      },
      trialEndsAt: {
        type: DATE,
        allowNull: true,
      },
      selectedPlan: {
        type: STRING,
        allowNull: true,
        validate: {
          isIn: [['graduated', 'starter', 'professional', 'enterprise']],
        },
      },
      providerCount: {
        type: INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      // checkoutSessionId: {
      //   type: STRING,
      //   allowNull: true,
      // },
    },
    {
      sequelize,
      modelName: 'Clinic',
      timestamps: true,
      paranoid: true,
    }
  );
  return Clinic;
};
