/**
 * Matches API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Matches API using Supertest.
 * Matches have multiple foreign key relationships to Seasons and Teams.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { testForeignKeyConstraints, createForeignKeyTestConfigs } from './shared-validation-patterns';

describe('Matches API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let testData: {
    seasonId: string;
    homeTeamId: string;
    awayTeamId: string;
    matchIds: string[];
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
    
    console.log('Matches API Tests: Database connected');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test data with proper foreign key relationships
    testData = {
      seasonId: randomUUID(),
      homeTeamId: randomUUID(),
      awayTeamId: randomUUID(),
      matchIds: []
    };

    try {
      // Create in correct dependency order
      
      // 1. Create season (matches depend on seasons)
      await prisma.seasons.create({
        data: {
          season_id: testData.seasonId,
          label: `Test Season ${Date.now()}`
        }
      });
      
      // 2. Create home team (matches depend on teams)
      await prisma.team.create({
        data: {
          id: testData.homeTeamId,
          name: `Home Team ${Date.now()}`,
          home_kit_primary: '#FF0000'
        }
      });
      
      // 3. Create away team (matches depend on teams)
      await prisma.team.create({
        data: {
          id: testData.awayTeamId,
          name: `Away Team ${Date.now()}`,
          home_kit_primary: '#0000FF'
        }
      });
      
      console.log(`Test data created: season=${testData.seasonId.slice(0,8)}, home=${testData.homeTeamId.slice(0,8)}, away=${testData.awayTeamId.slice(0,8)}`);
      
    } catch (error) {
      console.error('Failed to create test data:', error);
      throw error;
    }
  });

  afterEach(async () => {
    try {
      // Clean up in reverse dependency order
      
      // 1. Delete matches first (depend on seasons and teams)
      if (testData.matchIds.length > 0) {
        await prisma.match.deleteMany({
          where: { match_id: { in: testData.matchIds } }
        });
      }
      
      // 2. Delete teams (no dependencies)
      await prisma.team.deleteMany({
        where: { id: { in: [testData.homeTeamId, testData.awayTeamId] } }
      });
      
      // 3. Delete season (no dependencies)
      await prisma.seasons.deleteMany({
        where: { season_id: testData.seasonId }
      });
      
      console.log('Matches test data cleaned up successfully');
      
    } catch (error) {
      console.warn('Match cleanup warning (non-fatal):', error);
    }
  });

  describe('POST /api/v1/matches', () => {
    it('should create a match successfully', async () => {
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Test League',
        venue: 'Test Stadium',
        durationMinutes: 90,
        periodFormat: 'half',
        ourScore: 0,
        opponentScore: 0,
        notes: 'Test match notes'
      };
      
      const response = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        seasonId: testData.seasonId,
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: matchData.competition,
        venue: matchData.venue,
        durationMinutes: matchData.durationMinutes,
        periodFormat: matchData.periodFormat
      });
      
      console.log('Match created successfully:', response.body.id);
    });

    it('should create a minimal match', async () => {
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // Day after tomorrow
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId
        // Omitting optional fields
      };
      
      const response = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        seasonId: testData.seasonId,
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId
      });
      
      console.log('Minimal match created successfully:', response.body.id);
    });

    it('should validate required fields', async () => {
      const invalidMatchData = {
        competition: 'Missing Required Fields'
        // Missing required seasonId, kickoffTime, homeTeamId, awayTeamId
      };
      
      const response = await apiRequest
        .post('/api/v1/matches')
        .send(invalidMatchData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    // ENABLED: Using shared validation patterns for consistency
    it('should validate foreign key constraints', async () => {
      const config = createForeignKeyTestConfigs.matches();
      await testForeignKeyConstraints(apiRequest, config);
    });

    it('should create U10 format match', async () => {
      const u10MatchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'U10 League',
        durationMinutes: 60, // U10 matches are shorter
        periodFormat: 'half',
        notes: 'U10 format match - 7v7'
      };
      
      const response = await apiRequest
        .post('/api/v1/matches')
        .send(u10MatchData)
        .expect(201);
      
      testData.matchIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        competition: 'U10 League',
        durationMinutes: 60,
        periodFormat: 'half'
      });
      
      console.log('U10 match created successfully');
    });
  });

  describe('GET /api/v1/matches', () => {
    it('should return paginated matches', async () => {
      const response = await apiRequest
        .get('/api/v1/matches')
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
      
      console.log('Pagination working, total matches:', response.body.pagination.total);
    });

    it('should filter matches by season', async () => {
      // Create a test match first
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Season Filter Test'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(createResponse.body.id);
      
      // Filter matches by season
      const response = await apiRequest
        .get(`/api/v1/matches?seasonId=${testData.seasonId}`)
        .expect(200);
      
      // Should find our match
      const foundMatch = response.body.data.find((match: any) => match.id === createResponse.body.id);
      expect(foundMatch).toBeDefined();
      
      console.log('Season filtering working, found matches:', response.body.data.length);
    });

    it('should filter matches by team', async () => {
      // Create a test match first
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Team Filter Test'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(createResponse.body.id);
      
      // Filter matches by home team
      const response = await apiRequest
        .get(`/api/v1/matches?teamId=${testData.homeTeamId}`)
        .expect(200);
      
      // Should find our match
      const foundMatch = response.body.data.find((match: any) => match.id === createResponse.body.id);
      expect(foundMatch).toBeDefined();
      
      console.log('Team filtering working, found matches:', response.body.data.length);
    });

    it('should support search functionality', async () => {
      // Create a test match first
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 144 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Searchable Championship Final'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(createResponse.body.id);
      
      // Search for the match
      const searchTerm = 'Championship';
      const response = await apiRequest
        .get(`/api/v1/matches?search=${searchTerm}`)
        .expect(200);
      
      // Should find our match
      const foundMatch = response.body.data.find((match: any) => match.id === createResponse.body.id);
      expect(foundMatch).toBeDefined();
      
      console.log('Search functionality working, found matches:', response.body.data.length);
    });
  });

  describe('GET /api/v1/matches/:id', () => {
    it('should return a specific match', async () => {
      // Create match first
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 168 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Specific Match Test',
        venue: 'Specific Stadium',
        notes: 'Test notes for specific match'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(createResponse.body.id);
      
      // Get the specific match
      const response = await apiRequest
        .get(`/api/v1/matches/${createResponse.body.id}`)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        seasonId: testData.seasonId,
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: matchData.competition,
        venue: matchData.venue
      });
      
      console.log('Specific match retrieval working');
    });

    it('should return 404 for non-existent match', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .get(`/api/v1/matches/${nonExistentId}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for non-existent match');
    });
  });

  describe('PUT /api/v1/matches/:id', () => {
    it('should update a match', async () => {
      // Create match first
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 192 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Updatable Match',
        ourScore: 0,
        opponentScore: 0
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(createResponse.body.id);
      
      // Update the match (e.g., final score)
      const updateData = {
        ourScore: 3,
        opponentScore: 1,
        notes: 'Great victory! Hat-trick by our striker.'
      };
      
      const response = await apiRequest
        .put(`/api/v1/matches/${createResponse.body.id}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        ourScore: updateData.ourScore,
        opponentScore: updateData.opponentScore,
        notes: updateData.notes
      });
      
      console.log('Match update working');
    });

    it('should handle partial updates', async () => {
      // Create match first
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 216 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Partial Update Match',
        venue: 'Original Stadium'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      testData.matchIds.push(createResponse.body.id);
      
      // Partial update (only venue)
      const updateData = {
        venue: 'Updated Stadium'
      };
      
      const response = await apiRequest
        .put(`/api/v1/matches/${createResponse.body.id}`)
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        competition: matchData.competition, // Should remain unchanged
        venue: updateData.venue
      });
      
      console.log('Partial match update working');
    });
  });

  describe('DELETE /api/v1/matches/:id', () => {
    it('should delete a match', async () => {
      // Create match first
      const matchData = {
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + 240 * 60 * 60 * 1000).toISOString(),
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: 'Deletable Match'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(201);
      
      // Delete the match
      await apiRequest
        .delete(`/api/v1/matches/${createResponse.body.id}`)
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/matches/${createResponse.body.id}`)
        .expect(404);
      
      console.log('Match deletion working');
      
      // Don't add to cleanup array since it's already deleted
    });

    it('should return 404 when deleting non-existent match', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/matches/${nonExistentId}`)
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for match deletion');
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple match creation', async () => {
      const matchCount = 5;
      const matches = Array.from({ length: matchCount }, (_, i) => ({
        seasonId: testData.seasonId,
        kickoffTime: new Date(Date.now() + (264 + i * 24) * 60 * 60 * 1000).toISOString(), // Spread over days
        homeTeamId: testData.homeTeamId,
        awayTeamId: testData.awayTeamId,
        competition: `Performance Match ${i + 1}`,
        venue: `Stadium ${i + 1}`
      }));
      
      const startTime = Date.now();
      
      const promises = matches.map(match =>
        apiRequest.post('/api/v1/matches').send(match)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        testData.matchIds.push(response.body.id);
      });
      
      const avgTime = totalTime / matchCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per match
      
      console.log(`${matchCount} matches created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });
});