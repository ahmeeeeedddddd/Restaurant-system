// src/socket/orderHandlers.js
// import { Order, OrderItem, OrderGuest, MenuItem } from '../models/index.js';
import QRService from '../services/qr.service.js';

/**
 * Setup order-related socket event handlers
 * @param {Socket} socket - Socket.io socket instance
 * @param {Server} io - Socket.io server instance
 */
export const setupOrderHandlers = (socket, io) => {
  
  /**
   * Guest joins an order room
   * Payload: { sessionToken }
   */
  socket.on('join-order', async (data) => {
    try {
      const { sessionToken } = data;

      if (!sessionToken) {
        socket.emit('error', { message: 'Session token is required' });
        return;
      }

      // Validate session
      const validation = await QRService.validateGuestSession(sessionToken);
      
      if (!validation.success) {
        socket.emit('error', { message: validation.error });
        return;
      }

      const orderId = validation.guest.orderId;
      const roomName = `order-${orderId}`;

      // Join the order room
      socket.join(roomName);

      // Store guest info in socket data
      socket.data.guestId = validation.guest.guestId;
      socket.data.guestName = validation.guest.guestName;
      socket.data.orderId = orderId;

      console.log(`Guest ${validation.guest.guestName} joined order ${orderId}`);

      // Notify other guests in the room
      socket.to(roomName).emit('guest-connected', {
        guestName: validation.guest.guestName,
        guestId: validation.guest.guestId
      });

      // Send confirmation to the joining guest
      socket.emit('joined-order', {
        orderId,
        message: 'Successfully joined order room'
      });

    } catch (error) {
      console.error('Error in join-order:', error);
      socket.emit('error', { message: 'Failed to join order' });
    }
  });

  /**
   * Guest leaves order room
   */
  socket.on('leave-order', async () => {
    try {
      const { orderId, guestName } = socket.data;

      if (orderId) {
        const roomName = `order-${orderId}`;
        socket.leave(roomName);

        // Notify others
        socket.to(roomName).emit('guest-disconnected', {
          guestName
        });

        console.log(`Guest ${guestName} left order ${orderId}`);
      }
    } catch (error) {
      console.error('Error in leave-order:', error);
    }
  });

  /**
   * Guest is typing (for collaborative UX)
   * Payload: { action: 'adding-item' | 'browsing-menu' }
   */
  socket.on('guest-activity', (data) => {
    try {
      const { orderId, guestName } = socket.data;
      const { action } = data;

      if (orderId) {
        socket.to(`order-${orderId}`).emit('guest-activity-update', {
          guestName,
          action
        });
      }
    } catch (error) {
      console.error('Error in guest-activity:', error);
    }
  });

  /**
   * Real-time item added notification
   * This is emitted from the controller, but guests can also emit for optimistic UI
   */
  socket.on('item-adding', (data) => {
    try {
      const { orderId, guestName } = socket.data;
      const { menuItemName, quantity } = data;

      if (orderId) {
        socket.to(`order-${orderId}`).emit('item-being-added', {
          guestName,
          menuItemName,
          quantity
        });
      }
    } catch (error) {
      console.error('Error in item-adding:', error);
    }
  });

  /**
   * Request current order state
   * Useful for reconnecting guests
   */
  socket.on('request-order-state', async () => {
    try {
      const { orderId } = socket.data;

      if (!orderId) {
        socket.emit('error', { message: 'No active order session' });
        return;
      }

      // Get current order with all items and guests
      const order = await Order.findByPk(orderId, {
        include: [
          {
            model: OrderItem,
            as: 'items',
            include: [
              {
                model: MenuItem,
                as: 'menuItem',
                attributes: ['menu_item_id', 'name', 'description', 'price', 'image_url']
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
          }
        ]
      });

      if (order) {
        socket.emit('order-state', {
          order
        });
      }

    } catch (error) {
      console.error('Error in request-order-state:', error);
      socket.emit('error', { message: 'Failed to fetch order state' });
    }
  });

  /**
   * Guest requests to split bill
   * Calculate individual totals
   */
  socket.on('request-bill-split', async () => {
    try {
      const { orderId } = socket.data;

      if (!orderId) {
        socket.emit('error', { message: 'No active order session' });
        return;
      }

      // Get all items grouped by guest
      const items = await OrderItem.findAll({
        where: { order_id: orderId },
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
      });

      // Group by guest
      const billSplit = {};
      
      items.forEach(item => {
        const guestId = item.added_by_guest_id;
        const guestName = item.addedByGuest.guest_name;

        if (!billSplit[guestId]) {
          billSplit[guestId] = {
            guestId,
            guestName,
            items: [],
            subtotal: 0
          };
        }

        billSplit[guestId].items.push({
          name: item.menuItem.name,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          subtotal: item.subtotal
        });

        billSplit[guestId].subtotal += parseFloat(item.subtotal);
      });

      // Send to requesting guest
      socket.emit('bill-split-result', {
        billSplit: Object.values(billSplit)
      });

    } catch (error) {
      console.error('Error in request-bill-split:', error);
      socket.emit('error', { message: 'Failed to calculate bill split' });
    }
  });

  /**
   * Handle disconnection
   */
  socket.on('disconnect', () => {
    try {
      const { orderId, guestName } = socket.data;

      if (orderId && guestName) {
        // Notify others that guest disconnected
        socket.to(`order-${orderId}`).emit('guest-disconnected', {
          guestName
        });

        console.log(`Guest ${guestName} disconnected from order ${orderId}`);
      }
    } catch (error) {
      console.error('Error in disconnect:', error);
    }
  });
};

export default setupOrderHandlers;