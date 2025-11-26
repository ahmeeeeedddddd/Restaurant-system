import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Restaurant = sequelize.define('Restaurant', {
    restaurant_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    slug: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        isLowercase: true,
        is: /^[a-z0-9-]+$/i // URL-friendly
      }
    },
    logo_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    primary_color: {
      type: DataTypes.STRING(7),
      defaultValue: '#000000',
      validate: {
        is: /^#[0-9A-F]{6}$/i // Hex color format
      }
    },
    contact_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    contact_phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      defaultValue: 'Egypt'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'EGP'
    },
    tax_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      validate: {
        min: 0,
        max: 100
      }
    },
    service_charge_rate: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.00,
      validate: {
        min: 0,
        max: 100
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
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
    tableName: 'restaurants',
    timestamps: false,
    indexes: [
      { fields: ['slug'] },
      { fields: ['is_active'] }
    ],
    hooks: {
      beforeUpdate: (restaurant) => {
        restaurant.updated_at = new Date();
      }
    }
  });

  return Restaurant;
};