javascript// src/middleware/logger.js

/**
 * Custom request logger middleware
 * Logs incoming requests with method, URL, and response time
 */
export const logger = (req, res, next) => {
  const start = Date.now();

  // Log when response is finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    
    // Color-code status codes
    let statusColor = '\x1b[32m'; // Green for 2xx
    if (res.statusCode >= 400 && res.statusCode < 500) {
      statusColor = '\x1b[33m'; // Yellow for 4xx
    } else if (res.statusCode >= 500) {
      statusColor = '\x1b[31m'; // Red for 5xx
    }

    console.log(
      `[${timestamp}] ${req.method} ${req.originalUrl} ${statusColor}${res.statusCode}\x1b[0m ${duration}ms`
    );
  });

  next();
};

export default logger;