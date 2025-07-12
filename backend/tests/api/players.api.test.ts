/**
 * Players API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Players API using Supertest.
 * Players have foreign key relationships to Teams.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { testForeignKeyConstraints, createForeignKeyTestConfigs, testUniqueConstraints, createUniqueConstraintTestConfigs } from './shared-validation-patterns';

describe('Players API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let testData: {
    teamId: string;
    playerIds: string[];
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
    
    console.log('Players API Tests: Database connected');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test data with proper foreign key relationships
    testData = {
      teamId: randomUUID(),
      playerIds: []
    };

    try {
      // Create team first (players depend on teams)
      await prisma.team.create({
        data: {
          id: testData.teamId,
          name: `Test Team ${Date.now()}`,
          home_kit_primary: '#FF0000'
        }
      });
      
      console.log(`Test team created: ${testData.teamId.slice(0,8)}`);
      
    } catch (error) {
      console.error('Failed to create test team:', error);
      throw error;
    }
  });

  afterEach(async () => {
    try {
      // Clean up in reverse dependency order
      
      // 1. Delete players first (depend on team)
      if (testData.playerIds.length > 0) {
        await prisma.player.deleteMany({
          where: { id: { in: testData.playerIds } }
        });
      }
      
      // 2. Delete team (no dependencies)
      await prisma.team.deleteMany({
        where: { id: testData.teamId }
      });
      
      console.log('Players test data cleaned up successfully');
      
    } catch (error) {
      console.warn('Player cleanup warning (non-fatal):', error);
    }
  });

  describe('POST /api/v1/players', () => {
    it('should create a player successfully', async () => {
      const playerData = {
        name: `Test Player ${Date.now()}`,
        squadNumber: 10,
        dateOfBirth: '2010-01-15T00:00:00.000Z',
        notes: 'Test player notes',
        currentTeam: testData.teamId
        // Omitting preferredPosition to avoid foreign key constraint
      };
      
      const response = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      testData.playerIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: playerData.name,
        squadNumber: playerData.squadNumber,
        currentTeam: testData.teamId
      });
      
      console.log('Player created successfully:', response.body.id);
    });

    it('should create a minimal player', async () => {
      const playerData = {
        name: `Minimal Player ${Date.now()}`,
        currentTeam: testData.teamId
      };
      
      const response = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      testData.playerIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: playerData.name,
        currentTeam: testData.teamId
      });
      
      console.log('Minimal player created successfully:', response.body.id);
    });

    it('should validate required fields', async () => {
      const invalidPlayerData = {
        squadNumber: 10
        // Missing required name
      };
      
      const response = await apiRequest
        .post('/api/v1/players')
        .send(invalidPlayerData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    // ENABLED: Using shared validation patterns for consistency
    it('should validate foreign key constraints', async () => {
      const config = createForeignKeyTestConfigs.players();
      await testForeignKeyConstraints(apiRequest, config);
    });

    // ENABLED: Using shared validation patterns for consistency
    it('should validate squad number uniqueness within team', async () => {
      const config = createUniqueConstraintTestConfigs.players(testData.teamId);
      const createdPlayerId = await testUniqueConstraints(apiRequest, config);
      testData.playerIds.push(createdPlayerId);
    });
  });

  describe('GET /api/v1/players', () => {
    it('should return paginated players', async () => {
      const response = await apiRequest
        .get('/api/v1/players')
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
      
      console.log('Pagination working, total players:', response.body.pagination.total);
    });

    it('should filter players by team', async () => {
      // Create a test player first
      const playerData = {
        name: `Team Filter Player ${Date.now()}`,
        currentTeam: testData.teamId
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      testData.playerIds.push(createResponse.body.id);
      
      // Filter players by team
      const response = await apiRequest
        .get(`/api/v1/players?teamId=${testData.teamId}`)
        .expect(200);
      
      // Should find our player
      const foundPlayer = response.body.data.find((player: any) => player.id === createResponse.body.id);
      expect(foundPlayer).toBeDefined();
      
      console.log('Team filtering working, found players:', response.body.data.length);
    });

    it('should support search functionality', async () => {
      // Create a test player first
      const playerData = {
        name: `Searchable Ronaldo ${Date.now()}`,
        currentTeam: testData.teamId
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      testData.playerIds.push(createResponse.body.id);
      
      // Search for the player
      const searchTerm = 'Ronaldo';
      const response = await apiRequest
        .get(`/api/v1/players?search=${searchTerm}`)
        .expect(200);
      
      // Should find our player
      const foundPlayer = response.body.data.find((player: any) => player.id === createResponse.body.id);
      expect(foundPlayer).toBeDefined();
      
      console.log('Search functionality working, found players:', response.body.data.length);
    });
  });

  describe('GET /api/v1/players/:id', () => {
    it('should return a specific player', async () => {
      // Create player first
      const playerData = {
        name: `Specific Player ${Date.now()}`,
        squadNumber: 9,
        currentTeam: testData.teamId
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      testData.playerIds.push(createResponse.body.id);
      
      // Get the specific player
      const response = await apiRequest
        .get(`/api/v1/players/${createResponse.body.id}`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        name: playerData.name,
        squadNumber: playerData.squadNumber,
        currentTeam: testData.teamId
      });
      
      console.log('Specific player retrieval working');
    });

    it('should return 404 for non-existent player', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .get(`/api/v1/players/${nonExistentId}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for non-existent player');
    });
  });

  describe('PUT /api/v1/players/:id', () => {
    it('should update a player', async () => {
      // Create player first
      const playerData = {
        name: `Updatable Player ${Date.now()}`,
        squadNumber: 11,
        currentTeam: testData.teamId
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      testData.playerIds.push(createResponse.body.id);
      
      // Update the player
      const updateData = {
        name: `Updated Player ${Date.now()}`,
        squadNumber: 12
        // Omitting preferredPosition to avoid foreign key constraint
      };
      
      const response = await apiRequest
        .put(`/api/v1/players/${createResponse.body.id}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        name: updateData.name,
        squadNumber: updateData.squadNumber,
        currentTeam: testData.teamId // Should remain unchanged
      });
      
      console.log('Player update working');
    });

    it('should handle partial updates', async () => {
      // Create player first
      const playerData = {
        name: `Partial Update Player ${Date.now()}`,
        squadNumber: 13,
        currentTeam: testData.teamId
        // Omitting preferredPosition to avoid foreign key constraint
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      testData.playerIds.push(createResponse.body.id);
      
      // Partial update (only squad number)
      const updateData = {
        squadNumber: 14
      };
      
      const response = await apiRequest
        .put(`/api/v1/players/${createResponse.body.id}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        name: playerData.name, // Should remain unchanged
        squadNumber: updateData.squadNumber,
        currentTeam: testData.teamId
      });
      
      console.log('Partial player update working');
    });
  });

  describe('DELETE /api/v1/players/:id', () => {
    it('should delete a player', async () => {
      // Create player first
      const playerData = {
        name: `Deletable Player ${Date.now()}`,
        currentTeam: testData.teamId
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(201);
      
      // Delete the player
      await apiRequest
        .delete(`/api/v1/players/${createResponse.body.id}`)
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/players/${createResponse.body.id}`)
        .expect(404);
      
      console.log('Player deletion working');
      
      // Don't add to cleanup array since it's already deleted
    });

    it('should return 404 when deleting non-existent player', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/players/${nonExistentId}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for player deletion');
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple player creation', async () => {
      const playerCount = 5;
      const players = Array.from({ length: playerCount }, (_, i) => ({
        name: `Performance Player ${i + 1} ${Date.now()}`,
        squadNumber: i + 1,
        currentTeam: testData.teamId
      }));
      
      const startTime = Date.now();
      
      const promises = players.map(player =>
        apiRequest.post('/api/v1/players').send(player)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        testData.playerIds.push(response.body.id);
      });
      
      const avgTime = totalTime / playerCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per player
      
      console.log(`${playerCount} players created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });
});