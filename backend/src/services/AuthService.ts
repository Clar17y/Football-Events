import { Prisma, PrismaClient } from '@prisma/client';
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken } from '../utils/auth.js';
import type { RegisterRequest, LoginRequest, UpdateProfileRequest, ChangePasswordRequest, UpdateSettingsRequest } from '../validation/auth.js';

const prisma = new PrismaClient();

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    email_verified: boolean;
    created_at: Date;
  };
  access_token: string;
  refresh_token: string;
}

export interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserSettings {
  id: string;
  user_id: string;
  display_name: string | null;
  notification_prefs: Record<string, boolean> | null;
  created_at: Date;
  updated_at: Date;
}

export class AuthService {
  /**
   * Register a new user with soft delete restoration
   */
  static async register(data: RegisterRequest): Promise<AuthResponse> {
    // Check if user already exists (including soft-deleted)
    const existingUser = await prisma.user.findFirst({
      where: {
        email: data.email
      }
    });

    // If user exists and is soft-deleted, restore them
    if (existingUser && existingUser.is_deleted) {
      // Hash new password
      const password_hash = await hashPassword(data.password);

      const restoredUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password_hash,
          first_name: data.first_name || null,
          last_name: data.last_name || null,
          role: 'USER',
          email_verified: false,
          // Reset soft delete fields
          is_deleted: false,
          deleted_at: null,
          deleted_by_user_id: null,
          updated_at: new Date()
        },
        select: {
          id: true,
          email: true,
          first_name: true,
          last_name: true,
          role: true,
          email_verified: true,
          created_at: true
        }
      });

      // Generate tokens
      const access_token = generateAccessToken(restoredUser.id, restoredUser.email, restoredUser.role);
      const refresh_token = generateRefreshToken(restoredUser.id, restoredUser.email, restoredUser.role);

      return {
        user: restoredUser,
        access_token,
        refresh_token
      };
    }

    // If user exists and is not deleted, throw error
    if (existingUser && !existingUser.is_deleted) {
      const error = new Error('User with this email already exists') as any;
      error.statusCode = 409;
      throw error;
    }

    // Hash password
    const password_hash = await hashPassword(data.password);

    // Create new user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password_hash,
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        role: 'USER', // Default role
        email_verified: false // Will implement email verification later
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        email_verified: true,
        created_at: true
      }
    });

    // Generate tokens
    const access_token = generateAccessToken(user.id, user.email, user.role);
    const refresh_token = generateRefreshToken(user.id, user.email, user.role);

    return {
      user,
      access_token,
      refresh_token
    };
  }

  /**
   * Login user
   */
  static async login(data: LoginRequest): Promise<AuthResponse> {
    // Find user
    const user = await prisma.user.findFirst({
      where: {
        email: data.email,
        is_deleted: false
      }
    });

    if (!user) {
      const error = new Error('Invalid email or password') as any;
      error.statusCode = 401;
      throw error;
    }

    // Check password
    const isValidPassword = await comparePassword(data.password, user.password_hash);
    if (!isValidPassword) {
      const error = new Error('Invalid email or password') as any;
      error.statusCode = 401;
      throw error;
    }

    // Generate tokens
    const access_token = generateAccessToken(user.id, user.email, user.role);
    const refresh_token = generateRefreshToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        email_verified: user.email_verified,
        created_at: user.created_at
      },
      access_token,
      refresh_token
    };
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refresh_token: string): Promise<{ access_token: string; refresh_token: string }> {
    try {
      const { verifyToken } = await import('../utils/auth.js');
      const decoded = verifyToken(refresh_token);

      // Ensure it's a refresh token
      if (decoded.type !== 'refresh') {
        const error = new Error('Invalid token type') as any;
        error.statusCode = 401;
        throw error;
      }

      // Verify user still exists and is active
      const user = await prisma.user.findFirst({
        where: {
          id: decoded.userId,
          is_deleted: false
        }
      });

      if (!user) {
        const error = new Error('User not found') as any;
        error.statusCode = 404;
        throw error;
      }

      // Generate new tokens
      const new_access_token = generateAccessToken(user.id, user.email, user.role);
      const new_refresh_token = generateRefreshToken(user.id, user.email, user.role);

      return {
        access_token: new_access_token,
        refresh_token: new_refresh_token
      };
    } catch (error) {
      const authError = new Error('Invalid refresh token') as any;
      authError.statusCode = 401;
      throw authError;
    }
  }

  /**
   * Get user profile
   */
  static async getProfile(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        is_deleted: false
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        email_verified: true,
        created_at: true,
        updated_at: true
      }
    });

    if (!user) {
      const error = new Error('User not found') as any;
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId: string, data: UpdateProfileRequest): Promise<UserProfile> {
    // If email is being updated, check it's not already taken
    if (data.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email,
          is_deleted: false,
          NOT: {
            id: userId
          }
        }
      });

      if (existingUser) {
        const error = new Error('Email already in use') as any;
        error.statusCode = 409;
        throw error;
      }
    }

    const user = await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        ...(data.email && { email: data.email }),
        ...(data.first_name !== undefined && { first_name: data.first_name }),
        ...(data.last_name !== undefined && { last_name: data.last_name }),
        updated_at: new Date()
      },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        email_verified: true,
        created_at: true,
        updated_at: true
      }
    });

    return user;
  }

  /**
   * Delete user (soft delete)
   */
  static async deleteUser(userId: string, deletedByUserId: string): Promise<void> {
    await prisma.user.update({
      where: {
        id: userId
      },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
        deleted_by_user_id: deletedByUserId
      }
    });
  }

  /**
   * Change user password
   */
  static async changePassword(userId: string, data: ChangePasswordRequest): Promise<void> {
    // Get current user with password hash
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        is_deleted: false
      }
    });

    if (!user) {
      const error = new Error('User not found') as any;
      error.statusCode = 404;
      throw error;
    }

    // Verify current password
    const isValidPassword = await comparePassword(data.current_password, user.password_hash);
    if (!isValidPassword) {
      const error = new Error('Current password is incorrect') as any;
      error.statusCode = 401;
      throw error;
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(data.new_password);
    await prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
        updated_at: new Date()
      }
    });
  }

  /**
   * Get user settings (creates if doesn't exist)
   */
  static async getSettings(userId: string): Promise<UserSettings> {
    let settings = await prisma.user_settings.findUnique({
      where: { user_id: userId }
    });

    // Create settings if they don't exist
    if (!settings) {
      settings = await prisma.user_settings.create({
        data: {
          user_id: userId
        }
      });
    }

    return {
      id: settings.id,
      user_id: settings.user_id,
      display_name: settings.display_name,
      notification_prefs: settings.notification_prefs as Record<string, boolean> | null,
      created_at: settings.created_at,
      updated_at: settings.updated_at
    };
  }

  /**
   * Update user settings (creates if doesn't exist)
   */
  static async updateSettings(userId: string, data: UpdateSettingsRequest): Promise<UserSettings> {
    const settings = await prisma.user_settings.upsert({
      where: { user_id: userId },
      update: {
        ...(data.display_name !== undefined && { display_name: data.display_name }),
        ...(data.notification_prefs !== undefined && { notification_prefs: data.notification_prefs })
      },
      create: {
        user_id: userId,
        display_name: data.display_name ?? null,
        notification_prefs: data.notification_prefs ?? Prisma.DbNull
      }
    });

    return {
      id: settings.id,
      user_id: settings.user_id,
      display_name: settings.display_name,
      notification_prefs: settings.notification_prefs as Record<string, boolean> | null,
      created_at: settings.created_at,
      updated_at: settings.updated_at
    };
  }
}