import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const OrderItem = sequelize.define('OrderItem', {
    order_item_id: {
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
    menu_item_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'menu_items',
        key: 'menu_item_id'
      },
      onDelete: 'RESTRICT'
    },
    added_by_guest_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'order_guests',
        key: 'guest_id'
      },
      onDelete: 'CASCADE'
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    unit_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Price snapshot at order time'
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'quantity * unit_price'
    },
    special_instructions: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'e.g., "No onions", "Extra spicy"'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'order_items',
    timestamps: false,
    indexes: [
      { fields: ['order_id'] },
      { fields: ['menu_item_id'] },
      { fields: ['added_by_guest_id'] }
    ],
    hooks: {
      beforeValidate: (orderItem) => {
        // Auto-calculate subtotal
        if (orderItem.quantity && orderItem.unit_price) {
          orderItem.subtotal = (parseFloat(orderItem.quantity) * parseFloat(orderItem.unit_price)).toFixed(2);
        }
      }
    }
  });

  return OrderItem;
};