// src/routes/order.routes.js
import express from 'express';
import {
  scanQRAndJoin,
  getOrderBySession,
  addItemToOrder,
  updateOrderItem,
  removeOrderItem,
  getOrderItemsByGuest,
  submitOrder,
  getAllOrders,
  updateOrderStatus
} from '../controllers/order.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES (Customer facing)
// ============================================

/**
 * POST /api/orders/scan
 * Initialize order session when customer scans QR code
 * Body: { qrToken, guestName?, deviceInfo? }
 */
router.post('/scan', scanQRAndJoin);

/**
 * GET /api/orders/session/:sessionToken
 * Get current order details using guest session token
 */
router.get('/session/:sessionToken', getOrderBySession);

/**
 * POST /api/orders/items
 * Add item to order
 * Body: { sessionToken, menuItemId, quantity, specialInstructions? }
 */
router.post('/items', addItemToOrder);

/**
 * PATCH /api/orders/items/:itemId
 * Update order item quantity
 * Body: { sessionToken, quantity }
 */
router.patch('/items/:itemId', updateOrderItem);

/**
 * DELETE /api/orders/items/:itemId
 * Remove item from order
 * Body: { sessionToken }
 */
router.delete('/items/:itemId', removeOrderItem);

/**
 * GET /api/orders/:orderId/items-by-guest
 * Get order items grouped by guest for bill splitting
 * Query: ?sessionToken=xxx
 */
router.get('/:orderId/items-by-guest', getOrderItemsByGuest);

/**
 * POST /api/orders/:orderId/submit
 * Submit order to kitchen
 * Body: { sessionToken, specialInstructions? }
 */
router.post('/:orderId/submit', submitOrder);

// ============================================
// PROTECTED ROUTES (Admin/Kitchen/Cashier)
// ============================================

// Apply authentication to all routes below
router.use(protect);

/**
 * GET /api/orders
 * Get all orders for restaurant
 * Query params: ?status=preparing&table_id=5&date=2025-01-19
 * Roles: admin, kitchen, cashier
 */
router.get(
  '/',
  restrictTo('admin', 'super_admin', 'kitchen', 'cashier'),
  getAllOrders
);

/**
 * PATCH /api/orders/:orderId/status
 * Update order status (kitchen workflow)
 * Body: { status: 'preparing' | 'ready' | 'served' | 'completed' }
 * Roles: admin, kitchen, cashier
 */
router.patch(
  '/:orderId/status',
  restrictTo('admin', 'super_admin', 'kitchen', 'cashier'),
  updateOrderStatus
);

export default router;