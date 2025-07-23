/**
 * Awards API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Awards API using Supertest.
 * Awards have foreign key relationships to Seasons and Players.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { testForeignKeyConstraints, createForeignKeyTestConfigs } from './shared-validation-patterns';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Awards API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let adminUser: TestUser;
  let otherUser: TestUser;
  let testData: {
    seasonId: string;
    teamId: string;
    playerId: string;
    awardIds: string[];
  };
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
    
    // Create test users
    testUser = await authHelper.createTestUser('USER');
    otherUser = await authHelper.createTestUser('USER');
    adminUser = await authHelper.createAdminUser();
    
    // Track created users for cleanup
    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    
    console.log('Awards API Tests: Database connected and users created');
  });

  afterAll(async () => {
    // Clean up test data in reverse dependency order
    await prisma.awards.deleteMany({
      where: { created_by_user_id: { in: createdUserIds } }
    });
    await prisma.match_awards.deleteMany({
      where: { created_by_user_id: { in: createdUserIds } }
    });
    await prisma.player.deleteMany({
      where: { created_by_user_id: { in: createdUserIds } }
    });
    await prisma.team.deleteMany({
      where: { created_by_user_id: { in: createdUserIds } }
    });
    await prisma.seasons.deleteMany({
      where: { created_by_user_id: { in: createdUserIds } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds } }
    });
    
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test data with proper foreign key relationships
    testData = {
      seasonId: randomUUID(),
      teamId: randomUUID(),
      playerId: randomUUID(),
      awardIds: []
    };

    try {
      // Create in correct dependency order
      
      // 1. Create season (awards depend on seasons)
      await prisma.seasons.create({
        data: {
          season_id: testData.seasonId,
          label: `Test Season ${Date.now()}`,
          start_date: new Date('2024-08-01'),
          end_date: new Date('2025-05-31'),
          created_by_user_id: testUser.id
        }
      });
      
      // 2. Create team (players depend on teams)
      await prisma.team.create({
        data: {
          id: testData.teamId,
          name: `Test Team ${Date.now()}`,
          home_kit_primary: '#FF0000',
          created_by_user_id: testUser.id
        }
      });
      
      // 3. Create player (awards depend on players)
      await prisma.player.create({
        data: {
          id: testData.playerId,
          name: `Test Player ${Date.now()}`,
          created_by_user_id: testUser.id
        }
      });
      
      console.log(`Test data created: season=${testData.seasonId.slice(0,8)}, player=${testData.playerId.slice(0,8)}`);
      
    } catch (error) {
      console.error('Failed to create test data:', error);
      throw error;
    }
  });

  afterEach(async () => {
    // Skip cleanup for Authorization Tests - they have their own cleanup
    const currentTest = expect.getState().currentTestName;
    if (currentTest && currentTest.includes('Authorization Tests')) {
      return;
    }

    try {
      // Clean up in reverse dependency order
      
      // 1. Delete awards first (depend on seasons and players)
      if (testData.awardIds.length > 0) {
        await prisma.awards.deleteMany({
          where: { award_id: { in: testData.awardIds } }
        });
      }
      
      // 2. Delete player (depends on team)
      await prisma.player.deleteMany({
        where: { id: testData.playerId }
      });
      
      // 3. Delete team (no dependencies)
      await prisma.team.deleteMany({
        where: { id: testData.teamId }
      });
      
      // 4. Delete season (no dependencies)
      await prisma.seasons.deleteMany({
        where: { season_id: testData.seasonId }
      });
      
      // Reset the awardIds array for next test
      testData.awardIds = [];
      
      console.log('Awards test data cleaned up successfully');
      
    } catch (error) {
      console.warn('Award cleanup warning (non-fatal):', error);
    }
  });

  describe('POST /api/v1/awards', () => {
    it('should create an award successfully', async () => {
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Player of the Match',
        notes: 'Outstanding performance in the final'
      };
      
      const response = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: awardData.category,
        notes: awardData.notes
      });
      
      console.log('Award created successfully:', response.body.id);
    });

    it('should create a minimal award', async () => {
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Top Scorer'
        // Omitting optional notes
      };
      
      const response = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: awardData.category
      });
      
      console.log('Minimal award created successfully:', response.body.id);
    });

    it('should validate required fields', async () => {
      const invalidAwardData = {
        category: 'Missing Required Fields'
        // Missing required seasonId and playerId
      };
      
      const response = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidAwardData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    // ENABLED: Using shared validation patterns for consistency
    it('should validate foreign key constraints', async () => {
      const config = createForeignKeyTestConfigs.awards();
      await testForeignKeyConstraints(apiRequest, config, testUser.accessToken);
    });

    it('should create different award categories', async () => {
      const categories = [
        'Most Improved Player',
        'Fair Play Award',
        'Goal of the Season',
        'Best Defender',
        'Team Spirit Award'
      ];
      
      for (const category of categories) {
        const awardData = {
          seasonId: testData.seasonId,
          playerId: testData.playerId,
          category: category,
          notes: `Test award for ${category}`
        };
        
        const response = await apiRequest
          .post('/api/v1/awards')
          .set(authHelper.getAuthHeader(testUser))
          .send(awardData)
          .expect(201);
        
        testData.awardIds.push(response.body.id);
        expect(response.body.category).toBe(category);
      }
      
      console.log(`Created ${categories.length} different award categories`);
    });
  });

  describe('GET /api/v1/awards', () => {
    it('should return paginated awards', async () => {
      const response = await apiRequest
        .get('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body).toMatchObject({
        data: expect.any(Array),
        pagination: {
          page: expect.any(Number),
          limit: expect.any(Number),
          total: expect.any(Number),
          totalPages: expect.any(Number),
          hasNext: expect.any(Boolean),
          hasPrev: expect.any(Boolean)
        }
      });
      
      console.log('Pagination working, total awards:', response.body.pagination.total);
    });

    it('should filter awards by season', async () => {
      // Create a test award first
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Season Filter Test'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Filter awards by season
      const response = await apiRequest
        .get(`/api/v1/awards?seasonId=${testData.seasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      // Should find our award
      const foundAward = response.body.data.find((award: any) => award.id === createResponse.body.id);
      expect(foundAward).toBeDefined();
      
      console.log('Season filtering working, found awards:', response.body.data.length);
    });

    it('should filter awards by player', async () => {
      // Create a test award first
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Player Filter Test'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Filter awards by player
      const response = await apiRequest
        .get(`/api/v1/awards?playerId=${testData.playerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      // Should find our award
      const foundAward = response.body.data.find((award: any) => award.id === createResponse.body.id);
      expect(foundAward).toBeDefined();
      
      console.log('Player filtering working, found awards:', response.body.data.length);
    });

    it('should support search functionality', async () => {
      // Create a test award first
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Searchable Golden Boot Award'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Search for the award
      const searchTerm = 'Golden';
      const response = await apiRequest
        .get(`/api/v1/awards?search=${searchTerm}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      // Should find our award
      const foundAward = response.body.data.find((award: any) => award.id === createResponse.body.id);
      expect(foundAward).toBeDefined();
      
      console.log('Search functionality working, found awards:', response.body.data.length);
    });
  });

  describe('GET /api/v1/awards/:id', () => {
    it('should return a specific award', async () => {
      // Create award first
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Specific Award Test',
        notes: 'Test notes for specific award'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Get the specific award
      const response = await apiRequest
        .get(`/api/v1/awards/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: awardData.category,
        notes: awardData.notes
      });
      
      console.log('Specific award retrieval working');
    });

    it('should return 404 for non-existent award', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .get(`/api/v1/awards/${nonExistentId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for non-existent award');
    });
  });

  describe('PUT /api/v1/awards/:id', () => {
    it('should update an award', async () => {
      // Create award first
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Updatable Award',
        notes: 'Original notes'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Update the award
      const updateData = {
        category: 'Updated Award Category',
        notes: 'Updated notes for the award'
      };
      
      const response = await apiRequest
        .put(`/api/v1/awards/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: updateData.category,
        notes: updateData.notes
      });
      
      console.log('Award update working');
    });

    it('should handle partial updates', async () => {
      // Create award first
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Partial Update Award',
        notes: 'Original notes'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Partial update (only notes)
      const updateData = {
        notes: 'Only notes updated'
      };
      
      const response = await apiRequest
        .put(`/api/v1/awards/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: awardData.category, // Should remain unchanged
        notes: updateData.notes
      });
      
      console.log('Partial award update working');
    });
  });

  describe('DELETE /api/v1/awards/:id', () => {
    it('should delete an award', async () => {
      // Create award first
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Deletable Award'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);
      
      // Delete the award
      await apiRequest
        .delete(`/api/v1/awards/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/awards/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Award deletion working');
      
      // Don't add to cleanup array since it's already deleted
    });

    it('should return 404 when deleting non-existent award', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/awards/${nonExistentId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for award deletion');
    });

    it('should restore soft-deleted award when creating same award again', async () => {
      // 1. Create an award
      const awardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Soft Delete Restoration Test',
        notes: 'Original award notes'
      };

      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(awardData)
        .expect(201);

      const originalAwardId = createResponse.body.id;
      console.log('Original award created:', originalAwardId);

      // 2. Delete the award (soft delete)
      await apiRequest
        .delete(`/api/v1/awards/${originalAwardId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Verify it's soft deleted (should return 404)
      await apiRequest
        .get(`/api/v1/awards/${originalAwardId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('Award soft deleted successfully');

      // 3. Create the same award again (same unique constraints: playerId + seasonId + category)
      const restoredAwardData = {
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: 'Soft Delete Restoration Test', // Same category
        notes: 'Restored award with new notes'
      };

      const restoreResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(restoredAwardData)
        .expect(201);

      // 4. Verify it's the same record restored (same ID)
      expect(restoreResponse.body.id).toBe(originalAwardId);
      expect(restoreResponse.body.seasonId).toBe(testData.seasonId);
      expect(restoreResponse.body.playerId).toBe(testData.playerId);
      expect(restoreResponse.body.category).toBe(restoredAwardData.category);
      expect(restoreResponse.body.notes).toBe(restoredAwardData.notes); // Updated notes

      console.log('Award restored with same ID:', restoreResponse.body.id);

      // 5. Verify the award is now accessible again
      const getResponse = await apiRequest
        .get(`/api/v1/awards/${originalAwardId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.id).toBe(originalAwardId);
      expect(getResponse.body.notes).toBe(restoredAwardData.notes);

      console.log('Soft delete restoration working - same award ID restored with updated data');

      // Add to cleanup
      testData.awardIds.push(originalAwardId);
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple award creation', async () => {
      const awardCount = 5;
      const awards = Array.from({ length: awardCount }, (_, i) => ({
        seasonId: testData.seasonId,
        playerId: testData.playerId,
        category: `Performance Award ${i + 1}`,
        notes: `Performance test award number ${i + 1}`
      }));
      
      const startTime = Date.now();
      
      const promises = awards.map(award =>
        apiRequest.post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser)).send(award)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        testData.awardIds.push(response.body.id);
      });
      
      const avgTime = totalTime / awardCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per award
      
      console.log(`${awardCount} awards created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });

  describe('Authorization Tests', () => {
    let testAwardId: string;
    let otherUserAwardId: string;
    let authTestSeasonId: string;
    let authTestPlayerId: string;
    let otherUserSeasonId: string;
    let otherUserPlayerId: string;

    beforeEach(async () => {
      // Create separate test data for authorization tests
      authTestSeasonId = randomUUID();
      authTestPlayerId = randomUUID();
      otherUserSeasonId = randomUUID();
      otherUserPlayerId = randomUUID();

      // Create season and player for testUser
      await prisma.seasons.create({
        data: {
          season_id: authTestSeasonId,
          label: `Auth Test Season ${Date.now()}`,
          start_date: new Date('2024-08-01'),
          end_date: new Date('2025-05-31'),
          created_by_user_id: testUser.id
        }
      });

      await prisma.player.create({
        data: {
          id: authTestPlayerId,
          name: `Auth Test Player ${Date.now()}`,
          created_by_user_id: testUser.id
        }
      });
      // Create an award by testUser
      const testUserAward = {
        seasonId: authTestSeasonId,
        playerId: authTestPlayerId,
        category: 'Test User Award',
        notes: 'Award created by test user'
      };

      const testUserResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send(testUserAward)
        .expect(201);

      testAwardId = testUserResponse.body.id;

      // Create season and player for otherUser
      await prisma.seasons.create({
        data: {
          season_id: otherUserSeasonId,
          label: `Other User Season ${Date.now()}`,
          start_date: new Date('2024-08-01'),
          end_date: new Date('2025-05-31'),
          created_by_user_id: otherUser.id
        }
      });

      await prisma.player.create({
        data: {
          id: otherUserPlayerId,
          name: `Other User Player ${Date.now()}`,
          created_by_user_id: otherUser.id
        }
      });

      const otherUserAward = {
        seasonId: otherUserSeasonId,
        playerId: otherUserPlayerId,
        category: 'Other User Award',
        notes: 'Award created by other user'
      };

      const otherUserResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(otherUser))
        .send(otherUserAward)
        .expect(201);

      otherUserAwardId = otherUserResponse.body.id;
    });

    afterEach(async () => {
      // Clean up authorization test data
      try {
        await prisma.awards.deleteMany({
          where: { 
            OR: [
              { award_id: testAwardId },
              { award_id: otherUserAwardId }
            ]
          }
        });
        
        await prisma.player.deleteMany({
          where: { 
            id: { in: [authTestPlayerId, otherUserPlayerId] }
          }
        });
        
        await prisma.seasons.deleteMany({
          where: { 
            season_id: { in: [authTestSeasonId, otherUserSeasonId] }
          }
        });
        
        console.log('Authorization test data cleaned up successfully');
      } catch (error) {
        console.warn('Authorization cleanup warning (non-fatal):', error);
      }
    });

    describe('User Isolation', () => {
      it('should not allow users to see other users awards in list', async () => {
        const response = await apiRequest
          .get('/api/v1/awards')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should only see their own awards
        expect(response.body.data).toBeInstanceOf(Array);
        
        // Check that otherUser's award is not in the list
        const awardIds = response.body.data.map((award: any) => award.id);
        expect(awardIds).toContain(testAwardId);
        expect(awardIds).not.toContain(otherUserAwardId);

        console.log('User isolation working for GET /awards');
      });

      it('should not allow users to access other users awards by ID', async () => {
        await apiRequest
          .get(`/api/v1/awards/${otherUserAwardId}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to other user\'s award');
      });

      it('should not allow users to update other users awards', async () => {
        const updateData = {
          category: 'Hacked Award',
          notes: 'This should not work'
        };

        await apiRequest
          .put(`/api/v1/awards/${otherUserAwardId}`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to other user\'s award');
      });

      it('should not allow users to delete other users awards', async () => {
        await apiRequest
          .delete(`/api/v1/awards/${otherUserAwardId}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to other user\'s award');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to see all awards in list', async () => {
        const response = await apiRequest
          .get('/api/v1/awards')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see awards from all users
        expect(response.body.data).toBeInstanceOf(Array);
        
        const awardIds = response.body.data.map((award: any) => award.id);
        expect(awardIds).toContain(testAwardId);
        expect(awardIds).toContain(otherUserAwardId);

        console.log('Admin can see all awards');
      });

      it('should allow admin to access any award by ID', async () => {
        // Admin should be able to access testUser's award
        const testUserAwardResponse = await apiRequest
          .get(`/api/v1/awards/${testAwardId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserAwardResponse.body.id).toBe(testAwardId);

        // Admin should be able to access otherUser's award
        const otherUserAwardResponse = await apiRequest
          .get(`/api/v1/awards/${otherUserAwardId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserAwardResponse.body.id).toBe(otherUserAwardId);

        console.log('Admin can access any award');
      });

      it('should allow admin to update any award', async () => {
        const updateData = {
          category: 'Admin Updated Award',
          notes: 'Updated by admin'
        };

        const response = await apiRequest
          .put(`/api/v1/awards/${otherUserAwardId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.category).toBe(updateData.category);
        expect(response.body.notes).toBe(updateData.notes);

        console.log('Admin can update any award');
      });

      it('should allow admin to delete any award', async () => {
        // Create a temporary award to delete
        const tempAward = {
          seasonId: authTestSeasonId,
          playerId: authTestPlayerId,
          category: 'Temp Award for Deletion',
          notes: 'This will be deleted by admin'
        };

        const createResponse = await apiRequest
          .post('/api/v1/awards')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempAward)
          .expect(201);

        const tempAwardId = createResponse.body.id;

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/awards/${tempAwardId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's soft deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/awards/${tempAwardId}`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        console.log('Admin can delete any award');
      });
    });
  });

  // ============================================================================
  // BATCH OPERATIONS TESTS
  // ============================================================================

  describe('POST /api/v1/awards/batch - Season Awards Batch Operations', () => {
    it('should create multiple awards in batch', async () => {
      // Create additional test player directly in database for batch operations
      const player2Id = randomUUID();
      await prisma.player.create({
        data: {
          id: player2Id,
          name: 'Batch Test Player 2',
          squad_number: 99,
          created_by_user_id: testUser.id
        }
      });

      const batchData = {
        create: [
          {
            seasonId: testData.seasonId,
            playerId: testData.playerId,
            category: 'Player of the Season',
            notes: 'Outstanding performance'
          },
          {
            seasonId: testData.seasonId,
            playerId: player2Id,
            category: 'Most Improved',
            notes: 'Great development'
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/awards/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(2);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.summary.totalSuccess).toBe(2);
      expect(response.body.summary.totalFailed).toBe(0);
    });

    it('should handle mixed batch operations (create, update, delete)', async () => {
      // Create additional test player for batch operations
      const player2Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: 'Batch Test Player 3',
          squadNumber: 98,
          currentTeam: testData.teamId
        })
        .expect(201);

      // First create an award to update and delete
      const createResponse = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testData.seasonId,
          playerId: testData.playerId,
          category: 'Test Award',
          notes: 'To be updated'
        })
        .expect(201);

      const awardToUpdate = createResponse.body.id;

      const createResponse2 = await apiRequest
        .post('/api/v1/awards')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testData.seasonId,
          playerId: player2Response.body.id,
          category: 'Test Award 2',
          notes: 'To be deleted'
        })
        .expect(201);

      const awardToDelete = createResponse2.body.id;

      const batchData = {
        create: [
          {
            seasonId: testData.seasonId,
            playerId: testData.playerId,
            category: 'New Batch Award',
            notes: 'Created in batch'
          }
        ],
        update: [
          {
            id: awardToUpdate,
            data: {
              category: 'Updated Award',
              notes: 'Updated in batch'
            }
          }
        ],
        delete: [awardToDelete]
      };

      const response = await apiRequest
        .post('/api/v1/awards/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.updated.success).toBe(1);
      expect(response.body.results.deleted.success).toBe(1);
      expect(response.body.summary.totalSuccess).toBe(3);
      expect(response.body.summary.totalFailed).toBe(0);
    });

    it('should handle validation failures in batch operations', async () => {
      const batchData = {
        create: [
          {
            seasonId: testData.seasonId,
            playerId: testData.playerId,
            category: 'Valid Award',
            notes: 'This should succeed'
          },
          {
            seasonId: 'invalid-uuid',
            playerId: testData.playerId,
            category: 'Invalid Award',
            notes: 'This should fail validation'
          }
        ],
        update: [
          {
            id: 'non-existent-id',
            data: {
              category: 'Updated Award'
            }
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/awards/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData);
      
      // Should fail validation at request level due to invalid UUID
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details).toBeDefined();
    });

    it('should handle partial failures with valid data but business logic failures', async () => {
      // Create a valid UUID that doesn't exist in the database
      const nonExistentSeasonId = '12345678-1234-1234-1234-123456789012';
      const nonExistentPlayerId = '87654321-4321-4321-4321-210987654321';
      const nonExistentAwardId = '11111111-2222-3333-4444-555555555555';

      const batchData = {
        create: [
          {
            seasonId: testData.seasonId,
            playerId: testData.playerId,
            category: 'Valid Award',
            notes: 'This should succeed'
          },
          {
            seasonId: nonExistentSeasonId,
            playerId: testData.playerId,
            category: 'Non-existent Season Award',
            notes: 'This should fail - season does not exist'
          },
          {
            seasonId: testData.seasonId,
            playerId: nonExistentPlayerId,
            category: 'Non-existent Player Award',
            notes: 'This should fail - player does not exist'
          }
        ],
        update: [
          {
            id: nonExistentAwardId,
            data: {
              category: 'Updated Award',
              notes: 'This should fail - award does not exist'
            }
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/awards/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData);
      
      // Should return 207 for partial success (valid data but some operations fail)
      expect(response.status).toBe(207);
      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.created.failed).toBe(2);
      expect(response.body.results.updated.failed).toBe(1);
      expect(response.body.summary.totalSuccess).toBe(1);
      expect(response.body.summary.totalFailed).toBe(3);
    });
  });

  describe('POST /api/v1/awards/match-awards/batch - Match Awards Batch Operations', () => {
    let testMatchId: string;

    beforeEach(async () => {
      // Create a test match for match awards
      const matchResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testData.seasonId,
          kickoffTime: new Date().toISOString(),
          homeTeamId: testData.teamId,
          awayTeamId: testData.teamId,
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);
      
      testMatchId = matchResponse.body.id;
    });

    it('should create multiple match awards in batch', async () => {
      // Create additional test player for batch operations
      const player2Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: 'Match Batch Test Player 1',
          squadNumber: 97,
          currentTeam: testData.teamId
        })
        .expect(201);

      const batchData = {
        create: [
          {
            matchId: testMatchId,
            playerId: testData.playerId,
            category: 'Man of the Match',
            notes: 'Excellent performance'
          },
          {
            matchId: testMatchId,
            playerId: player2Response.body.id,
            category: 'Best Defender',
            notes: 'Solid defense'
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/awards/match-awards/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(2);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.summary.totalSuccess).toBe(2);
      expect(response.body.summary.totalFailed).toBe(0);
    });

    it('should handle mixed batch operations for match awards', async () => {
      // Create additional test player for batch operations
      const player2Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: 'Match Batch Test Player 2',
          squadNumber: 96,
          currentTeam: testData.teamId
        })
        .expect(201);

      // First create a match award to update and delete
      const createResponse = await apiRequest
        .post('/api/v1/awards/match-awards')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          playerId: testData.playerId,
          category: 'Test Match Award',
          notes: 'To be updated'
        })
        .expect(201);

      const matchAwardToUpdate = createResponse.body.id;

      const createResponse2 = await apiRequest
        .post('/api/v1/awards/match-awards')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          playerId: player2Response.body.id,
          category: 'Test Match Award 2',
          notes: 'To be deleted'
        })
        .expect(201);

      const matchAwardToDelete = createResponse2.body.id;

      const batchData = {
        create: [
          {
            matchId: testMatchId,
            playerId: testData.playerId,
            category: 'New Batch Match Award',
            notes: 'Created in batch'
          }
        ],
        update: [
          {
            id: matchAwardToUpdate,
            data: {
              category: 'Updated Match Award',
              notes: 'Updated in batch'
            }
          }
        ],
        delete: [matchAwardToDelete]
      };

      const response = await apiRequest
        .post('/api/v1/awards/match-awards/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.updated.success).toBe(1);
      expect(response.body.results.deleted.success).toBe(1);
      expect(response.body.summary.totalSuccess).toBe(3);
      expect(response.body.summary.totalFailed).toBe(0);
    });

    it('should require authentication for batch operations', async () => {
      const batchData = {
        create: [
          {
            matchId: testMatchId,
            playerId: testData.playerId,
            category: 'Test Award'
          }
        ]
      };

      await apiRequest
        .post('/api/v1/awards/match-awards/batch')
        .send(batchData)
        .expect(401);
    });

    it('should validate batch request schema', async () => {
      const invalidBatchData = {
        create: [
          {
            matchId: 'invalid-uuid',
            playerId: testData.playerId,
            category: ''  // Empty category should fail validation
          }
        ]
      };

      await apiRequest
        .post('/api/v1/awards/match-awards/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidBatchData)
        .expect(400);
    });
  });
});