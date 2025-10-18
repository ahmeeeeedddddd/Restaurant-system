// src/services/auth.service.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/database.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Generate JWT token
 * @param {number} userId - User ID
 * @param {string} role - User role
 * @returns {string} JWT token
 */
export const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Generate refresh token
 * @param {number} userId - User ID
 * @returns {string} Refresh token
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
};

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
};

/**
 * Compare password with hashed password
 * @param {string} candidatePassword - Plain text password
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} True if passwords match
 */
export const comparePasswords = async (candidatePassword, hashedPassword) => {
  return await bcrypt.compare(candidatePassword, hashedPassword);
};

/**
 * Login user
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Object>} User data and token
 */
export const loginUser = async (email, password) => {
  // 1. Check if email and password exist
  if (!email || !password) {
    throw new AppError('Please provide email and password', 400);
  }

  // 2. Check if user exists
  const result = await query(
    `SELECT u.user_id, u.email, u.password_hash, u.full_name, u.role, 
            u.restaurant_id, u.is_active, r.name as restaurant_name, r.slug as restaurant_slug
     FROM users u
     LEFT JOIN restaurants r ON u.restaurant_id = r.restaurant_id
     WHERE u.email = $1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    throw new AppError('Invalid email or password', 401);
  }

  const user = result.rows[0];

  // 3. Check if user is active
  if (!user.is_active) {
    throw new AppError('Your account has been deactivated. Please contact support.', 401);
  }

  // 4. Check if password is correct
  const isPasswordCorrect = await comparePasswords(password, user.password_hash);
  
  if (!isPasswordCorrect) {
    throw new AppError('Invalid email or password', 401);
  }

  // 5. Update last login timestamp
  await query(
    'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
    [user.user_id]
  );

  // 6. Generate tokens
  const token = generateToken(user.user_id, user.role);
  const refreshToken = generateRefreshToken(user.user_id);

  // 7. Return user data (without password hash)
  return {
    user: {
      userId: user.user_id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      restaurantId: user.restaurant_id,
      restaurantName: user.restaurant_name,
      restaurantSlug: user.restaurant_slug
    },
    token,
    refreshToken
  };
};

/**
 * Register a new admin user (restaurant owner)
 * @param {Object} userData - User registration data
 * @returns {Promise<Object>} Created user data and token
 */
export const registerAdmin = async (userData) => {
  const { email, password, fullName, restaurantId, phone } = userData;

  // 1. Validate required fields
  if (!email || !password || !fullName || !restaurantId) {
    throw new AppError('Please provide all required fields: email, password, fullName, restaurantId', 400);
  }

  // 2. Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Please provide a valid email address', 400);
  }

  // 3. Validate password strength (minimum 8 characters)
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters long', 400);
  }

  // 4. Check if restaurant exists
  const restaurantCheck = await query(
    'SELECT restaurant_id, is_active FROM restaurants WHERE restaurant_id = $1',
    [restaurantId]
  );

  if (restaurantCheck.rows.length === 0) {
    throw new AppError('Restaurant not found', 404);
  }

  if (!restaurantCheck.rows[0].is_active) {
    throw new AppError('This restaurant is not active', 400);
  }

  // 5. Check if email already exists
  const emailCheck = await query(
    'SELECT user_id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (emailCheck.rows.length > 0) {
    throw new AppError('A user with this email already exists', 400);
  }

  // 6. Hash password
  const hashedPassword = await hashPassword(password);

  // 7. Create user
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, role, restaurant_id, phone, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING user_id, email, full_name, role, restaurant_id, phone, created_at`,
    [email.toLowerCase(), hashedPassword, fullName, 'admin', restaurantId, phone || null, true]
  );

  const newUser = result.rows[0];

  // 8. Generate tokens
  const token = generateToken(newUser.user_id, newUser.role);
  const refreshToken = generateRefreshToken(newUser.user_id);

  // 9. Return user data
  return {
    user: {
      userId: newUser.user_id,
      email: newUser.email,
      fullName: newUser.full_name,
      role: newUser.role,
      restaurantId: newUser.restaurant_id,
      phone: newUser.phone,
      createdAt: newUser.created_at
    },
    token,
    refreshToken
  };
};

/**
 * Register staff member (cashier, kitchen, waiter)
 * Can only be done by admin of the same restaurant
 * @param {Object} userData - Staff registration data
 * @param {number} adminRestaurantId - Admin's restaurant ID
 * @returns {Promise<Object>} Created staff data
 */
export const registerStaff = async (userData, adminRestaurantId) => {
  const { email, password, fullName, role, phone } = userData;

  // 1. Validate required fields
  if (!email || !password || !fullName || !role) {
    throw new AppError('Please provide all required fields: email, password, fullName, role', 400);
  }

  // 2. Validate role (cannot create admin or super_admin through this endpoint)
  const allowedRoles = ['cashier', 'kitchen', 'waiter'];
  if (!allowedRoles.includes(role)) {
    throw new AppError('Invalid role. Allowed roles: cashier, kitchen, waiter', 400);
  }

  // 3. Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new AppError('Please provide a valid email address', 400);
  }

  // 4. Validate password strength
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters long', 400);
  }

  // 5. Check if email already exists
  const emailCheck = await query(
    'SELECT user_id FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (emailCheck.rows.length > 0) {
    throw new AppError('A user with this email already exists', 400);
  }

  // 6. Hash password
  const hashedPassword = await hashPassword(password);

  // 7. Create staff member
  const result = await query(
    `INSERT INTO users (email, password_hash, full_name, role, restaurant_id, phone, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING user_id, email, full_name, role, restaurant_id, phone, created_at`,
    [email.toLowerCase(), hashedPassword, fullName, role, adminRestaurantId, phone || null, true]
  );

  const newStaff = result.rows[0];

  return {
    userId: newStaff.user_id,
    email: newStaff.email,
    fullName: newStaff.full_name,
    role: newStaff.role,
    restaurantId: newStaff.restaurant_id,
    phone: newStaff.phone,
    createdAt: newStaff.created_at
  };
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New access token
 */
export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    throw new AppError('Refresh token is required', 400);
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );

    // Check if user still exists
    const result = await query(
      'SELECT user_id, role, is_active FROM users WHERE user_id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      throw new AppError('User not found', 401);
    }

    const user = result.rows[0];

    if (!user.is_active) {
      throw new AppError('User account is deactivated', 401);
    }

    // Generate new access token
    const newToken = generateToken(user.user_id, user.role);

    return {
      token: newToken
    };
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      throw new AppError('Invalid or expired refresh token', 401);
    }
    throw error;
  }
};

/**
 * Change user password
 * @param {number} userId - User ID
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @returns {Promise<void>}
 */
export const changePassword = async (userId, currentPassword, newPassword) => {
  // 1. Validate input
  if (!currentPassword || !newPassword) {
    throw new AppError('Please provide current and new password', 400);
  }

  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters long', 400);
  }

  // 2. Get user
  const result = await query(
    'SELECT password_hash FROM users WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new AppError('User not found', 404);
  }

  // 3. Verify current password
  const isPasswordCorrect = await comparePasswords(currentPassword, result.rows[0].password_hash);
  
  if (!isPasswordCorrect) {
    throw new AppError('Current password is incorrect', 401);
  }

  // 4. Hash new password
  const hashedPassword = await hashPassword(newPassword);

  // 5. Update password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
    [hashedPassword, userId]
  );
};

export default {
  generateToken,
  generateRefreshToken,
  hashPassword,
  comparePasswords,
  loginUser,
  registerAdmin,
  registerStaff,
  refreshAccessToken,
  changePassword
};