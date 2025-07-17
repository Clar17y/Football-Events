import { z } from 'zod';

// User registration schema
export const registerSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .min(1, 'Email is required')
    .max(255, 'Email must be less than 255 characters'),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    ),
  
  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .optional(),
  
  last_name: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .optional()
});

// User login schema
export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .min(1, 'Email is required'),
  
  password: z
    .string()
    .min(1, 'Password is required')
});

// Refresh token schema
export const refreshTokenSchema = z.object({
  refresh_token: z
    .string()
    .min(1, 'Refresh token is required')
});

// Password reset request schema
export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .min(1, 'Email is required')
});

// Password reset schema
export const resetPasswordSchema = z.object({
  token: z
    .string()
    .min(1, 'Reset token is required'),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one lowercase letter, one uppercase letter, and one number'
    )
});

// Update profile schema
export const updateProfileSchema = z.object({
  first_name: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be less than 50 characters')
    .optional(),
  
  last_name: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be less than 50 characters')
    .optional(),
  
  email: z
    .string()
    .email('Invalid email format')
    .min(1, 'Email is required')
    .max(255, 'Email must be less than 255 characters')
    .optional()
});

// Type exports
export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;