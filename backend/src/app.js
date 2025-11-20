// src/app.js
import express from "express";
import dotenv from "dotenv";

// Import middleware
import { errorHandler } from "./middleware/errorHandler.js";
import { logger } from "./middleware/logger.js";

// Import routes
import routes from "./routes/index.js";

dotenv.config();

const app = express();

// ============================================
// LOGGING MIDDLEWARE
// ============================================

// Custom request logger
app.use(logger);

// ============================================
// BODY PARSING MIDDLEWARE
// ============================================

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================
// STATIC FILES
// ============================================

// Serve static files (if needed for QR codes, images, etc.)
app.use('/public', express.static('public'));

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================
// API ROUTES
// ============================================

// Mount all routes under /api
app.use('/api', routes);

// ============================================
// 404 HANDLER (catch-all - must be after all other routes)
// ============================================

app.use((req, res, next) => {  // ✅ No path parameter - catches everything not matched above
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

// ============================================
// ERROR HANDLING MIDDLEWARE (must be last)
// ============================================

app.use(errorHandler);

export default app;