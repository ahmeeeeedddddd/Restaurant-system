// src/controllers/auth.controller.js
import * as authService from '../services/auth.service.js';
import { catchAsync } from '../middleware/errorHandler.js';

/**
 * @route   POST /api/auth/login
 * @desc    Login user (admin, cashier, kitchen, waiter)
 * @access  Public
 */
export const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  const result = await authService.loginUser(email, password);

  res.status(200).json({
    status: 'success',
    message: 'Login successful',
    data: result
  });
});

/**
 * @route   POST /api/auth/register/admin
 * @desc    Register new restaurant admin (owner/manager)
 * @access  Public (or can be restricted to super_admin only)
 */
export const registerAdmin = catchAsync(async (req, res, next) => {
  const { email, password, fullName, restaurantId, phone } = req.body;

  const result = await authService.registerAdmin({
    email,
    password,
    fullName,
    restaurantId,
    phone
  });

  res.status(201).json({
    status: 'success',
    message: 'Admin registered successfully',
    data: result
  });
});

/**
 * @route   POST /api/auth/register/staff
 * @desc    Register staff member (cashier, kitchen, waiter)
 * @access  Private (Admin only)
 */
export const registerStaff = catchAsync(async (req, res, next) => {
  const { email, password, fullName, role, phone } = req.body;

  // Admin can only create staff for their own restaurant
  const result = await authService.registerStaff(
    { email, password, fullName, role, phone },
    req.user.restaurantId
  );

  res.status(201).json({
    status: 'success',
    message: 'Staff member registered successfully',
    data: result
  });
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
export const refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;

  const result = await authService.refreshAccessToken(refreshToken);

  res.status(200).json({
    status: 'success',
    message: 'Token refreshed successfully',
    data: result
  });
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged-in user
 * @access  Private
 */
export const getCurrentUser = catchAsync(async (req, res, next) => {
  // req.user is populated by verifyToken middleware
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user
    }
  });
});

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
export const changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  await authService.changePassword(
    req.user.userId,
    currentPassword,
    newPassword
  );

  res.status(200).json({
    status: 'success',
    message: 'Password changed successfully'
  });
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal, optional server-side blacklist)
 * @access  Private
 */
export const logout = catchAsync(async (req, res, next) => {
  // In JWT, logout is typically handled client-side by removing the token
  // If you want server-side logout, you'd need to implement a token blacklist
  
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

export default {
  login,
  registerAdmin,
  registerStaff,
  refreshToken,
  getCurrentUser,
  changePassword,
  logout
};