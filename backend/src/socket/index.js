// src/socket/index.js
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

/**
 * Initialize Socket.io server
 * @param {http.Server} server - HTTP server instance
 * @returns {Server} Socket.io server instance
 */
export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true
    },
    // Connection settings
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    // Allow binary data (for images, etc.)
    allowEIO3: true
  });

  // ============================================
  // CONNECTION HANDLER
  // ============================================

  io.on("connection", (socket) => {
    console.log(`✅ Socket connected: ${socket.id}`);

    // ============================================
    // ROOM MANAGEMENT
    // ============================================

    /**
     * Join restaurant room (for all updates related to a restaurant)
     * Used by: Admin, Cashier, Kitchen staff
     */
    socket.on("join:restaurant", (restaurantId) => {
      const room = `restaurant:${restaurantId}`;
      socket.join(room);
      console.log(`👥 Socket ${socket.id} joined ${room}`);
      socket.emit("joined:restaurant", { restaurantId, room });
    });

    /**
     * Join table room (for customer-specific updates)
     * Used by: Customers at a specific table
     */
    socket.on("join:table", ({ restaurantId, tableId }) => {
      const room = `table:${restaurantId}:${tableId}`;
      socket.join(room);
      console.log(`🪑 Socket ${socket.id} joined ${room}`);
      socket.emit("joined:table", { restaurantId, tableId, room });
    });

    /**
     * Join kitchen room (for kitchen-specific updates)
     * Used by: Kitchen staff
     */
    socket.on("join:kitchen", (restaurantId) => {
      const room = `kitchen:${restaurantId}`;
      socket.join(room);
      console.log(`👨‍🍳 Socket ${socket.id} joined ${room}`);
      socket.emit("joined:kitchen", { restaurantId, room });
    });

    /**
     * Join cashier room (for cashier-specific updates)
     * Used by: Cashier staff
     */
    socket.on("join:cashier", (restaurantId) => {
      const room = `cashier:${restaurantId}`;
      socket.join(room);
      console.log(`💰 Socket ${socket.id} joined ${room}`);
      socket.emit("joined:cashier", { restaurantId, room });
    });

    // ============================================
    // LEAVE ROOMS
    // ============================================

    socket.on("leave:room", (room) => {
      socket.leave(room);
      console.log(`👋 Socket ${socket.id} left ${room}`);
    });

    // ============================================
    // DISCONNECT HANDLER
    // ============================================

    socket.on("disconnect", (reason) => {
      console.log(`❌ Socket disconnected: ${socket.id} - Reason: ${reason}`);
    });

    // ============================================
    // ERROR HANDLER
    // ============================================

    socket.on("error", (error) => {
      console.error(`⚠️ Socket error on ${socket.id}:`, error);
    });
  });

  // ============================================
  // GLOBAL ERROR HANDLER
  // ============================================

  io.engine.on("connection_error", (err) => {
    console.error("❌ Socket.io connection error:", err);
  });

  console.log("✅ Socket.io initialized");

  return io;
};

/**
 * Emit event to a specific restaurant room
 * @param {Server} io - Socket.io instance
 * @param {number} restaurantId - Restaurant ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export const emitToRestaurant = (io, restaurantId, event, data) => {
  const room = `restaurant:${restaurantId}`;
  io.to(room).emit(event, data);
  console.log(`📡 Emitted ${event} to ${room}`);
};

/**
 * Emit event to a specific table room
 * @param {Server} io - Socket.io instance
 * @param {number} restaurantId - Restaurant ID
 * @param {number} tableId - Table ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export const emitToTable = (io, restaurantId, tableId, event, data) => {
  const room = `table:${restaurantId}:${tableId}`;
  io.to(room).emit(event, data);
  console.log(`📡 Emitted ${event} to ${room}`);
};

/**
 * Emit event to kitchen room
 * @param {Server} io - Socket.io instance
 * @param {number} restaurantId - Restaurant ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export const emitToKitchen = (io, restaurantId, event, data) => {
  const room = `kitchen:${restaurantId}`;
  io.to(room).emit(event, data);
  console.log(`📡 Emitted ${event} to ${room}`);
};

/**
 * Emit event to cashier room
 * @param {Server} io - Socket.io instance
 * @param {number} restaurantId - Restaurant ID
 * @param {string} event - Event name
 * @param {object} data - Event data
 */
export const emitToCashier = (io, restaurantId, event, data) => {
  const room = `cashier:${restaurantId}`;
  io.to(room).emit(event, data);
  console.log(`📡 Emitted ${event} to ${room}`);
};

export default initializeSocket;