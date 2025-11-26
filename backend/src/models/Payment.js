import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Payment = sequelize.define('Payment', {
    payment_id: {
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
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0
      }
    },
    payment_method: {
      type: DataTypes.ENUM('cash', 'card', 'stripe', 'paymob', 'fawry', 'wallet'),
      allowNull: false
    },
    payment_status: {
      type: DataTypes.ENUM('pending', 'processing', 'completed', 'failed', 'refunded'),
      defaultValue: 'pending'
    },
    transaction_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      comment: 'Transaction ID from payment gateway'
    },
    payment_gateway: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'stripe, paymob, fawry, etc.'
    },
    gateway_response: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Full response from payment gateway'
    },
    paid_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    refunded_at: {
      type: DataTypes.DATE,
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
    tableName: 'payments',
    timestamps: false,
    indexes: [
      { fields: ['order_id'] },
      { fields: ['transaction_id'] },
      { fields: ['payment_status'] }
    ],
    hooks: {
      beforeUpdate: (payment) => {
        payment.updated_at = new Date();
        
        // Auto-set paid_at when status changes to completed
        if (payment.changed('payment_status') && payment.payment_status === 'completed' && !payment.paid_at) {
          payment.paid_at = new Date();
        }
        
        // Auto-set refunded_at when status changes to refunded
        if (payment.changed('payment_status') && payment.payment_status === 'refunded' && !payment.refunded_at) {
          payment.refunded_at = new Date();
        }
      }
    }
  });

  return Payment;
};