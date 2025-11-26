import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Customer = sequelize.define('Customer', {
    customer_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    name: {
      type: DataTypes.STRING(255),
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
    tableName: 'customers',
    timestamps: false,
    indexes: [
      { fields: ['email'] }
    ],
    hooks: {
      beforeUpdate: (customer) => {
        customer.updated_at = new Date();
      }
    },
    validate: {
      // At least one contact method should be provided
      atLeastOneContact() {
        if (!this.email && !this.phone) {
          throw new Error('Customer must have at least email or phone');
        }
      }
    }
  });

  return Customer;
};