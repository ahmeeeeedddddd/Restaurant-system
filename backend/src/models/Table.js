import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Table = sequelize.define('Table', {
    table_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    restaurant_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'restaurants',
        key: 'restaurant_id'
      },
      onDelete: 'CASCADE'
    },
    table_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    qr_code: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    qr_image_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    capacity: {
      type: DataTypes.INTEGER,
      defaultValue: 4,
      validate: {
        min: 1
      }
    },
    status: {
      type: DataTypes.ENUM('available', 'occupied', 'reserved', 'maintenance'),
      defaultValue: 'available'
    },
    location: {
      type: DataTypes.STRING(100),
      allowNull: true
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
    tableName: 'tables',
    timestamps: false,
    indexes: [
      { fields: ['restaurant_id'] },
      { fields: ['qr_code'] },
      { fields: ['status'] },
      { 
        unique: true, 
        fields: ['restaurant_id', 'table_number'],
        name: 'unique_table_number_per_restaurant'
      }
    ],
    hooks: {
      beforeUpdate: (table) => {
        table.updated_at = new Date();
      }
    }
  });

  return Table;
};