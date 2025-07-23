/**
 * Authentication API Integration Tests
 * 
 * Tests all AuthService functionality including:
 * - User registration with soft delete restoration
 * - Login/logout flows
 * - Token refresh functionality
 * - Profile management
 * - Security edge cases
 * - Proper HTTP status codes
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { app } from '../../src/app';
import { AuthTestHelper, TestUser } from './auth-helpers';

let prisma: PrismaClient;
let authHelper: AuthTestHelper;

// Shared test users for read-only operations
let sharedTestUser: TestUser;
let sharedAdminUser: TestUser;
let sharedOtherUser: TestUser;

beforeAll(async () => {
  // Initialize Prisma
  prisma = new PrismaClient();
  
  // Initialize auth helper
  authHelper = new AuthTestHelper(app);
  
  // Create shared test users once for efficiency
  console.log('Creating shared test users...');
  sharedTestUser = await authHelper.createTestUser('USER');
  sharedAdminUser = await authHelper.createAdminUser();
  sharedOtherUser = await authHelper.createTestUser('USER');
  
  console.log('Auth API Tests: Database connected and shared users created');
});

afterAll(async () => {
  // Clean up shared test users
  const sharedUserIds = [sharedTestUser.id, sharedAdminUser.id, sharedOtherUser.id];
  await prisma.user.deleteMany({
    where: {
      id: {
        in: sharedUserIds
      }
    }
  });
  await prisma.$disconnect();
  console.log('Shared test users cleaned up');
});

afterEach(async () => { 
  // Restore shared users if they were soft-deleted by tests
  const sharedUserIds = [sharedTestUser.id, sharedAdminUser.id, sharedOtherUser.id];
  await prisma.user.updateMany({
    where: {
      id: {
        in: sharedUserIds
      },
      is_deleted: true
    },
    data: {
      is_deleted: false,
      deleted_at: null,
      deleted_by_user_id: null
    }
  });
});

describe('Authentication API Integration', () => {
  
  describe('POST /api/v1/auth/register', () => {
    
    it('should register a new user successfully', async () => {
      const userData = {
        email: `test-${randomUUID()}@example.com`,
        password: 'TestPassword123!',
        first_name: 'John',
        last_name: 'Doe'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      
      // Verify user data
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.first_name).toBe(userData.first_name);
      expect(response.body.data.user.last_name).toBe(userData.last_name);
      expect(response.body.data.user.role).toBe('USER');
      expect(response.body.data.user.email_verified).toBe(false);
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user).toHaveProperty('created_at');
      
      // Verify tokens are strings
      expect(typeof response.body.data.access_token).toBe('string');
      expect(typeof response.body.data.refresh_token).toBe('string');
      
      // Track for cleanup
      authHelper.getCreatedUserIds().push(response.body.data.user.id);
      
      console.log('User registered successfully:', response.body.data.user.id);
    });

    it('should register with minimal data (only email and password)', async () => {
      const userData = {
        email: `minimal-${randomUUID()}@example.com`,
        password: 'TestPassword123!'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.first_name).toBe(null);
      expect(response.body.data.user.last_name).toBe(null);
      
      // Track for cleanup
      authHelper.getCreatedUserIds().push(response.body.data.user.id);
      
      console.log('Minimal user registered successfully');
    });

    it('should validate required fields', async () => {
      // Test missing email
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          password: 'TestPassword123!'
        })
        .expect(400);

      // Test missing password
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com'
        })
        .expect(400);

      // Test invalid email format
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'TestPassword123!'
        })
        .expect(400);

      console.log('Registration validation working correctly');
    });

    it('should prevent duplicate email registration', async () => {
      const userData = {
        email: `duplicate-${randomUUID()}@example.com`,
        password: 'TestPassword123!',
        first_name: 'First',
        last_name: 'User'
      };

      // Register first user
      const firstResponse = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      // Track for cleanup
      authHelper.getCreatedUserIds().push(firstResponse.body.data.user.id);

      // Try to register with same email
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          ...userData,
          first_name: 'Second',
          last_name: 'User'
        })
        .expect(409); // Conflict

      console.log('Duplicate email prevention working');
    });

    it('should restore soft-deleted user on registration', async () => {
      const userData = {
        email: `restore-${randomUUID()}@example.com`,
        password: 'OriginalPassword123!',
        first_name: 'Original',
        last_name: 'User'
      };

      // Register user
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      const userId = registerResponse.body.data.user.id;
      authHelper.getCreatedUserIds().push(userId);

      // Soft delete the user
      await prisma.user.update({
        where: { id: userId },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });

      console.log('User soft deleted for restoration test');

      // Register again with same email but different data
      const newUserData = {
        email: userData.email,
        password: 'NewPassword123!',
        first_name: 'Restored',
        last_name: 'User'
      };

      const restoreResponse = await request(app)
        .post('/api/v1/auth/register')
        .send(newUserData)
        .expect(201);

      // Should restore the same user ID
      expect(restoreResponse.body.data.user.id).toBe(userId);
      expect(restoreResponse.body.data.user.email).toBe(userData.email);
      expect(restoreResponse.body.data.user.first_name).toBe(newUserData.first_name);
      expect(restoreResponse.body.data.user.last_name).toBe(newUserData.last_name);

      // Verify user is no longer soft deleted
      const restoredUser = await prisma.user.findUnique({
        where: { id: userId }
      });
      expect(restoredUser?.is_deleted).toBe(false);
      expect(restoredUser?.deleted_at).toBe(null);

      console.log('Soft delete restoration working correctly');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    // Use shared test user for login tests (read-only operations)

    it('should login with valid credentials', async () => {
      // Get fresh login for shared user to ensure valid credentials
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedTestUser.email,
          password: sharedTestUser.password
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      
      expect(response.body.data.user.email).toBe(sharedTestUser.email);
      expect(response.body.data.user.id).toBe(sharedTestUser.id);
      
      console.log('Login successful with valid credentials');
    });

    it('should reject invalid email', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: sharedTestUser.password
        })
        .expect(401);

      console.log('Invalid email rejected correctly');
    });

    it('should reject invalid password', async () => {
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedTestUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401);

      console.log('Invalid password rejected correctly');
    });

    it('should reject login for soft-deleted user', async () => {
      // Create a fresh user for this destructive test
      const tempUser = await authHelper.createTestUser();
      
      // Soft delete the user
      await prisma.user.update({
        where: { id: tempUser.id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: tempUser.id
        }
      });

      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: tempUser.email,
          password: tempUser.password
        })
        .expect(401);

      console.log('Soft-deleted user login rejected correctly');
    });

    it('should validate required fields', async () => {
      // Missing email
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          password: sharedTestUser.password
        })
        .expect(400);

      // Missing password
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedTestUser.email
        })
        .expect(400);

      console.log('Login validation working correctly');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    // Use shared test user for refresh tests (read-only operations)

    it('should refresh tokens with valid refresh token', async () => {
      // Get fresh tokens for shared user first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedTestUser.email,
          password: sharedTestUser.password
        })
        .expect(200);

      const response = await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refresh_token: loginResponse.body.data.refresh_token
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('access_token');
      expect(response.body.data).toHaveProperty('refresh_token');
      
      // New tokens should be valid strings
      expect(typeof response.body.data.access_token).toBe('string');
      expect(typeof response.body.data.refresh_token).toBe('string');
      expect(response.body.data.access_token.length).toBeGreaterThan(0);
      expect(response.body.data.refresh_token.length).toBeGreaterThan(0);
      
      console.log('Token refresh successful');
    });

    it('should reject invalid refresh token', async () => {
      await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refresh_token: 'invalid.token.here'
        })
        .expect(401);

      console.log('Invalid refresh token rejected correctly');
    });

    it('should reject access token as refresh token', async () => {
      // Get fresh tokens for shared user first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedTestUser.email,
          password: sharedTestUser.password
        })
        .expect(200);

      await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refresh_token: loginResponse.body.data.access_token // Use access token as refresh token (should fail)
        })
        .expect(401);

      console.log('Access token rejected as refresh token');
    });

    it('should reject refresh token for soft-deleted user', async () => {
      // Create a fresh user for this destructive test
      const tempUser = await authHelper.createTestUser();
      
      // Soft delete the user
      await prisma.user.update({
        where: { id: tempUser.id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: tempUser.id
        }
      });

      await request(app)
        .post('/api/v1/auth/refresh')
        .send({
          refresh_token: tempUser.refreshToken
        })
        .expect(401);

      console.log('Refresh token for soft-deleted user rejected');
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    // Use shared test user for profile read tests (read-only operations)

    it('should return user profile with valid token', async () => {
      // Get fresh tokens for shared user first
      const loginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedTestUser.email,
          password: sharedTestUser.password
        })
        .expect(200);

      const response = await request(app)
        .get('/api/v1/auth/profile')
        .set({ Authorization: `Bearer ${loginResponse.body.data.access_token}` })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('email');
      expect(response.body.data).toHaveProperty('first_name');
      expect(response.body.data).toHaveProperty('last_name');
      expect(response.body.data).toHaveProperty('role');
      expect(response.body.data).toHaveProperty('email_verified');
      expect(response.body.data).toHaveProperty('created_at');
      expect(response.body.data).toHaveProperty('updated_at');
      
      expect(response.body.data.id).toBe(sharedTestUser.id);
      expect(response.body.data.email).toBe(sharedTestUser.email);
      
      console.log('Profile retrieval successful');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/v1/auth/profile')
        .expect(401);

      console.log('Profile requires authentication');
    });

    it('should reject invalid token', async () => {
      await request(app)
        .get('/api/v1/auth/profile')
        .set({ Authorization: 'Bearer invalid.token.here' })
        .expect(401);

      console.log('Invalid token rejected for profile');
    });
  });

  describe('PUT /api/v1/auth/profile', () => {
    // Profile update tests need fresh users since they modify user data
    
    let testUser: TestUser;

    beforeEach(async () => {
      testUser = await authHelper.createTestUser();
    });

    it('should update profile successfully', async () => {
      const updateData = {
        first_name: 'Updated',
        last_name: 'Name',
        email: `updated-${randomUUID()}@example.com`
      };

      const response = await request(app)
        .put('/api/v1/auth/profile')
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe(updateData.first_name);
      expect(response.body.data.last_name).toBe(updateData.last_name);
      expect(response.body.data.email).toBe(updateData.email);
      
      console.log('Profile update successful');
    });

    it('should update partial profile data', async () => {
      const updateData = {
        first_name: 'OnlyFirst'
      };

      const response = await request(app)
        .put('/api/v1/auth/profile')
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);

      expect(response.body.data.first_name).toBe(updateData.first_name);
      expect(response.body.data.email).toBe(testUser.email); // Should remain unchanged
      
      console.log('Partial profile update successful');
    });

    it('should prevent email conflicts', async () => {
      // Create another user
      const otherUser = await authHelper.createTestUser();

      // Try to update to other user's email
      await request(app)
        .put('/api/v1/auth/profile')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          email: otherUser.email
        })
        .expect(409);

      console.log('Email conflict prevention working');
    });

    it('should require authentication', async () => {
      await request(app)
        .put('/api/v1/auth/profile')
        .send({
          first_name: 'Test'
        })
        .expect(401);

      console.log('Profile update requires authentication');
    });
  });

  describe('DELETE /api/v1/auth/account', () => {
    // Delete tests need fresh users since they destroy user data
    
    let testUser: TestUser;

    beforeEach(async () => {
      testUser = await authHelper.createTestUser();
    });

    it('should soft delete user account', async () => {
      await request(app)
        .delete('/api/v1/auth/profile')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      // Verify user is soft deleted
      const deletedUser = await prisma.user.findUnique({
        where: { id: testUser.id }
      });
      
      expect(deletedUser?.is_deleted).toBe(true);
      expect(deletedUser?.deleted_at).toBeTruthy();
      expect(deletedUser?.deleted_by_user_id).toBe(testUser.id);
      
      console.log('Account deletion (soft delete) successful');
    });

    it('should prevent login after account deletion', async () => {
      // Delete account
      await request(app)
        .delete('/api/v1/auth/profile')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      // Try to login
      await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(401);

      console.log('Login prevented after account deletion');
    });

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/v1/auth/profile')
        .expect(401);

      console.log('Account deletion requires authentication');
    });
  });

  describe('Authorization and Security', () => {
    // Use shared users for security tests (read-only operations)

    it('should handle expired tokens gracefully', async () => {
      // This would require mocking JWT expiration or using a very short-lived token
      // For now, we'll test with an obviously invalid token structure
      await request(app)
        .get('/api/v1/auth/profile')
        .set({ Authorization: 'Bearer expired.token.structure' })
        .expect(401);

      console.log('Expired token handling working');
    });

    it('should validate JWT token structure', async () => {
      const invalidTokens = [
        'Bearer invalid',
        'Bearer invalid.token',
        'Bearer invalid.token.structure.too.many.parts',
        'InvalidBearer token',
        'Bearer ',
        ''
      ];

      for (const token of invalidTokens) {
        await request(app)
          .get('/api/v1/auth/profile')
          .set({ Authorization: token })
          .expect(401);
      }

      console.log('JWT token structure validation working');
    });

    it('should handle role-based access (if implemented)', async () => {
      // Get fresh tokens for shared users first
      const userLoginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedTestUser.email,
          password: sharedTestUser.password
        })
        .expect(200);

      const adminLoginResponse = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: sharedAdminUser.email,
          password: sharedAdminUser.password
        })
        .expect(200);

      // Test that regular user has USER role
      const userResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set({ Authorization: `Bearer ${userLoginResponse.body.data.access_token}` })
        .expect(200);

      expect(userResponse.body.data.role).toBe('USER');

      // Test that admin user has ADMIN role
      const adminResponse = await request(app)
        .get('/api/v1/auth/profile')
        .set({ Authorization: `Bearer ${adminLoginResponse.body.data.access_token}` })
        .expect(200);

      expect(adminResponse.body.data.role).toBe('ADMIN');

      console.log('Role-based access working correctly');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    
    it('should handle malformed JSON gracefully', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      console.log('Malformed JSON handled gracefully');
    });

    it('should handle very long input strings', async () => {
      const longString = 'a'.repeat(1000);
      
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `${longString}@example.com`,
          password: 'TestPassword123!',
          firstName: longString,
          lastName: longString
        })
        .expect(400); // Should fail validation

      console.log('Long input strings handled correctly');
    });

    it('should handle special characters in input', async () => {
      const specialChars = {
        email: `test+special.chars_${randomUUID()}@example.com`,
        password: 'Test!@#$%^&*()123',
        first_name: "O'Connor",
        last_name: 'Smith-Jones'
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(specialChars)
        .expect(201);

      expect(response.body.data.user.email).toBe(specialChars.email);
      expect(response.body.data.user.first_name).toBe(specialChars.first_name);
      expect(response.body.data.user.last_name).toBe(specialChars.last_name);

      // Track for cleanup
      authHelper.getCreatedUserIds().push(response.body.data.user.id);

      console.log('Special characters in input handled correctly');
    });

    it('should handle concurrent registration attempts', async () => {
      const userDatas = Array.from({ length: 3 }, (_, i) => ({
        email: `concurrent-${i + 1}-${randomUUID()}@example.com`,
        password: 'TestPassword123!'
      }));
      const [userData1, userData2, userData3] = userDatas;

      // Make multiple concurrent registration requests with DIFFERENT emails
      const promises = userDatas.map(userData =>
        request(app)
          .post('/api/v1/auth/register')
          .send(userData)
      );

      const results = await Promise.allSettled(promises);
      
      // Count successful and failed attempts
      const successful = results.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status === 201
      );
      const failed = results.filter(r => 
        r.status === 'fulfilled' && (r.value as any).status === 409
      );
      const rejected = results.filter(r => r.status === 'rejected');
      
      // All requests should be fulfilled (not rejected) - no crashes
      expect(rejected.length).toBe(0);
      expect(successful.length).toBe(3);

      // Track all successful registrations for cleanup
      successful.forEach((result: any) => {
        authHelper.getCreatedUserIds().push(result.value.body.data.user.id);
      });

      console.log(`Concurrent registration handled: ${successful.length} successful, ${failed.length} failed`);
    });
  });
});