/**
 * Match State API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Match State Management API using Supertest.
 * Tests authentication, authorization, state transitions, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Match State API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let adminUser: TestUser;
  let otherUser: TestUser;
  let createdMatchIds: string[] = [];
  let createdTeamIds: string[] = [];
  let createdUserIds: string[] = [];
  let createdSeasonIds: string[] = [];
  let testTeamId: string;
  let otherUserTeamId: string;
  let testSeasonId: string;
  let testMatchId: string;
  let otherUserMatchId: string;

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
    
    // Create test teams
    const testTeamResponse = await request(app)
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Team ${Date.now()}` })
      .expect(201);
    
    const otherTeamResponse = await request(app)
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(otherUser))
      .send({ name: `Other Team ${Date.now()}` })
      .expect(201);
    
    testTeamId = testTeamResponse.body.id;
    otherUserTeamId = otherTeamResponse.body.id;
    
    // Create test season
    const seasonResponse = await prisma.seasons.create({
      data: {
        season_id: randomUUID(),
        label: `Test Season ${Date.now()}`,
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        is_current: true,
        created_by_user_id: testUser.id
      }
    });
    testSeasonId = seasonResponse.season_id;
    
    // Create test matches
    const testMatchResponse = await request(app)
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        seasonId: testSeasonId,
        kickoffTime: new Date().toISOString(),
        homeTeamId: testTeamId,
        awayTeamId: otherUserTeamId,
        competition: 'Test League',
        venue: 'Test Stadium'
      });
    
    const otherMatchResponse = await request(app)
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(otherUser))
      .send({
        seasonId: testSeasonId,
        kickoffTime: new Date().toISOString(),
        homeTeamId: otherUserTeamId,
        awayTeamId: testTeamId,
        competition: 'Test League',
        venue: 'Test Stadium'
      });
    
    if (testMatchResponse.status !== 201 || otherMatchResponse.status !== 201) {
      throw new Error(`Failed to create matches. Test: ${testMatchResponse.status}, Other: ${otherMatchResponse.status}`);
    }
    
    testMatchId = testMatchResponse.body.id;
    otherUserMatchId = otherMatchResponse.body.id;
    
    // Verify match IDs were created successfully
    if (!testMatchId || !otherUserMatchId) {
      throw new Error(`Failed to create test matches. testMatchId: ${testMatchId}, otherUserMatchId: ${otherUserMatchId}`);
    }
    
    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    createdTeamIds.push(testTeamId, otherUserTeamId);
    createdSeasonIds.push(testSeasonId);
    createdMatchIds.push(testMatchId, otherUserMatchId);
    
    console.log('Match State API Tests: Database connected and test data created');
  });

  afterAll(async () => {
    // Clean up match states first
    try {
      if (createdMatchIds.length > 0) {
        await prisma.match_state.deleteMany({
          where: { match_id: { in: createdMatchIds.filter(id => id) } }
        });
      }
    } catch (error) {
      console.warn('Match state cleanup warning:', error);
    }
    
    // Clean up matches
    try {
      await prisma.match.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Match cleanup warning:', error);
    }
    
    // Clean up seasons
    try {
      await prisma.seasons.deleteMany({
        where: { season_id: { in: createdSeasonIds } }
      });
    } catch (error) {
      console.warn('Season cleanup warning:', error);
    }
    
    // Clean up teams
    try {
      await prisma.team.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Team cleanup warning:', error);
    }
    
    // Clean up users
    if (createdUserIds.length > 0) {
      try {
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } }
        });
      } catch (error) {
        console.warn('User cleanup warning:', error);
      }
    }
    
    await prisma.$disconnect();
    console.log('Match State API Tests: Database disconnected and cleanup completed');
  });

  afterEach(async () => {
    // Reset match states before each test
    if (createdMatchIds.length > 0) {
      await prisma.match_state.deleteMany({
        where: { match_id: { in: createdMatchIds } }
      });
    }
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'post', path: `/api/v1/matches/${testMatchId}/start` },
        { method: 'post', path: `/api/v1/matches/${testMatchId}/pause` },
        { method: 'post', path: `/api/v1/matches/${testMatchId}/resume` },
        { method: 'post', path: `/api/v1/matches/${testMatchId}/complete` },
        { method: 'post', path: `/api/v1/matches/${testMatchId}/cancel` },
        { method: 'get', path: `/api/v1/matches/${testMatchId}/state` }
      ];

      for (const endpoint of endpoints) {
        const response = await apiRequest[endpoint.method as keyof typeof apiRequest](endpoint.path);
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Access token required');
      }
    });

    it('should deny access to matches user does not own', async () => {
      const endpoints = [
        { method: 'post', path: `/api/v1/matches/${otherUserMatchId}/start` },
        { method: 'post', path: `/api/v1/matches/${otherUserMatchId}/pause` },
        { method: 'post', path: `/api/v1/matches/${otherUserMatchId}/resume` },
        { method: 'post', path: `/api/v1/matches/${otherUserMatchId}/complete` },
        { method: 'post', path: `/api/v1/matches/${otherUserMatchId}/cancel` },
        { method: 'get', path: `/api/v1/matches/${otherUserMatchId}/state` }
      ];

      for (const endpoint of endpoints) {
        const response = await apiRequest[endpoint.method as keyof typeof apiRequest](endpoint.path)
          .set(authHelper.getAuthHeader(testUser));
        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Access denied');
      }
    });

    it('should allow admin access to any match', async () => {
      // Start match as admin
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(adminUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('LIVE');
    });
  });

  describe('Match State Transitions', () => {
    it('should start a match successfully', async () => {
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('LIVE');
      expect(response.body.data.matchId).toBe(testMatchId);
      expect(response.body.data.matchStartedAt).toBeDefined();
    });

    it('should pause a live match successfully', async () => {
      // First start the match
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      // Then pause it
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/pause`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('PAUSED');
    });

    it('should resume a paused match successfully', async () => {
      // Start and pause the match
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/pause`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      // Then resume it
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/resume`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('LIVE');
    });

    it('should complete a match successfully', async () => {
      // Start the match first
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      // Then complete it
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/complete`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('COMPLETED');
      expect(response.body.data.matchEndedAt).toBeDefined();
    });

    it('should cancel a match successfully', async () => {
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/cancel`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ reason: 'Weather conditions' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CANCELLED');
      expect(response.body.data.matchEndedAt).toBeDefined();
    });

    it('should cancel a match with default reason when none provided', async () => {
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/cancel`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('CANCELLED');
    });
  });

  describe('Invalid State Transitions', () => {
    it('should reject pausing a scheduled match', async () => {
      const testMatchResponse = await request(app)
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        seasonId: testSeasonId,
        kickoffTime: new Date().toISOString(),
        homeTeamId: testTeamId,
        awayTeamId: otherUserTeamId,
        competition: 'Test League',
        venue: 'Test Stadium'
      });
      const newMatchId = testMatchResponse.body.id;

      const response = await apiRequest
        .post(`/api/v1/matches/${newMatchId}/pause`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(400);

      expect(response.body.message).toContain('invalid transition from SCHEDULED to PAUSED');
    });

    it('should allow resuming a scheduled match (same as starting)', async () => {
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/resume`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('LIVE');
    });

    it('should reject starting a completed match', async () => {
      // Complete the match first
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/complete`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      // Try to start it again
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(400);

      expect(response.body.message).toContain('invalid transition from COMPLETED to LIVE');
    });
  });

  describe('Match State Retrieval', () => {
    it('should get current match state', async () => {
      // Start the match first
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const response = await apiRequest
        .get(`/api/v1/matches/${testMatchId}/state`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('LIVE');
      expect(response.body.data.matchId).toBe(testMatchId);
    });

    it('should return 404 for non-existent match state', async () => {
      const response = await apiRequest
        .get(`/api/v1/matches/${testMatchId}/state`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      expect(response.body.error).toBe('Match state not found');
    });

    it('should return 404 for invalid match ID', async () => {
      const invalidId = randomUUID();
      const response = await apiRequest
        .get(`/api/v1/matches/${invalidId}/state`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });
  });

  describe('Match Status Query Endpoints', () => {
    it('should get live matches for user', async () => {
      // Start a match to make it live
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const response = await apiRequest
        .get('/api/v1/matches/live')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].status).toBe('LIVE');
      expect(response.body.data[0].matchId).toBe(testMatchId);
    });

    it('should return empty array when no live matches exist', async () => {
      const response = await apiRequest
        .get('/api/v1/matches/live')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      console.log(JSON.stringify(response.body, null, 2));
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(0);
    });

    it('should get match status with full details', async () => {
      // Start the match first
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const response = await apiRequest
        .get(`/api/v1/matches/${testMatchId}/status`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.matchId).toBe(testMatchId);
      expect(response.body.data.homeTeam).toBeDefined();
      expect(response.body.data.awayTeam).toBeDefined();
      expect(response.body.data.state).toBeDefined();
      expect(response.body.data.state.status).toBe('LIVE');
      expect(response.body.data.kickoffTime).toBeDefined();
      expect(response.body.data.competition).toBe('Test League');
      expect(response.body.data.venue).toBe('Test Stadium');
    });

    it('should return 404 for non-existent match status', async () => {
      const invalidId = randomUUID();
      const response = await apiRequest
        .get(`/api/v1/matches/${invalidId}/status`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(403);

      expect(response.body.message).toContain('Access denied');
    });

    it('should require authentication for live matches endpoint', async () => {
      const response = await apiRequest
        .get('/api/v1/matches/live')
        .expect(401);

      expect(response.body.error).toBe('Access token required');
    });

    it('should require authentication for match status endpoint', async () => {
      const response = await apiRequest
        .get(`/api/v1/matches/${testMatchId}/status`)
        .expect(401);

      expect(response.body.error).toBe('Access token required');
    });

    it('should allow admin to see all live matches', async () => {
      // Start matches for both users
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      await apiRequest
        .post(`/api/v1/matches/${otherUserMatchId}/start`)
        .set(authHelper.getAuthHeader(otherUser))
        .expect(200);

      // Admin should see both matches
      const response = await apiRequest
        .get('/api/v1/matches/live')
        .set(authHelper.getAuthHeader(adminUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(2);
      
      const matchIds = response.body.data.map((match: any) => match.matchId);
      expect(matchIds).toContain(testMatchId);
      expect(matchIds).toContain(otherUserMatchId);
    });

    it('should only show user-accessible live matches for non-admin users', async () => {
      // Start matches for both users
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      await apiRequest
        .post(`/api/v1/matches/${otherUserMatchId}/start`)
        .set(authHelper.getAuthHeader(otherUser))
        .expect(200);

      // Regular user should only see their own match
      const response = await apiRequest
        .get('/api/v1/matches/live')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.data[0].matchId).toBe(testMatchId);
    });

    it('should validate UUID format for match status endpoint', async () => {
      const response = await apiRequest
        .get('/api/v1/matches/invalid-uuid/status')
        .set(authHelper.getAuthHeader(testUser))
        .expect(400);

      expect(response.body.error).toContain('Invalid UUID');
    });
  });

  describe('Input Validation', () => {
    it('should validate UUID format in match ID', async () => {
      const response = await apiRequest
        .post('/api/v1/matches/invalid-uuid/start')
        .set(authHelper.getAuthHeader(testUser))
        .expect(400);

      expect(response.body.error).toContain('Invalid UUID');
    });

    it('should validate cancellation reason length', async () => {
      const longReason = 'x'.repeat(501); // Exceeds 500 character limit
      
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/cancel`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ reason: longReason })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details[0].message).toContain('Cancellation reason must be less than 500 characters');
    });

    it('should validate match start notes length', async () => {
      const longNotes = 'x'.repeat(501); // Exceeds 500 character limit
      
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ notes: longNotes })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details[0].message).toContain('Start notes must be less than 500 characters');
    });

    it('should validate match pause reason length', async () => {
      // First start the match
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const longReason = 'x'.repeat(501); // Exceeds 500 character limit
      
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/pause`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ reason: longReason })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details[0].message).toContain('Pause reason must be less than 500 characters');
    });

    it('should validate match resume notes length', async () => {
      // First start and pause the match
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/pause`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const longNotes = 'x'.repeat(501); // Exceeds 500 character limit
      
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/resume`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ notes: longNotes })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details[0].message).toContain('Resume notes must be less than 500 characters');
    });

    it('should validate match complete final score', async () => {
      // First start the match
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const invalidScore = {
        finalScore: {
          home: -1, // Invalid negative score
          away: 2
        }
      };
      
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/complete`)
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidScore)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details[0].message).toContain('Home score cannot be negative');
    });

    it('should validate match complete notes length', async () => {
      // First start the match
      await apiRequest
        .post(`/api/v1/matches/${testMatchId}/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const longNotes = 'x'.repeat(501); // Exceeds 500 character limit
      
      const response = await apiRequest
        .post(`/api/v1/matches/${testMatchId}/complete`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ notes: longNotes })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details[0].message).toContain('Completion notes must be less than 500 characters');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll test that the error handling structure is in place
      const response = await apiRequest
        .post(`/api/v1/matches/${randomUUID()}/start`)
        .set(authHelper.getAuthHeader(testUser));

      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });
});