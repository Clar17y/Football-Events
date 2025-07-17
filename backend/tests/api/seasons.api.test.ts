/**
 * Seasons API Integration Tests with Authentication and Soft Delete Restoration
 * 
 * Comprehensive HTTP endpoint testing for the Seasons API using Supertest.
 * Tests user ownership, authentication, and soft delete restoration functionality.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Seasons API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let otherUser: TestUser;
  let adminUser: TestUser;
  let createdSeasonIds: string[] = [];
  let createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        }
      }
    });
    
    await prisma.$connect();
    apiRequest = request(app);
    authHelper = new AuthTestHelper(app);
    
    // Create test users ONCE for all tests
    testUser = await authHelper.createTestUser('USER');
    otherUser = await authHelper.createTestUser('USER');
    adminUser = await authHelper.createAdminUser();
    
    // Track created users for final cleanup
    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    
    console.log('Seasons API Tests: Database connected and users created');
  });

  afterAll(async () => {
    // Clean up any remaining test data - seasons first due to foreign key constraints
    await prisma.seasons.deleteMany({
      where: { created_by_user_id: { in: createdUserIds } }
    });
    
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } }
      });
    }
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Only reset season tracking - users are reused
    createdSeasonIds = [];
  });

  afterEach(async () => {
    // Clean up only seasons created in this test - users are reused
    if (createdSeasonIds.length > 0) {
      await prisma.seasons.deleteMany({
        where: {
          season_id: {
            in: createdSeasonIds
          }
        }
      });
    }
    
    // Also clean up any other seasons created by our test users to ensure clean state
    await prisma.seasons.deleteMany({
      where: {
        created_by_user_id: {
          in: createdUserIds
        }
      }
    });
    
    // Reset season tracking
    createdSeasonIds = [];
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      // Test all endpoints without token
      await apiRequest.get('/api/v1/seasons').expect(401);
      await apiRequest.post('/api/v1/seasons').expect(401);
      await apiRequest.get(`/api/v1/seasons/${randomUUID()}`).expect(401);
      await apiRequest.put(`/api/v1/seasons/${randomUUID()}`).expect(401);
      await apiRequest.delete(`/api/v1/seasons/${randomUUID()}`).expect(401);
    });

    it('should reject invalid tokens', async () => {
      await apiRequest
        .get('/api/v1/seasons')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /api/v1/seasons', () => {
    it('should create a season successfully', async () => {
      const seasonData = {
        label: '2025/2026 Test Season',
        startDate: '2025-08-01',
        endDate: '2026-05-31',
        isCurrent: false,
        description: 'Test season for API validation'
      };

      const response = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      expect(response.body).toHaveProperty('seasonId');
      expect(response.body.label).toBe(seasonData.label);
      expect(response.body.isCurrent).toBe(false);
      expect(response.body.description).toBe(seasonData.description);

      createdSeasonIds.push(response.body.seasonId);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing required fields
        description: 'Invalid season data'
      };

      const response = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      console.log('Validation working:', response.body.error);
    });

    it('should handle duplicate season labels for same user', async () => {
      const seasonData = {
        label: 'Duplicate Test Season',
        startDate: '2025-08-01',
        endDate: '2026-05-31',
        isCurrent: false
      };

      // Create first season
      const firstResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      createdSeasonIds.push(firstResponse.body.seasonId);

      // Try to create duplicate for same user
      await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(409); // Conflict due to unique constraint
    });

    it('should allow same season label for different users (per-user uniqueness)', async () => {
      const seasonData = {
        label: '2024-25 Season',
        startDate: '2025-08-01',
        endDate: '2026-05-31',
        isCurrent: false
      };

      // Create season with first user
      const firstResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      createdSeasonIds.push(firstResponse.body.seasonId);

      // Create season with same label for second user (should succeed)
      const secondResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send(seasonData)
        .expect(201);

      expect(secondResponse.body.label).toBe(seasonData.label);
      expect(secondResponse.body.seasonId).not.toBe(firstResponse.body.seasonId);

      // Clean up second user's season
      await prisma.seasons.deleteMany({
        where: { season_id: secondResponse.body.seasonId }
      });
    });

    it('should validate date ranges', async () => {
      const invalidDateData = {
        label: 'Invalid Date Season',
        startDate: '2026-08-01', // Start after end
        endDate: '2025-05-31',
        isCurrent: false
      };

      await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidDateData)
        .expect(400);
    });
  });

  describe('GET /api/v1/seasons', () => {
    it('should return only user\'s own seasons', async () => {
      // Create seasons for first user
      const userSeasons = [
        {
          label: 'User 1 Season A',
          startDate: '2024-08-01',
          endDate: '2025-05-31',
          isCurrent: false
        },
        {
          label: 'User 1 Season B',
          startDate: '2025-08-01',
          endDate: '2026-05-31',
          isCurrent: true
        }
      ];

      for (const season of userSeasons) {
        const response = await apiRequest
          .post('/api/v1/seasons')
          .set(authHelper.getAuthHeader(testUser))
          .send(season)
          .expect(201);
        createdSeasonIds.push(response.body.seasonId);
      }

      // Create season for different user
      const otherSeasonResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          label: 'Other User Season',
          startDate: '2024-08-01',
          endDate: '2025-05-31',
          isCurrent: false
        })
        .expect(201);

      // Get seasons for first user - should only see their own
      const response = await apiRequest
        .get('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2); // Only user's own seasons

      // Verify all returned seasons belong to the user
      response.body.data.forEach((season: any) => {
        expect(['User 1 Season A', 'User 1 Season B']).toContain(season.label);
      });

      // Clean up other user's season
      await prisma.seasons.deleteMany({
        where: { season_id: otherSeasonResponse.body.seasonId }
      });

      console.log(`User isolation working: ${response.body.data.length} seasons returned`);
    });

    it('should support search functionality', async () => {
      const seasonData = {
        label: 'Searchable Season 2024',
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: false
      };

      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      createdSeasonIds.push(createResponse.body.seasonId);

      const searchResponse = await apiRequest
        .get('/api/v1/seasons?search=Searchable')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(searchResponse.body.data.length).toBeGreaterThan(0);
      expect(searchResponse.body.data[0].label).toContain('Searchable');
    });

    it('should support pagination', async () => {
      // Create multiple seasons
      for (let i = 1; i <= 5; i++) {
        const response = await apiRequest
          .post('/api/v1/seasons')
          .set(authHelper.getAuthHeader(testUser))
          .send({
            label: `Pagination Season ${i}`,
            startDate: `202${3 + i}-08-01`,
            endDate: `202${4 + i}-07-31`,
            isCurrent: false
          })
          .expect(201);
        createdSeasonIds.push(response.body.seasonId);
      }

      // Test pagination
      const response = await apiRequest
        .get('/api/v1/seasons?page=1&limit=3')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(3);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(3);
    });
  });

  describe('GET /api/v1/seasons/:id', () => {
    it('should return user\'s own season', async () => {
      const seasonData = {
        label: 'Specific Season Test',
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: false,
        description: 'Test season for specific retrieval'
      };

      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      const seasonId = createResponse.body.seasonId;
      createdSeasonIds.push(seasonId);

      const getResponse = await apiRequest
        .get(`/api/v1/seasons/${seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.seasonId).toBe(seasonId);
      expect(getResponse.body.label).toBe(seasonData.label);
      expect(getResponse.body.description).toBe(seasonData.description);
    });

    it('should return 404 for other user\'s season', async () => {
      // Create season with different user
      // Using existing otherUser
      const otherSeasonResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          label: 'Other User Season',
          startDate: '2024-08-01',
          endDate: '2025-05-31',
          isCurrent: false
        })
        .expect(201);

      // Try to access with first user's token
      await apiRequest
        .get(`/api/v1/seasons/${otherSeasonResponse.body.seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      // Clean up
      await prisma.seasons.deleteMany({
        where: { season_id: otherSeasonResponse.body.seasonId }
      });
    });

    it('should return 404 for non-existent season', async () => {
      const nonExistentId = randomUUID();
      
      await apiRequest
        .get(`/api/v1/seasons/${nonExistentId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('404 handling working for non-existent season');
    });
  });

  describe('PUT /api/v1/seasons/:id', () => {
    it('should update user\'s own season successfully', async () => {
      const seasonData = {
        label: 'Original Season',
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: false
      };

      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      const seasonId = createResponse.body.seasonId;
      createdSeasonIds.push(seasonId);

      const updateData = {
        label: 'Updated Season',
        isCurrent: true,
        description: 'Updated description'
      };

      const updateResponse = await apiRequest
        .put(`/api/v1/seasons/${seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);

      expect(updateResponse.body.label).toBe(updateData.label);
      expect(updateResponse.body.isCurrent).toBe(true);
      expect(updateResponse.body.description).toBe(updateData.description);
    });

    it('should return 404 when updating other user\'s season', async () => {
      // Create season with different user
      // Using existing otherUser
      const otherSeasonResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          label: 'Other User Season',
          startDate: '2024-08-01',
          endDate: '2025-05-31',
          isCurrent: false
        })
        .expect(201);

      // Try to update with first user's token
      await apiRequest
        .put(`/api/v1/seasons/${otherSeasonResponse.body.seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ label: 'Hacked Update' })
        .expect(404);

      // Clean up
      await prisma.seasons.deleteMany({
        where: { season_id: otherSeasonResponse.body.seasonId }
      });
    });

    it('should return 404 when updating non-existent season', async () => {
      const nonExistentId = randomUUID();
      
      await apiRequest
        .put(`/api/v1/seasons/${nonExistentId}`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ label: 'Updated' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/seasons/:id', () => {
    it('should soft delete user\'s own season successfully', async () => {
      const seasonData = {
        label: 'Season to Delete',
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: false
      };

      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      const seasonId = createResponse.body.seasonId;

      await apiRequest
        .delete(`/api/v1/seasons/${seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Verify season is soft deleted (not accessible via API)
      await apiRequest
        .get(`/api/v1/seasons/${seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      // Verify season still exists in database but is soft deleted
      const deletedSeason = await prisma.seasons.findFirst({
        where: { season_id: seasonId }
      });
      expect(deletedSeason).toBeTruthy();
      expect(deletedSeason!.is_deleted).toBe(true);
      expect(deletedSeason!.deleted_at).toBeTruthy();
      expect(deletedSeason!.deleted_by_user_id).toBe(testUser.id);
    });

    it('should return 404 when deleting other user\'s season', async () => {
      // Create season with different user
      // Using existing otherUser
      const otherSeasonResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          label: 'Other User Season',
          startDate: '2024-08-01',
          endDate: '2025-05-31',
          isCurrent: false
        })
        .expect(201);

      // Try to delete with first user's token
      await apiRequest
        .delete(`/api/v1/seasons/${otherSeasonResponse.body.seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      // Clean up
      await prisma.seasons.deleteMany({
        where: { season_id: otherSeasonResponse.body.seasonId }
      });
    });

    it('should return 404 when deleting non-existent season', async () => {
      const nonExistentId = randomUUID();
      
      await apiRequest
        .delete(`/api/v1/seasons/${nonExistentId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('404 handling working for season deletion');
    });
  });

  describe('Soft Delete Restoration', () => {
    it('should restore soft-deleted season when creating with same label', async () => {
      const seasonData = {
        label: '2024-25 Restoration Test',
        startDate: '2024-08-01',
        endDate: '2025-07-31',
        isCurrent: false,
        description: 'Original description'
      };

      // 1. Create season
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      const seasonId = createResponse.body.seasonId;
      expect(createResponse.body.label).toBe(seasonData.label);
      createdSeasonIds.push(seasonId);

      // 2. Delete season (soft delete)
      await apiRequest
        .delete(`/api/v1/seasons/${seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // 3. Verify season is soft deleted in database
      const deletedSeason = await prisma.seasons.findFirst({
        where: { season_id: seasonId }
      });
      expect(deletedSeason).toBeTruthy();
      expect(deletedSeason!.is_deleted).toBe(true);
      expect(deletedSeason!.deleted_at).toBeTruthy();

      // 4. Create season with same label (should restore)
      const restoreResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          ...seasonData,
          isCurrent: true, // Different value to verify update
          startDate: '2024-09-01', // Different start date
          description: 'Restored description'
        })
        .expect(201);

      // 5. Verify restoration (should be same ID)
      expect(restoreResponse.body.seasonId).toBe(seasonId);
      expect(restoreResponse.body.label).toBe(seasonData.label);
      expect(restoreResponse.body.isCurrent).toBe(true);
      expect(restoreResponse.body.startDate).toBe('2024-09-01');
      expect(restoreResponse.body.description).toBe('Restored description');

      // 6. Verify restoration in database
      const restoredSeason = await prisma.seasons.findFirst({
        where: { season_id: seasonId }
      });
      expect(restoredSeason!.is_deleted).toBe(false);
      expect(restoredSeason!.deleted_at).toBeNull();
      expect(restoredSeason!.deleted_by_user_id).toBeNull();
      expect(restoredSeason!.updated_at).toBeTruthy();
    });

    it('should create new season when no soft-deleted season exists', async () => {
      const seasonData = {
        label: '2025-26 New Season',
        startDate: '2025-08-01',
        endDate: '2026-07-31',
        isCurrent: false
      };

      // Normal creation should work as before
      const response = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      expect(response.body.seasonId).toBeTruthy();
      expect(response.body.label).toBe(seasonData.label);
      createdSeasonIds.push(response.body.seasonId);

      // Verify in database
      const season = await prisma.seasons.findFirst({
        where: { season_id: response.body.seasonId }
      });
      expect(season!.is_deleted).toBe(false);
      expect(season!.deleted_at).toBeNull();
    });

    it('should only restore user\'s own soft-deleted seasons', async () => {
      const seasonData = {
        label: 'Cross-User Restoration Test',
        startDate: '2024-08-01',
        endDate: '2025-07-31',
        isCurrent: false
      };

      // Create and delete season with first user
      const firstResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      const firstSeasonId = firstResponse.body.seasonId;
      createdSeasonIds.push(firstSeasonId);

      await apiRequest
        .delete(`/api/v1/seasons/${firstSeasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Create season with same label using second user (should succeed - different user)
      const secondResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send(seasonData)
        .expect(201);

      // Should create new season, not restore first user's
      expect(secondResponse.body.seasonId).not.toBe(firstSeasonId);
      expect(secondResponse.body.label).toBe(seasonData.label);

      // Clean up second user's season
      await prisma.seasons.deleteMany({
        where: { season_id: secondResponse.body.seasonId }
      });
    });

    it('should handle multiple soft-deleted seasons correctly', async () => {
      const seasons = [
        { label: 'Multi Test 1', startDate: '2024-01-01', endDate: '2024-12-31', isCurrent: false },
        { label: 'Multi Test 2', startDate: '2025-01-01', endDate: '2025-12-31', isCurrent: false },
        { label: 'Multi Test 3', startDate: '2026-01-01', endDate: '2026-12-31', isCurrent: false }
      ];

      const createdSeasons = [];

      // Create and delete multiple seasons
      for (const seasonData of seasons) {
        const createResponse = await apiRequest
          .post('/api/v1/seasons')
          .set(authHelper.getAuthHeader(testUser))
          .send(seasonData)
          .expect(201);

        createdSeasons.push({ id: createResponse.body.seasonId, data: seasonData });
        createdSeasonIds.push(createResponse.body.seasonId);

        // Soft delete
        await apiRequest
          .delete(`/api/v1/seasons/${createResponse.body.seasonId}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(204);
      }

      // Restore one specific season (the middle one)
      const targetSeason = createdSeasons[1];
      const restoreResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          ...targetSeason.data,
          isCurrent: true // Updated value
        })
        .expect(201);

      // Should restore the correct season
      expect(restoreResponse.body.seasonId).toBe(targetSeason.id);
      expect(restoreResponse.body.label).toBe(targetSeason.data.label);
      expect(restoreResponse.body.isCurrent).toBe(true);

      // Verify other seasons remain soft deleted
      for (let i = 0; i < createdSeasons.length; i++) {
        const season = await prisma.seasons.findFirst({
          where: { season_id: createdSeasons[i].id }
        });

        if (i === 1) {
          // Target season should be restored
          expect(season!.is_deleted).toBe(false);
        } else {
          // Other seasons should remain soft deleted
          expect(season!.is_deleted).toBe(true);
        }
      }
    });

    it('should fail when trying to create season with same label as active season', async () => {
      const seasonData = {
        label: 'Active Season Test',
        startDate: '2024-08-01',
        endDate: '2025-07-31',
        isCurrent: false
      };

      // 1. Create season
      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      createdSeasonIds.push(createResponse.body.seasonId);

      // 2. Try to create another season with same label (should fail)
      await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(409); // Should fail due to unique constraint
    });
  });

  describe('Authorization Tests', () => {
    let testSeasonIdByTestUser: string;
    let testSeasonIdByOtherUser: string;

    beforeEach(async () => {
      // Create a season by testUser
      const testUserSeason = {
        label: `Test User Season ${Date.now()}`,
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: false,
        description: 'Season created by test user'
      };

      const testUserResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(testUserSeason)
        .expect(201);

      testSeasonIdByTestUser = testUserResponse.body.seasonId;

      // Create a season by otherUser
      const otherUserSeason = {
        label: `Other User Season ${Date.now()}`,
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: false,
        description: 'Season created by other user'
      };

      const otherUserResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send(otherUserSeason)
        .expect(201);

      testSeasonIdByOtherUser = otherUserResponse.body.seasonId;
    });

    afterEach(async () => {
      // Clean up authorization test data
      try {
        await prisma.seasons.deleteMany({
          where: { 
            season_id: { in: [testSeasonIdByTestUser, testSeasonIdByOtherUser] }
          }
        });
        console.log('Authorization test data cleaned up successfully');
      } catch (error) {
        console.warn('Authorization cleanup warning (non-fatal):', error);
      }
    });

    describe('User Isolation', () => {
      it('should not allow users to see other users seasons in list', async () => {
        const response = await apiRequest
          .get('/api/v1/seasons')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should only see their own seasons
        expect(response.body.data).toBeInstanceOf(Array);
        
        // Check that otherUser's season is not in the list
        const seasonIds = response.body.data.map((season: any) => season.seasonId);
        expect(seasonIds).toContain(testSeasonIdByTestUser);
        expect(seasonIds).not.toContain(testSeasonIdByOtherUser);

        console.log('User isolation working for GET /seasons');
      });

      it('should not allow users to access other users seasons by ID', async () => {
        await apiRequest
          .get(`/api/v1/seasons/${testSeasonIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to other user\'s season');
      });

      it('should not allow users to update other users seasons', async () => {
        const updateData = {
          label: 'Hacked Season',
          description: 'This should not work'
        };

        await apiRequest
          .put(`/api/v1/seasons/${testSeasonIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to other user\'s season');
      });

      it('should not allow users to delete other users seasons', async () => {
        await apiRequest
          .delete(`/api/v1/seasons/${testSeasonIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to other user\'s season');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to see all seasons in list', async () => {
        const response = await apiRequest
          .get('/api/v1/seasons')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see seasons from all users
        expect(response.body.data).toBeInstanceOf(Array);
        
        const seasonIds = response.body.data.map((season: any) => season.seasonId);
        expect(seasonIds).toContain(testSeasonIdByTestUser);
        expect(seasonIds).toContain(testSeasonIdByOtherUser);

        console.log('Admin can see all seasons');
      });

      it('should allow admin to access any season by ID', async () => {
        // Admin should be able to access testUser's season
        const testUserSeasonResponse = await apiRequest
          .get(`/api/v1/seasons/${testSeasonIdByTestUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserSeasonResponse.body.seasonId).toBe(testSeasonIdByTestUser);

        // Admin should be able to access otherUser's season
        const otherUserSeasonResponse = await apiRequest
          .get(`/api/v1/seasons/${testSeasonIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserSeasonResponse.body.seasonId).toBe(testSeasonIdByOtherUser);

        console.log('Admin can access any season');
      });

      it('should allow admin to update any season', async () => {
        const updateData = {
          label: 'Admin Updated Season',
          description: 'Updated by admin'
        };

        const response = await apiRequest
          .put(`/api/v1/seasons/${testSeasonIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.label).toBe(updateData.label);
        expect(response.body.description).toBe(updateData.description);

        console.log('Admin can update any season');
      });

      it('should allow admin to delete any season', async () => {
        // Create a temporary season to delete
        const tempSeason = {
          label: `Temp Season for Deletion ${Date.now()}`,
          startDate: '2024-08-01',
          endDate: '2025-05-31',
          isCurrent: false,
          description: 'This will be deleted by admin'
        };

        const createResponse = await apiRequest
          .post('/api/v1/seasons')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempSeason)
          .expect(201);

        const tempSeasonId = createResponse.body.seasonId;

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/seasons/${tempSeasonId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's soft deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/seasons/${tempSeasonId}`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        console.log('Admin can delete any season');
      });
    });
  });

  describe('GET /api/v1/seasons/current', () => {
    it('should return 404 when no current season exists', async () => {
      // Ensure no current seasons exist for this user
      await prisma.seasons.updateMany({
        where: { 
          created_by_user_id: testUser.id,
          is_deleted: false
        },
        data: { is_current: false }
      });

      await apiRequest
        .get('/api/v1/seasons/current')
        .expect(404);

      console.log('404 handling working for current season');
    });

    it('should return current season when marked with is_current flag', async () => {
      const currentSeasonData = {
        label: 'Current Season Test',
        startDate: '2024-08-01',
        endDate: '2025-05-31',
        isCurrent: true
      };

      const createResponse = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(currentSeasonData)
        .expect(201);

      createdSeasonIds.push(createResponse.body.seasonId);

      const currentResponse = await apiRequest
        .get('/api/v1/seasons/current')
        .expect(200);

      expect(currentResponse.body.season.isCurrent).toBe(true);
      expect(currentResponse.body.season.label).toBe(currentSeasonData.label);
    });
  });
});


