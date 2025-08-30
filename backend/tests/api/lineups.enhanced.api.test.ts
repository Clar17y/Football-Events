/**
 * Enhanced Lineups API Integration Tests
 * 
 * Tests for positioning data, substitution endpoints, and enhanced lineup functionality.
 * Covers pitch coordinates, substitution reasons, and live match integration endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Enhanced Lineups API Integration', () => {
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
    matchId: string;
    playerId1: string;
    playerId2: string;
    playerId3: string;
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
    
    // Create test users
    testUser = await authHelper.createTestUser('USER');
    otherUser = await authHelper.createTestUser('USER');
    adminUser = await authHelper.createAdminUser();
    
    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    
    console.log('Enhanced Lineups API Tests: Database connected and users created');
  });

  afterAll(async () => {
    // Clean up test data in proper order
    try {
      await prisma.lineup.deleteMany({
        where: { 
          matches: { 
            created_by_user_id: { in: createdUserIds } 
          }
        }
      });
      
      await prisma.match.deleteMany({
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
    console.log('Creating test data for enhanced lineups...');
    
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

    const player3Response = await apiRequest
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        name: `Test Player 3 ${Date.now()}`,
        squadNumber: 3,
        currentTeam: teamResponse.body.id
      })
      .expect(201);
    
    // Create match
    const matchResponse = await apiRequest
      .post('/api/v1/matches')
      .set(authHelper.getAuthHeader(testUser))
      .send({
        seasonId: seasonResponse.body.id,
        kickoffTime: new Date().toISOString(),
        homeTeamId: teamResponse.body.id,
        awayTeamId: teamResponse.body.id,
        competition: 'Test League',
        venue: 'Test Stadium'
      })
      .expect(201);
    
    testData = {
      teamId: teamResponse.body.id,
      seasonId: seasonResponse.body.id,
      matchId: matchResponse.body.id,
      playerId1: player1Response.body.id,
      playerId2: player2Response.body.id,
      playerId3: player3Response.body.id
    };
  });

  afterEach(async () => {
    // Clean up test data created in this test
    try {
      await prisma.lineup.deleteMany({
        where: { match_id: testData.matchId }
      });
    } catch (error) {
      console.warn('Test cleanup warning:', error);
    }
  });

  describe('Enhanced Lineup Creation with Positioning Data', () => {
    it('should create lineup with pitch coordinates', async () => {
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        position: 'GK',
        pitchX: 50.0,
        pitchY: 5.0
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
        position: 'GK',
        pitchX: 50.0,
        pitchY: 5.0
      });
    });

    it('should create lineup with substitution reason', async () => {
      const lineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 30,
        position: 'ST',
        substitutionReason: 'Tactical change'
      };

      const response = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(lineupData)
        .expect(201);

      expect(response.body).toMatchObject({
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 30,
        position: 'ST',
        substitutionReason: 'Tactical change'
      });
    });

    it('should validate pitch coordinate ranges', async () => {
      const invalidLineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        position: 'GK',
        pitchX: 150.0, // Invalid - over 100
        pitchY: -10.0  // Invalid - under 0
      };

      const response = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidLineupData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should validate substitution reason length', async () => {
      const longReason = 'A'.repeat(101); // Over 100 characters
      const invalidLineupData = {
        matchId: testData.matchId,
        playerId: testData.playerId1,
        startMinute: 0,
        position: 'GK',
        substitutionReason: longReason
      };

      const response = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidLineupData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('Enhanced Lineup Updates with Positioning Data', () => {
    it('should update lineup with pitch coordinates', async () => {
      // Create initial lineup
      const initialLineup = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId1,
          startMinute: 0,
          position: 'GK'
        })
        .expect(201);

      // Update with positioning data
      const updateData = {
        pitchX: 50.0,
        pitchY: 10.0,
        substitutionReason: 'Position adjustment'
      };

      const response = await apiRequest
        .put(`/api/v1/lineups/${initialLineup.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        id: initialLineup.body.id,
        pitchX: 50.0,
        pitchY: 10.0,
        substitutionReason: 'Position adjustment'
      });
    });
  });

  describe('GET /api/v1/lineups/match/:matchId/current', () => {
    it('should get current lineup for a match', async () => {
      // Create starting lineup
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId1,
          startMinute: 0,
          position: 'GK',
          pitchX: 50.0,
          pitchY: 5.0
        })
        .expect(201);

      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId2,
          startMinute: 0,
          position: 'ST',
          pitchX: 50.0,
          pitchY: 90.0
        })
        .expect(201);

      const response = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/current`)
        .set(authHelper.getAuthHeader(testUser))
        .query({ currentTime: 15 })
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('playerId');
      expect(response.body[0]).toHaveProperty('position');
      expect(response.body[0]).toHaveProperty('pitchX');
      expect(response.body[0]).toHaveProperty('pitchY');
    });

    it('should handle substitutions in current lineup', async () => {
      // Create starting lineup
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId1,
          startMinute: 0,
          endMinute: 30,
          position: 'ST'
        })
        .expect(201);

      // Create substitution
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId2,
          startMinute: 30,
          position: 'ST',
          substitutionReason: 'Tactical change'
        })
        .expect(201);

      // Check lineup at minute 45 (after substitution)
      const response = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/current`)
        .set(authHelper.getAuthHeader(testUser))
        .query({ currentTime: 45 })
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].playerId).toBe(testData.playerId2);
      expect(response.body[0].substitutionReason).toBe('Tactical change');
    });

    it('should validate currentTime parameter', async () => {
      const response = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/current`)
        .set(authHelper.getAuthHeader(testUser))
        .query({ currentTime: 'invalid' })
        .expect(400);

      expect(response.body.error).toBe('Invalid current time');
    });
  });

  describe('GET /api/v1/lineups/match/:matchId/active-at/:timeMinutes', () => {
    it('should get active players at specific time', async () => {
      // Create lineup entries
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId1,
          startMinute: 0,
          endMinute: 20,
          position: 'GK'
        })
        .expect(201);

      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId2,
          startMinute: 20,
          position: 'GK'
        })
        .expect(201);

      // Check at minute 10 (player 1 active)
      const response1 = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/active-at/10`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response1.body).toHaveLength(1);
      expect(response1.body[0].playerId).toBe(testData.playerId1);

      // Check at minute 30 (player 2 active)
      const response2 = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/active-at/30`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response2.body).toHaveLength(1);
      expect(response2.body[0].playerId).toBe(testData.playerId2);
    });

    it('should validate time parameter', async () => {
      const response = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/active-at/invalid`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(400);

      expect(response.body.error).toBe('Invalid time');
    });
  });

  describe('POST /api/v1/lineups/match/:matchId/substitute', () => {
    it('should make a substitution successfully', async () => {
      // Create starting player
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId1,
          startMinute: 0,
          position: 'ST'
        })
        .expect(201);

      const substitutionData = {
        playerOffId: testData.playerId1,
        playerOnId: testData.playerId2,
        position: 'ST',
        currentTime: 30,
        substitutionReason: 'Tactical change'
      };

      const response = await apiRequest
        .post(`/api/v1/lineups/match/${testData.matchId}/substitute`)
        .set(authHelper.getAuthHeader(testUser))
        .send(substitutionData)
        .expect(201);

      expect(response.body).toHaveProperty('playerOffLineup');
      expect(response.body).toHaveProperty('playerOnLineup');
      expect(response.body).toHaveProperty('timelineEvents');
      
      expect(response.body.playerOffLineup.endMinute).toBe(30);
      expect(response.body.playerOnLineup.startMinute).toBe(30);
      expect(response.body.playerOnLineup.substitutionReason).toBe('Tactical change');
      expect(response.body.timelineEvents).toHaveLength(2);
    });

    it('should validate required substitution fields', async () => {
      const invalidData = {
        playerOffId: testData.playerId1,
        // Missing playerOnId, position, currentTime
      };

      const response = await apiRequest
        .post(`/api/v1/lineups/match/${testData.matchId}/substitute`)
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('playerOnId, position, and currentTime are required');
    });

    it('should validate currentTime is non-negative', async () => {
      const invalidData = {
        playerOffId: testData.playerId1,
        playerOnId: testData.playerId2,
        position: 'ST',
        currentTime: -5
      };

      const response = await apiRequest
        .post(`/api/v1/lineups/match/${testData.matchId}/substitute`)
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.message).toContain('currentTime must be a non-negative number');
    });

    it('should handle substitution errors gracefully', async () => {
      // Try to substitute a player who isn't on the pitch
      const substitutionData = {
        playerOffId: testData.playerId1, // Not on pitch
        playerOnId: testData.playerId2,
        position: 'ST',
        currentTime: 30
      };

      const response = await apiRequest
        .post(`/api/v1/lineups/match/${testData.matchId}/substitute`)
        .set(authHelper.getAuthHeader(testUser))
        .send(substitutionData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Authorization for Enhanced Endpoints', () => {
    it('should require authentication for current lineup endpoint', async () => {
      await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/current`)
        .expect(401);
    });

    it('should require authentication for active players endpoint', async () => {
      await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/active-at/30`)
        .expect(401);
    });

    it('should require authentication for substitution endpoint', async () => {
      await apiRequest
        .post(`/api/v1/lineups/match/${testData.matchId}/substitute`)
        .send({
          playerOffId: testData.playerId1,
          playerOnId: testData.playerId2,
          position: 'ST',
          currentTime: 30
        })
        .expect(401);
    });

    it('should deny access to other users matches for current lineup', async () => {
      const response = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/current`)
        .set(authHelper.getAuthHeader(otherUser))
        .expect(404);

      expect(response.body.error).toBe('Match not found');
    });

    it('should allow admin access to all enhanced endpoints', async () => {
      // Create lineup for admin test
      await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId1,
          startMinute: 0,
          position: 'GK'
        })
        .expect(201);

      // Admin should be able to access current lineup
      const response = await apiRequest
        .get(`/api/v1/lineups/match/${testData.matchId}/current`)
        .set(authHelper.getAuthHeader(adminUser))
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('Batch Operations with Enhanced Data', () => {
    it('should handle batch creation with positioning data', async () => {
      const batchData = {
        create: [
          {
            matchId: testData.matchId,
            playerId: testData.playerId1,
            startMinute: 0,
            position: 'GK',
            pitchX: 50.0,
            pitchY: 5.0
          },
          {
            matchId: testData.matchId,
            playerId: testData.playerId2,
            startMinute: 0,
            position: 'ST',
            pitchX: 50.0,
            pitchY: 90.0,
            substitutionReason: 'Starting lineup'
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
    });

    it('should handle batch updates with positioning data', async () => {
      // Create initial lineups
      const lineup1 = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId1,
          startMinute: 0,
          position: 'GK'
        })
        .expect(201);

      const lineup2 = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testData.matchId,
          playerId: testData.playerId2,
          startMinute: 0,
          position: 'ST'
        })
        .expect(201);

      // Batch update with positioning data
      const batchData = {
        update: [
          {
            id: lineup1.body.id,
            data: {
              pitchX: 50.0,
              pitchY: 5.0
            }
          },
          {
            id: lineup2.body.id,
            data: {
              pitchX: 50.0,
              pitchY: 90.0,
              substitutionReason: 'Position update'
            }
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/lineups/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.updated.success).toBe(2);
      expect(response.body.results.updated.failed).toBe(0);
    });
  });
});