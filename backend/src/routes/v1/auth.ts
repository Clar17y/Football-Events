import { Router } from 'express';
import { AuthService } from '../../services/AuthService.js';
import { authenticateToken } from '../../middleware/auth.js';
import { validateRequest } from '../../middleware/validation.js';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateProfileSchema,
  changePasswordSchema,
  updateSettingsSchema
} from '../../validation/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Register a new user
 */
router.post('/register', validateRequest(registerSchema), asyncHandler(async (req, res) => {
  const result = await AuthService.register(req.body);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    data: result
  });
}));

/**
 * POST /api/v1/auth/login
 * Login user
 */
router.post('/login', validateRequest(loginSchema), asyncHandler(async (req, res) => {
  const result = await AuthService.login(req.body);

  res.json({
    success: true,
    message: 'Login successful',
    data: result
  });
}));

/**
 * POST /api/v1/auth/refresh
 * Refresh access token
 */
router.post('/refresh', validateRequest(refreshTokenSchema), asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  const result = await AuthService.refreshToken(refresh_token);

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: result
  });
}));

/**
 * POST /api/v1/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', asyncHandler(async (_req, res) => {
  // For JWT, logout is handled client-side by removing the token
  // In the future, we could implement a token blacklist
  res.json({
    success: true,
    message: 'Logout successful'
  });
}));

/**
 * GET /api/v1/auth/profile
 * Get current user profile
 */
router.get('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const user = await AuthService.getProfile(req.user!.id);

  res.json({
    success: true,
    data: user
  });
}));

/**
 * PUT /api/v1/auth/profile
 * Update current user profile
 */
router.put('/profile',
  authenticateToken,
  validateRequest(updateProfileSchema),
  asyncHandler(async (req, res) => {
    const user = await AuthService.updateProfile(req.user!.id, req.body);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  })
);

/**
 * DELETE /api/v1/auth/profile
 * Delete current user account (soft delete)
 */
router.delete('/profile', authenticateToken, asyncHandler(async (req, res) => {
  await AuthService.deleteUser(req.user!.id, req.user!.id);

  res.json({
    success: true,
    message: 'Account deleted successfully'
  });
}));

/**
 * GET /api/v1/auth/me
 * Get current user info (alias for /profile)
 */
router.get('/me', authenticateToken, asyncHandler(async (req, res) => {
  const user = await AuthService.getProfile(req.user!.id);

  res.json({
    success: true,
    data: user
  });
}));

/**
 * PUT /api/v1/auth/password
 * Change current user's password
 */
router.put('/password',
  authenticateToken,
  validateRequest(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await AuthService.changePassword(req.user!.id, req.body);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  })
);

/**
 * GET /api/v1/auth/settings
 * Get user settings
 */
router.get('/settings', authenticateToken, asyncHandler(async (req, res) => {
  const settings = await AuthService.getSettings(req.user!.id);

  res.json({
    success: true,
    data: settings
  });
}));

/**
 * PUT /api/v1/auth/settings
 * Update user settings
 */
router.put('/settings',
  authenticateToken,
  validateRequest(updateSettingsSchema),
  asyncHandler(async (req, res) => {
    const settings = await AuthService.updateSettings(req.user!.id, req.body);

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  })
);

export default router;