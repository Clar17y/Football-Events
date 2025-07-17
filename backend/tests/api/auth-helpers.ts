/**
 * Authentication helpers for API tests
 */

import request from 'supertest';
import { Express } from 'express';
import { randomUUID } from 'crypto';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
  role: string;
}

export class AuthTestHelper {
  private app: Express;
  private createdUserIds: string[] = [];

  constructor(app: Express) {
    this.app = app;
  }

  /**
   * Register a new test user and return credentials
   */
  async createTestUser(role: 'USER' | 'ADMIN' = 'USER'): Promise<TestUser> {
    const userData = {
      email: `test-${randomUUID()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User'
    };

    const registerResponse = await request(this.app)
      .post('/api/v1/auth/register')
      .send(userData)
      .expect(201);

    const userId = registerResponse.body.data.user.id;
    this.createdUserIds.push(userId);

    // If admin role requested, we need to update the user role directly in DB
    // For now, we'll create a regular user and handle admin separately
    
    const loginResponse = await request(this.app)
      .post('/api/v1/auth/login')
      .send({
        email: userData.email,
        password: userData.password
      })
      .expect(200);

    return {
      id: userId,
      email: userData.email,
      password: userData.password,
      accessToken: loginResponse.body.data.access_token,
      refreshToken: loginResponse.body.data.refresh_token,
      role: role
    };
  }

  /**
   * Create an admin user (requires direct DB manipulation)
   */
  async createAdminUser(): Promise<TestUser> {
    // Create a regular user first
    const user = await this.createTestUser('USER');
    
    // Import Prisma and auth utilities
    const { PrismaClient } = await import('@prisma/client');
    const { generateAccessToken, generateRefreshToken } = await import('../../src/utils/auth');
    
    const prisma = new PrismaClient();
    
    try {
      // Update user role in database
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN' }
      });
      
      // Get updated user data
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      
      if (updatedUser) {
        // Regenerate JWT tokens with admin role
        user.accessToken = generateAccessToken(updatedUser.id, updatedUser.email, updatedUser.role);
        user.refreshToken = generateRefreshToken(updatedUser.id, updatedUser.email, updatedUser.role);
        user.role = 'ADMIN';
      }
      
      return user;
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Get authorization header for a user
   */
  getAuthHeader(user: TestUser): { Authorization: string } {
    return {
      Authorization: `Bearer ${user.accessToken}`
    };
  }

  /**
   * Clean up created test users
   */
  getCreatedUserIds(): string[] {
    return [...this.createdUserIds];
  }

  /**
   * Clear tracking
   */
  clearTracking(): void {
    this.createdUserIds = [];
  }
}