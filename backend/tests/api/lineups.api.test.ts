/**
 * Lineups API Integration Tests with Authentication
 * 
 * Comprehensive HTTP endpoint testing for the Lineups API using Supertest.
 * Tests authentication, authorization, user ownership, composite key handling,
 * batch operations, and soft delete functionality.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Lineups API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let otherUser: TestUser;
  let adminUser: TestUser;
  let createdUserIds: string[] = [];
  let testData: {
    teamId: string;
    seasonId: string;
    positionCode: string;
    matchId: string;
    playerId1: string;
    playerId2: string;
    lineupEntries: Array<{ matchId: string; playerId: string; startMinute: number }>;
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
    authHelper = new AuthTestHelper(app);
    
    // Create test users ONCE for all tests
    testUser = await authHelper.createTestUser('USER');
    otherUser = await authHelper.createTestUser('USER');
    adminUser = await authHelper.createAdminUser();
    
    // Track created users for final cleanup
    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    
    console.log('Lineups API Tests: Database connected and users created');
  });

  afterAll(async () => {
    // Clean up test data in proper order (foreign key constraints)
    try {
      // Clean up lineups first
      await prisma.lineup.deleteMany({
        where: { 
          matches: { 
            created_by_user_id: { in: createdUserIds } 
          }
        }
      });
      
      // Clean up matches
      await prisma.match.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
      
      // Clean up other entities
      await prisma.player.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
      
      await prisma.team.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
      
      await prisma.seasons.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
      
      // Clean up users last
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: createdUserIds } }
        });
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
    
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Create test data
    console.log('Creating test data for lineups...');
    
    // Create season
    const seasonResponse = await apiRequest
      .post('/api/v1/seasons')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        label: `Test Season ${Date.now()}`,
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      })
      .expect(201);
    
    // Create team
    const teamResponse = await apiRequest
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        name: `Test Team ${Date.now()}`,
        homeKitPrimary: '#FF0000',
        awayKitPrimary: '#0000FF'
      })
      .expect(201);
    
    // Create players
    const player1Response = await apiRequest
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        name: `Test Player 1 ${Date.now()}`,
        squadNumber: 1,
        currentTeam: teamResponse.body.id
      })
      .expect(201);
    
    const player2Response = await apiRequest
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        name: `Test Player 2 ${Date.now()}`,
        squadNumber: 2,
        currentTeam: teamResponse.body.id
      })
      .expect(201);
    
    // Create match
    const matchResponse = await apiRequest
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        homeTeamId: teamResponse.body.id,
        awayTeamId: teamResponse.body.id,
        seasonId: seasonResponse.body.seasonId,
        kickoffTime: '2024-06-15T15:00:00.000Z',
        venue: 'Test Stadium'
      })
      .expect(201);
    
    testData = {
      teamId: teamResponse.body.id,
      seasonId: seasonResponse.body.seasonId,
      positionCode: 'ST',
      matchId: matchResponse.body.id,
      playerId1: player1Response.body.id,
      playerId2: player2Response.body.id,
      lineupEntries: []
    };
    
    console.log(`Test data created: match=${testData.matchId.slice(0, 8)}, players=${testData.playerId1.slice(0, 8)},${testData.playerId2.slice(0, 8)}`);
  });

  afterEach(async () => {
    // Clean up lineup entries
    if (testData && testData.lineupEntries) {
      for (const entry of testData.lineupEntries) {
        try {
          await apiRequest
            .delete(`/api/v1/lineups/${entry.matchId}/${entry.playerId}/${entry.startMinute}`)
            .set(authHelper.getAuthHeader(testUser))
            .expect(204);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
    
    // Clean up test data created in this test
    try {
      if (testData) {
        await prisma.lineup.deleteMany({
          where: { match_id: testData.matchId }
        });
        await prisma.match.deleteMany({
          where: { match_id: testData.matchId }
        });
        await prisma.player.deleteMany({
          where: { id: { in: [testData.playerId1, testData.playerId2] } }
        });
        await prisma.team.deleteMany({
          where: { id: testData.teamId }
        });
        await prisma.seasons.deleteMany({
          where: { season_id: testData.seasonId }
        });
      }
    } catch (error) {
      console.warn('Cleanup warning (non-fatal):', error);
    }
    
    console.log('Lineups test data cleaned up successfully');
  });

  describe('Authentication', () => {
    it('should require authentication for all endpoints', async () => {
      // Test all endpoints without token
      await apiRequest.get('/api/v1/lineups').expect(401);
      await apiRequest.post('/api/v1/lineups').expect(401);
      await apiRequest.get(`/api/v1/lineups/${randomUUID()}/${randomUUID()}/0`).expect(401);
      await apiRequest.put(`/api/v1/lineups/${randomUUID()}/${randomUUID()}/0`).expect(401);
      await apiRequest.delete(`/api/v1/lineups/${randomUUID()}/${randomUUID()}/0`).expect(401);
      await apiRequest.get(`/api/v1/lineups/match/${randomUUID()}`).expect(401);
      await apiRequest.get(`/api/v1/lineups/player/${randomUUID()}`).expect(401);
      await apiRequest.get('/api/v1/lineups/position/ST').expect(401);
      await apiRequest.post('/api/v1/lineups/batch').expect(401);
    });

    it('should reject invalid tokens', async () => {
      await apiRequest
        .get('/api/v1/lineups')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /api/v1/lineups', () => {
    it('should create a lineup entry successfully', async () => {
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      const response = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);
      
      expect(response.body).toMatchObject({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      });
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      console.log('Lineup entry created successfully');
    });

    it('should create a substitution scenario', async () => {
      // Player starts the match
      const startingLineup = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 60,
        position: testData.positionCode
      };
      
      const startResponse = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(startingLineup)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      // Substitute comes on
      const substituteLineup = {
        matchId: testData.matchId,
        playerId: testData.playerId2,
        startMinute: 60,
        endMinute: 90,
        position: testData.positionCode
      };
      
      const subResponse = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(substituteLineup)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId2,
        startMinute: 60
      });
      
      expect(startResponse.body.endMinute).toBe(60);
      expect(subResponse.body.startMinute).toBe(60);
      
      console.log('Substitution scenario created successfully');
    });

    it('should validate required fields', async () => {
      const invalidLineup = {
        matchId: testData.matchId,
        // Missing playerId, startMinute, position
      };
      
      const response = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidLineup)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working: Validation Error');
    });

    it('should validate foreign key constraints', async () => {
      // Test invalid matchId (should fail with access denied)
      const invalidMatchData = {
        matchId: randomUUID(),
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: 'ST'
      };
      
      const matchResponse = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidMatchData)
        .expect(400);
      
      expect(matchResponse.body.error || matchResponse.body.message).toBeDefined();
      expect(matchResponse.body.message.toLowerCase()).toContain('match not found');
      
      // Test invalid playerId (should fail with foreign key constraint)
      const invalidPlayerData = {
        matchId: testData.matchId,
        playerId: randomUUID(),
        startMinute: 0,
        endMinute: 90,
        position: 'ST'
      };
      
      const playerResponse = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidPlayerData)
        .expect(400);
      
      expect(playerResponse.body.error || playerResponse.body.message).toBeDefined();
      
      // Test invalid position (should fail with enum constraint)
      const invalidPositionData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: 'INVALID_POSITION'
      };
      
      const positionResponse = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidPositionData)
        .expect(400);
      
      expect(positionResponse.body.error || positionResponse.body.message).toBeDefined();
      
      console.log('Foreign key validation working for Lineup');
    });
  });

  describe('GET /api/v1/lineups', () => {
    it('should return paginated lineups', async () => {
      // Create a lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      const response = await apiRequest
        .get('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination.total).toBeGreaterThan(0);
      
      console.log(`Pagination working, total lineups: ${response.body.pagination.total}`);
    });

    it('should filter lineups by match', async () => {
      // Create a lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      const response = await apiRequest
        .get(`/api/v1/lineups?matchId=${testData.matchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].matchId).toBe(testData.matchId);
      
      console.log(`Match filtering working, found lineups: ${response.body.data.length}`);
    });

    it('should filter lineups by player', async () => {
      // Create a lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      const response = await apiRequest
        .get(`/api/v1/lineups?playerId=${testData.playerId1}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].playerId).toBe(testData.playerId1);
      
      console.log(`Player filtering working, found lineups: ${response.body.data.length}`);
    });
  });

  describe('POST /api/v1/lineups/batch - Critical for Real-Time', () => {
    it('should handle batch lineup operations', async () => {
      const batchData = {
        create: [
          {
            matchId: testData.matchId,
            playerId: testData.playerId1,
            startMinute: 0,
            endMinute: 45,
            position: testData.positionCode
          },
          {
            matchId: testData.matchId,
            playerId: testData.playerId2,
            startMinute: 45,
            endMinute: 90,
            position: testData.positionCode
          }
        ]
      };
      
      const response = await apiRequest
        .post('/api/v1/lineups/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);
      
      expect(response.body.results.created.success).toBe(2);
      expect(response.body.results.created.failed).toBe(0);
      
      // Track for cleanup
      testData.lineupEntries.push(
        { matchId: testData.matchId, playerId: testData.playerId1, startMinute: 0 },
        { matchId: testData.matchId, playerId: testData.playerId2, startMinute: 45 }
      );
      
      console.log('Batch lineup operations working');
    });
  });

  describe('PUT /api/v1/lineups/:matchId/:playerId/:startMinute', () => {
    it('should update a lineup entry', async () => {
      // Create lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 45,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);
      
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });
      
      // Update the lineup (extend playing time)
      const updateData = {
        endMinute: 90
      };
      
      const response = await apiRequest
        .put(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body.endMinute).toBe(90);
      
      console.log('Lineup update working');
    });
  });

  describe('DELETE /api/v1/lineups/:matchId/:playerId/:startMinute', () => {
    it('should delete a lineup entry', async () => {
      // Create lineup first
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: testData.positionCode
      };
      
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);
      
      // Delete the lineup
      await apiRequest
        .delete(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify it's deleted
      await apiRequest
        .get(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Lineup deletion working');
    });

    it('should return 404 when deleting non-existent lineup', async () => {
      const nonExistentPlayerId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/lineups/${testData.matchId}/${nonExistentPlayerId}/0`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for lineup deletion');
    });
  });

  describe('Soft Delete Restoration', () => {
    it('should restore soft-deleted lineup when creating with same composite key', async () => {
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        endMinute: 90,
        position: 'ST'
      };

      // 1. Create lineup
      const createResponse = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);

      expect(createResponse.body.matchId).toBe(testData.matchId);
      expect(createResponse.body.playerId).toBe(testData.playerId1);
      expect(createResponse.body.startMinute).toBe(0);
      expect(createResponse.body.position).toBe('ST');

      // 2. Delete lineup (soft delete)
      await apiRequest
        .delete(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // 3. Verify lineup is soft deleted (should return 404)
      await apiRequest
        .get(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      // 4. Verify lineup is soft deleted in database
      const deletedLineup = await prisma.lineup.findFirst({
        where: { 
          match_id: testData.matchId,
          player_id: testData.playerId1,
          start_min: 0
        }
      });
      expect(deletedLineup).toBeTruthy();
      expect(deletedLineup!.is_deleted).toBe(true);
      expect(deletedLineup!.deleted_at).toBeTruthy();
      expect(deletedLineup!.deleted_by_user_id).toBe(testUser.id);

      // 5. Create lineup with same composite key (should restore)
      const restoreResponse = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          ...lineupData,
          endMinute: 75, // Different value to verify update
          position: 'CF' // Different position to verify update
        })
        .expect(201);

      // 6. Verify restoration (should have same composite key but updated data)
      expect(restoreResponse.body.matchId).toBe(testData.matchId);
      expect(restoreResponse.body.playerId).toBe(testData.playerId1);
      expect(restoreResponse.body.startMinute).toBe(0);
      expect(restoreResponse.body.endMinute).toBe(75); // Updated value
      expect(restoreResponse.body.position).toBe('CF'); // Updated value

      // 7. Verify lineup is now accessible again
      const getResponse = await apiRequest
        .get(`/api/v1/lineups/${testData.matchId}/${testData.playerId1}/0`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.endMinute).toBe(75);
      expect(getResponse.body.position).toBe('CF');

      // 8. Verify restoration in database
      const restoredLineup = await prisma.lineup.findFirst({
        where: { 
          match_id: testData.matchId,
          player_id: testData.playerId1,
          start_min: 0
        }
      });
      expect(restoredLineup!.is_deleted).toBe(false);
      expect(restoredLineup!.deleted_at).toBeNull();
      expect(restoredLineup!.deleted_by_user_id).toBeNull();
      expect(restoredLineup!.updated_at).toBeTruthy();

      // Track for cleanup
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0
      });

      console.log('Soft delete restoration working - lineup restored with updated data');
    });

    it('should create new lineup when no soft-deleted lineup exists', async () => {
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId2,
        startMinute: 30,
        endMinute: 90,
        position: 'CM'
      };

      // Normal creation should work as before
      const response = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);

      expect(response.body.matchId).toBe(testData.matchId);
      expect(response.body.playerId).toBe(testData.playerId2);
      expect(response.body.startMinute).toBe(30);
      expect(response.body.position).toBe('CM');

      // Verify in database
      const lineup = await prisma.lineup.findFirst({
        where: { 
          match_id: testData.matchId,
          player_id: testData.playerId2,
          start_min: 30
        }
      });
      expect(lineup!.is_deleted).toBe(false);
      expect(lineup!.deleted_at).toBeNull();

      // Track for cleanup
      testData.lineupEntries.push({
        matchId: testData.matchId,
        playerId: testData.playerId2,
        startMinute: 30
      });

      console.log('New lineup creation working when no soft-deleted record exists');
    });
  });

  describe('Authorization Tests', () => {
    let testMatchIdByTestUser: string;
    let testMatchIdByOtherUser: string;
    let testPlayerIdByTestUser: string;
    let testPlayerIdByOtherUser: string;

    beforeEach(async () => {
      // Create test data for testUser
      const testUserSeason = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          label: `Test User Season ${Date.now()}`,
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .expect(201);

      const testUserTeam = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Test User Team ${Date.now()}`,
          homeKitPrimary: '#FF0000'
        })
        .expect(201);

      const testUserPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Test User Player ${Date.now()}`,
          squadNumber: 10,
          currentTeam: testUserTeam.body.id
        })
        .expect(201);

      const testUserMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: testUserTeam.body.id,
          awayTeamId: testUserTeam.body.id,
          seasonId: testUserSeason.body.seasonId,
          kickoffTime: '2024-06-15T15:00:00.000Z',
          venue: 'Test Stadium'
        })
        .expect(201);

      testMatchIdByTestUser = testUserMatch.body.id;
      testPlayerIdByTestUser = testUserPlayer.body.id;

      // Create test data for otherUser
      const otherUserSeason = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          label: `Other User Season ${Date.now()}`,
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        })
        .expect(201);

      const otherUserTeam = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          name: `Other User Team ${Date.now()}`,
          homeKitPrimary: '#0000FF'
        })
        .expect(201);

      const otherUserPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          name: `Other User Player ${Date.now()}`,
          squadNumber: 11,
          currentTeam: otherUserTeam.body.id
        })
        .expect(201);

      const otherUserMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          homeTeamId: otherUserTeam.body.id,
          awayTeamId: otherUserTeam.body.id,
          seasonId: otherUserSeason.body.seasonId,
          kickoffTime: '2024-06-15T15:00:00.000Z',
          venue: 'Other Stadium'
        })
        .expect(201);

      testMatchIdByOtherUser = otherUserMatch.body.id;
      testPlayerIdByOtherUser = otherUserPlayer.body.id;

      // Create lineup for testUser
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchIdByTestUser,
          playerId: testPlayerIdByTestUser,
          startMinute: 0,
          endMinute: 90,
          position: 'ST'
        })
        .expect(201);

      // Create lineup for otherUser
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          matchId: testMatchIdByOtherUser,
          playerId: testPlayerIdByOtherUser,
          startMinute: 0,
          endMinute: 90,
          position: 'CM'
        })
        .expect(201);
    });

    describe('User Isolation', () => {
      it('should not allow users to see other users lineups in list', async () => {
        const response = await apiRequest
          .get('/api/v1/lineups')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should only see lineups from their own matches
        expect(response.body.data).toBeInstanceOf(Array);
        
        // All lineups should be from testUser's matches
        response.body.data.forEach((lineup: any) => {
          expect(lineup.matchId).toBe(testMatchIdByTestUser);
        });

        console.log('User isolation working for GET /lineups');
      });

      it('should not allow users to access lineups from other users matches', async () => {
        await apiRequest
          .get(`/api/v1/lineups/${testMatchIdByOtherUser}/${testPlayerIdByOtherUser}/0`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to other user lineup');
      });

      it('should not allow users to create lineups in other users matches', async () => {
        const lineupData = {
          matchId: testMatchIdByOtherUser,
          playerId: testPlayerIdByOtherUser,
          startMinute: 45,
          endMinute: 90,
          position: 'CB'
        };

        await apiRequest
          .post('/api/v1/lineups')
          .set(authHelper.getAuthHeader(testUser))
          .send(lineupData)
          .expect(400); // Should fail due to match access denied

        console.log('Create access denied to other user match');
      });

      it('should not allow users to update lineups in other users matches', async () => {
        const updateData = {
          endMinute: 60
        };

        await apiRequest
          .put(`/api/v1/lineups/${testMatchIdByOtherUser}/${testPlayerIdByOtherUser}/0`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to other user lineup');
      });

      it('should not allow users to delete lineups in other users matches', async () => {
        await apiRequest
          .delete(`/api/v1/lineups/${testMatchIdByOtherUser}/${testPlayerIdByOtherUser}/0`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to other user lineup');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to see all lineups in list', async () => {
        const response = await apiRequest
          .get('/api/v1/lineups')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see lineups from all users
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.data.length).toBeGreaterThanOrEqual(2);
        
        const matchIds = response.body.data.map((lineup: any) => lineup.matchId);
        expect(matchIds).toContain(testMatchIdByTestUser);
        expect(matchIds).toContain(testMatchIdByOtherUser);

        console.log('Admin can see all lineups');
      });

      it('should allow admin to access any lineup', async () => {
        // Admin should be able to access testUser lineup
        const testUserLineupResponse = await apiRequest
          .get(`/api/v1/lineups/${testMatchIdByTestUser}/${testPlayerIdByTestUser}/0`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserLineupResponse.body.matchId).toBe(testMatchIdByTestUser);

        // Admin should be able to access otherUser lineup
        const otherUserLineupResponse = await apiRequest
          .get(`/api/v1/lineups/${testMatchIdByOtherUser}/${testPlayerIdByOtherUser}/0`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserLineupResponse.body.matchId).toBe(testMatchIdByOtherUser);

        console.log('Admin can access any lineup');
      });

      it('should allow admin to update any lineup', async () => {
        const updateData = {
          endMinute: 75
        };

        const response = await apiRequest
          .put(`/api/v1/lineups/${testMatchIdByOtherUser}/${testPlayerIdByOtherUser}/0`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.endMinute).toBe(75);

        console.log('Admin can update any lineup');
      });

      it('should allow admin to delete any lineup', async () => {
        // Create a temporary lineup to delete
        const tempLineup = {
          matchId: testMatchIdByOtherUser,
          playerId: testPlayerIdByOtherUser,
          startMinute: 60,
          endMinute: 90,
          position: 'SUB'
        };

        await apiRequest
          .post('/api/v1/lineups')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempLineup)
          .expect(201);

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/lineups/${testMatchIdByOtherUser}/${testPlayerIdByOtherUser}/60`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/lineups/${testMatchIdByOtherUser}/${testPlayerIdByOtherUser}/60`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        console.log('Admin can delete any lineup');
      });
    });
  });
});