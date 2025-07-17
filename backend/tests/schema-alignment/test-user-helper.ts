/**
 * Test user helper for schema alignment tests
 * Creates users directly in the database without API calls
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export class SchemaTestUserHelper {
  private prisma: PrismaClient;
  private createdUserIds: string[] = [];

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Create a test user directly in the database
   */
  async createTestUser(role: 'USER' | 'ADMIN' = 'USER'): Promise<string> {
    const userData = {
      email: `test-schema-${randomUUID()}@example.com`,
      password_hash: 'test-hash-for-schema-tests',
      first_name: 'Schema',
      last_name: 'Test',
      role: role
    };

    const user = await this.prisma.user.create({
      data: userData
    });

    this.createdUserIds.push(user.id);
    return user.id;
  }

  /**
   * Get all created user IDs for cleanup
   */
  getCreatedUserIds(): string[] {
    return [...this.createdUserIds];
  }

  /**
   * Clean up all created test users
   */
  async cleanup(): Promise<void> {
    if (this.createdUserIds.length > 0) {
      await this.prisma.user.deleteMany({
        where: {
          id: {
            in: this.createdUserIds
          }
        }
      });
      this.createdUserIds = [];
    }
  }

  /**
   * Clear tracking without deleting (useful if cleanup is handled elsewhere)
   */
  clearTracking(): void {
    this.createdUserIds = [];
  }
}