import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

// Import all models
import RestaurantModel from './Restaurant.js';
import RestaurantConfigModel from './RestaurantConfig.js';
import UserModel from './User.js';
import TableModel from './Table.js';
import MenuItemModel from './MenuItem.js';
import CustomerModel from './Customer.js';
import OrderModel from './Order.js';
import OrderGuestModel from './OrderGuest.js';
import OrderItemModel from './OrderItem.js';
import PaymentModel from './Payment.js';
import QRScanModel from './QRScan.js';

dotenv.config();

// Initialize Sequelize connection
const sequelize = new Sequelize(
  process.env.PG_DATABASE,
  process.env.PG_USER,
  process.env.PG_PASSWORD,
  {
    host: process.env.PG_HOST,
    port: process.env.PG_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    define: {
      timestamps: false, // We're using custom created_at/updated_at
      underscored: true   // Use snake_case for auto-generated fields
    }
  }
);

// Initialize all models
const Restaurant = RestaurantModel(sequelize);
const RestaurantConfig = RestaurantConfigModel(sequelize);
const User = UserModel(sequelize);
const Table = TableModel(sequelize);
const MenuItem = MenuItemModel(sequelize);
const Customer = CustomerModel(sequelize);
const Order = OrderModel(sequelize);
const OrderGuest = OrderGuestModel(sequelize);
const OrderItem = OrderItemModel(sequelize);
const Payment = PaymentModel(sequelize);
const QRScan = QRScanModel(sequelize);

// ============================================
// DEFINE ASSOCIATIONS
// ============================================

// Restaurant relationships
Restaurant.hasOne(RestaurantConfig, {
  foreignKey: 'restaurant_id',
  as: 'config',
  onDelete: 'CASCADE'
});
RestaurantConfig.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

Restaurant.hasMany(User, {
  foreignKey: 'restaurant_id',
  as: 'users',
  onDelete: 'CASCADE'
});
User.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

Restaurant.hasMany(Table, {
  foreignKey: 'restaurant_id',
  as: 'tables',
  onDelete: 'CASCADE'
});
Table.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

Restaurant.hasMany(MenuItem, {
  foreignKey: 'restaurant_id',
  as: 'menuItems',
  onDelete: 'CASCADE'
});
MenuItem.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

Restaurant.hasMany(Order, {
  foreignKey: 'restaurant_id',
  as: 'orders',
  onDelete: 'CASCADE'
});
Order.belongsTo(Restaurant, {
  foreignKey: 'restaurant_id',
  as: 'restaurant'
});

// Table relationships
Table.hasMany(Order, {
  foreignKey: 'table_id',
  as: 'orders',
  onDelete: 'CASCADE'
});
Order.belongsTo(Table, {
  foreignKey: 'table_id',
  as: 'table'
});

Table.hasMany(QRScan, {
  foreignKey: 'table_id',
  as: 'scans',
  onDelete: 'CASCADE'
});
QRScan.belongsTo(Table, {
  foreignKey: 'table_id',
  as: 'table'
});

// Order relationships
Order.belongsTo(Customer, {
  foreignKey: 'customer_id',
  as: 'customer',
  onDelete: 'SET NULL'
});
Customer.hasMany(Order, {
  foreignKey: 'customer_id',
  as: 'orders'
});

Order.hasMany(OrderGuest, {
  foreignKey: 'order_id',
  as: 'guests',
  onDelete: 'CASCADE'
});
OrderGuest.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

Order.hasMany(OrderItem, {
  foreignKey: 'order_id',
  as: 'items',
  onDelete: 'CASCADE'
});
OrderItem.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

Order.hasMany(Payment, {
  foreignKey: 'order_id',
  as: 'payments',
  onDelete: 'CASCADE'
});
Payment.belongsTo(Order, {
  foreignKey: 'order_id',
  as: 'order'
});

// OrderItem relationships
OrderItem.belongsTo(MenuItem, {
  foreignKey: 'menu_item_id',
  as: 'menuItem',
  onDelete: 'RESTRICT'
});
MenuItem.hasMany(OrderItem, {
  foreignKey: 'menu_item_id',
  as: 'orderItems'
});

OrderItem.belongsTo(OrderGuest, {
  foreignKey: 'added_by_guest_id',
  as: 'addedByGuest',
  onDelete: 'CASCADE'
});
OrderGuest.hasMany(OrderItem, {
  foreignKey: 'added_by_guest_id',
  as: 'items'
});

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
};

// Sync all models with database (only use in development)
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force, alter: !force });
    console.log(`✅ Database synchronized ${force ? '(force mode)' : '(alter mode)'}`);
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
    throw error;
  }
};

// Export everything
export {
  sequelize,
  testConnection,
  syncDatabase,
  Restaurant,
  RestaurantConfig,
  User,
  Table,
  MenuItem,
  Customer,
  Order,
  OrderGuest,
  OrderItem,
  Payment,
  QRScan
};

export default {
  sequelize,
  testConnection,
  syncDatabase,
  Restaurant,
  RestaurantConfig,
  User,
  Table,
  MenuItem,
  Customer,
  Order,
  OrderGuest,
  OrderItem,
  Payment,
  QRScan
};