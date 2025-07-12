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

describe('Awards API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let testData: {
    seasonId: string;
    teamId: string;
    playerId: string;
    awardIds: string[];
  };

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
    
    console.log('Awards API Tests: Database connected');
  });

  afterAll(async () => {
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
          label: `Test Season ${Date.now()}`
        }
      });
      
      // 2. Create team (players depend on teams)
      await prisma.team.create({
        data: {
          id: testData.teamId,
          name: `Test Team ${Date.now()}`,
          home_kit_primary: '#FF0000'
        }
      });
      
      // 3. Create player (awards depend on players)
      await prisma.player.create({
        data: {
          id: testData.playerId,
          name: `Test Player ${Date.now()}`,
          current_team: testData.teamId
        }
      });
      
      console.log(`Test data created: season=${testData.seasonId.slice(0,8)}, player=${testData.playerId.slice(0,8)}`);
      
    } catch (error) {
      console.error('Failed to create test data:', error);
      throw error;
    }
  });

  afterEach(async () => {
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
        .send(invalidAwardData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    // ENABLED: Using shared validation patterns for consistency
    it('should validate foreign key constraints', async () => {
      const config = createForeignKeyTestConfigs.awards();
      await testForeignKeyConstraints(apiRequest, config);
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
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Filter awards by season
      const response = await apiRequest
        .get(`/api/v1/awards?seasonId=${testData.seasonId}`)
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
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Filter awards by player
      const response = await apiRequest
        .get(`/api/v1/awards?playerId=${testData.playerId}`)
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
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Search for the award
      const searchTerm = 'Golden';
      const response = await apiRequest
        .get(`/api/v1/awards?search=${searchTerm}`)
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
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Get the specific award
      const response = await apiRequest
        .get(`/api/v1/awards/${createResponse.body.id}`)
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
        .send(awardData)
        .expect(201);
      
      testData.awardIds.push(createResponse.body.id);
      
      // Partial update (only notes)
      const updateData = {
        notes: 'Only notes updated'
      };
      
      const response = await apiRequest
        .put(`/api/v1/awards/${createResponse.body.id}`)
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
        .send(awardData)
        .expect(201);
      
      // Delete the award
      await apiRequest
        .delete(`/api/v1/awards/${createResponse.body.id}`)
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/awards/${createResponse.body.id}`)
        .expect(404);
      
      console.log('Award deletion working');
      
      // Don't add to cleanup array since it's already deleted
    });

    it('should return 404 when deleting non-existent award', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/awards/${nonExistentId}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for award deletion');
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
        apiRequest.post('/api/v1/awards').send(award)
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
});