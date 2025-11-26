// src/services/order.service.js
import { Order, OrderItem, OrderGuest, MenuItem, Restaurant, Table } from '../models/index.js';

/**
 * Order Service
 * Handles order calculations, aggregation, and business logic
 */

class OrderService {
  /**
   * Calculate order totals (subtotal, tax, service charge, total)
   * @param {number} orderId - Order ID
   * @returns {Promise<Object>} Calculated totals
   */
  async calculateOrderTotals(orderId) {
    try {
      const order = await Order.findByPk(orderId, {
        include: [
          { model: OrderItem, as: 'items' },
          { model: Restaurant, as: 'restaurant' }
        ]
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Calculate subtotal from all items
      const subtotal = order.items.reduce((sum, item) => {
        return sum + parseFloat(item.subtotal);
      }, 0);

      // Get tax and service charge rates from restaurant
      const taxRate = parseFloat(order.restaurant.tax_rate || 0) / 100;
      const serviceChargeRate = parseFloat(order.restaurant.service_charge_rate || 0) / 100;

      // Calculate amounts
      const taxAmount = subtotal * taxRate;
      const serviceCharge = subtotal * serviceChargeRate;
      const totalAmount = subtotal + taxAmount + serviceCharge;

      return {
        subtotal: parseFloat(subtotal.toFixed(2)),
        taxAmount: parseFloat(taxAmount.toFixed(2)),
        serviceCharge: parseFloat(serviceCharge.toFixed(2)),
        totalAmount: parseFloat(totalAmount.toFixed(2))
      };
    } catch (error) {
      console.error('Error calculating order totals:', error);
      throw error;
    }
  }

  /**
   * Update order totals in database
   * @param {number} orderId - Order ID
   * @returns {Promise<Order>} Updated order
   */
  async updateOrderTotals(orderId) {
    try {
      const totals = await this.calculateOrderTotals(orderId);

      const order = await Order.findByPk(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      await order.update({
        subtotal: totals.subtotal,
        tax_amount: totals.taxAmount,
        service_charge: totals.serviceCharge,
        total_amount: totals.totalAmount
      });

      return order;
    } catch (error) {
      console.error('Error updating order totals:', error);
      throw error;
    }
  }

  /**
   * Get order summary with all details
   * @param {number} orderId - Order ID
   * @returns {Promise<Object>} Complete order summary
   */
  async getOrderSummary(orderId) {
    try {
      const order = await Order.findByPk(orderId, {
        include: [
          {
            model: OrderItem,
            as: 'items',
            include: [
              {
                model: MenuItem,
                as: 'menuItem',
                attributes: ['menu_item_id', 'name', 'description', 'price', 'image_url', 'category']
              },
              {
                model: OrderGuest,
                as: 'addedByGuest',
                attributes: ['guest_id', 'guest_name']
              }
            ]
          },
          {
            model: OrderGuest,
            as: 'guests',
            attributes: ['guest_id', 'guest_name', 'joined_at']
          },
          {
            model: Table,
            as: 'table',
            attributes: ['table_id', 'table_number', 'capacity', 'location']
          },
          {
            model: Restaurant,
            as: 'restaurant',
            attributes: ['restaurant_id', 'name', 'slug', 'logo_url', 'primary_color', 'currency', 'tax_rate', 'service_charge_rate']
          }
        ]
      });

      if (!order) {
        return null;
      }

      // Calculate totals
      const totals = await this.calculateOrderTotals(orderId);

      return {
        order,
        totals,
        itemCount: order.items.length,
        guestCount: order.guests.length
      };
    } catch (error) {
      console.error('Error getting order summary:', error);
      throw error;
    }
  }

  /**
   * Calculate bill split by guest
   * @param {number} orderId - Order ID
   * @returns {Promise<Object>} Bill split details
   */
  async calculateBillSplit(orderId) {
    try {
      const order = await Order.findByPk(orderId, {
        include: [
          {
            model: OrderItem,
            as: 'items',
            include: [
              {
                model: MenuItem,
                as: 'menuItem',
                attributes: ['name', 'price']
              },
              {
                model: OrderGuest,
                as: 'addedByGuest',
                attributes: ['guest_id', 'guest_name']
              }
            ]
          },
          {
            model: Restaurant,
            as: 'restaurant',
            attributes: ['tax_rate', 'service_charge_rate']
          }
        ]
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Group items by guest
      const guestTotals = {};

      order.items.forEach(item => {
        const guestId = item.added_by_guest_id;
        const guestName = item.addedByGuest.guest_name;

        if (!guestTotals[guestId]) {
          guestTotals[guestId] = {
            guestId,
            guestName,
            items: [],
            subtotal: 0
          };
        }

        const itemData = {
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unit_price),
          subtotal: parseFloat(item.subtotal)
        };

        guestTotals[guestId].items.push(itemData);
        guestTotals[guestId].subtotal += parseFloat(item.subtotal);
      });

      // Calculate tax and service charge for each guest
      const taxRate = parseFloat(order.restaurant.tax_rate || 0) / 100;
      const serviceChargeRate = parseFloat(order.restaurant.service_charge_rate || 0) / 100;

      Object.values(guestTotals).forEach(guest => {
        guest.taxAmount = guest.subtotal * taxRate;
        guest.serviceCharge = guest.subtotal * serviceChargeRate;
        guest.total = guest.subtotal + guest.taxAmount + guest.serviceCharge;

        // Round to 2 decimals
        guest.subtotal = parseFloat(guest.subtotal.toFixed(2));
        guest.taxAmount = parseFloat(guest.taxAmount.toFixed(2));
        guest.serviceCharge = parseFloat(guest.serviceCharge.toFixed(2));
        guest.total = parseFloat(guest.total.toFixed(2));
      });

      return {
        orderId,
        guestBills: Object.values(guestTotals),
        overallTotal: parseFloat(order.total_amount)
      };
    } catch (error) {
      console.error('Error calculating bill split:', error);
      throw error;
    }
  }

  /**
   * Validate order can be submitted
   * @param {number} orderId - Order ID
   * @returns {Promise<Object>} Validation result
   */
  async validateOrderForSubmission(orderId) {
    try {
      const order = await Order.findByPk(orderId, {
        include: [{ model: OrderItem, as: 'items' }]
      });

      if (!order) {
        return {
          valid: false,
          message: 'Order not found'
        };
      }

      // Check if order has items
      if (!order.items || order.items.length === 0) {
        return {
          valid: false,
          message: 'Cannot submit an empty order'
        };
      }

      // Check if order is in correct status
      if (order.status !== 'pending') {
        return {
          valid: false,
          message: `Order is already ${order.status}`
        };
      }

      return {
        valid: true,
        message: 'Order is ready to submit'
      };
    } catch (error) {
      console.error('Error validating order:', error);
      throw error;
    }
  }

  /**
   * Get active orders for a table
   * @param {number} tableId - Table ID
   * @returns {Promise<Array>} Active orders
   */
  async getActiveOrdersForTable(tableId) {
    try {
      const activeOrders = await Order.findAll({
        where: {
          table_id: tableId,
          status: ['pending', 'confirmed', 'preparing', 'ready']
        },
        include: [
          {
            model: OrderItem,
            as: 'items',
            include: [{
              model: MenuItem,
              as: 'menuItem',
              attributes: ['name', 'category']
            }]
          },
          {
            model: OrderGuest,
            as: 'guests',
            attributes: ['guest_name']
          }
        ],
        order: [['created_at', 'DESC']]
      });

      return activeOrders;
    } catch (error) {
      console.error('Error getting active orders for table:', error);
      throw error;
    }
  }

  /**
   * Get order statistics for a restaurant
   * @param {number} restaurantId - Restaurant ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Order statistics
   */
  async getOrderStatistics(restaurantId, startDate, endDate) {
    try {
      const whereClause = {
        restaurant_id: restaurantId
      };

      if (startDate && endDate) {
        whereClause.created_at = {
          $gte: startDate,
          $lte: endDate
        };
      }

      const [totalOrders, completedOrders, cancelledOrders, totalRevenue] = await Promise.all([
        Order.count({ where: whereClause }),
        Order.count({ where: { ...whereClause, status: 'completed' } }),
        Order.count({ where: { ...whereClause, status: 'cancelled' } }),
        Order.sum('total_amount', {
          where: { ...whereClause, status: 'completed' }
        })
      ]);

      return {
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue: parseFloat(totalRevenue || 0).toFixed(2),
        period: {
          start: startDate,
          end: endDate
        }
      };
    } catch (error) {
      console.error('Error getting order statistics:', error);
      throw error;
    }
  }

  /**
   * Add item to order and recalculate totals
   * @param {number} orderId - Order ID
   * @param {number} menuItemId - Menu item ID
   * @param {number} guestId - Guest ID who's adding the item
   * @param {number} quantity - Item quantity
   * @param {string} specialInstructions - Special instructions
   * @returns {Promise<OrderItem>} Created order item
   */
  async addItemToOrder(orderId, menuItemId, guestId, quantity, specialInstructions = null) {
    try {
      // Get menu item details
      const menuItem = await MenuItem.findByPk(menuItemId);
      if (!menuItem) {
        throw new Error('Menu item not found');
      }

      if (!menuItem.is_available) {
        throw new Error(`${menuItem.name} is currently unavailable`);
      }

      // Calculate item subtotal
      const unitPrice = parseFloat(menuItem.price);
      const subtotal = unitPrice * quantity;

      // Create order item
      const orderItem = await OrderItem.create({
        order_id: orderId,
        menu_item_id: menuItemId,
        added_by_guest_id: guestId,
        quantity,
        unit_price: unitPrice,
        subtotal,
        special_instructions: specialInstructions
      });

      // Recalculate order totals
      await this.updateOrderTotals(orderId);

      return orderItem;
    } catch (error) {
      console.error('Error adding item to order:', error);
      throw error;
    }
  }

  /**
   * Update order item quantity and recalculate
   * @param {number} orderItemId - Order item ID
   * @param {number} quantity - New quantity
   * @returns {Promise<OrderItem>} Updated order item
   */
  async updateOrderItemQuantity(orderItemId, quantity) {
    try {
      const orderItem = await OrderItem.findByPk(orderItemId);
      if (!orderItem) {
        throw new Error('Order item not found');
      }

      // Calculate new subtotal
      const newSubtotal = parseFloat(orderItem.unit_price) * quantity;

      // Update item
      await orderItem.update({
        quantity,
        subtotal: newSubtotal
      });

      // Recalculate order totals
      await this.updateOrderTotals(orderItem.order_id);

      return orderItem;
    } catch (error) {
      console.error('Error updating order item:', error);
      throw error;
    }
  }

  /**
   * Remove item from order and recalculate
   * @param {number} orderItemId - Order item ID
   * @returns {Promise<void>}
   */
  async removeOrderItem(orderItemId) {
    try {
      const orderItem = await OrderItem.findByPk(orderItemId);
      if (!orderItem) {
        throw new Error('Order item not found');
      }

      const orderId = orderItem.order_id;

      // Delete item
      await orderItem.destroy();

      // Recalculate order totals
      await this.updateOrderTotals(orderId);
    } catch (error) {
      console.error('Error removing order item:', error);
      throw error;
    }
  }
}

export default new OrderService();