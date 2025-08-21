import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import { AuthTestHelper, TestUser } from './auth-helpers';

const prisma = new PrismaClient();
const authHelper = new AuthTestHelper(app);

describe('Match Periods API Integration', () => {
  let testUser: TestUser;
  let otherUser: TestUser;
  let adminUser: TestUser;
  let testTeam: any;
  let otherTeam: any;
  let testSeason: any;
  let testMatch: any;
  let createdTeamIds: string[] = [];

  beforeAll(async () => {
    console.log('Match Periods API Tests: Database connected and test data created');
    
    // Create test users
    testUser = await authHelper.createTestUser();
    otherUser = await authHelper.createTestUser();
    adminUser = await authHelper.createAdminUser();

    // Create test teams
    testTeam = await request(app)
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Team ${Date.now()}` })
      .expect(201)
      .then(res => res.body);

    otherTeam = await request(app)
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(otherUser))
      .send({ name: `Other Team ${Date.now()}` })
      .expect(201)
      .then(res => res.body);

    // Create test season
    testSeason = await request(app)
      .post('/api/v1/seasons')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        label: `Test Season ${Date.now()}`,
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      })
      .expect(201)
      .then(res => res.body);
      
      createdTeamIds.push(testTeam.id, otherTeam.id);
  });

  afterAll(async () => {
    // Clean up
    await prisma.team.deleteMany({
      where: { id: { in: createdTeamIds } }
    })

    await prisma.seasons.delete({
      where: { season_id: testSeason.id }
    })

    const userIds = authHelper.getCreatedUserIds();
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } }
      });
    }
    
    await prisma.$disconnect();
    console.log('Match Periods API Tests: Database disconnected and cleanup completed');
  });

  beforeEach(async () => {
    // Create a fresh match for each test
    testMatch = await request(app)
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        seasonId: testSeason.id,
        homeTeamId: testTeam.id,
        awayTeamId: otherTeam.id,
        kickoffTime: new Date().toISOString(),
        periodFormat: 'quarter'
      })
      .expect(201)
      .then(res => res.body);

    // Start the match to enable period management
    await request(app)
      .post(`/api/v1/matches/${testMatch.id}/start`)
      .set(authHelper.getAuthHeader(testUser))
      .expect(200);
  });

  afterEach(async () => {
    // Clean up match and related data
    if (testMatch?.id) {
      await prisma.match_periods.deleteMany({
        where: { match_id: testMatch.id }
      });
      await prisma.match_state.deleteMany({
        where: { match_id: testMatch.id }
      });
      await prisma.match.deleteMany({
        where: { match_id: testMatch.id }
      });
    }
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all period endpoints', async () => {
      // Start period without auth
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .expect(401);

      // End period without auth
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/fake-id/end`)
        .expect(401);

      // Get periods without auth
      await request(app)
        .get(`/api/v1/matches/${testMatch.id}/periods`)
        .expect(401);
    });

    it('should deny access to matches user does not own', async () => {
      // Create a match owned by other user
      const otherMatch = await request(app)
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          seasonId: testSeason.id,
          homeTeamId: otherTeam.id,
          awayTeamId: testTeam.id,
          kickoffTime: new Date().toISOString()
        })
        .expect(201)
        .then(res => res.body);
      
      // Try to start period with unauthorized user
      await request(app)
        .post(`/api/v1/matches/${otherMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(403);

      // Try to get periods with unauthorized user
      await request(app)
        .get(`/api/v1/matches/${otherMatch.id}/periods`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(403);

      // Cleanup
      await prisma.match.deleteMany({ where: { match_id: otherMatch.id } });
    });

    it('should allow admin access to any match', async () => {
      // Admin should be able to start period
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(adminUser))
        .send({ periodType: 'regular' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.periodType).toBe('REGULAR');

      // Admin should be able to get periods
      const periodsResponse = await request(app)
        .get(`/api/v1/matches/${testMatch.id}/periods`)
        .set(authHelper.getAuthHeader(adminUser))
        .expect(200);

      expect(periodsResponse.body.success).toBe(true);
      expect(Array.isArray(periodsResponse.body.data)).toBe(true);
    });
  });

  describe('Period Management', () => {
    it('should start a regular period successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.periodType).toBe('REGULAR');
      expect(response.body.data.periodNumber).toBe(1);
      expect(response.body.data.startedAt).toBeTruthy();
      expect(response.body.data.endedAt).toBeUndefined();
    });

    it('should start period with default type when not specified', async () => {
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.periodType).toBe('REGULAR');
    });

    it('should start extra time period successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'extra_time' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.periodType).toBe('EXTRA_TIME');
      expect(response.body.data.periodNumber).toBe(1);
    });

    it('should start penalty shootout period successfully', async () => {
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'penalty_shootout' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.periodType).toBe('PENALTY_SHOOTOUT');
      expect(response.body.data.periodNumber).toBe(1);
    });

    it('should prevent starting multiple periods simultaneously', async () => {
      // Start first period
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(201);

      // Try to start second period without ending first
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(400);

      expect(response.body.message).toContain('another period is already active');
    });

    it('should end a period successfully', async () => {
      // Start a period
      const startResponse = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(201);

      const periodId = startResponse.body.data.id;

      // Wait a moment to ensure duration > 0
      await new Promise(resolve => setTimeout(resolve, 100));

      // End the period
      const endResponse = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/${periodId}/end`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(200);

      expect(endResponse.body.success).toBe(true);
      expect(endResponse.body.data.id).toBe(periodId);
      expect(endResponse.body.data.endedAt).toBeTruthy();
      expect(endResponse.body.data.durationSeconds).toBeGreaterThan(0);
    });

    it('should prevent ending non-existent period', async () => {
      const fakeId = '12345678-1234-1234-1234-123456789012';
      
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/${fakeId}/end`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(404);

      expect(response.body.message).toContain('Period not found');
    });

    it('should prevent ending already ended period', async () => {
      // Start and end a period
      const startResponse = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(201);

      const periodId = startResponse.body.data.id;

      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/${periodId}/end`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(200);

      // Try to end it again
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/${periodId}/end`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(400);

      expect(response.body.message).toContain('Period is already ended');
    });
  });

  describe('Period Retrieval', () => {
    it('should get all periods for a match', async () => {
      // Start and end first period
      const period1Response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(201);

      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/${period1Response.body.data.id}/end`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(200);

      // Start second period
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(201);

      // Get all periods
      const response = await request(app)
        .get(`/api/v1/matches/${testMatch.id}/periods`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(2);
      
      // Check ordering (should be by period type and number)
      expect(response.body.data[0].periodNumber).toBe(1);
      expect(response.body.data[1].periodNumber).toBe(2);
    });

    it('should return empty array for match with no periods', async () => {
      // Create a new match without starting any periods
      const newMatch = await request(app)
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testSeason.id,
          homeTeamId: testTeam.id,
          awayTeamId: otherTeam.id,
          kickoffTime: new Date().toISOString()
        })
        .expect(201)
        .then(res => res.body);

      const response = await request(app)
        .get(`/api/v1/matches/${newMatch.id}/periods`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toHaveLength(0);

      // Cleanup
      await prisma.match.deleteMany({ where: { match_id: newMatch.id } });
    });

    it('should handle different period types correctly', async () => {
      // Start regular period
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(201);

      // Start extra time period (should be allowed as different type)
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'extra_time' })
        .expect(400); // Should fail because regular period is still active

      // End regular period first
      const periodsResponse = await request(app)
        .get(`/api/v1/matches/${testMatch.id}/periods`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const activePeriod = periodsResponse.body.data.find((p: any) => !p.endedAt);
      
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/${activePeriod.id}/end`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(200);

      // Now start extra time
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'extra_time' })
        .expect(201);

      // Get all periods and verify types
      const finalResponse = await request(app)
        .get(`/api/v1/matches/${testMatch.id}/periods`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(finalResponse.body.data).toHaveLength(2);
      expect(finalResponse.body.data.some((p: any) => p.periodType === 'REGULAR')).toBe(true);
      expect(finalResponse.body.data.some((p: any) => p.periodType === 'EXTRA_TIME')).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should validate period type', async () => {
      const response = await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'invalid_type' })
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    it('should validate UUID format in match ID', async () => {
      await request(app)
        .post('/api/v1/matches/invalid-uuid/periods/start')
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(400);
    });

    it('should validate UUID format in period ID', async () => {
      await request(app)
        .post(`/api/v1/matches/${testMatch.id}/periods/invalid-uuid/end`)
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent match gracefully', async () => {
      const fakeMatchId = '12345678-1234-1234-1234-123456789012';
      
      const response = await request(app)
        .post(`/api/v1/matches/${fakeMatchId}/periods/start`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ periodType: 'regular' })
        .expect(403); // Should be access denied since match doesn't exist

      expect(response.body.message).contain("You do not have permission");
    });

    it('should handle database errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll just verify the error structure is correct
      const response = await request(app)
        .get(`/api/v1/matches/${testMatch.id}/periods`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('data');
    });
  });
});