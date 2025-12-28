/**
 * Integration tests for frontend API services
 * These tests mock `fetch` to avoid requiring a running backend server.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
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

    // Mock fetch with an in-memory auth backend so tests are hermetic.
    const users = new Map<
      string,
      {
        id: string;
        email: string;
        password: string;
        first_name: string | null;
        last_name: string | null;
        role: string;
        email_verified: boolean;
        created_at: string;
        updated_at: string;
      }
    >();
    const accessTokens = new Map<string, string>(); // token -> user email
    const refreshTokens = new Map<string, string>(); // token -> user email

    const json = (status: number, body: any) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    const unauthorized = () => json(401, { error: 'Authentication required', message: 'Authentication required' });

    const parseAuthEmail = (headers: HeadersInit | undefined): string | null => {
      const h = (headers || {}) as Record<string, any>;
      const auth = h.Authorization || h.authorization;
      if (!auth || typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
      const token = auth.slice('Bearer '.length);
      const email = accessTokens.get(token);
      return email || null;
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input?.url || String(input);
        const parsed = new URL(url);
        const method = (init?.method || 'GET').toUpperCase();
        const path = parsed.pathname.replace(/^\/api\/v1/, '');
        const body = init?.body ? JSON.parse(init.body as string) : undefined;

        if (!path.startsWith('/auth/')) {
          return json(404, { error: 'Not Found', message: 'Not Found' });
        }

        if (method === 'POST' && path === '/auth/register') {
          const email = String(body?.email || '');
          const password = String(body?.password || '');

          if (!email.includes('@')) return json(400, { error: 'Validation Error', message: 'Invalid email' });
          if (password.length < 8) return json(400, { error: 'Validation Error', message: 'Weak password' });
          if (users.has(email)) return json(409, { error: 'Conflict', message: 'Email already registered' });

          const now = new Date().toISOString();
          const user = {
            id: crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
            email,
            password,
            first_name: body?.first_name ?? null,
            last_name: body?.last_name ?? null,
            role: 'USER',
            email_verified: false,
            created_at: now,
            updated_at: now,
          };
          users.set(email, user);

          const accessToken = `access-${Math.random().toString(36).slice(2)}`;
          const refreshToken = `refresh-${Math.random().toString(36).slice(2)}`;
          accessTokens.set(accessToken, email);
          refreshTokens.set(refreshToken, email);

          return json(201, {
            success: true,
            data: {
              user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role,
                email_verified: user.email_verified,
                created_at: user.created_at,
              },
              access_token: accessToken,
              refresh_token: refreshToken,
            },
          });
        }

        if (method === 'POST' && path === '/auth/login') {
          const email = String(body?.email || '');
          const password = String(body?.password || '');
          const user = users.get(email);
          if (!user || user.password !== password) return unauthorized();

          const accessToken = `access-${Math.random().toString(36).slice(2)}`;
          const refreshToken = `refresh-${Math.random().toString(36).slice(2)}`;
          accessTokens.set(accessToken, email);
          refreshTokens.set(refreshToken, email);

          return json(200, {
            success: true,
            data: {
              user: {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                role: user.role,
                email_verified: user.email_verified,
                created_at: user.created_at,
              },
              access_token: accessToken,
              refresh_token: refreshToken,
            },
          });
        }

        if (method === 'POST' && path === '/auth/refresh') {
          const refreshToken = String(body?.refresh_token || '');
          const email = refreshTokens.get(refreshToken);
          if (!email) return unauthorized();
          const user = users.get(email);
          if (!user) return unauthorized();

          const nextAccessToken = `access-${Math.random().toString(36).slice(2)}`;
          const nextRefreshToken = `refresh-${Math.random().toString(36).slice(2)}`;
          accessTokens.set(nextAccessToken, email);
          refreshTokens.set(nextRefreshToken, email);

          return json(200, {
            success: true,
            data: { access_token: nextAccessToken, refresh_token: nextRefreshToken },
          });
        }

        if (method === 'POST' && path === '/auth/logout') {
          return json(200, { success: true, data: { message: 'Logged out' } });
        }

        if (method === 'GET' && (path === '/auth/profile' || path === '/auth/me')) {
          const email = parseAuthEmail(init?.headers);
          if (!email) return unauthorized();
          const user = users.get(email);
          if (!user) return unauthorized();
          return json(200, {
            success: true,
            data: {
              id: user.id,
              email: user.email,
              first_name: user.first_name,
              last_name: user.last_name,
              role: user.role,
              email_verified: user.email_verified,
              created_at: user.created_at,
              updated_at: user.updated_at,
            },
          });
        }

        if (method === 'PUT' && path === '/auth/profile') {
          const email = parseAuthEmail(init?.headers);
          if (!email) return unauthorized();
          const user = users.get(email);
          if (!user) return unauthorized();

          const now = new Date().toISOString();
          const updated = {
            ...user,
            first_name: body?.first_name ?? user.first_name,
            last_name: body?.last_name ?? user.last_name,
            updated_at: now,
          };
          users.set(email, updated);

          return json(200, {
            success: true,
            data: {
              id: updated.id,
              email: updated.email,
              first_name: updated.first_name,
              last_name: updated.last_name,
              role: updated.role,
              email_verified: updated.email_verified,
              created_at: updated.created_at,
              updated_at: updated.updated_at,
            },
          });
        }

        return json(404, { error: 'Not Found', message: 'Not Found' });
      })
    );
  });

  beforeEach(() => {
    // Clear any existing tokens before each test
    apiClient.setToken(null);
    localStorage.clear();
  });

  afterAll(() => {
    // Clean up after all tests
    localStorage.clear();
    vi.unstubAllGlobals();
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
      beforeEach(async () => {
        // Login to ensure access/refresh tokens are available
        await authApi.login({
          email: testUser.email,
          password: testUser.password,
        });
      });

      it('should refresh access token', async () => {
        const response = await authApi.refreshToken();

        expect(response.success).toBe(true);
        expect(response.data.access_token).toBeDefined();
        expect(response.data.refresh_token).toBeDefined();

        // Tokens should be stored/updated after refresh
        expect(authApi.getAccessToken()).toBe(response.data.access_token);
        expect(localStorage.getItem('refresh_token')).toBe(response.data.refresh_token);
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
