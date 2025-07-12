/**
 * API Test Setup and Utilities
 * 
 * Provides test infrastructure for HTTP API integration testing using Supertest.
 * This setup ensures proper test isolation and cleanup for reliable API testing.
 */

import { Express } from 'express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Import the Express app
import { app as expressApp } from '../../src/app';

export class ApiTestSetup {
  public app: Express;
  public prisma: PrismaClient;
  public request: request.SuperTest<request.Test>;
  private createdIds: Map<string, string[]> = new Map();

  constructor() {
    // Initialize Prisma with test database
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        }
      }
    });
  }

  async initialize() {
    // Use the imported Express app
    this.app = expressApp;
    this.request = request(this.app);
    
    // Connect to test database
    await this.prisma.$connect();
    
    console.log('API Test Setup: Database connected');
  }

  async cleanup() {
    // Clean up all created test data
    await this.cleanupTestData();
    
    // Disconnect from database
    await this.prisma.$disconnect();
    
    console.log('API Test Setup: Cleanup completed');
  }

  /**
   * Track created entities for cleanup
   */
  trackCreatedEntity(entityType: string, id: string) {
    if (!this.createdIds.has(entityType)) {
      this.createdIds.set(entityType, []);
    }
    this.createdIds.get(entityType)!.push(id);
  }

  /**
   * Clean up all tracked test data
   */
  private async cleanupTestData() {
    try {
      // Clean up in reverse dependency order to avoid foreign key constraints
      const cleanupOrder = ['events', 'lineup', 'matches', 'awards', 'players', 'teams', 'seasons', 'positions'];
      
      for (const entityType of cleanupOrder) {
        const ids = this.createdIds.get(entityType);
        if (ids && ids.length > 0) {
          await this.cleanupEntity(entityType, ids);
        }
      }
      
      // Clear tracking
      this.createdIds.clear();
    } catch (error) {
      console.warn('Cleanup warning:', error);
      // Don't fail tests due to cleanup issues
    }
  }

  /**
   * Clean up specific entity type
   */
  private async cleanupEntity(entityType: string, ids: string[]) {
    try {
      switch (entityType) {
        case 'teams':
          await this.prisma.team.deleteMany({ where: { id: { in: ids } } });
          break;
        case 'players':
          await this.prisma.player.deleteMany({ where: { id: { in: ids } } });
          break;
        case 'events':
          await this.prisma.event.deleteMany({ where: { id: { in: ids } } });
          break;
        case 'matches':
          await this.prisma.match.deleteMany({ where: { match_id: { in: ids } } });
          break;
        case 'seasons':
          await this.prisma.seasons.deleteMany({ where: { season_id: { in: ids } } });
          break;
        case 'positions':
          await this.prisma.positions.deleteMany({ where: { pos_code: { in: ids } } });
          break;
        case 'awards':
          await this.prisma.award.deleteMany({ where: { id: { in: ids } } });
          break;
        case 'lineup':
          // Lineup has composite key, need different approach
          for (const id of ids) {
            const [matchId, playerId, startMinute] = id.split('|');
            await this.prisma.lineup.deleteMany({
              where: {
                matchId,
                playerId,
                startMinute: parseInt(startMinute)
              }
            });
          }
          break;
      }
    } catch (error) {
      console.warn(`Failed to cleanup ${entityType}:`, error);
    }
  }

  /**
   * Create a test request with automatic ID tracking
   */
  createTrackedRequest() {
    return {
      post: (url: string) => this.request.post(url),
      get: (url: string) => this.request.get(url),
      put: (url: string) => this.request.put(url),
      delete: (url: string) => this.request.delete(url),
      patch: (url: string) => this.request.patch(url)
    };
  }
}

// Global test setup instance
let apiTestSetup: ApiTestSetup;

/**
 * Global setup for API tests
 */
export const setupApiTests = () => {
  beforeAll(async () => {
    apiTestSetup = new ApiTestSetup();
    await apiTestSetup.initialize();
  });

  afterAll(async () => {
    if (apiTestSetup) {
      await apiTestSetup.cleanup();
    }
  });

  beforeEach(() => {
    // Reset tracking for each test
    if (apiTestSetup) {
      apiTestSetup['createdIds'].clear();
    }
  });

  afterEach(async () => {
    // Clean up after each test
    if (apiTestSetup) {
      await apiTestSetup['cleanupTestData']();
    }
  });

  return () => apiTestSetup;
};

/**
 * Helper to get the current API test setup instance
 */
export const getApiTestSetup = (): ApiTestSetup => {
  if (!apiTestSetup) {
    throw new Error('API test setup not initialized. Call setupApiTests() first.');
  }
  return apiTestSetup;
};