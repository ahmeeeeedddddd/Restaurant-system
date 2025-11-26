import crypto from 'crypto';
import { Table, Restaurant, Order } from '../models/index.js';

/**
 * QR Service
 * Handles QR code generation, validation, and table session management
 */

class QRService {
  /**
   * Generate a unique cryptographic token for a table's QR code
   * Format: {restaurantSlug}-{tableNumber}-{randomToken}
   */
  generateQRToken(restaurantSlug, tableNumber) {
    const randomToken = crypto.randomBytes(16).toString('hex');
    const token = `${restaurantSlug}-T${tableNumber}-${randomToken}`;
    return token;
  }

  /**
   * Generate QR code data for a table
   * Returns the URL that customers will scan
   * @param {number} restaurantId - Restaurant ID
   * @param {number} tableId - Table ID
   * @param {string} baseUrl - Base URL of your frontend (e.g., https://yourdomain.com)
   * @returns {Promise<Object>} QR code data
   */
  async generateQRCodeForTable(restaurantId, tableId, baseUrl = process.env.FRONTEND_URL) {
    try {
      // Fetch restaurant and table info
      const table = await Table.findOne({
        where: { table_id: tableId, restaurant_id: restaurantId },
        include: [{
          model: Restaurant,
          as: 'restaurant',
          attributes: ['restaurant_id', 'name', 'slug']
        }]
      });

      if (!table) {
        throw new Error('Table not found');
      }

      // Generate unique QR token if it doesn't exist
      let qrToken = table.qr_code;
      if (!qrToken) {
        qrToken = this.generateQRToken(
          table.restaurant.slug,
          table.table_number
        );

        // Update table with QR token
        await table.update({ qr_code: qrToken });
      }

      // Generate the URL that will be encoded in QR
      // Format: https://yourdomain.com/r/{slug}/table/{qrToken}
      const qrUrl = `${baseUrl}/r/${table.restaurant.slug}/table/${qrToken}`;

      return {
        success: true,
        qrToken,
        qrUrl,
        tableInfo: {
          tableId: table.table_id,
          tableNumber: table.table_number,
          restaurantName: table.restaurant.name,
          restaurantSlug: table.restaurant.slug,
          capacity: table.capacity,
          location: table.location
        }
      };
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  /**
   * Validate QR code and get table/restaurant info
   * Called when customer scans QR code
   * @param {string} qrToken - The QR token from URL
   * @returns {Promise<Object>} Table and restaurant information
   */
  async validateQRCode(qrToken) {
    try {
      // Find table by QR code
      const table = await Table.findOne({
        where: { qr_code: qrToken },
        include: [{
          model: Restaurant,
          as: 'restaurant',
          attributes: ['restaurant_id', 'name', 'slug', 'logo_url', 'primary_color', 'currency', 'is_active']
        }]
      });

      if (!table) {
        return {
          success: false,
          error: 'Invalid QR code'
        };
      }

      // Check if restaurant is active
      if (!table.restaurant.is_active) {
        return {
          success: false,
          error: 'Restaurant is currently inactive'
        };
      }

      // Check if table is available
      if (table.status === 'maintenance') {
        return {
          success: false,
          error: 'Table is under maintenance'
        };
      }

      return {
        success: true,
        table: {
          tableId: table.table_id,
          tableNumber: table.table_number,
          capacity: table.capacity,
          location: table.location,
          status: table.status
        },
        restaurant: {
          restaurantId: table.restaurant.restaurant_id,
          name: table.restaurant.name,
          slug: table.restaurant.slug,
          logoUrl: table.restaurant.logo_url,
          primaryColor: table.restaurant.primary_color,
          currency: table.restaurant.currency
        }
      };
    } catch (error) {
      console.error('Error validating QR code:', error);
      throw error;
    }
  }

  /**
   * Get or create an active order/session for a table
   * When a customer scans the QR, they join the active order for that table
   * @param {number} tableId - Table ID
   * @param {number} restaurantId - Restaurant ID
   * @returns {Promise<Object>} Active order information
   */
  async getOrCreateTableSession(tableId, restaurantId) {
    try {
      // Check if there's already an active order for this table
      let activeOrder = await Order.findOne({
        where: {
          table_id: tableId,
          restaurant_id: restaurantId,
          status: ['pending', 'confirmed', 'preparing'] // Active statuses
        },
        order: [['created_at', 'DESC']]
      });

      // If no active order exists, create a new one
      if (!activeOrder) {
        // Generate unique order number
        const orderNumber = await this.generateOrderNumber(restaurantId);

        activeOrder = await Order.create({
          restaurant_id: restaurantId,
          table_id: tableId,
          order_number: orderNumber,
          status: 'pending',
          subtotal: 0.00,
          tax_amount: 0.00,
          service_charge: 0.00,
          total_amount: 0.00,
          payment_status: 'pending'
        });

        // Update table status to occupied
        await Table.update(
          { status: 'occupied' },
          { where: { table_id: tableId } }
        );
      }

      return {
        success: true,
        orderId: activeOrder.order_id,
        orderNumber: activeOrder.order_number,
        status: activeOrder.status,
        isNewSession: !activeOrder.order_id // True if we just created it
      };
    } catch (error) {
      console.error('Error getting/creating table session:', error);
      throw error;
    }
  }

  /**
   * Generate unique order number
   * Format: ORD-{YYYYMMDD}-{restaurant_id}-{sequence}
   */
  async generateOrderNumber(restaurantId) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Get count of orders today for this restaurant
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));
    
    const todayOrderCount = await Order.count({
      where: {
        restaurant_id: restaurantId,
        created_at: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      }
    });

    const sequence = (todayOrderCount + 1).toString().padStart(3, '0');
    return `ORD-${dateStr}-${restaurantId}-${sequence}`;
  }

  /**
   * Create a guest session token for a customer
   * Each device/customer that scans the QR gets a unique token
   * @param {number} orderId - Order ID
   * @param {string} guestName - Guest's name (optional, can be "Guest 1", "Guest 2", etc.)
   * @param {string} deviceInfo - User agent or device info
   * @returns {Promise<Object>} Guest session information
   */
  async createGuestSession(orderId, guestName = null, deviceInfo = null) {
    try {
      // Generate unique session token
      const sessionToken = crypto.randomBytes(32).toString('hex');

      // If no guest name provided, generate one
      if (!guestName) {
        // Count existing guests for this order
        const { OrderGuest } = await import('../models/index.js');
        const guestCount = await OrderGuest.count({ where: { order_id: orderId } });
        guestName = `Guest ${guestCount + 1}`;
      }

      // Create guest record
      const { OrderGuest } = await import('../models/index.js');
      const guest = await OrderGuest.create({
        order_id: orderId,
        guest_name: guestName,
        session_token: sessionToken,
        device_info: deviceInfo
      });

      return {
        success: true,
        guestId: guest.guest_id,
        guestName: guest.guest_name,
        sessionToken: guest.session_token
      };
    } catch (error) {
      console.error('Error creating guest session:', error);
      throw error;
    }
  }

  /**
   * Validate guest session token
   * Used to verify that a guest is part of an active order
   * @param {string} sessionToken - Guest's session token
   * @returns {Promise<Object>} Guest and order information
   */
  async validateGuestSession(sessionToken) {
    try {
      const { OrderGuest } = await import('../models/index.js');
      
      const guest = await OrderGuest.findOne({
        where: { session_token: sessionToken },
        include: [{
          model: Order,
          as: 'order',
          include: [{
            model: Table,
            as: 'table'
          }]
        }]
      });

      if (!guest) {
        return {
          success: false,
          error: 'Invalid session token'
        };
      }

      // Check if order is still active
      const activeStatuses = ['pending', 'confirmed', 'preparing', 'ready'];
      if (!activeStatuses.includes(guest.order.status)) {
        return {
          success: false,
          error: 'Order session has ended'
        };
      }

      return {
        success: true,
        guest: {
          guestId: guest.guest_id,
          guestName: guest.guest_name,
          orderId: guest.order_id
        },
        order: {
          orderId: guest.order.order_id,
          orderNumber: guest.order.order_number,
          status: guest.order.status,
          tableNumber: guest.order.table.table_number
        }
      };
    } catch (error) {
      console.error('Error validating guest session:', error);
      throw error;
    }
  }

  /**
   * Complete workflow when customer scans QR code
   * 1. Validate QR code
   * 2. Get/Create table session (order)
   * 3. Create guest session
   * @param {string} qrToken - QR token from URL
   * @param {string} guestName - Optional guest name
   * @param {string} deviceInfo - User agent
   * @returns {Promise<Object>} Complete session information
   */
  async handleQRScan(qrToken, guestName = null, deviceInfo = null) {
    try {
      // Step 1: Validate QR code
      const qrValidation = await this.validateQRCode(qrToken);
      if (!qrValidation.success) {
        return qrValidation;
      }

      const { table, restaurant } = qrValidation;

      // Step 2: Get or create table session (order)
      const session = await this.getOrCreateTableSession(
        table.tableId,
        restaurant.restaurantId
      );

      // Step 3: Create guest session
      const guestSession = await this.createGuestSession(
        session.orderId,
        guestName,
        deviceInfo
      );

      // Track QR scan (optional analytics)
      await this.trackQRScan(table.tableId, deviceInfo);

      return {
        success: true,
        restaurant,
        table,
        order: {
          orderId: session.orderId,
          orderNumber: session.orderNumber,
          status: session.status
        },
        guest: {
          guestId: guestSession.guestId,
          guestName: guestSession.guestName,
          sessionToken: guestSession.sessionToken
        },
        // Frontend should store this token in localStorage/sessionStorage
        message: session.isNewSession 
          ? 'New session started for this table'
          : 'Joined existing table session'
      };
    } catch (error) {
      console.error('Error handling QR scan:', error);
      throw error;
    }
  }

  /**
   * Track QR scan for analytics (optional)
   */
  async trackQRScan(tableId, userAgent = null, ipAddress = null) {
    try {
      const { QRScan } = await import('../models/index.js');
      await QRScan.create({
        table_id: tableId,
        user_agent: userAgent,
        ip_address: ipAddress
      });
    } catch (error) {
      // Don't throw error if tracking fails
      console.error('Error tracking QR scan:', error);
    }
  }

  /**
   * Regenerate QR code for a table (in case of security concerns)
   */
  async regenerateQRCode(tableId, restaurantId) {
    try {
      const table = await Table.findOne({
        where: { table_id: tableId, restaurant_id: restaurantId },
        include: [{
          model: Restaurant,
          as: 'restaurant',
          attributes: ['slug']
        }]
      });

      if (!table) {
        throw new Error('Table not found');
      }

      // Generate new token
      const newQRToken = this.generateQRToken(
        table.restaurant.slug,
        table.table_number
      );

      // Update table
      await table.update({ qr_code: newQRToken });

      return {
        success: true,
        qrToken: newQRToken,
        message: 'QR code regenerated successfully'
      };
    } catch (error) {
      console.error('Error regenerating QR code:', error);
      throw error;
    }
  }
}

export default new QRService();
export const { generateQRCodeForTable } = new QRService();

// How it works:
// Scenario: 4 friends at Table 5 in "Cairo Grill" restaurant

// Friend 1 scans the QR code on Table 5

// System validates the QR code
// System checks: "Is there an active order for Table 5?" → NO
// System creates a new order (e.g., ORD-20250119-001)
// Friend 1 gets a guest session token and joins as "Guest 1"
// Table status changes to "occupied"


// Friend 2 scans the SAME QR code (30 seconds later)

// System validates the QR code
// System checks: "Is there an active order for Table 5?" → YES (the one Friend 1 created)
// Friend 2 joins the EXISTING order ORD-20250119-001
// Friend 2 gets their own guest session token and joins as "Guest 2"


// Friend 3 and Friend 4 scan → Same thing, they join as "Guest 3" and "Guest 4"