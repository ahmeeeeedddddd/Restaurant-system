import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const RestaurantConfig = sequelize.define('RestaurantConfig', {
    config_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    restaurant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: {
        model: 'restaurants',
        key: 'restaurant_id'
      },
      onDelete: 'CASCADE'
    },
    payment_gateway: {
      type: DataTypes.STRING(50),
      defaultValue: 'stripe',
      comment: 'stripe, paymob, fawry'
    },
    smtp_host: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    smtp_port: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    smtp_user: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    smtp_password: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Should be encrypted in application'
    },
    receipt_footer_text: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    opening_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    closing_time: {
      type: DataTypes.TIME,
      allowNull: true
    },
    custom_settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'For flexible additional settings'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'restaurant_config',
    timestamps: false,
    hooks: {
      beforeUpdate: (config) => {
        config.updated_at = new Date();
      }
    }
  });

  return RestaurantConfig;
};