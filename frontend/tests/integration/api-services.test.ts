/**
 * Integration tests for frontend API services
 * Tests against real backend using MCP server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { authApi } from '../../src/services/api/authApi';
import { apiClient } from '../../src/services/api/baseApi';

describe('Frontend API Services Integration Tests', () => {
  let testUser: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };

  beforeAll(async () => {
    // Generate unique test user for this test run
    const timestamp = Date.now();
    testUser = {
      email: `test-frontend-${timestamp}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Frontend',
      lastName: 'Test'
    };
  });

  beforeEach(() => {
    // Clear any existing tokens before each test
    apiClient.setToken(null);
    localStorage.clear();
  });

  afterAll(() => {
    // Clean up after all tests
    localStorage.clear();
  });

  describe('AuthApi', () => {
    describe('User Registration', () => {
      it('should register a new user successfully', async () => {
        const response = await authApi.register({
          email: testUser.email,
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
        });

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(response.data.user.email).toBe(testUser.email);
        expect(response.data.user.first_name).toBe(testUser.firstName);
        expect(response.data.user.last_name).toBe(testUser.lastName);
        expect(response.data.user.role).toBe('USER');
        expect(response.data.access_token).toBeDefined();
        expect(response.data.refresh_token).toBeDefined();

        // Verify tokens are stored
        expect(authApi.isAuthenticated()).toBe(true);
        expect(authApi.getAccessToken()).toBe(response.data.access_token);
      });

      it('should reject registration with invalid email', async () => {
        await expect(authApi.register({
          email: 'invalid-email',
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
        })).rejects.toThrow();
      });

      it('should reject registration with weak password', async () => {
        await expect(authApi.register({
          email: `weak-password-${Date.now()}@example.com`,
          password: '123',
          firstName: testUser.firstName,
          lastName: testUser.lastName,
        })).rejects.toThrow();
      });

      it('should reject duplicate email registration', async () => {
        // Try to register with same email again
        await expect(authApi.register({
          email: testUser.email,
          password: testUser.password,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
        })).rejects.toThrow();
      });
    });

    describe('User Login', () => {
      it('should login with valid credentials', async () => {
        const response = await authApi.login({
          email: testUser.email,
          password: testUser.password,
        });

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(response.data.user.email).toBe(testUser.email);
        expect(response.data.access_token).toBeDefined();
        expect(response.data.refresh_token).toBeDefined();

        // Verify tokens are stored
        expect(authApi.isAuthenticated()).toBe(true);
        expect(authApi.getAccessToken()).toBe(response.data.access_token);
      });

      it('should reject login with invalid email', async () => {
        await expect(authApi.login({
          email: 'nonexistent@example.com',
          password: testUser.password,
        })).rejects.toThrow();
      });

      it('should reject login with invalid password', async () => {
        await expect(authApi.login({
          email: testUser.email,
          password: 'wrongpassword',
        })).rejects.toThrow();
      });
    });

    describe('Profile Management', () => {
      beforeEach(async () => {
        // Login before each profile test
        await authApi.login({
          email: testUser.email,
          password: testUser.password,
        });
      });

      it('should get user profile', async () => {
        const response = await authApi.getProfile();

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(response.data.email).toBe(testUser.email);
        expect(response.data.first_name).toBe(testUser.firstName);
        expect(response.data.last_name).toBe(testUser.lastName);
        expect(response.data.role).toBe('USER');
      });

      it('should get current user info', async () => {
        const response = await authApi.getCurrentUser();

        expect(response.success).toBe(true);
        expect(response.data).toBeDefined();
        expect(response.data.email).toBe(testUser.email);
      });

      it('should update user profile', async () => {
        const updatedData = {
          firstName: 'Updated',
          lastName: 'Name',
        };

        const response = await authApi.updateProfile(updatedData);

        expect(response.success).toBe(true);
        expect(response.data.first_name).toBe(updatedData.firstName);
        expect(response.data.last_name).toBe(updatedData.lastName);
        expect(response.data.email).toBe(testUser.email); // Should remain unchanged
      });
    });

    describe('Token Management', () => {
      let refreshToken: string;

      beforeEach(async () => {
        // Login and capture refresh token
        const loginResponse = await authApi.login({
          email: testUser.email,
          password: testUser.password,
        });
        refreshToken = loginResponse.data.refresh_token;
      });

      it('should refresh access token', async () => {
        const response = await authApi.refreshToken();

        expect(response.success).toBe(true);
        expect(response.data.access_token).toBeDefined();
        expect(response.data.refresh_token).toBeDefined();
        
        // New tokens should be different from original
        expect(response.data.access_token).not.toBe(authApi.getAccessToken());
        expect(response.data.refresh_token).not.toBe(refreshToken);
      });

      it('should handle token refresh failure gracefully', async () => {
        // Clear tokens to simulate invalid refresh token
        apiClient.setToken(null);
        localStorage.removeItem('refresh_token');
        
        // Ensure we're starting with a clean state
        expect(authApi.isAuthenticated()).toBe(false);

        // Test the refresh attempt - should return false when no refresh token
        try {
          const success = await authApi.attemptTokenRefresh();
          expect(success).toBe(false);
          expect(authApi.isAuthenticated()).toBe(false);
        } catch (error) {
          // If it throws an error instead of returning false, that's also acceptable
          // as long as the tokens are cleared
          expect(authApi.isAuthenticated()).toBe(false);
        }
      });
    });

    describe('Logout', () => {
      beforeEach(async () => {
        // Login before logout test
        await authApi.login({
          email: testUser.email,
          password: testUser.password,
        });
      });

      it('should logout successfully', async () => {
        expect(authApi.isAuthenticated()).toBe(true);

        const response = await authApi.logout();

        expect(response.success).toBe(true);
        expect(authApi.isAuthenticated()).toBe(false);
        expect(authApi.getAccessToken()).toBe(null);
      });
    });
  });

  describe('BaseApi Error Handling', () => {
    it('should handle 401 unauthorized errors', async () => {
      // Set invalid token
      apiClient.setToken('invalid-token');

      await expect(authApi.getProfile()).rejects.toMatchObject({
        status: 401,
        message: expect.stringContaining('Authentication required'),
      });

      // Token should be cleared after 401 error
      expect(authApi.isAuthenticated()).toBe(false);
    });

    it('should handle network errors', async () => {
      // Mock fetch to simulate network error
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Network error'));

      await expect(authApi.login({
        email: testUser.email,
        password: testUser.password,
      })).rejects.toThrow('Network error');

      // Restore original fetch
      global.fetch = originalFetch;
    });
  });
});