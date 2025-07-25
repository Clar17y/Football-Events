/**
 * Authentication API service
 * Handles login, register, logout, and profile management
 */

import { apiClient } from './baseApi';
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

export class AuthApi {
  /**
   * Register a new user
   */
  async register(data: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await apiClient.post<AuthResponse>('/auth/register', {
      email: data.email,
      password: data.password,
      first_name: data.firstName,
      last_name: data.lastName,
    });

    // Store tokens after successful registration
    if (response.success && response.data) {
      apiClient.setToken(response.data.access_token);
      this.storeRefreshToken(response.data.refresh_token);
    }

    return response;
  }

  /**
   * Login user
   */
  async login(data: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);

    // Store tokens after successful login
    if (response.success && response.data) {
      apiClient.setToken(response.data.access_token);
      this.storeRefreshToken(response.data.refresh_token);
    }

    return response;
  }

  /**
   * Logout user
   */
  async logout(): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await apiClient.post<{ message: string }>('/auth/logout');
      return response;
    } finally {
      // Always clear tokens, even if logout request fails
      this.clearTokens();
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<ApiResponse<TokenResponse>> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await apiClient.post<TokenResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    });

    // Update stored tokens
    if (response.success && response.data) {
      apiClient.setToken(response.data.access_token);
      this.storeRefreshToken(response.data.refresh_token);
    }

    return response;
  }

  /**
   * Get current user profile
   */
  async getProfile(): Promise<ApiResponse<UserProfile>> {
    return apiClient.get<UserProfile>('/auth/profile');
  }

  /**
   * Update user profile
   */
  async updateProfile(data: UpdateProfileRequest): Promise<ApiResponse<UserProfile>> {
    return apiClient.put<UserProfile>('/auth/profile', {
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
    });
  }

  /**
   * Delete user account
   */
  async deleteAccount(): Promise<ApiResponse<{ message: string }>> {
    const response = await apiClient.delete<{ message: string }>('/auth/profile');
    
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
    return apiClient.get<UserProfile>('/auth/me');
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

  /**
   * Get stored refresh token
   */
  private getRefreshToken(): string | null {
    try {
      return localStorage.getItem('refresh_token');
    } catch (error) {
      console.warn('Failed to get refresh token:', error);
      return null;
    }
  }

  /**
   * Clear all stored tokens
   */
  private clearTokens(): void {
    apiClient.setToken(null);
    try {
      localStorage.removeItem('refresh_token');
    } catch (error) {
      console.warn('Failed to clear refresh token:', error);
    }
  }

  /**
   * Attempt to refresh token automatically
   * Returns true if successful, false if refresh failed
   */
  async attemptTokenRefresh(): Promise<boolean> {
    try {
      await this.refreshToken();
      return true;
    } catch (error) {
      console.warn('Token refresh failed:', error);
      this.clearTokens();
      return false;
    }
  }

  /**
   * Clear authentication token (alias for logout)
   */
  clearToken(): void {
    this.clearTokens();
  }
}

// Create singleton instance
export const authApi = new AuthApi();

// Export for testing
export default authApi;