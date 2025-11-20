// src/routes/menu.routes.js
import express from 'express';
import * as menuController from '../controllers/menu.controller.js';
import { verifyToken, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES (For customers via QR code)
// ============================================

/**
 * GET /api/r/:slug/menu
 * Get all menu items for a restaurant
 * Query params: ?category=Main%20Course (optional)
 */
router.get('/r/:slug/menu', menuController.getMenuByRestaurant);

/**
 * GET /api/r/:slug/menu/categories
 * Get all menu categories for a restaurant
 */
router.get('/r/:slug/menu/categories', menuController.getMenuCategories);

/**
 * GET /api/r/:slug/menu/:itemId
 * Get single menu item details
 */
router.get('/r/:slug/menu/:itemId', menuController.getMenuItemById);

// ============================================
// ADMIN ROUTES (Protected - Authentication required)
// ============================================

/**
 * POST /api/admin/menu
 * Create new menu item
 * Requires: Admin role
 */
router.post(
  '/admin/menu',
  verifyToken,
  restrictTo('admin'),
  menuController.createMenuItem
);

/**
 * PUT /api/admin/menu/:itemId
 * Update menu item
 * Requires: Admin role
 */
router.put(
  '/admin/menu/:itemId',
  verifyToken,
  restrictTo('admin'),
  menuController.updateMenuItem
);

/**
 * DELETE /api/admin/menu/:itemId
 * Delete menu item (soft delete)
 * Requires: Admin role
 */
router.delete(
  '/admin/menu/:itemId',
  verifyToken,
  restrictTo('admin'),
  menuController.deleteMenuItem
);

/**
 * PATCH /api/admin/menu/:itemId/toggle
 * Toggle menu item availability (quick out-of-stock)
 * Requires: Admin or Cashier role
 */
router.patch(
  '/admin/menu/:itemId/toggle',
  verifyToken,
  restrictTo('admin', 'cashier'),
  menuController.toggleAvailability
);

export default router;