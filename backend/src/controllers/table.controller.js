// src/controllers/table.controller.js
import { query } from '../config/database.js';
import { catchAsync, AppError, ErrorTypes } from '../middleware/errorHandler.js';
import { generateQRCodeForTable } from '../services/qr.service.js';

/**
 * Get all tables for a restaurant
 * GET /api/admin/tables
 */
export const getAllTables = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { status, location } = req.query;

  let queryText = `
    SELECT 
      table_id,
      table_number,
      qr_code,
      qr_image_url,
      capacity,
      status,
      location,
      created_at,
      updated_at
    FROM tables
    WHERE restaurant_id = $1
  `;
  
  const params = [restaurant_id];
  let paramCount = 1;

  // Filter by status if provided
  if (status) {
    paramCount++;
    queryText += ` AND status = $${paramCount}`;
    params.push(status);
  }

  // Filter by location if provided
  if (location) {
    paramCount++;
    queryText += ` AND location = $${paramCount}`;
    params.push(location);
  }

  queryText += ' ORDER BY table_number ASC';

  const result = await query(queryText, params);

  res.status(200).json({
    status: 'success',
    results: result.rows.length,
    data: {
      tables: result.rows
    }
  });
});

/**
 * Get single table by ID
 * GET /api/admin/tables/:id
 */
export const getTableById = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { id } = req.params;

  const result = await query(
    `SELECT * FROM tables WHERE table_id = $1 AND restaurant_id = $2`,
    [id, restaurant_id]
  );

  if (result.rows.length === 0) {
    return next(ErrorTypes.NotFound('Table'));
  }

  res.status(200).json({
    status: 'success',
    data: {
      table: result.rows[0]
    }
  });
});

/**
 * Get table by QR code (for customers)
 * GET /api/tables/qr/:qrCode
 */
export const getTableByQR = catchAsync(async (req, res, next) => {
  const { qrCode } = req.params;

  const result = await query(
    `
    SELECT 
      t.table_id,
      t.table_number,
      t.capacity,
      t.status,
      t.location,
      r.restaurant_id,
      r.name as restaurant_name,
      r.slug as restaurant_slug,
      r.logo_url,
      r.primary_color,
      r.currency
    FROM tables t
    JOIN restaurants r ON t.restaurant_id = r.restaurant_id
    WHERE t.qr_code = $1 AND r.is_active = true
    `,
    [qrCode]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Invalid QR code or table not found', 404));
  }

  const table = result.rows[0];

  // Check if table is available
  if (table.status === 'maintenance') {
    return next(new AppError('This table is currently under maintenance', 400));
  }

  res.status(200).json({
    status: 'success',
    data: {
      table
    }
  });
});

/**
 * Create new table
 * POST /api/admin/tables
 */
export const createTable = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const {
    table_number,
    capacity,
    location,
    status = 'available'
  } = req.body;

  // Validate required fields
  if (!table_number) {
    return next(ErrorTypes.BadRequest('Table number is required'));
  }

  // Check if table number already exists for this restaurant
  const existingTable = await query(
    'SELECT table_id FROM tables WHERE restaurant_id = $1 AND table_number = $2',
    [restaurant_id, table_number]
  );

  if (existingTable.rows.length > 0) {
    return next(ErrorTypes.AlreadyExists(`Table ${table_number}`));
  }

  // Generate unique QR code
  const { qrCode, qrImageUrl } = await generateQRCodeForTable(restaurant_id, table_number);

  // Insert new table
  const result = await query(
    `
    INSERT INTO tables (
      restaurant_id,
      table_number,
      qr_code,
      qr_image_url,
      capacity,
      status,
      location
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
    `,
    [restaurant_id, table_number, qrCode, qrImageUrl, capacity || 4, status, location]
  );

  res.status(201).json({
    status: 'success',
    data: {
      table: result.rows[0]
    }
  });
});

/**
 * Update table
 * PATCH /api/admin/tables/:id
 */
export const updateTable = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { id } = req.params;
  const {
    table_number,
    capacity,
    status,
    location
  } = req.body;

  // Check if table exists
  const existingTable = await query(
    'SELECT * FROM tables WHERE table_id = $1 AND restaurant_id = $2',
    [id, restaurant_id]
  );

  if (existingTable.rows.length === 0) {
    return next(ErrorTypes.NotFound('Table'));
  }

  // If updating table_number, check for duplicates
  if (table_number && table_number !== existingTable.rows[0].table_number) {
    const duplicate = await query(
      'SELECT table_id FROM tables WHERE restaurant_id = $1 AND table_number = $2 AND table_id != $3',
      [restaurant_id, table_number, id]
    );

    if (duplicate.rows.length > 0) {
      return next(ErrorTypes.AlreadyExists(`Table ${table_number}`));
    }
  }

  // Build dynamic update query
  const updates = [];
  const values = [];
  let paramCount = 0;

  if (table_number !== undefined) {
    paramCount++;
    updates.push(`table_number = $${paramCount}`);
    values.push(table_number);
  }

  if (capacity !== undefined) {
    paramCount++;
    updates.push(`capacity = $${paramCount}`);
    values.push(capacity);
  }

  if (status !== undefined) {
    paramCount++;
    updates.push(`status = $${paramCount}`);
    values.push(status);
  }

  if (location !== undefined) {
    paramCount++;
    updates.push(`location = $${paramCount}`);
    values.push(location);
  }

  if (updates.length === 0) {
    return next(ErrorTypes.BadRequest('No valid fields to update'));
  }

  // Add updated_at
  paramCount++;
  updates.push(`updated_at = $${paramCount}`);
  values.push(new Date());

  // Add WHERE clause parameters
  paramCount++;
  values.push(id);
  const tableIdParam = paramCount;

  paramCount++;
  values.push(restaurant_id);
  const restaurantIdParam = paramCount;

  const updateQuery = `
    UPDATE tables
    SET ${updates.join(', ')}
    WHERE table_id = $${tableIdParam} AND restaurant_id = $${restaurantIdParam}
    RETURNING *
  `;

  const result = await query(updateQuery, values);

  res.status(200).json({
    status: 'success',
    data: {
      table: result.rows[0]
    }
  });
});

/**
 * Delete table
 * DELETE /api/admin/tables/:id
 */
export const deleteTable = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { id } = req.params;

  // Check if table has any active orders
  const activeOrders = await query(
    `
    SELECT COUNT(*) as count 
    FROM orders 
    WHERE table_id = $1 
    AND status NOT IN ('completed', 'cancelled')
    `,
    [id]
  );

  if (parseInt(activeOrders.rows[0].count) > 0) {
    return next(new AppError('Cannot delete table with active orders', 400));
  }

  // Delete table
  const result = await query(
    'DELETE FROM tables WHERE table_id = $1 AND restaurant_id = $2 RETURNING table_id',
    [id, restaurant_id]
  );

  if (result.rows.length === 0) {
    return next(ErrorTypes.NotFound('Table'));
  }

  res.status(200).json({
    status: 'success',
    message: 'Table deleted successfully'
  });
});

/**
 * Regenerate QR code for a table
 * POST /api/admin/tables/:id/regenerate-qr
 */
export const regenerateQR = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { id } = req.params;

  // Check if table exists
  const existingTable = await query(
    'SELECT * FROM tables WHERE table_id = $1 AND restaurant_id = $2',
    [id, restaurant_id]
  );

  if (existingTable.rows.length === 0) {
    return next(ErrorTypes.NotFound('Table'));
  }

  const table = existingTable.rows[0];

  // Generate new QR code
  const { qrCode, qrImageUrl } = await generateQRCodeForTable(restaurant_id, table.table_number);

  // Update table with new QR code
  const result = await query(
    `
    UPDATE tables
    SET qr_code = $1, qr_image_url = $2, updated_at = CURRENT_TIMESTAMP
    WHERE table_id = $3
    RETURNING *
    `,
    [qrCode, qrImageUrl, id]
  );

  res.status(200).json({
    status: 'success',
    message: 'QR code regenerated successfully',
    data: {
      table: result.rows[0]
    }
  });
});

/**
 * Update table status
 * PATCH /api/admin/tables/:id/status
 */
export const updateTableStatus = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return next(ErrorTypes.BadRequest('Status is required'));
  }

  // Validate status value
  const validStatuses = ['available', 'occupied', 'reserved', 'maintenance'];
  if (!validStatuses.includes(status)) {
    return next(ErrorTypes.BadRequest('Invalid status value'));
  }

  const result = await query(
    `
    UPDATE tables
    SET status = $1, updated_at = CURRENT_TIMESTAMP
    WHERE table_id = $2 AND restaurant_id = $3
    RETURNING *
    `,
    [status, id, restaurant_id]
  );

  if (result.rows.length === 0) {
    return next(ErrorTypes.NotFound('Table'));
  }

  res.status(200).json({
    status: 'success',
    data: {
      table: result.rows[0]
    }
  });
});

/**
 * Bulk create tables
 * POST /api/admin/tables/bulk
 */
export const bulkCreateTables = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { tables } = req.body;

  if (!Array.isArray(tables) || tables.length === 0) {
    return next(ErrorTypes.BadRequest('Tables array is required'));
  }

  const createdTables = [];
  const errors = [];

  for (const tableData of tables) {
    try {
      const { table_number, capacity, location } = tableData;

      if (!table_number) {
        errors.push({ table_number, error: 'Table number is required' });
        continue;
      }

      // Check for duplicates
      const exists = await query(
        'SELECT table_id FROM tables WHERE restaurant_id = $1 AND table_number = $2',
        [restaurant_id, table_number]
      );

      if (exists.rows.length > 0) {
        errors.push({ table_number, error: 'Already exists' });
        continue;
      }

      // Generate QR code
      const { qrCode, qrImageUrl } = await generateQRCodeForTable(restaurant_id, table_number);

      // Insert table
      const result = await query(
        `
        INSERT INTO tables (
          restaurant_id, table_number, qr_code, qr_image_url,
          capacity, location, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'available')
        RETURNING *
        `,
        [restaurant_id, table_number, qrCode, qrImageUrl, capacity || 4, location]
      );

      createdTables.push(result.rows[0]);
    } catch (error) {
      errors.push({ table_number: tableData.table_number, error: error.message });
    }
  }

  res.status(201).json({
    status: 'success',
    data: {
      created: createdTables.length,
      failed: errors.length,
      tables: createdTables,
      errors: errors.length > 0 ? errors : undefined
    }
  });
});