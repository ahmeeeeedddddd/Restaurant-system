// src/socket/kitchenHandlers.js
// import { Order, OrderItem, Table, MenuItem } from '../models/index.js';

/**
 * Setup kitchen-related socket event handlers
 * @param {Socket} socket - Socket.io socket instance
 * @param {Server} io - Socket.io server instance
 */
export const setupKitchenHandlers = (socket, io) => {
  
  /**
   * Kitchen/Cashier staff joins their restaurant room
   * Payload: { restaurantId, role: 'kitchen' | 'cashier' }
   */
  socket.on('join-kitchen', async (data) => {
    try {
      const { restaurantId, role } = data;

      if (!restaurantId) {
        socket.emit('error', { message: 'Restaurant ID is required' });
        return;
      }

      const roomName = `restaurant-${restaurantId}-${role || 'kitchen'}`;

      // Join the kitchen room
      socket.join(roomName);

      // Store staff info in socket data
      socket.data.restaurantId = restaurantId;
      socket.data.role = role || 'kitchen';

      console.log(`${role} staff joined restaurant ${restaurantId} room`);

      // Send current pending orders
      const pendingOrders = await Order.findAll({
        where: {
          restaurant_id: restaurantId,
          status: ['confirmed', 'preparing', 'ready']
        },
        include: [
          {
            model: Table,
            as: 'table',
            attributes: ['table_number', 'location']
          },
          {
            model: OrderItem,
            as: 'items',
            include: [{
              model: MenuItem,
              as: 'menuItem',
              attributes: ['name', 'category', 'preparation_time']
            }]
          }
        ],
        order: [['created_at', 'ASC']]
      });

      socket.emit('kitchen-joined', {
        restaurantId,
        pendingOrders
      });

    } catch (error) {
      console.error('Error in join-kitchen:', error);
      socket.emit('error', { message: 'Failed to join kitchen room' });
    }
  });

  /**
   * Leave kitchen room
   */
  socket.on('leave-kitchen', () => {
    try {
      const { restaurantId, role } = socket.data;

      if (restaurantId) {
        const roomName = `restaurant-${restaurantId}-${role}`;
        socket.leave(roomName);
        console.log(`${role} staff left restaurant ${restaurantId} room`);
      }
    } catch (error) {
      console.error('Error in leave-kitchen:', error);
    }
  });

  /**
   * Kitchen updates order status
   * Payload: { orderId, status, estimatedTime? }
   * Status: 'confirmed' → 'preparing' → 'ready' → 'served'
   */
  socket.on('update-order-status', async (data) => {
    try {
      const { orderId, status, estimatedTime } = data;
      const { restaurantId } = socket.data;

      if (!orderId || !status) {
        socket.emit('error', { message: 'Order ID and status are required' });
        return;
      }

      // Validate status
      const validStatuses = ['confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        socket.emit('error', { message: 'Invalid status' });
        return;
      }

      // Update order
      const order = await Order.findOne({
        where: {
          order_id: orderId,
          restaurant_id: restaurantId
        }
      });

      if (!order) {
        socket.emit('error', { message: 'Order not found' });
        return;
      }

      await order.update({ status });

      // If completed or cancelled, update table status
      if (status === 'completed' || status === 'cancelled') {
        await Table.update(
          { status: 'available' },
          { where: { table_id: order.table_id } }
        );
      }

      // Notify the order room (customers)
      io.to(`order-${orderId}`).emit('order-status-updated', {
        orderId,
        status,
        estimatedTime,
        message: getStatusMessage(status)
      });

      // Notify kitchen staff
      io.to(`restaurant-${restaurantId}-kitchen`).emit('order-updated', {
        orderId,
        status
      });

      // Notify cashier if order is ready or completed
      if (status === 'ready' || status === 'completed') {
        io.to(`restaurant-${restaurantId}-cashier`).emit('order-ready-for-payment', {
          orderId,
          orderNumber: order.order_number,
          tableId: order.table_id
        });
      }

      // Confirm to sender
      socket.emit('status-updated', {
        orderId,
        status,
        message: 'Order status updated successfully'
      });

    } catch (error) {
      console.error('Error in update-order-status:', error);
      socket.emit('error', { message: 'Failed to update order status' });
    }
  });

  /**
   * Kitchen marks item as completed
   * Payload: { orderItemId }
   */
  socket.on('mark-item-prepared', async (data) => {
    try {
      const { orderItemId } = data;

      const orderItem = await OrderItem.findByPk(orderItemId, {
        include: [{
          model: Order,
          as: 'order'
        }]
      });

      if (!orderItem) {
        socket.emit('error', { message: 'Order item not found' });
        return;
      }

      const orderId = orderItem.order_id;

      // Notify order room
      io.to(`order-${orderId}`).emit('item-prepared', {
        orderItemId,
        message: 'Item is ready'
      });

      // Notify kitchen
      io.to(`restaurant-${orderItem.order.restaurant_id}-kitchen`).emit('item-marked-prepared', {
        orderItemId
      });

      socket.emit('item-prepared-confirmed', {
        orderItemId
      });

    } catch (error) {
      console.error('Error in mark-item-prepared:', error);
      socket.emit('error', { message: 'Failed to mark item as prepared' });
    }
  });

  /**
   * Request kitchen statistics
   */
  socket.on('request-kitchen-stats', async () => {
    try {
      const { restaurantId } = socket.data;

      if (!restaurantId) {
        socket.emit('error', { message: 'Not connected to a restaurant' });
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get today's statistics
      const [totalOrders, activeOrders, completedOrders] = await Promise.all([
        Order.count({
          where: {
            restaurant_id: restaurantId,
            created_at: { $gte: today }
          }
        }),
        Order.count({
          where: {
            restaurant_id: restaurantId,
            status: ['confirmed', 'preparing', 'ready']
          }
        }),
        Order.count({
          where: {
            restaurant_id: restaurantId,
            status: 'completed',
            created_at: { $gte: today }
          }
        })
      ]);

      socket.emit('kitchen-stats', {
        totalOrders,
        activeOrders,
        completedOrders,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error in request-kitchen-stats:', error);
      socket.emit('error', { message: 'Failed to fetch kitchen stats' });
    }
  });

  /**
   * Kitchen broadcasts a message to all guests
   * Payload: { message }
   */
  socket.on('kitchen-announcement', (data) => {
    try {
      const { restaurantId } = socket.data;
      const { message } = data;

      if (!restaurantId || !message) {
        socket.emit('error', { message: 'Restaurant ID and message are required' });
        return;
      }

      // Broadcast to all order rooms in this restaurant
      // Note: This requires tracking which orders belong to which restaurant
      // For now, we'll emit to the general restaurant room
      io.to(`restaurant-${restaurantId}`).emit('kitchen-announcement', {
        message,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error in kitchen-announcement:', error);
    }
  });
};

/**
 * Helper function to generate status messages
 */
function getStatusMessage(status) {
  const messages = {
    confirmed: 'Your order has been confirmed!',
    preparing: 'Your order is being prepared...',
    ready: 'Your order is ready!',
    served: 'Enjoy your meal!',
    completed: 'Order completed. Thank you!',
    cancelled: 'Your order has been cancelled.'
  };

  return messages[status] || 'Order status updated';
}

export default setupKitchenHandlers;