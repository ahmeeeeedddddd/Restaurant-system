import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const MenuItem = sequelize.define('MenuItem', {
    menu_item_id: {
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    image_url: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    is_available: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    preparation_time: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Preparation time in minutes'
    },
    calories: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    is_vegetarian: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    is_spicy: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    allergens: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: true,
      defaultValue: []
    },
    display_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0
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
    tableName: 'menu_items',
    timestamps: false,
    indexes: [
      { fields: ['restaurant_id'] },
      { fields: ['category'] },
      { fields: ['is_available'] }
    ],
    hooks: {
      beforeUpdate: (menuItem) => {
        menuItem.updated_at = new Date();
      }
    }
  });

  return MenuItem;
};