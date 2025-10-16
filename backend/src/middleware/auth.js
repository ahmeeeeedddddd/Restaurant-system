// src/middleware/auth.js
import jwt from "jsonwebtoken";
import { query } from "../config/database.js";
import { AppError } from "./errorHandler.js";

/**
 * Verify JWT token and attach user to request
 * Usage: router.get('/protected', verifyToken, controller)
 */
export const verifyToken = async (req, res, next) => {
  try {
    // 1. Get token from header
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in. Please log in to access this resource.', 401));
    }

    // 2. Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 3. Check if user still exists
    const result = await query(
      'SELECT user_id, email, full_name, role, restaurant_id, is_active FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    const user = result.rows[0];

    // 4. Check if user is active
    if (!user.is_active) {
      return next(new AppError('Your account has been deactivated. Please contact support.', 401));
    }

    // 5. Attach user to request object
    req.user = {
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      restaurantId: user.restaurant_id
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    return next(error);
  }
};

/**
 * Restrict access to specific roles
 * Usage: router.delete('/admin-only', verifyToken, restrictTo('admin', 'super_admin'), controller)
 * 
 * @param  {...string} roles - Allowed roles
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('You must be logged in to access this resource.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action.', 403)
      );
    }

    next();
  };
};

/**
 * Optional authentication - doesn't fail if no token
 * Useful for routes that work differently for logged-in users
 * Usage: router.get('/menu', optionalAuth, controller)
 */
export const optionalAuth = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(); // No token, continue without user
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user
    const result = await query(
      'SELECT user_id, email, full_name, role, restaurant_id, is_active FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (result.rows.length > 0 && result.rows[0].is_active) {
      const user = result.rows[0];
      req.user = {
        userId: user.user_id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        restaurantId: user.restaurant_id
      };
    }

    next();
  } catch (error) {
    // If token is invalid, just continue without user
    next();
  }
};

/**
 * Check if user belongs to the restaurant in the request
 * Used to prevent users from accessing other restaurants' data
 * Usage: router.get('/restaurant/:restaurantId/orders', verifyToken, checkRestaurantAccess, controller)
 */
export const checkRestaurantAccess = (req, res, next) => {
  const requestedRestaurantId = parseInt(req.params.restaurantId) || parseInt(req.body.restaurantId);

  // Super admin can access all restaurants
  if (req.user.role === 'super_admin') {
    return next();
  }

  // Check if user's restaurant matches requested restaurant
  if (req.user.restaurantId !== requestedRestaurantId) {
    return next(
      new AppError('You do not have access to this restaurant.', 403)
    );
  }

  next();
};

/**
 * Verify restaurant slug and attach restaurant ID to request
 * Usage: router.get('/r/:slug/menu', verifyRestaurantSlug, controller)
 */
export const verifyRestaurantSlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const result = await query(
      'SELECT restaurant_id, name, is_active FROM restaurants WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Restaurant not found.', 404));
    }

    const restaurant = result.rows[0];

    if (!restaurant.is_active) {
      return next(new AppError('This restaurant is currently inactive.', 403));
    }

    // Attach restaurant info to request
    req.restaurant = {
      restaurantId: restaurant.restaurant_id,
      name: restaurant.name,
      slug: slug
    };

    next();
  } catch (error) {
    return next(error);
  }
};

export default { verifyToken, restrictTo, optionalAuth, checkRestaurantAccess, verifyRestaurantSlug };