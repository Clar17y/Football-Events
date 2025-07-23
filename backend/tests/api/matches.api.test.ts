/**
 * Matches API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Matches API using Supertest.
 * Tests authentication, authorization, and match creator ownership isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Matches API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let adminUser: TestUser;
  let otherUser: TestUser;
  let thirdUser: TestUser;
  let createdMatchIds: string[] = [];
  let createdTeamIds: string[] = [];
  let createdUserIds: string[] = [];
  let createdSeasonIds: string[] = [];
  let testTeamId: string;
  let otherUserTeamId: string;
  let thirdUserTeamId: string;
  let testSeasonId: string;
  let testPlayerId: string;

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
    thirdUser = await authHelper.createTestUser('USER');
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
    
    const thirdTeamResponse = await request(app)
      .post('/api/v1/teams')
      .set(authHelper.getAuthHeader(thirdUser))
      .send({ name: `Third Team ${Date.now()}` })
      .expect(201);
    
    testTeamId = testTeamResponse.body.id;
    otherUserTeamId = otherTeamResponse.body.id;
    thirdUserTeamId = thirdTeamResponse.body.id;
    
    // Create test player
    const playerData = {
      name: `Minimal Player ${Date.now()}`
    };
    
    const response = await apiRequest
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send(playerData)
      .expect(201);
    testPlayerId = response.body.id;

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
    
    createdUserIds.push(testUser.id, otherUser.id, thirdUser.id, adminUser.id);
    createdTeamIds.push(testTeamId, otherUserTeamId, thirdUserTeamId);
    createdSeasonIds.push(testSeasonId);
    
    console.log('Matches API Tests: Database connected and test data created');
  });

  afterAll(async () => {
    // Clean up all matches first
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
    
    // Clean up all teams
    try {
      await prisma.team.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Team cleanup warning:', error);
    }

    // Clean up players
    try {
      await prisma.player.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Player cleanup warning:', error);
    }
    
    // Then clean up users
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
  });

  beforeEach(() => {
    createdMatchIds = [];
  });

  afterEach(async () => {
    // Clean up created matches
    if (createdMatchIds.length > 0) {
      try {
        await prisma.match.deleteMany({
          where: { match_id: { in: createdMatchIds } }
        });
        console.log('Matches cleaned up successfully');
      } catch (error) {
        console.warn('Match cleanup warning (non-fatal):', error);
      }
    }
  });

  describe('POST /api/v1/matches', () => {
    it('should require authentication', async () => {
      const matchData = {
        seasonId: testSeasonId,
        homeTeamId: testTeamId,
        awayTeamId: otherUserTeamId,
        kickoffTime: new Date().toISOString()
      };
      
      await apiRequest
        .post('/api/v1/matches')
        .send(matchData)
        .expect(401);
    });

    it('should create a match when user owns home team', async () => {
      const matchData = {
        seasonId: testSeasonId,
        homeTeamId: testTeamId, // User owns this team
        awayTeamId: otherUserTeamId, // User doesn't own this team (opponent)
        kickoffTime: new Date().toISOString(),
        competition: 'Friendly',
        venue: 'Test Stadium'
      };
      
      const response = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send(matchData)
        .expect(201);
      
      createdMatchIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        seasonId: matchData.seasonId,
        homeTeamId: matchData.homeTeamId,
        awayTeamId: matchData.awayTeamId,
        competition: matchData.competition,
        venue: matchData.venue
      });
      
      console.log('Match created successfully with user as home team');
    });

    it('should create a match when user owns away team', async () => {
      const matchData = {
        seasonId: testSeasonId,
        homeTeamId: otherUserTeamId, // User doesn't own this team
        awayTeamId: testTeamId, // User owns this team
        kickoffTime: new Date().toISOString(),
        competition: 'Away Match'
      };
      
      const response = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send(matchData)
        .expect(201);
      
      createdMatchIds.push(response.body.id);
      
      expect(response.body.awayTeamId).toBe(testTeamId);
      console.log('Match created successfully with user as away team');
    });


    it('should validate required fields', async () => {
      const invalidMatchData = {}; // Missing required fields
      
      const response = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidMatchData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });
  });

  describe('GET /api/v1/matches', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get('/api/v1/matches')
        .expect(401);
    });

    it('should return only matches involving user\'s teams or created by user', async () => {
      // Create matches involving different teams
      const testUserMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: testTeamId,
          awayTeamId: otherUserTeamId,
          kickoffTime: new Date().toISOString()
        })
        .expect(201);
      
      const otherUserMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: otherUserTeamId,
          awayTeamId: testTeamId, // testUser's team as opponent
          kickoffTime: new Date().toISOString()
        })
        .expect(201);
      
      createdMatchIds.push(testUserMatch.body.id, otherUserMatch.body.id);
      
      // Test user should see their own match and the match involving their team
      const testUserResponse = await apiRequest
        .get('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      const testUserMatchIds = testUserResponse.body.data.map((match: any) => match.id);
      expect(testUserMatchIds).toContain(testUserMatch.body.id);
      // Should also see otherUserMatch because testUser's team is involved as away team
      expect(testUserMatchIds).toContain(otherUserMatch.body.id);
      
      console.log('Ownership isolation working for GET /matches');
    });

  });

  describe('GET /api/v1/matches/:id', () => {
    it('should require authentication', async () => {
      const matchId = randomUUID();
      await apiRequest
        .get(`/api/v1/matches/${matchId}`)
        .expect(401);
    });

    it('should return match created by user', async () => {
      // Create match
      const matchResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: testTeamId,
          awayTeamId: otherUserTeamId,
          kickoffTime: new Date().toISOString()
        })
        .expect(201);
      
      createdMatchIds.push(matchResponse.body.id);
      
      // Get the specific match
      const response = await apiRequest
        .get(`/api/v1/matches/${matchResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.id).toBe(matchResponse.body.id);
      console.log('Match retrieval working');
    });

    it('should return match involving user\'s team', async () => {
      // Create match with otherUser where testUser's team is involved
      const matchResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: otherUserTeamId,
          awayTeamId: testTeamId, // testUser's team as away
          kickoffTime: new Date().toISOString()
        })
        .expect(201);
      
      createdMatchIds.push(matchResponse.body.id);
      
      // testUser should be able to see this match because their team is involved
      const response = await apiRequest
        .get(`/api/v1/matches/${matchResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.id).toBe(matchResponse.body.id);
      console.log('User can see match involving their team');
    });

    it('should deny access to unrelated match', async () => {
      // Create match between teams that testUser doesn't own
      const matchResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(otherUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: otherUserTeamId,
          awayTeamId: thirdUserTeamId, // Neither team belongs to testUser
          kickoffTime: new Date().toISOString()
        })
        .expect(201);
      
      createdMatchIds.push(matchResponse.body.id);
      
      // testUser should not be able to access this match
      await apiRequest
        .get(`/api/v1/matches/${matchResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Access denied to unrelated match');
    });
  });

  describe('PUT /api/v1/matches/:id', () => {
    it('should require authentication', async () => {
      const matchId = randomUUID();
      await apiRequest
        .put(`/api/v1/matches/${matchId}`)
        .send({ competition: 'Test' })
        .expect(401);
    });

    it('should allow match creator to update match', async () => {
      // Create match
      const matchResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: testTeamId,
          awayTeamId: otherUserTeamId,
          kickoffTime: new Date().toISOString(),
          competition: 'Original'
        })
        .expect(201);
      
      createdMatchIds.push(matchResponse.body.id);
      
      // Update the match
      const updateData = { 
        competition: 'Updated Competition',
        ourScore: 2,
        opponentScore: 1
      };
      const response = await apiRequest
        .put(`/api/v1/matches/${matchResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body.competition).toBe(updateData.competition);
      expect(response.body.ourScore).toBe(updateData.ourScore);
      console.log('Match creator can update match');
    });

  });

  describe('DELETE /api/v1/matches/:id', () => {
    it('should require authentication', async () => {
      const matchId = randomUUID();
      await apiRequest
        .delete(`/api/v1/matches/${matchId}`)
        .expect(401);
    });

    it('should allow match creator to delete match', async () => {
      // Create match
      const matchResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: testTeamId,
          awayTeamId: otherUserTeamId,
          kickoffTime: new Date().toISOString()
        })
        .expect(201);
      
      const matchId = matchResponse.body.id;
      
      // Delete the match
      await apiRequest
        .delete(`/api/v1/matches/${matchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify match is gone from API
      await apiRequest
        .get(`/api/v1/matches/${matchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Match creator can delete match');
    });

    it('should perform soft delete', async () => {
      // Create match
      const matchResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          seasonId: testSeasonId,
          homeTeamId: testTeamId,
          awayTeamId: otherUserTeamId,
          kickoffTime: new Date().toISOString()
        })
        .expect(201);
      
      const matchId = matchResponse.body.id;
      
      // Delete the match
      await apiRequest
        .delete(`/api/v1/matches/${matchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify soft delete in database
      const deletedMatch = await prisma.match.findUnique({
        where: { match_id: matchId }
      });
      
      expect(deletedMatch).toBeTruthy();
      expect(deletedMatch!.is_deleted).toBe(true);
      expect(deletedMatch!.deleted_at).toBeTruthy();
      expect(deletedMatch!.deleted_by_user_id).toBe(testUser.id);
      
      console.log('Soft delete working correctly');
    });


    it('should restore soft-deleted match when creating same match again', async () => {
      // 1. Create a match
      const matchData = {
        seasonId: testSeasonId,
        homeTeamId: testTeamId,
        awayTeamId: otherUserTeamId,
        kickoffTime: '2024-12-15T15:00:00.000Z', // Fixed time for consistency
        competition: 'Soft Delete Restoration Test',
        venue: 'Original Venue'
      };

      const createResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send(matchData)
        .expect(201);

      const originalMatchId = createResponse.body.id;
      console.log('Original match created:', originalMatchId);

      // 2. Delete the match (soft delete)
      await apiRequest
        .delete(`/api/v1/matches/${originalMatchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Verify it's soft deleted (should return 404)
      await apiRequest
        .get(`/api/v1/matches/${originalMatchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('Match soft deleted successfully');

      // 3. Create the same match again (same unique constraints: homeTeamId + awayTeamId + kickoffTime)
      const restoredMatchData = {
        seasonId: testSeasonId,
        homeTeamId: testTeamId, // Same home team
        awayTeamId: otherUserTeamId, // Same away team
        kickoffTime: '2024-12-15T15:00:00.000Z', // Same kickoff time
        competition: 'Restored Match Competition', // Different competition
        venue: 'Restored Venue'
      };

      const restoreResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send(restoredMatchData)
        .expect(201);

      // 4. Verify it's the same record restored (same ID)
      expect(restoreResponse.body.id).toBe(originalMatchId);
      expect(restoreResponse.body.homeTeamId).toBe(restoredMatchData.homeTeamId);
      expect(restoreResponse.body.awayTeamId).toBe(restoredMatchData.awayTeamId);
      expect(restoreResponse.body.competition).toBe(restoredMatchData.competition);
      expect(restoreResponse.body.venue).toBe(restoredMatchData.venue);

      console.log('Match restored with same ID:', restoreResponse.body.id);

      // 5. Verify the match is now accessible again
      const getResponse = await apiRequest
        .get(`/api/v1/matches/${originalMatchId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.id).toBe(originalMatchId);
      expect(getResponse.body.competition).toBe(restoredMatchData.competition);

      console.log('Soft delete restoration working - same match ID restored with updated data');

      // Add to cleanup
      createdMatchIds.push(originalMatchId);
    });
  });

  describe('Authorization Tests', () => {
    let testMatchIdByTestUser: string;
    let testMatchIdByOtherUser: string;

    beforeEach(async () => {
      // Create a match by testUser
      const testUserMatch = {
        seasonId: testSeasonId,
        homeTeamId: testTeamId,
        awayTeamId: otherUserTeamId,
        kickoffTime: new Date().toISOString(),
        competition: 'Test User Match',
        venue: 'Test User Venue'
      };

      const testUserResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send(testUserMatch)
        .expect(201);

      testMatchIdByTestUser = testUserResponse.body.id;

      // Create a match by otherUser (between teams not owned by testUser)
      const otherUserMatch = {
        seasonId: testSeasonId,
        homeTeamId: otherUserTeamId,
        awayTeamId: thirdUserTeamId, // Neither team belongs to testUser
        kickoffTime: new Date().toISOString(),
        competition: 'Other User Match',
        venue: 'Other User Venue'
      };

      const otherUserResponse = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(otherUser))
        .send(otherUserMatch)
        .expect(201);

      testMatchIdByOtherUser = otherUserResponse.body.id;
    });

    afterEach(async () => {
      // Clean up authorization test data
      try {
        await prisma.match.deleteMany({
          where: { 
            match_id: { in: [testMatchIdByTestUser, testMatchIdByOtherUser] }
          }
        });
        console.log('Authorization test data cleaned up successfully');
      } catch (error) {
        console.warn('Authorization cleanup warning (non-fatal):', error);
      }
    });

    describe('User Isolation', () => {
      it('should deny creating match when user owns neither team', async () => {
        const matchData = {
          seasonId: testSeasonId,
          homeTeamId: otherUserTeamId, // User doesn't own this
          awayTeamId: thirdUserTeamId, // User doesn't own this either
          kickoffTime: new Date().toISOString()
        };
        
        // This should fail with access denied error, but the error gets wrapped
        // so we expect a 500 status - the important thing is that it fails
        await apiRequest
          .post('/api/v1/matches')
          .set(authHelper.getAuthHeader(testUser))
          .send(matchData)
          .expect(403); // Access denied should return 403 Forbidden
        
        console.log('Access denied for creating match with unowned teams - test passed');
      });

      it('should not allow users to see other users matches in list (unrelated matches)', async () => {
        const response = await apiRequest
          .get('/api/v1/matches')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should see their own match but not the unrelated match
        expect(response.body.data).toBeInstanceOf(Array);
        
        const matchIds = response.body.data.map((match: any) => match.id);
        expect(matchIds).toContain(testMatchIdByTestUser);
        expect(matchIds).not.toContain(testMatchIdByOtherUser); // Unrelated match

        console.log('User isolation working for GET /matches');
      });

      it('should not allow users to access other users matches by ID (unrelated matches)', async () => {
        await apiRequest
          .get(`/api/v1/matches/${testMatchIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to other user\'s unrelated match');
      });

      it('should not allow users to update other users matches', async () => {
        const updateData = {
          competition: 'Hacked Match',
          venue: 'This should not work'
        };

        await apiRequest
          .put(`/api/v1/matches/${testMatchIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to other user\'s match');
      });

      it('should not allow users to delete other users matches', async () => {
        await apiRequest
          .delete(`/api/v1/matches/${testMatchIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to other user\'s match');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to create match with any teams', async () => {
        const matchData = {
          seasonId: testSeasonId,
          homeTeamId: otherUserTeamId, // Admin doesn't own this
          awayTeamId: thirdUserTeamId, // Admin doesn't own this either
          kickoffTime: new Date().toISOString(),
          competition: 'Admin Match'
        };
        
        const response = await apiRequest
          .post('/api/v1/matches')
          .set(authHelper.getAuthHeader(adminUser))
          .send(matchData)
          .expect(201);
        
        // Clean up the match we created
        await prisma.match.deleteMany({
          where: { match_id: response.body.id }
        });
        
        expect(response.body.competition).toBe('Admin Match');
        console.log('Admin created match successfully with unowned teams');
      });

      it('should allow admin to see all matches in list', async () => {
        const response = await apiRequest
          .get('/api/v1/matches')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see matches from all users
        expect(response.body.data).toBeInstanceOf(Array);
        
        const matchIds = response.body.data.map((match: any) => match.id);
        expect(matchIds).toContain(testMatchIdByTestUser);
        expect(matchIds).toContain(testMatchIdByOtherUser);

        console.log('Admin can see all matches');
      });

      it('should allow admin to access any match by ID', async () => {
        // Admin should be able to access testUser's match
        const testUserMatchResponse = await apiRequest
          .get(`/api/v1/matches/${testMatchIdByTestUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserMatchResponse.body.id).toBe(testMatchIdByTestUser);

        // Admin should be able to access otherUser's match
        const otherUserMatchResponse = await apiRequest
          .get(`/api/v1/matches/${testMatchIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserMatchResponse.body.id).toBe(testMatchIdByOtherUser);

        console.log('Admin can access any match');
      });

      it('should allow admin to update any match', async () => {
        const updateData = {
          competition: 'Admin Updated Match',
          venue: 'Updated by admin'
        };

        const response = await apiRequest
          .put(`/api/v1/matches/${testMatchIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.competition).toBe(updateData.competition);
        expect(response.body.venue).toBe(updateData.venue);

        console.log('Admin can update any match');
      });

      it('should allow admin to delete any match', async () => {
        // Create a temporary match to delete
        const tempMatch = {
          seasonId: testSeasonId,
          homeTeamId: otherUserTeamId,
          awayTeamId: thirdUserTeamId,
          kickoffTime: new Date().toISOString(),
          competition: 'Temp Match for Deletion',
          venue: 'This will be deleted by admin'
        };

        const createResponse = await apiRequest
          .post('/api/v1/matches')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempMatch)
          .expect(201);

        const tempMatchId = createResponse.body.id;

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/matches/${tempMatchId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's soft deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/matches/${tempMatchId}`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        console.log('Admin can delete any match');
      });
    });
  });

  // ============================================================================
  // FRONTEND CONVENIENCE API TESTS
  // ============================================================================

  describe('GET /api/v1/matches/upcoming - Upcoming Matches', () => {
    let futureMatch: any;

    beforeEach(async () => {
      // Create a future match for testing
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

      futureMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: testTeamId,
          awayTeamId: thirdUserTeamId,
          seasonId: testSeasonId,
          kickoffTime: futureDate.toISOString(),
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);
    });

    it('should return upcoming matches', async () => {
      const response = await apiRequest
        .get('/api/v1/matches/upcoming')
        .set(authHelper.getAuthHeader(testUser));
        //.expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Verify all matches are in the future
      response.body.forEach((match: any) => {
        expect(new Date(match.kickoffTime).getTime()).toBeGreaterThan(Date.now());
      });
    });

    it('should limit upcoming matches when limit parameter is provided', async () => {
      const response = await apiRequest
        .get('/api/v1/matches/upcoming?limit=1')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeLessThanOrEqual(1);
    });

    it('should filter upcoming matches by team', async () => {
      const response = await apiRequest
        .get(`/api/v1/matches/upcoming?teamId=${testTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((match: any) => {
        expect(match.homeTeamId === testTeamId || match.awayTeamId === testTeamId).toBe(true);
      });
    });

    it('should require authentication', async () => {
      await apiRequest
        .get('/api/v1/matches/upcoming')
        .expect(401);
    });
  });

  describe('GET /api/v1/matches/recent - Recent Matches', () => {
    let pastMatch: any;

    beforeEach(async () => {
      // Create a past match for testing
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7); // 7 days ago

      pastMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: testTeamId,
          awayTeamId: thirdUserTeamId,
          seasonId: testSeasonId,
          kickoffTime: pastDate.toISOString(),
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);
    });

    it('should return recent matches', async () => {
      const response = await apiRequest
        .get('/api/v1/matches/recent')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      
      // Verify all matches are in the past
      response.body.forEach((match: any) => {
        expect(new Date(match.kickoffTime).getTime()).toBeLessThan(Date.now());
      });
    });

    it('should limit recent matches when limit parameter is provided', async () => {
      const response = await apiRequest
        .get('/api/v1/matches/recent?limit=1')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeLessThanOrEqual(1);
    });

    it('should filter recent matches by team', async () => {
      const response = await apiRequest
        .get(`/api/v1/matches/recent?teamId=${testTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((match: any) => {
        expect(match.homeTeamId === testTeamId || match.awayTeamId === testTeamId).toBe(true);
      });
    });

    it('should require authentication', async () => {
      await apiRequest
        .get('/api/v1/matches/recent')
        .expect(401);
    });
  });

  describe('GET /api/v1/matches/:id/full-details - Match Full Details', () => {
    let testMatch: any;
    let testEvent: any;
    let testLineup: any;

    beforeAll(async () => {
      // Create a test match
      testMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: testTeamId,
          awayTeamId: thirdUserTeamId,
          seasonId: testSeasonId,
          kickoffTime: new Date().toISOString(),
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);

      // Create a test event
      testEvent = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatch.body.id,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          periodNumber: 1,
          clockMs: 300000,
          notes: 'Test goal'
        })
        .expect(201);

      // Create a test lineup
      testLineup = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatch.body.id,
          playerId: testPlayerId,
          teamId: testTeamId,
          position: 'ST',
          startMinute: 0
        })
        .expect(201);
    });

    it('should return complete match details with events, lineups, and teams', async () => {
      const response = await apiRequest
        .get(`/api/v1/matches/${testMatch.body.id}/full-details`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('match');
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('lineups');
      expect(response.body).toHaveProperty('teams');

      // Verify match data
      expect(response.body.match.id).toBe(testMatch.body.id);

      // Verify events
      expect(Array.isArray(response.body.events)).toBe(true);
      expect(response.body.events.length).toBeGreaterThan(0);
      expect(response.body.events[0]).toHaveProperty('kind');
      expect(response.body.events[0]).toHaveProperty('clockMs');

      // Verify lineups
      expect(Array.isArray(response.body.lineups)).toBe(true);
      expect(response.body.lineups.length).toBeGreaterThan(0);
      expect(response.body.lineups[0]).toHaveProperty('position');
      expect(response.body.lineups[0]).toHaveProperty('playerId');

      // Verify teams
      expect(response.body.teams).toHaveProperty('home');
      expect(response.body.teams).toHaveProperty('away');
      expect(response.body.teams.home).toHaveProperty('name');
      expect(response.body.teams.away).toHaveProperty('name');
    });

    it('should return 404 for non-existent match', async () => {
      const nonExistentId = '12345678-1234-1234-1234-123456789012';
      await apiRequest
        .get(`/api/v1/matches/${nonExistentId}/full-details`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
    });

    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/matches/${testMatch.body.id}/full-details`)
        .expect(401);
    });

    it('should deny access to other users matches', async () => {
      await apiRequest
        .get(`/api/v1/matches/${testMatch.body.id}/full-details`)
        .set(authHelper.getAuthHeader(otherUser))
        .expect(404);
    });
  });

  describe('GET /api/v1/matches/:id/timeline - Match Timeline', () => {
    let testMatch: any;
    let testEvents: any[];

    beforeEach(async () => {
      // Create a test match
      testMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: testTeamId,
          awayTeamId: testTeamId,
          seasonId: testSeasonId,
          kickoffTime: new Date().toISOString(),
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);

      // Create multiple events for timeline
      testEvents = [];
      for (let i = 0; i < 3; i++) {
        const event = await apiRequest
          .post('/api/v1/events')
          .set(authHelper.getAuthHeader(testUser))
          .send({
            matchId: testMatch.body.id,
            kind: i === 0 ? 'goal' : i === 1 ? 'assist' : 'foul',
            teamId: testTeamId,
            playerId: testPlayerId,
            periodNumber: 1,
            clockMs: (i + 1) * 300000, // Different times
            notes: `Test event ${i + 1}`
          })
          .expect(201);
        testEvents.push(event.body);
      }
    });

    it('should return chronological timeline of match events', async () => {
      const response = await apiRequest
        .get(`/api/v1/matches/${testMatch.body.id}/timeline`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('matchId');
      expect(response.body).toHaveProperty('timeline');
      expect(response.body.matchId).toBe(testMatch.body.id);

      // Verify timeline structure
      expect(Array.isArray(response.body.timeline)).toBe(true);
      expect(response.body.timeline.length).toBe(3);

      // Verify chronological order (ascending by clockMs)
      for (let i = 1; i < response.body.timeline.length; i++) {
        expect(response.body.timeline[i].clockMs).toBeGreaterThanOrEqual(
          response.body.timeline[i - 1].clockMs
        );
      }

      // Verify event structure includes player and team info
      response.body.timeline.forEach((event: any) => {
        expect(event).toHaveProperty('kind');
        expect(event).toHaveProperty('clockMs');
        expect(event).toHaveProperty('playerId');
      });
    });

    it('should return 404 for non-existent match', async () => {
      const nonExistentId = '12345678-1234-1234-1234-123456789012';
      await apiRequest
        .get(`/api/v1/matches/${nonExistentId}/timeline`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
    });

    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/matches/${testMatch.body.id}/timeline`)
        .expect(401);
    });
  });

  describe('GET /api/v1/matches/:id/live-state - Live Match State', () => {
    let testMatch: any;
    let testLineup: any;
    let testEvent: any;

    beforeEach(async () => {
      // Create a test match
      testMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: testTeamId,
          awayTeamId: testTeamId,
          seasonId: testSeasonId,
          kickoffTime: new Date().toISOString(),
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);

      // Create lineup and events for live state
      testLineup = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatch.body.id,
          playerId: testPlayerId,
          teamId: testTeamId,
          position: 'ST',
          startMinute: 0
        })
        .expect(201);

      testEvent = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatch.body.id,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          periodNumber: 1,
          clockMs: 300000,
          notes: 'Test goal'
        })
        .expect(201);
    });

    it('should return live match state with lineups, recent events, and stats', async () => {
      const response = await apiRequest
        .get(`/api/v1/matches/${testMatch.body.id}/live-state`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('match');
      expect(response.body).toHaveProperty('currentLineups');
      expect(response.body).toHaveProperty('recentEvents');
      expect(response.body).toHaveProperty('stats');

      // Verify match data
      expect(response.body.match.id).toBe(testMatch.body.id);

      // Verify current lineups
      expect(Array.isArray(response.body.currentLineups)).toBe(true);
      expect(response.body.currentLineups.length).toBeGreaterThan(0);
      expect(response.body.currentLineups[0]).toHaveProperty('position');

      // Verify recent events (limited to 10)
      expect(Array.isArray(response.body.recentEvents)).toBe(true);
      expect(response.body.recentEvents.length).toBeLessThanOrEqual(10);

      // Verify stats
      expect(response.body.stats).toHaveProperty('totalGoals');
      expect(response.body.stats).toHaveProperty('lastUpdated');
      expect(typeof response.body.stats.totalGoals).toBe('number');
    });

    it('should return 404 for non-existent match', async () => {
      const nonExistentId = '12345678-1234-1234-1234-123456789012';
      await apiRequest
        .get(`/api/v1/matches/${nonExistentId}/live-state`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
    });

    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/matches/${testMatch.body.id}/live-state`)
        .expect(401);
    });
  });

  describe('POST /api/v1/matches/:id/quick-event - Quick Event Creation', () => {
    let testMatch: any;

    beforeEach(async () => {
      // Create a test match
      testMatch = await apiRequest
        .post('/api/v1/matches')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          homeTeamId: testTeamId,
          awayTeamId: testTeamId,
          seasonId: testSeasonId,
          kickoffTime: new Date().toISOString(),
          competition: 'Test League',
          venue: 'Test Stadium'
        })
        .expect(201);
    });

    it('should create a quick event for live match', async () => {
      const eventData = {
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId,
        periodNumber: 1,
        clockMs: 450000,
        notes: 'Quick goal from live match',
        sentiment: 5 // integer
      };

      const response = await apiRequest
        .post(`/api/v1/matches/${testMatch.body.id}/quick-event`)
        .set(authHelper.getAuthHeader(testUser))
        .send(eventData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.kind).toBe(eventData.kind);
      expect(response.body.teamId).toBe(eventData.teamId);
      expect(response.body.playerId).toBe(eventData.playerId);
      expect(response.body.clockMs).toBe(eventData.clockMs);
      expect(response.body.notes).toBe(eventData.notes);
      expect(response.body.sentiment).toBe(eventData.sentiment);
    });

    it('should use default values for optional fields', async () => {
      const eventData = {
        kind: 'foul',
        teamId: testTeamId,
        playerId: testPlayerId
      };

      const response = await apiRequest
        .post(`/api/v1/matches/${testMatch.body.id}/quick-event`)
        .set(authHelper.getAuthHeader(testUser))
        .send(eventData)
        .expect(201);

      expect(response.body.periodNumber).toBe(1); // Default
      expect(response.body.clockMs).toBe(0); // Default
      expect(response.body.sentiment).toBe(0); // Default
    });

    it('should return 404 for non-existent match', async () => {
      const nonExistentId = '12345678-1234-1234-1234-123456789012';
      const eventData = {
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId
      };

      await apiRequest
        .post(`/api/v1/matches/${nonExistentId}/quick-event`)
        .set(authHelper.getAuthHeader(testUser))
        .send(eventData)
        .expect(404);
    });

    it('should deny access to other users matches', async () => {
      const eventData = {
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId
      };

      await apiRequest
        .post(`/api/v1/matches/${testMatch.body.id}/quick-event`)
        .set(authHelper.getAuthHeader(otherUser))
        .send(eventData)
        .expect(404);
    });

    it('should require authentication', async () => {
      const eventData = {
        kind: 'goal',
        teamId: testTeamId,
        playerId: testPlayerId
      };

      await apiRequest
        .post(`/api/v1/matches/${testMatch.body.id}/quick-event`)
        .send(eventData)
        .expect(401);
    });
  });

});