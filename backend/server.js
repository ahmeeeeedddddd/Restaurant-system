// server.js
import http from "http";
import dotenv from "dotenv";
import app from "./src/app.js";
import { initializeSocket } from "./src/socket/index.js";
import pool from "./src/config/database.js";

dotenv.config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = initializeSocket(server);

// Make io available to routes via app.locals
app.set('io', io);

// ============================================
// DATABASE CONNECTION TEST
// ============================================

const testDatabaseConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    console.log('📅 Database time:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

// ============================================
// START SERVER
// ============================================

const startServer = async () => {
  try {
    // Test database connection before starting server
    const dbConnected = await testDatabaseConnection();
    
    if (!dbConnected) {
      console.error('⚠️ Server starting without database connection');
    }

    // Start listening
    server.listen(PORT, () => {
      console.log('\n' + '='.repeat(50));
      console.log('🚀 Restaurant Ordering System - Server Started');
      console.log('='.repeat(50));
      console.log(`📡 Server running on port: ${PORT}`);
      console.log(`🌍 Environment: ${NODE_ENV}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API base: http://localhost:${PORT}/api`);
      console.log('='.repeat(50) + '\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  
  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    
    try {
      // Close Socket.io connections
      io.close(() => {
        console.log('✅ Socket.io connections closed');
      });
      
      // Close database pool
      await pool.end();
      console.log('✅ Database pool closed');
      
      console.log('👋 Server shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds if graceful shutdown fails
  setTimeout(() => {
    console.error('⚠️ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server
startServer();