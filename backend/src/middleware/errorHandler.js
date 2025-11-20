// src/middleware/errorHandler.js

/**
 * Custom Application Error Class
 * Extends the built-in Error class to include statusCode and isOperational flag
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Distinguishes operational errors from programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async Error Wrapper
 * Wraps async route handlers to catch errors and pass them to error handler
 * Usage: router.get('/path', catchAsync(async (req, res, next) => { ... }))
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle Database Errors
 */
const handleDatabaseError = (err) => {
  // PostgreSQL error codes
  if (err.code === '23505') {
    // Unique violation
    const field = err.detail?.match(/Key \((.*?)\)/)?.[1] || 'field';
    return new AppError(`Duplicate value for ${field}. This ${field} already exists.`, 409);
  }

  if (err.code === '23503') {
    // Foreign key violation
    return new AppError('Referenced record does not exist.', 400);
  }

  if (err.code === '23502') {
    // Not null violation
    const field = err.column || 'field';
    return new AppError(`${field} is required.`, 400);
  }

  if (err.code === '22P02') {
    // Invalid text representation
    return new AppError('Invalid data format provided.', 400);
  }

  if (err.code === '42703') {
    // Undefined column
    return new AppError('Database query error: invalid column.', 500);
  }

  // Sequelize specific errors
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map(e => e.message).join(', ');
    return new AppError(`Validation error: ${messages}`, 400);
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return new AppError(`${field} already exists.`, 409);
  }

  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return new AppError('Referenced record does not exist.', 400);
  }

  return null; // Not a recognized database error
};

/**
 * Handle JWT Errors
 */
const handleJWTError = () => {
  return new AppError('Invalid token. Please log in again.', 401);
};

const handleJWTExpiredError = () => {
  return new AppError('Your token has expired. Please log in again.', 401);
};

/**
 * Handle Validation Errors (from Joi/Zod/express-validator)
 */
const handleValidationError = (err) => {
  // Joi validation error
  if (err.isJoi || err.name === 'ValidationError') {
    const messages = err.details?.map(d => d.message).join(', ') || err.message;
    return new AppError(`Validation error: ${messages}`, 400);
  }

  // Zod validation error
  if (err.name === 'ZodError') {
    const messages = err.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
    return new AppError(`Validation error: ${messages}`, 400);
  }

  return null;
};

/**
 * Send Error Response in Development Mode
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack
  });
};

/**
 * Send Error Response in Production Mode
 */
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message
    });
  } else {
    // Programming or unknown error: don't leak error details
    console.error('ERROR 💥:', err);
    
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong on the server.'
    });
  }
};

/**
 * Main Error Handler Middleware
 * This should be the last middleware in your app
 */
export const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else if (process.env.NODE_ENV === 'production') {
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;
    error.code = err.code;

    // Handle specific error types
    const dbError = handleDatabaseError(error);
    if (dbError) error = dbError;

    const validationError = handleValidationError(error);
    if (validationError) error = validationError;

    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    // Handle invalid ObjectId (if using MongoDB alongside)
    if (error.name === 'CastError') {
      error = new AppError('Invalid ID format.', 400);
    }

    sendErrorProd(error, res);
  }
};

/**
 * 404 Not Found Handler
 * Use this before the error handler middleware
 */
export const notFound = (req, res, next) => {
  const err = new AppError(`Cannot find ${req.originalUrl} on this server.`, 404);
  next(err);
};

/**
 * Predefined Error Generators
 * Convenience functions for common errors
 */
export const ErrorTypes = {
  // Authentication & Authorization
  Unauthorized: (message = 'You are not logged in. Please log in to get access.') => 
    new AppError(message, 401),
  
  Forbidden: (message = 'You do not have permission to perform this action.') => 
    new AppError(message, 403),
  
  InvalidCredentials: () => 
    new AppError('Invalid email or password.', 401),
  
  TokenExpired: () => 
    new AppError('Your session has expired. Please log in again.', 401),

  // Resource Errors
  NotFound: (resource = 'Resource') => 
    new AppError(`${resource} not found.`, 404),
  
  AlreadyExists: (resource = 'Resource') => 
    new AppError(`${resource} already exists.`, 409),

  // Validation Errors
  BadRequest: (message = 'Invalid request data.') => 
    new AppError(message, 400),
  
  InvalidInput: (field) => 
    new AppError(`Invalid ${field} provided.`, 400),

  // Business Logic Errors
  TableOccupied: () => 
    new AppError('This table is currently occupied.', 400),
  
  MenuItemUnavailable: (itemName) => 
    new AppError(`${itemName} is currently unavailable.`, 400),
  
  InvalidOrderStatus: () => 
    new AppError('Cannot perform this action on order with current status.', 400),
  
  PaymentFailed: (message = 'Payment processing failed.') => 
    new AppError(message, 402),
  
  InsufficientPermissions: () => 
    new AppError('You do not have sufficient permissions for this restaurant.', 403),

  // Server Errors
  InternalError: (message = 'An internal server error occurred.') => 
    new AppError(message, 500),
  
  ServiceUnavailable: (service = 'Service') => 
    new AppError(`${service} is temporarily unavailable.`, 503)
};