import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, JSON }) => {
  class AuditLog extends Model {
    static associate(models) {
      AuditLog.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });
      AuditLog.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
    }
  }

  AuditLog.init(
    {
      id: {
        allowNull: false,
        primaryKey: true,
        type: UUID,
        defaultValue: UUIDV4,
      },
      userId: {
        type: UUID,
        allowNull: true,
      },
      clinicId: {
        type: UUID,
        allowNull: true,
      },
      action: {
        type: STRING(100),
        allowNull: false,
      },
      resourceType: {
        type: STRING(100),
        allowNull: false,
      },
      resourceId: {
        type: UUID,
        allowNull: true,
      },
      changes: {
        type: JSON,
        allowNull: true,
      },
      ipAddress: {
        type: STRING,
        allowNull: true,
      },
      userAgent: {
        type: STRING,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      timestamps: true,
      updatedAt: false,
    }
  );
  return AuditLog;
};
