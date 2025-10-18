// src/routes/auth.routes.js
import express from 'express';
import * as authController from '../controllers/auth.controller.js';
import { verifyToken, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

/**
 * POST /api/auth/login
 * Login for all user types (admin, cashier, kitchen, waiter)
 */
router.post('/login', authController.login);

/**
 * POST /api/auth/register/admin
 * Register new restaurant admin
 * NOTE: In production, you may want to restrict this to super_admin only
 */
router.post('/register/admin', authController.registerAdmin);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', authController.refreshToken);

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

/**
 * GET /api/auth/me
 * Get current logged-in user information
 */
router.get('/me', verifyToken, authController.getCurrentUser);

/**
 * POST /api/auth/logout
 * Logout current user
 */
router.post('/logout', verifyToken, authController.logout);

/**
 * POST /api/auth/change-password
 * Change current user's password
 */
router.post('/change-password', verifyToken, authController.changePassword);

// ============================================
// ADMIN-ONLY ROUTES
// ============================================

/**
 * POST /api/auth/register/staff
 * Register staff member (cashier, kitchen, waiter)
 * Only restaurant admin can create staff for their restaurant
 */
router.post(
  '/register/staff',
  verifyToken,
  restrictTo('admin', 'super_admin'),
  authController.registerStaff
);

export default router;