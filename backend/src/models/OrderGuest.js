import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const OrderGuest = sequelize.define('OrderGuest', {
    guest_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    order_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'orders',
        key: 'order_id'
      },
      onDelete: 'CASCADE'
    },
    guest_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true
      },
      comment: 'e.g., "Ahmed", "Omar", "Mohamed"'
    },
    session_token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'Unique token per guest/device'
    },
    device_info: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User agent (optional)'
    },
    joined_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'order_guests',
    timestamps: false,
    indexes: [
      { fields: ['order_id'] },
      { fields: ['session_token'] },
      {
        unique: true,
        fields: ['order_id', 'guest_name'],
        name: 'unique_guest_per_order'
      }
    ]
  });

  return OrderGuest;
};