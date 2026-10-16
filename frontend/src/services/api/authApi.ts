/**
 * Authentication API service
 * Handles login, register, logout, and profile management
 */

import { apiClient } from './baseApi';
import { cacheConfirmedProfile, readConfirmedProfile, readTokenClaims } from './authOfflineIdentity';
import type { ApiResponse } from '@shared/types';

// Auth-specific types (these should eventually be added to shared types)
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface RefreshTokenRequest {
  refresh_token: string;
}

export interface UpdateProfileRequest {
  email?: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    email_verified: boolean;
    created_at: string;
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
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  display_name: string | null;
  notification_prefs: Record<string, boolean> | null;
  created_at: string;
  updated_at: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateSettingsRequest {
  display_name?: string | null;
  notification_prefs?: Record<string, boolean>;
}

export class AuthApi {
  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    // Invalidate pending work before beginning a replacement account attempt.
    this.clearTokens();
    const generation = apiClient.getSessionGeneration();
    const response = await apiClient.post<AuthResponse>('/auth/register', {
      email: data.email,
      password: data.password,
      first_name: data.firstName,
      last_name: data.lastName,
    });
    apiClient.assertSession(generation);
    if (response.success && response.data) {
      apiClient.setToken(response.data.access_token, true);
      this.storeRefreshToken(response.data.refresh_token);
    }
    return response;
  }

  /**
   * Login user
   */
  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    // Invalidate pending work before beginning a replacement account attempt.
    this.clearTokens();
    const generation = apiClient.getSessionGeneration();
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    apiClient.assertSession(generation);
    if (response.success && response.data) {
      apiClient.setToken(response.data.access_token, true);
      this.storeRefreshToken(response.data.refresh_token);
    }
    return response;
  }

  /**
   * Logout user
   */
  async logout(): Promise<ApiResponse<{ message: string }>> {
    // Start the remote logout with the old credentials, then end local access immediately.
    const request = apiClient.post<{ message: string }>('/auth/logout');
    apiClient.clearSession();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    try { return await request; } catch {
      return { success: true, data: { message: 'Signed out on this device.' } };
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<ApiResponse<TokenResponse>> {
    return apiClient.refreshSession();
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<ApiResponse<UserProfile>> {
    return this.confirmProfile(() => apiClient.get<UserProfile>('/auth/profile'));
  }

  /**
   * Update user profile
   */
  async updateProfile(data: UpdateProfileRequest): Promise<ApiResponse<UserProfile>> {
    return this.confirmProfile(() => apiClient.put<UserProfile>('/auth/profile', {
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
    }));
  }

  /**
   * Delete user account
   */
  async deleteAccount(): Promise<ApiResponse<{ message: string }>> {
    const generation = this.getSessionGeneration();
    const response = await apiClient.delete<{ message: string }>('/auth/profile');
    apiClient.assertSession(generation);

    // Clear tokens after account deletion
    if (response.success) {
      this.clearTokens();
    }

    return response;
  }

  /**
   * Get current user info (alternative endpoint)
   */
  async getCurrentUser(): Promise<ApiResponse<UserProfile>> {
    return this.confirmProfile(() => apiClient.get<UserProfile>('/auth/me'));
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return apiClient.isAuthenticated();
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return apiClient.getToken();
  }

  /**
   * Store refresh token securely
   */
  private storeRefreshToken(token: string): void {
    try {
      localStorage.setItem('refresh_token', token);
    } catch (error) {
      console.warn('Failed to store refresh token:', error);
    }
  }

  getSessionGeneration(): number {
    return apiClient.getSessionGeneration();
  }

  getCachedProfile(): UserProfile | null {
    return readConfirmedProfile(this.getAccessToken());
  }

  getAccessTokenExpiryMs(): number | null {
    return readTokenClaims(this.getAccessToken()).expiryMs;
  }

  private async confirmProfile(request: () => Promise<ApiResponse<UserProfile>>): Promise<ApiResponse<UserProfile>> {
    const generation = this.getSessionGeneration();
    const subject = readTokenClaims(this.getAccessToken()).subject;
    const response = await request();
    apiClient.assertSession(generation);
    if (response.success && response.data) {
      if (response.data.id !== subject || !cacheConfirmedProfile(this.getAccessToken(), response.data)) {
        throw new Error('Server profile does not match the current account. Connect again to confirm it.');
      }
    }
    return response;
  }

  private clearTokens(): void {
    apiClient.clearSession();
  }

  /** False is recoverable unless the API received a definitive server rejection. */
  async attemptTokenRefresh(): Promise<boolean> {
    try {
      const response = await this.refreshToken();
      return response.success;
    } catch {
      return false;
    }
  }

  /**
   * Clear authentication token (alias for logout)
   */
  clearToken(): void {
    this.clearTokens();
  }

  /**
   * Change user password
   */
  async changePassword(data: ChangePasswordRequest): Promise<ApiResponse<{ message: string }>> {
    return apiClient.put<{ message: string }>('/auth/password', {
      current_password: data.currentPassword,
      new_password: data.newPassword,
    });
  }

  /**
   * Get user settings
   */
  async getSettings(): Promise<ApiResponse<UserSettings>> {
    return apiClient.get<UserSettings>('/auth/settings');
  }

  /**
   * Update user settings
   */
  async updateSettings(data: UpdateSettingsRequest): Promise<ApiResponse<UserSettings>> {
    return apiClient.put<UserSettings>('/auth/settings', data);
  }
}

// Create singleton instance
export const authApi = new AuthApi();

// Export for testing
export default authApi;
