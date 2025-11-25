// src/routes/table.routes.js
import express from 'express';
import {
  getAllTables,
  getTableById,
  getTableByQR,
  createTable,
  updateTable,
  deleteTable,
  regenerateQR,
  updateTableStatus,
  bulkCreateTables
} from '../controllers/table.controller.js';
import { protect, restrictTo } from '../middleware/auth.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES (Customer facing)
// ============================================

/**
 * GET /api/tables/qr/:qrCode
 * Get table information by scanning QR code
 * No authentication required
 */
router.get('/qr/:qrCode', getTableByQR);

// ============================================
// PROTECTED ROUTES (Admin/Manager only)
// ============================================

// Apply authentication to all routes below
router.use(protect);
router.use(restrictTo('admin', 'super_admin'));

/**
 * GET /api/admin/tables
 * Get all tables for the restaurant
 * Query params: ?status=available&location=Indoor
 */
router.get('/', getAllTables);

/**
 * POST /api/admin/tables
 * Create a new table
 * Body: { table_number, capacity, location, status }
 */
router.post('/', createTable);

/**
 * POST /api/admin/tables/bulk
 * Create multiple tables at once
 * Body: { tables: [{ table_number, capacity, location }, ...] }
 */
router.post('/bulk', bulkCreateTables);

/**
 * GET /api/admin/tables/:id
 * Get single table by ID
 */
router.get('/:id', getTableById);

/**
 * PATCH /api/admin/tables/:id
 * Update table details
 * Body: { table_number?, capacity?, status?, location? }
 */
router.patch('/:id', updateTable);

/**
 * DELETE /api/admin/tables/:id
 * Delete a table (only if no active orders)
 */
router.delete('/:id', deleteTable);

/**
 * POST /api/admin/tables/:id/regenerate-qr
 * Regenerate QR code for a table
 */
router.post('/:id/regenerate-qr', regenerateQR);

/**
 * PATCH /api/admin/tables/:id/status
 * Update only the table status
 * Body: { status: 'available' | 'occupied' | 'reserved' | 'maintenance' }
 */
router.patch('/:id/status', updateTableStatus);

export default router;