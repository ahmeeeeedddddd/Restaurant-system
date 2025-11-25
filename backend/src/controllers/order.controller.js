// src/controllers/order.controller.js
// import { Order, OrderItem, OrderGuest, MenuItem, Table, Restaurant } from '../models/index.js';
import { catchAsync, AppError, ErrorTypes } from '../middleware/errorHandler.js';
import QRService from '../services/qr.service.js';

/**
 * Initialize order session when customer scans QR
 * POST /api/orders/scan
 * Body: { qrToken, guestName?, deviceInfo? }
 */
export const scanQRAndJoin = catchAsync(async (req, res, next) => {
  const { qrToken, guestName, deviceInfo } = req.body;

  if (!qrToken) {
    return next(ErrorTypes.BadRequest('QR token is required'));
  }

  // Handle complete QR scan workflow
  const result = await QRService.handleQRScan(
    qrToken,
    guestName,
    deviceInfo || req.headers['user-agent']
  );

  if (!result.success) {
    return next(new AppError(result.error, 400));
  }

  // Emit socket event to notify others at the table
  const io = req.app.get('io');
  io.to(`order-${result.order.orderId}`).emit('guest-joined', {
    guestName: result.guest.guestName,
    guestId: result.guest.guestId
  });

  res.status(200).json({
    status: 'success',
    data: result
  });
});

/**
 * Get current order details for a guest
 * GET /api/orders/session/:sessionToken
 */
export const getOrderBySession = catchAsync(async (req, res, next) => {
  const { sessionToken } = req.params;

  // Validate guest session
  const validation = await QRService.validateGuestSession(sessionToken);
  
  if (!validation.success) {
    return next(new AppError(validation.error, 401));
  }

  // Get full order details
  const order = await Order.findByPk(validation.guest.orderId, {
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
    return next(ErrorTypes.NotFound('Order'));
  }

  res.status(200).json({
    status: 'success',
    data: {
      order,
      currentGuest: validation.guest
    }
  });
});

/**
 * Add item to order
 * POST /api/orders/items
 * Body: { sessionToken, menuItemId, quantity, specialInstructions? }
 */
export const addItemToOrder = catchAsync(async (req, res, next) => {
  const { sessionToken, menuItemId, quantity, specialInstructions } = req.body;

  if (!sessionToken || !menuItemId || !quantity) {
    return next(ErrorTypes.BadRequest('Session token, menu item ID, and quantity are required'));
  }

  if (quantity < 1) {
    return next(ErrorTypes.BadRequest('Quantity must be at least 1'));
  }

  // Validate guest session
  const validation = await QRService.validateGuestSession(sessionToken);
  if (!validation.success) {
    return next(new AppError(validation.error, 401));
  }

  // Get menu item details
  const menuItem = await MenuItem.findByPk(menuItemId);
  if (!menuItem) {
    return next(ErrorTypes.NotFound('Menu item'));
  }

  if (!menuItem.is_available) {
    return next(ErrorTypes.MenuItemUnavailable(menuItem.name));
  }

  // Calculate subtotal
  const unitPrice = parseFloat(menuItem.price);
  const subtotal = unitPrice * quantity;

  // Add item to order
  const orderItem = await OrderItem.create({
    order_id: validation.guest.orderId,
    menu_item_id: menuItemId,
    added_by_guest_id: validation.guest.guestId,
    quantity,
    unit_price: unitPrice,
    subtotal,
    special_instructions: specialInstructions
  });

  // Recalculate order totals
  await recalculateOrderTotals(validation.guest.orderId);

  // Get the created item with relations
  const createdItem = await OrderItem.findByPk(orderItem.order_item_id, {
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
  });

  // Emit socket event to all guests at this table
  const io = req.app.get('io');
  io.to(`order-${validation.guest.orderId}`).emit('item-added', {
    orderItem: createdItem,
    addedBy: validation.guest.guestName
  });

  res.status(201).json({
    status: 'success',
    data: {
      orderItem: createdItem
    }
  });
});

/**
 * Update order item quantity
 * PATCH /api/orders/items/:itemId
 * Body: { sessionToken, quantity }
 */
export const updateOrderItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const { sessionToken, quantity } = req.body;

  if (!sessionToken || !quantity) {
    return next(ErrorTypes.BadRequest('Session token and quantity are required'));
  }

  if (quantity < 1) {
    return next(ErrorTypes.BadRequest('Quantity must be at least 1'));
  }

  // Validate guest session
  const validation = await QRService.validateGuestSession(sessionToken);
  if (!validation.success) {
    return next(new AppError(validation.error, 401));
  }

  // Get order item
  const orderItem = await OrderItem.findByPk(itemId);
  if (!orderItem) {
    return next(ErrorTypes.NotFound('Order item'));
  }

  // Verify item belongs to this order
  if (orderItem.order_id !== validation.guest.orderId) {
    return next(ErrorTypes.Forbidden('This item does not belong to your order'));
  }

  // Update quantity and subtotal
  const newSubtotal = parseFloat(orderItem.unit_price) * quantity;
  await orderItem.update({
    quantity,
    subtotal: newSubtotal
  });

  // Recalculate order totals
  await recalculateOrderTotals(validation.guest.orderId);

  // Emit socket event
  const io = req.app.get('io');
  io.to(`order-${validation.guest.orderId}`).emit('item-updated', {
    orderItemId: itemId,
    quantity,
    updatedBy: validation.guest.guestName
  });

  res.status(200).json({
    status: 'success',
    data: {
      orderItem
    }
  });
});

/**
 * Remove item from order
 * DELETE /api/orders/items/:itemId
 * Body: { sessionToken }
 */
export const removeOrderItem = catchAsync(async (req, res, next) => {
  const { itemId } = req.params;
  const { sessionToken } = req.body;

  if (!sessionToken) {
    return next(ErrorTypes.BadRequest('Session token is required'));
  }

  // Validate guest session
  const validation = await QRService.validateGuestSession(sessionToken);
  if (!validation.success) {
    return next(new AppError(validation.error, 401));
  }

  // Get order item
  const orderItem = await OrderItem.findByPk(itemId);
  if (!orderItem) {
    return next(ErrorTypes.NotFound('Order item'));
  }

  // Verify item belongs to this order
  if (orderItem.order_id !== validation.guest.orderId) {
    return next(ErrorTypes.Forbidden('This item does not belong to your order'));
  }

  // Delete item
  await orderItem.destroy();

  // Recalculate order totals
  await recalculateOrderTotals(validation.guest.orderId);

  // Emit socket event
  const io = req.app.get('io');
  io.to(`order-${validation.guest.orderId}`).emit('item-removed', {
    orderItemId: itemId,
    removedBy: validation.guest.guestName
  });

  res.status(200).json({
    status: 'success',
    message: 'Item removed from order'
  });
});

/**
 * Get order items grouped by guest (for bill splitting)
 * GET /api/orders/:orderId/items-by-guest
 */
export const getOrderItemsByGuest = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { sessionToken } = req.query;

  // Validate guest session
  const validation = await QRService.validateGuestSession(sessionToken);
  if (!validation.success) {
    return next(new AppError(validation.error, 401));
  }

  // Verify orderId matches
  if (validation.guest.orderId !== parseInt(orderId)) {
    return next(ErrorTypes.Forbidden('Access denied'));
  }

  // Get all items grouped by guest
  const items = await OrderItem.findAll({
    where: { order_id: orderId },
    include: [
      {
        model: MenuItem,
        as: 'menuItem',
        attributes: ['menu_item_id', 'name', 'price', 'image_url']
      },
      {
        model: OrderGuest,
        as: 'addedByGuest',
        attributes: ['guest_id', 'guest_name']
      }
    ]
  });

  // Group by guest
  const itemsByGuest = {};
  let totalAmount = 0;

  items.forEach(item => {
    const guestId = item.added_by_guest_id;
    const guestName = item.addedByGuest.guest_name;

    if (!itemsByGuest[guestId]) {
      itemsByGuest[guestId] = {
        guestId,
        guestName,
        items: [],
        subtotal: 0
      };
    }

    itemsByGuest[guestId].items.push(item);
    itemsByGuest[guestId].subtotal += parseFloat(item.subtotal);
    totalAmount += parseFloat(item.subtotal);
  });

  res.status(200).json({
    status: 'success',
    data: {
      itemsByGuest: Object.values(itemsByGuest),
      totalAmount
    }
  });
});

/**
 * Submit order to kitchen (confirm order)
 * POST /api/orders/:orderId/submit
 * Body: { sessionToken, specialInstructions? }
 */
export const submitOrder = catchAsync(async (req, res, next) => {
  const { orderId } = req.params;
  const { sessionToken, specialInstructions } = req.body;

  // Validate guest session
  const validation = await QRService.validateGuestSession(sessionToken);
  if (!validation.success) {
    return next(new AppError(validation.error, 401));
  }

  // Verify orderId matches
  if (validation.guest.orderId !== parseInt(orderId)) {
    return next(ErrorTypes.Forbidden('Access denied'));
  }

  // Get order
  const order = await Order.findByPk(orderId, {
    include: [{ model: OrderItem, as: 'items' }]
  });

  if (!order) {
    return next(ErrorTypes.NotFound('Order'));
  }

  // Check if order has items
  if (!order.items || order.items.length === 0) {
    return next(ErrorTypes.BadRequest('Cannot submit an empty order'));
  }

  // Check current status
  if (order.status !== 'pending') {
    return next(ErrorTypes.InvalidOrderStatus());
  }

  // Update order status to confirmed
  await order.update({
    status: 'confirmed',
    special_instructions: specialInstructions
  });

  // Emit socket events
  const io = req.app.get('io');
  
  // Notify guests at table
  io.to(`order-${orderId}`).emit('order-submitted', {
    orderId,
    status: 'confirmed',
    submittedBy: validation.guest.guestName
  });

  // Notify kitchen
  io.to(`restaurant-${order.restaurant_id}-kitchen`).emit('new-order', {
    orderId,
    orderNumber: order.order_number,
    tableNumber: order.table?.table_number
  });

  res.status(200).json({
    status: 'success',
    message: 'Order submitted to kitchen',
    data: {
      order
    }
  });
});

/**
 * Get all orders for a restaurant (Admin/Kitchen view)
 * GET /api/admin/orders
 */
export const getAllOrders = catchAsync(async (req, res, next) => {
  const { restaurant_id } = req.user;
  const { status, table_id, date } = req.query;

  const whereClause = { restaurant_id };

  if (status) {
    whereClause.status = status;
  }

  if (table_id) {
    whereClause.table_id = table_id;
  }

  if (date) {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    whereClause.created_at = {
      $gte: startDate,
      $lte: endDate
    };
  }

  const orders = await Order.findAll({
    where: whereClause,
    include: [
      {
        model: Table,
        as: 'table',
        attributes: ['table_id', 'table_number', 'location']
      },
      {
        model: OrderItem,
        as: 'items',
        include: [{
          model: MenuItem,
          as: 'menuItem',
          attributes: ['name', 'category']
        }]
      }
    ],
    order: [['created_at', 'DESC']]
  });

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: {
      orders
    }
  });
});

/**
 * Update order status (Kitchen/Cashier)
 * PATCH /api/admin/orders/:orderId/status
 * Body: { status }
 */
export const updateOrderStatus = catchAsync(async (req, res, next) => {
  const { restaurant_id, role } = req.user;
  const { orderId } = req.params;
  const { status } = req.body;

  if (!status) {
    return next(ErrorTypes.BadRequest('Status is required'));
  }

  // Validate status
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return next(ErrorTypes.BadRequest('Invalid status value'));
  }

  // Get order
  const order = await Order.findOne({
    where: {
      order_id: orderId,
      restaurant_id
    }
  });

  if (!order) {
    return next(ErrorTypes.NotFound('Order'));
  }

  // Update status
  await order.update({ status });

  // If completed, update table status
  if (status === 'completed' || status === 'cancelled') {
    await Table.update(
      { status: 'available' },
      { where: { table_id: order.table_id } }
    );
  }

  // Emit socket events
  const io = req.app.get('io');
  
  // Notify guests
  io.to(`order-${orderId}`).emit('order-status-updated', {
    orderId,
    status,
    updatedBy: req.user.full_name
  });

  // Notify kitchen/cashier
  io.to(`restaurant-${restaurant_id}-kitchen`).emit('order-updated', {
    orderId,
    status
  });

  res.status(200).json({
    status: 'success',
    data: {
      order
    }
  });
});

/**
 * Helper function to recalculate order totals
 */
async function recalculateOrderTotals(orderId) {
  const order = await Order.findByPk(orderId, {
    include: [
      { model: OrderItem, as: 'items' },
      { model: Restaurant, as: 'restaurant' }
    ]
  });

  if (!order) return;

  // Calculate subtotal
  const subtotal = order.items.reduce((sum, item) => {
    return sum + parseFloat(item.subtotal);
  }, 0);

  // Calculate tax and service charge
  const taxRate = parseFloat(order.restaurant.tax_rate) / 100;
  const serviceChargeRate = parseFloat(order.restaurant.service_charge_rate) / 100;

  const taxAmount = subtotal * taxRate;
  const serviceCharge = subtotal * serviceChargeRate;
  const totalAmount = subtotal + taxAmount + serviceCharge;

  // Update order
  await order.update({
    subtotal: subtotal.toFixed(2),
    tax_amount: taxAmount.toFixed(2),
    service_charge: serviceCharge.toFixed(2),
    total_amount: totalAmount.toFixed(2)
  });

  return order;
}