// src/controllers/menu.controller.js
import { query } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { catchAsync } from '../middleware/errorHandler.js';

/**
 * @route   GET /api/r/:slug/menu
 * @desc    Get all menu items for a restaurant (public - for customers)
 * @access  Public
 */
export const getMenuByRestaurant = catchAsync(async (req, res, next) => {
  const { slug } = req.params;
  const { category } = req.query; // Optional filter by category

  // Get restaurant ID from slug (middleware already verified it exists)
  const restaurantResult = await query(
    'SELECT restaurant_id, name, slug FROM restaurants WHERE slug = $1 AND is_active = true',
    [slug]
  );

  if (restaurantResult.rows.length === 0) {
    return next(new AppError('Restaurant not found or inactive', 404));
  }

  const restaurant = restaurantResult.rows[0];

  // Build query based on filters
  let queryText = `
    SELECT 
      menu_item_id, name, description, category, price, 
      image_url, is_available, preparation_time, calories,
      is_vegetarian, is_spicy, allergens, display_order
    FROM menu_items 
    WHERE restaurant_id = $1 AND is_available = true
  `;
  
  const queryParams = [restaurant.restaurant_id];

  // Add category filter if provided
  if (category) {
    queryText += ' AND category = $2';
    queryParams.push(category);
  }

  queryText += ' ORDER BY category, display_order, name';

  const menuResult = await query(queryText, queryParams);

  res.status(200).json({
    status: 'success',
    data: {
      restaurant: {
        restaurantId: restaurant.restaurant_id,
        name: restaurant.name,
        slug: restaurant.slug
      },
      menuItems: menuResult.rows.map(item => ({
        menuItemId: item.menu_item_id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: parseFloat(item.price),
        imageUrl: item.image_url,
        isAvailable: item.is_available,
        preparationTime: item.preparation_time,
        calories: item.calories,
        isVegetarian: item.is_vegetarian,
        isSpicy: item.is_spicy,
        allergens: item.allergens,
        displayOrder: item.display_order
      })),
      count: menuResult.rows.length
    }
  });
});

/**
 * @route   GET /api/r/:slug/menu/categories
 * @desc    Get all menu categories for a restaurant
 * @access  Public
 */
export const getMenuCategories = catchAsync(async (req, res, next) => {
  const { slug } = req.params;

  // Get restaurant ID
  const restaurantResult = await query(
    'SELECT restaurant_id FROM restaurants WHERE slug = $1 AND is_active = true',
    [slug]
  );

  if (restaurantResult.rows.length === 0) {
    return next(new AppError('Restaurant not found', 404));
  }

  const restaurantId = restaurantResult.rows[0].restaurant_id;

  // Get distinct categories
  const categoriesResult = await query(
    `SELECT DISTINCT category 
     FROM menu_items 
     WHERE restaurant_id = $1 AND is_available = true 
     ORDER BY category`,
    [restaurantId]
  );

  const categories = categoriesResult.rows.map(row => row.category);

  res.status(200).json({
    status: 'success',
    data: {
      categories,
      count: categories.length
    }
  });
});

/**
 * @route   GET /api/r/:slug/menu/:itemId
 * @desc    Get single menu item details
 * @access  Public
 */
export const getMenuItemById = catchAsync(async (req, res, next) => {
  const { slug, itemId } = req.params;

  // Get restaurant ID
  const restaurantResult = await query(
    'SELECT restaurant_id FROM restaurants WHERE slug = $1 AND is_active = true',
    [slug]
  );

  if (restaurantResult.rows.length === 0) {
    return next(new AppError('Restaurant not found', 404));
  }

  const restaurantId = restaurantResult.rows[0].restaurant_id;

  // Get menu item
  const itemResult = await query(
    `SELECT * FROM menu_items 
     WHERE menu_item_id = $1 AND restaurant_id = $2`,
    [itemId, restaurantId]
  );

  if (itemResult.rows.length === 0) {
    return next(new AppError('Menu item not found', 404));
  }

  const item = itemResult.rows[0];

  res.status(200).json({
    status: 'success',
    data: {
      menuItem: {
        menuItemId: item.menu_item_id,
        name: item.name,
        description: item.description,
        category: item.category,
        price: parseFloat(item.price),
        imageUrl: item.image_url,
        isAvailable: item.is_available,
        preparationTime: item.preparation_time,
        calories: item.calories,
        isVegetarian: item.is_vegetarian,
        isSpicy: item.is_spicy,
        allergens: item.allergens
      }
    }
  });
});

/**
 * @route   POST /api/admin/menu
 * @desc    Create new menu item
 * @access  Private (Admin only)
 */
export const createMenuItem = catchAsync(async (req, res, next) => {
  const {
    name,
    description,
    category,
    price,
    imageUrl,
    preparationTime,
    calories,
    isVegetarian,
    isSpicy,
    allergens,
    displayOrder
  } = req.body;

  const restaurantId = req.user.restaurantId;

  // Validate required fields
  if (!name || !category || price === undefined) {
    return next(new AppError('Please provide name, category, and price', 400));
  }

  // Validate price
  if (price < 0) {
    return next(new AppError('Price must be a positive number', 400));
  }

  // Insert menu item
  const result = await query(
    `INSERT INTO menu_items 
     (restaurant_id, name, description, category, price, image_url, 
      preparation_time, calories, is_vegetarian, is_spicy, allergens, display_order, is_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      restaurantId,
      name,
      description || null,
      category,
      price,
      imageUrl || null,
      preparationTime || null,
      calories || null,
      isVegetarian || false,
      isSpicy || false,
      allergens || null,
      displayOrder || 0,
      true
    ]
  );

  const newItem = result.rows[0];

  res.status(201).json({
    status: 'success',
    message: 'Menu item created successfully',
    data: {
      menuItem: {
        menuItemId: newItem.menu_item_id,
        name: newItem.name,
        description: newItem.description,
        category: newItem.category,
        price: parseFloat(newItem.price),
        imageUrl: newItem.image_url,
        isAvailable: newItem.is_available
      }
    }
  });
});

/**
 * @route   PUT /api/admin/menu/:itemId
 * @desc    Update menu item
 * @access  Private (Admin only)
 */
export const updateMenuItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const restaurantId = req.user.restaurantId;

  // Check if item exists and belongs to user's restaurant
  const checkResult = await query(
    'SELECT menu_item_id FROM menu_items WHERE menu_item_id = $1 AND restaurant_id = $2',
    [itemId, restaurantId]
  );

  if (checkResult.rows.length === 0) {
    return next(new AppError('Menu item not found or you do not have permission to edit it', 404));
  }

  const {
    name,
    description,
    category,
    price,
    imageUrl,
    preparationTime,
    calories,
    isVegetarian,
    isSpicy,
    allergens,
    displayOrder,
    isAvailable
  } = req.body;

  // Validate price if provided
  if (price !== undefined && price < 0) {
    return next(new AppError('Price must be a positive number', 400));
  }

  // Build dynamic update query
  const updates = [];
  const values = [];
  let paramCount = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramCount++}`);
    values.push(name);
  }
  if (description !== undefined) {
    updates.push(`description = $${paramCount++}`);
    values.push(description);
  }
  if (category !== undefined) {
    updates.push(`category = $${paramCount++}`);
    values.push(category);
  }
  if (price !== undefined) {
    updates.push(`price = $${paramCount++}`);
    values.push(price);
  }
  if (imageUrl !== undefined) {
    updates.push(`image_url = $${paramCount++}`);
    values.push(imageUrl);
  }
  if (preparationTime !== undefined) {
    updates.push(`preparation_time = $${paramCount++}`);
    values.push(preparationTime);
  }
  if (calories !== undefined) {
    updates.push(`calories = $${paramCount++}`);
    values.push(calories);
  }
  if (isVegetarian !== undefined) {
    updates.push(`is_vegetarian = $${paramCount++}`);
    values.push(isVegetarian);
  }
  if (isSpicy !== undefined) {
    updates.push(`is_spicy = $${paramCount++}`);
    values.push(isSpicy);
  }
  if (allergens !== undefined) {
    updates.push(`allergens = $${paramCount++}`);
    values.push(allergens);
  }
  if (displayOrder !== undefined) {
    updates.push(`display_order = $${paramCount++}`);
    values.push(displayOrder);
  }
  if (isAvailable !== undefined) {
    updates.push(`is_available = $${paramCount++}`);
    values.push(isAvailable);
  }

  if (updates.length === 0) {
    return next(new AppError('No fields to update', 400));
  }

  // Add WHERE clause parameters
  values.push(itemId, restaurantId);

  const queryText = `
    UPDATE menu_items 
    SET ${updates.join(', ')}
    WHERE menu_item_id = $${paramCount++} AND restaurant_id = $${paramCount}
    RETURNING *
  `;

  const result = await query(queryText, values);
  const updatedItem = result.rows[0];

  res.status(200).json({
    status: 'success',
    message: 'Menu item updated successfully',
    data: {
      menuItem: {
        menuItemId: updatedItem.menu_item_id,
        name: updatedItem.name,
        description: updatedItem.description,
        category: updatedItem.category,
        price: parseFloat(updatedItem.price),
        isAvailable: updatedItem.is_available
      }
    }
  });
});

/**
 * @route   DELETE /api/admin/menu/:itemId
 * @desc    Delete menu item (soft delete - mark as unavailable)
 * @access  Private (Admin only)
 */
export const deleteMenuItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const restaurantId = req.user.restaurantId;

  // Check if item exists
  const checkResult = await query(
    'SELECT menu_item_id FROM menu_items WHERE menu_item_id = $1 AND restaurant_id = $2',
    [itemId, restaurantId]
  );

  if (checkResult.rows.length === 0) {
    return next(new AppError('Menu item not found', 404));
  }

  // Soft delete (mark as unavailable)
  await query(
    'UPDATE menu_items SET is_available = false WHERE menu_item_id = $1',
    [itemId]
  );

  res.status(200).json({
    status: 'success',
    message: 'Menu item deleted successfully'
  });
});

/**
 * @route   PATCH /api/admin/menu/:itemId/toggle
 * @desc    Toggle menu item availability
 * @access  Private (Admin or Cashier)
 */
export const toggleAvailability = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const restaurantId = req.user.restaurantId;

  // Check if item exists
  const checkResult = await query(
    'SELECT menu_item_id, is_available FROM menu_items WHERE menu_item_id = $1 AND restaurant_id = $2',
    [itemId, restaurantId]
  );

  if (checkResult.rows.length === 0) {
    return next(new AppError('Menu item not found', 404));
  }

  // Toggle availability
  const result = await query(
    `UPDATE menu_items 
     SET is_available = NOT is_available 
     WHERE menu_item_id = $1 
     RETURNING menu_item_id, name, is_available`,
    [itemId]
  );

  const item = result.rows[0];

  res.status(200).json({
    status: 'success',
    message: `Menu item is now ${item.is_available ? 'available' : 'unavailable'}`,
    data: {
      menuItemId: item.menu_item_id,
      name: item.name,
      isAvailable: item.is_available
    }
  });
});

export default {
  getMenuByRestaurant,
  getMenuCategories,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleAvailability
};