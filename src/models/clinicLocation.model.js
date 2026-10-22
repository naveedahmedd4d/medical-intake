import { Model } from 'sequelize';

export default (sequelize, { UUID, UUIDV4, STRING, BOOLEAN }) => {
  class ClinicLocation extends Model {
    static associate(models) {
      ClinicLocation.belongsTo(models.Clinic, {
        foreignKey: 'clinicId',
        as: 'clinic',
      });
    }
  }

  ClinicLocation.init(
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
      addressLine1: {
        type: STRING,
        allowNull: false,
      },
      addressLine2: {
        type: STRING,
        allowNull: true,
      },
      city: {
        type: STRING,
        allowNull: false,
      },
      state: {
        type: STRING,
        allowNull: false,
      },
      zipCode: {
        type: STRING,
        allowNull: false,
      },
      phone: {
        type: STRING,
        allowNull: false,
      },
      isPrimary: {
        type: BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      sequelize,
      modelName: 'ClinicLocation',
      timestamps: true,
      updatedAt: false,
    }
  );
  return ClinicLocation;
};
