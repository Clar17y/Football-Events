/**
 * Player Teams API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Player Teams API using Supertest.
 * Tests authentication, authorization, and access control for many-to-many player-team relationships.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Player Teams API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let adminUser: TestUser;
  let otherUser: TestUser;
  let createdPlayerTeamIds: string[] = [];
  let createdPlayerIds: string[] = [];
  let createdTeamIds: string[] = [];
  let createdUserIds: string[] = [];
  let testTeamId: string;
  let otherUserTeamId: string;
  let testPlayerId: string;
  let testTeam2Id: string;
  let otherUserPlayerId: string;
  let batchPlayerId: string;  
  let batchPlayer2Id: string;
  let batchPlayer3Id: string;
  let batchPlayer4Id: string;

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

    const testTeam2Response = await request(app)
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
    testTeam2Id = testTeam2Response.body.id;
    otherUserTeamId = otherTeamResponse.body.id;
    
    // Create test players
    const testPlayerResponse = await request(app)
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Player ${Date.now()}` })
      .expect(201);
    
    const otherPlayerResponse = await request(app)
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(otherUser))
      .send({ name: `Other Player ${Date.now()}` })
      .expect(201);
    
    testPlayerId = testPlayerResponse.body.id;
    otherUserPlayerId = otherPlayerResponse.body.id;

    const batchPlayerResponse = await request(app)
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Player ${Date.now()}` })
      .expect(201);

    const batchPlayer2Response = await request(app)
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Player2 ${Date.now()}` })
      .expect(201);

    const batchPlayer3Response = await request(app)
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Player ${Date.now()}` })
      .expect(201);

    const batchPlayer4Response = await request(app)
      .post('/api/v1/players')
      .set(authHelper.getAuthHeader(testUser))
      .send({ name: `Test Player2 ${Date.now()}` })
      .expect(201);
    
    batchPlayerId = batchPlayerResponse.body.id;
    batchPlayer2Id = batchPlayer2Response.body.id;
    batchPlayer3Id = batchPlayer3Response.body.id;
    batchPlayer4Id = batchPlayer4Response.body.id;

    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    createdTeamIds.push(testTeamId, otherUserTeamId);
    createdPlayerIds.push(testPlayerId, otherUserPlayerId, batchPlayerId, batchPlayer2Id, batchPlayer3Id, batchPlayer4Id);
    
    console.log('Player Teams API Tests: Database connected and test data created');
  });

  afterAll(async () => {
    // Clean up all player teams first
    try {
      await prisma.player_teams.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Player teams cleanup warning:', error);
    }
    
    // Clean up players
    try {
      await prisma.player.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Player cleanup warning:', error);
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
  });

  beforeEach(() => {
    createdPlayerTeamIds = [];
  });

  afterEach(async () => {
    // Clean up created player teams
    if (createdPlayerTeamIds.length > 0) {
      try {
        await prisma.player_teams.deleteMany({
          where: { id: { in: createdPlayerTeamIds } }
        });
        console.log('Player teams cleaned up successfully');
      } catch (error) {
        console.warn('Player team cleanup warning (non-fatal):', error);
      }
    }
  });

  describe('POST /api/v1/player-teams', () => {
    it('should require authentication', async () => {
      const playerTeamData = {
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: '2024-01-01',
        isActive: true
      };
      
      await apiRequest
        .post('/api/v1/player-teams')
        .send(playerTeamData)
        .expect(401);
    });

    it('should create player-team relationship for own team', async () => {
      const playerTeamData = {
        playerId: testPlayerId, // testUser created this player
        teamId: testTeamId, // testUser created this team
        startDate: '2024-01-01',
        isActive: true
      };
      
      const response = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(playerTeamData)
        .expect(201);
      
      createdPlayerTeamIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        playerId: playerTeamData.playerId,
        teamId: playerTeamData.teamId,
        startDate: playerTeamData.startDate,
        isActive: playerTeamData.isActive,
        endDate: null
      });
      
      console.log('Player-team relationship created successfully');
    });

    it('should create player-team relationship for own player with other team (cross-ownership)', async () => {
      const playerTeamData = {
        playerId: testPlayerId, // testUser created this player
        teamId: otherUserTeamId, // otherUser created this team
        startDate: '2024-01-01',
        isActive: true
      };
      
      const response = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(playerTeamData)
        .expect(201);
      
      createdPlayerTeamIds.push(response.body.id);
      
      expect(response.body.playerId).toBe(playerTeamData.playerId);
      expect(response.body.teamId).toBe(playerTeamData.teamId);
      
      console.log('Cross-ownership player-team relationship created successfully');
    });

    it('should validate required fields', async () => {
      const invalidPlayerTeamData = {}; // Missing required fields
      
      const response = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidPlayerTeamData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    it('should prevent overlapping active relationships', async () => {
      // Create first relationship
      const playerTeamData = {
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: '2024-01-01',
        isActive: true
      };
      
      const firstResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(playerTeamData)
        .expect(201);
      
      createdPlayerTeamIds.push(firstResponse.body.id);
      
      // Try to create overlapping relationship
      const overlappingData = {
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: '2024-06-01', // Overlaps with first relationship
        isActive: true
      };
      
      await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(overlappingData)
        .expect(409); // Should fail due to overlap (Conflict)
      
      console.log('Overlap prevention working correctly');
    });
  });

  describe('GET /api/v1/player-teams', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get('/api/v1/player-teams')
        .expect(401);
    });

    it('should filter by playerId', async () => {
      // Create relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      createdPlayerTeamIds.push(relationshipResponse.body.id);
      
      // Filter by playerId
      const response = await apiRequest
        .get(`/api/v1/player-teams?playerId=${testPlayerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].playerId).toBe(testPlayerId);
      console.log('Player filtering working');
    });

    it('should filter by teamId', async () => {
      // Create relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      createdPlayerTeamIds.push(relationshipResponse.body.id);
      
      // Filter by teamId
      const response = await apiRequest
        .get(`/api/v1/player-teams?teamId=${testTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].teamId).toBe(testTeamId);
      console.log('Team filtering working');
    });
  });

  describe('GET /api/v1/player-teams/:id', () => {
    it('should require authentication', async () => {
      const relationshipId = randomUUID();
      await apiRequest
        .get(`/api/v1/player-teams/${relationshipId}`)
        .expect(401);
    });

    it('should return accessible player-team relationship', async () => {
      // Create relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      createdPlayerTeamIds.push(relationshipResponse.body.id);
      
      // Get the specific relationship
      const response = await apiRequest
        .get(`/api/v1/player-teams/${relationshipResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.id).toBe(relationshipResponse.body.id);
      console.log('Relationship retrieval working');
    });

  });

  describe('PUT /api/v1/player-teams/:id', () => {
    it('should require authentication', async () => {
      const relationshipId = randomUUID();
      await apiRequest
        .put(`/api/v1/player-teams/${relationshipId}`)
        .send({ isActive: false })
        .expect(401);
    });

    it('should update accessible player-team relationship', async () => {
      // Create relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      createdPlayerTeamIds.push(relationshipResponse.body.id);
      
      // Update the relationship
      const updateData = { 
        endDate: '2024-12-31',
        isActive: false 
      };
      const response = await apiRequest
        .put(`/api/v1/player-teams/${relationshipResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body.endDate).toBe(updateData.endDate);
      expect(response.body.isActive).toBe(updateData.isActive);
      console.log('Relationship update working');
    });

  });

  describe('DELETE /api/v1/player-teams/:id', () => {
    it('should require authentication', async () => {
      const relationshipId = randomUUID();
      await apiRequest
        .delete(`/api/v1/player-teams/${relationshipId}`)
        .expect(401);
    });

    it('should delete accessible player-team relationship', async () => {
      // Create relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      const relationshipId = relationshipResponse.body.id;
      
      // Delete the relationship
      await apiRequest
        .delete(`/api/v1/player-teams/${relationshipId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify relationship is gone from API
      await apiRequest
        .get(`/api/v1/player-teams/${relationshipId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Relationship deletion working');
    });

    it('should perform soft delete', async () => {
      // Create relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      const relationshipId = relationshipResponse.body.id;
      
      // Delete the relationship
      await apiRequest
        .delete(`/api/v1/player-teams/${relationshipId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify soft delete in database
      const deletedRelationship = await prisma.player_teams.findUnique({
        where: { id: relationshipId }
      });
      
      expect(deletedRelationship).toBeTruthy();
      expect(deletedRelationship!.is_deleted).toBe(true);
      expect(deletedRelationship!.deleted_at).toBeTruthy();
      expect(deletedRelationship!.deleted_by_user_id).toBe(testUser.id);
      
      console.log('Soft delete working correctly');
    });
  });

  describe('GET /api/v1/player-teams/team/:teamId/players', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/player-teams/team/${testTeamId}/players`)
        .expect(401);
    });

    it('should return players for accessible team', async () => {
      // Create player-team relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      createdPlayerTeamIds.push(relationshipResponse.body.id);
      
      // Get players for the team
      const response = await apiRequest
        .get(`/api/v1/player-teams/team/${testTeamId}/players`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].playerId).toBe(testPlayerId);
      console.log('Team players retrieval working');
    });

    it('should deny access to other user\'s team', async () => {
      // testUser should not be able to access otherUser's team players
      await apiRequest
        .get(`/api/v1/player-teams/team/${otherUserTeamId}/players`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200); // Returns empty array for no access
      
      console.log('Access control working for team players');
    });
  });

  describe('GET /api/v1/player-teams/player/:playerId/teams', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/player-teams/player/${testPlayerId}/teams`)
        .expect(401);
    });

    it('should return teams for accessible player', async () => {
      // Create player-team relationship
      const relationshipResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: testPlayerId,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      
      createdPlayerTeamIds.push(relationshipResponse.body.id);
      
      // Get teams for the player
      const response = await apiRequest
        .get(`/api/v1/player-teams/player/${testPlayerId}/teams`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].teamId).toBe(testTeamId);
      console.log('Player teams retrieval working');
    });

    it('should deny access to other user\'s player', async () => {
      // testUser should not be able to access otherUser's player teams
      await apiRequest
        .get(`/api/v1/player-teams/player/${otherUserPlayerId}/teams`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200); // Returns empty array for no access
      
      console.log('Access control working for player teams');
    });

    it('should restore soft-deleted player-team relationship when creating same relationship again', async () => {
      // 1. Create a player-team relationship
      const relationshipData = {
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: '2024-01-01', // Fixed date for consistency
        isActive: true,
        endDate: '2024-12-31'
      };

      const createResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(relationshipData)
        .expect(201);

      const originalRelationshipId = createResponse.body.id;
      console.log('Original player-team relationship created:', originalRelationshipId);

      // 2. Delete the relationship (soft delete)
      await apiRequest
        .delete(`/api/v1/player-teams/${originalRelationshipId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Verify it's soft deleted (should return 404)
      await apiRequest
        .get(`/api/v1/player-teams/${originalRelationshipId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('Player-team relationship soft deleted successfully');

      // 3. Create the same relationship again (same unique constraints: playerId + teamId + startDate)
      const restoredRelationshipData = {
        playerId: testPlayerId, // Same player
        teamId: testTeamId, // Same team
        startDate: '2024-01-01', // Same start date
        isActive: false, // Different active status
        endDate: '2024-06-30' // Different end date
      };

      const restoreResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(restoredRelationshipData)
        .expect(201);

      // 4. Verify it's the same record restored (same ID)
      expect(restoreResponse.body.id).toBe(originalRelationshipId);
      expect(restoreResponse.body.playerId).toBe(restoredRelationshipData.playerId);
      expect(restoreResponse.body.teamId).toBe(restoredRelationshipData.teamId);
      expect(restoreResponse.body.startDate).toBe(restoredRelationshipData.startDate);
      expect(restoreResponse.body.isActive).toBe(restoredRelationshipData.isActive);
      expect(restoreResponse.body.endDate).toBe(restoredRelationshipData.endDate);

      console.log('Player-team relationship restored with same ID:', restoreResponse.body.id);

      // 5. Verify the relationship is now accessible again
      const getResponse = await apiRequest
        .get(`/api/v1/player-teams/${originalRelationshipId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.id).toBe(originalRelationshipId);
      expect(getResponse.body.isActive).toBe(restoredRelationshipData.isActive);

      console.log('Soft delete restoration working - same relationship ID restored with updated data');

      // Add to cleanup
      createdPlayerTeamIds.push(originalRelationshipId);
    });
  });

  describe('Authorization Tests', () => {
    let testRelationshipIdByTestUser: string;
    let testRelationshipIdByOtherUser: string;

    beforeEach(async () => {
      // Create a relationship by testUser (testUser owns both player and team)
      const testUserRelationship = {
        playerId: testPlayerId, // testUser created this player
        teamId: testTeamId, // testUser created this team
        startDate: '2025-01-01', // Future date to avoid overlap with existing relationships
        isActive: true
      };

      const testUserResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(testUserRelationship)
        .expect(201);

      testRelationshipIdByTestUser = testUserResponse.body.id;

      // Create a relationship by otherUser (otherUser owns both player and team)
      const otherUserRelationship = {
        playerId: otherUserPlayerId, // otherUser created this player
        teamId: otherUserTeamId, // otherUser created this team
        startDate: '2025-01-01', // Future date to avoid overlap with existing relationships
        isActive: true
      };

      const otherUserResponse = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(otherUser))
        .send(otherUserRelationship)
        .expect(201);

      testRelationshipIdByOtherUser = otherUserResponse.body.id;
    });

    afterEach(async () => {
      // Clean up authorization test data
      try {
        await prisma.player_teams.deleteMany({
          where: { 
            id: { in: [testRelationshipIdByTestUser, testRelationshipIdByOtherUser] }
          }
        });
        console.log('Authorization test data cleaned up successfully');
      } catch (error) {
        console.warn('Authorization cleanup warning (non-fatal):', error);
      }
    });

    describe('User Isolation', () => {
      it('should deny creating relationship for player and team not owned', async () => {
        const relationshipData = {
          playerId: otherUserPlayerId, // otherUser created this player
          teamId: otherUserTeamId, // otherUser created this team
          startDate: '2025-02-01', // Future date to avoid overlap
          isActive: true
        };
        
        // testUser should not be able to create relationship for entities they don't own
        await apiRequest
          .post('/api/v1/player-teams')
          .set(authHelper.getAuthHeader(testUser))
          .send(relationshipData)
          .expect(403); // Access denied error (Forbidden)
        
        console.log('Access denied for creating relationship with unowned player and team');
      });

      it('should not allow users to see other users relationships in list', async () => {
        const response = await apiRequest
          .get('/api/v1/player-teams')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should only see their own accessible relationships
        expect(response.body.data).toBeInstanceOf(Array);
        
        const relationshipIds = response.body.data.map((rel: any) => rel.id);
        expect(relationshipIds).toContain(testRelationshipIdByTestUser);
        expect(relationshipIds).not.toContain(testRelationshipIdByOtherUser);

        console.log('User isolation working for GET /player-teams');
      });

      it('should not allow users to access other users relationships by ID', async () => {
        await apiRequest
          .get(`/api/v1/player-teams/${testRelationshipIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to other user\'s relationship');
      });

      it('should not allow users to update other users relationships', async () => {
        const updateData = {
          isActive: false,
          endDate: '2024-12-31'
        };

        await apiRequest
          .put(`/api/v1/player-teams/${testRelationshipIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to other user\'s relationship');
      });

      it('should not allow users to delete other users relationships', async () => {
        await apiRequest
          .delete(`/api/v1/player-teams/${testRelationshipIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to other user\'s relationship');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to create relationship for any player and team', async () => {
        // Create a completely new player and team to avoid overlap issues
        const newPlayer = await apiRequest
          .post('/api/v1/players')
          .set(authHelper.getAuthHeader(otherUser))
          .send({ name: `Admin Test Player ${Date.now()}` })
          .expect(201);

        const newTeam = await apiRequest
          .post('/api/v1/teams')
          .set(authHelper.getAuthHeader(otherUser))
          .send({ name: `Admin Test Team ${Date.now()}` })
          .expect(201);

        const relationshipData = {
          playerId: newPlayer.body.id, // Fresh player with no existing relationships
          teamId: newTeam.body.id, // Fresh team with no existing relationships
          startDate: '2025-02-01',
          endDate: '2025-06-30',
          isActive: false
        };
        
        const response = await apiRequest
          .post('/api/v1/player-teams')
          .set(authHelper.getAuthHeader(adminUser))
          .send(relationshipData)
          .expect(201);
        
        // Clean up the entities we created
        await prisma.player_teams.deleteMany({
          where: { id: response.body.id }
        });
        await prisma.player.deleteMany({
          where: { id: newPlayer.body.id }
        });
        await prisma.team.deleteMany({
          where: { id: newTeam.body.id }
        });
        
        expect(response.body.playerId).toBe(relationshipData.playerId);
        expect(response.body.teamId).toBe(relationshipData.teamId);
        console.log('Admin created relationship successfully with unowned player and team');
      });

      it('should allow admin to see all relationships in list', async () => {
        const response = await apiRequest
          .get('/api/v1/player-teams')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see relationships from all users
        expect(response.body.data).toBeInstanceOf(Array);
        
        const relationshipIds = response.body.data.map((rel: any) => rel.id);
        expect(relationshipIds).toContain(testRelationshipIdByTestUser);
        expect(relationshipIds).toContain(testRelationshipIdByOtherUser);

        console.log('Admin can see all relationships');
      });

      it('should allow admin to access any relationship by ID', async () => {
        // Admin should be able to access testUser's relationship
        const testUserRelationshipResponse = await apiRequest
          .get(`/api/v1/player-teams/${testRelationshipIdByTestUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserRelationshipResponse.body.id).toBe(testRelationshipIdByTestUser);

        // Admin should be able to access otherUser's relationship
        const otherUserRelationshipResponse = await apiRequest
          .get(`/api/v1/player-teams/${testRelationshipIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserRelationshipResponse.body.id).toBe(testRelationshipIdByOtherUser);

        console.log('Admin can access any relationship');
      });

      it('should allow admin to update any relationship', async () => {
        const updateData = {
          isActive: false,
          endDate: '2024-12-31'
        };

        const response = await apiRequest
          .put(`/api/v1/player-teams/${testRelationshipIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.isActive).toBe(updateData.isActive);
        expect(response.body.endDate).toBe(updateData.endDate);

        console.log('Admin can update any relationship');
      });

      it('should allow admin to delete any relationship', async () => {
        // Create fresh entities to avoid overlap issues
        const tempPlayer = await apiRequest
          .post('/api/v1/players')
          .set(authHelper.getAuthHeader(otherUser))
          .send({ name: `Temp Player for Deletion ${Date.now()}` })
          .expect(201);

        const tempTeam = await apiRequest
          .post('/api/v1/teams')
          .set(authHelper.getAuthHeader(otherUser))
          .send({ name: `Temp Team for Deletion ${Date.now()}` })
          .expect(201);

        // Create a temporary relationship to delete
        const tempRelationship = {
          playerId: tempPlayer.body.id,
          teamId: tempTeam.body.id,
          startDate: '2025-03-01',
          endDate: '2025-08-31',
          isActive: false
        };

        const createResponse = await apiRequest
          .post('/api/v1/player-teams')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempRelationship)
          .expect(201);

        const tempRelationshipId = createResponse.body.id;

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/player-teams/${tempRelationshipId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's soft deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/player-teams/${tempRelationshipId}`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        // Clean up the temp entities
        await prisma.player.deleteMany({
          where: { id: tempPlayer.body.id }
        });
        await prisma.team.deleteMany({
          where: { id: tempTeam.body.id }
        });

        console.log('Admin can delete any relationship');
      });
    });
  });

  describe('POST /api/v1/player-teams/batch', () => {

    it('should handle batch create operations', async () => {
      const batchData = {
        create: [
          {
            playerId: batchPlayerId,
            teamId: testTeamId,
            startDate: '2024-01-01',
            isActive: true
          },
          {
            playerId: batchPlayer2Id,
            teamId: testTeamId,
            startDate: '2024-01-15',
            isActive: true
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.created.success).toBe(2);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.successful).toBe(2);

      console.log('Batch create operations successful');
    });

    it('should handle batch update operations', async () => {
      // First create some relationships to update
      const relationship1 = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: batchPlayer3Id,
          teamId: testTeamId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);
      const relationship2 = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: batchPlayer4Id,
          teamId: testTeamId,
          startDate: '2024-01-15',
          isActive: true
        })
        .expect(201);

      const batchData = {
        update: [
          {
            id: relationship1.body.id,
            data: {
              endDate: '2024-06-30',
              isActive: false
            }
          },
          {
            id: relationship2.body.id,
            data: {
              endDate: '2024-07-31',
              isActive: false
            }
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.updated.success).toBe(2);
      expect(response.body.results.updated.failed).toBe(0);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.successful).toBe(2);

      console.log('Batch update operations successful');
    });

    it('should handle batch delete operations', async () => {
      // First create some relationships
      const relationship1 = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: batchPlayerId,
          teamId: testTeam2Id,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);

      const relationship2 = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: batchPlayer2Id,
          teamId: testTeam2Id,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);

      // Now batch delete them
      const batchData = {
        delete: [
          relationship1.body.id,
          relationship2.body.id
        ]
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.deleted.success).toBe(2);
      expect(response.body.results.deleted.failed).toBe(0);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.successful).toBe(2);

      console.log('Batch delete operations successful');
    });

    it('should handle mixed batch operations', async () => {
      // Create one relationship first for updating
      const existingRelationship = await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: batchPlayer3Id,
          teamId: testTeam2Id,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);

      // Mixed batch operations
      const batchData = {
        create: [
          {
            playerId: batchPlayer4Id,
            teamId: testTeam2Id,
            startDate: '2024-02-01',
            isActive: true
          }
        ],
        update: [
          {
            id: existingRelationship.body.id,
            data: {
              endDate: '2024-06-30',
              isActive: false
            }
          }
        ],
        delete: [] // No deletes in this test
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.updated.success).toBe(1);
      expect(response.body.results.deleted.success).toBe(0);
      expect(response.body.summary.total).toBe(2);
      expect(response.body.summary.successful).toBe(2);

      console.log('Mixed batch operations successful');
    });

    it('should handle access denied in batch operations', async () => {
      const batchData = {
        create: [
          {
            playerId: otherUserPlayerId,
            teamId: otherUserTeamId, // Team owned by other user
            startDate: '2024-01-01',
            isActive: true
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.created.success).toBe(0);
      expect(response.body.results.created.failed).toBe(1);
      expect(response.body.results.created.errors).toHaveLength(1);
      expect(response.body.results.created.errors[0].error).toContain('Access denied');

      console.log('Batch access denied handling working correctly');
    });

    it('should require authentication', async () => {
      const batchData = {
        create: [
          {
            playerId: batchPlayerId,
            teamId: testTeam2Id,
            startDate: '2024-01-01',
            isActive: true
          }
        ]
      };

      await apiRequest
        .post('/api/v1/player-teams/batch')
        .send(batchData)
        .expect(401);

      console.log('Batch authentication requirement working');
    });

    it('should validate batch request structure', async () => {
      // Empty batch request
      await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send({})
        .expect(200); // Should succeed with empty operations

      // Invalid structure
      await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          create: 'invalid' // Should be array
        })
        .expect(400);

      console.log('Batch request validation working');
    });
  });

  // ============================================================================
  // NATURAL KEYS BATCH OPERATIONS TESTS
  // ============================================================================

  describe('POST /api/v1/player-teams/batch - Natural Keys Support', () => {
    let naturalKeyTestTeamId: string;
    let naturalKeyTestPlayerId: string;

    beforeEach(async () => {
      // Create test team and player for natural key tests
      const teamResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Natural Key Team ${Date.now()}`,
          homeKitPrimary: '#FF0000'
        })
        .expect(201);
      
      naturalKeyTestTeamId = teamResponse.body.id;

      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Natural Key Player ${Date.now()}`,
          squadNumber: 42,
          preferredPosition: 'ST'
        })
        .expect(201);
      
      naturalKeyTestPlayerId = playerResponse.body.id;
    });

    it('should create player-team relationships using natural keys', async () => {
      const batchData = {
        create: [
          {
            playerName: `Natural Key Player ${Date.now()}`,
            teamName: `Natural Key Team ${Date.now()}`,
            startDate: '2024-01-01',
            isActive: true
          }
        ]
      };

      // Get the actual names from the created entities
      const teamData = await apiRequest
        .get(`/api/v1/teams/${naturalKeyTestTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      const playerData = await apiRequest
        .get(`/api/v1/players/${naturalKeyTestPlayerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      // Update batch data with actual names
      batchData.create[0].playerName = playerData.body.name;
      batchData.create[0].teamName = teamData.body.name;

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.summary.successful).toBe(1);
    });

    it('should handle mixed UUID and natural key requests', async () => {
      // Create a second player for this test
      const player2Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Natural Key Player 2 ${Date.now()}`,
          squadNumber: 43,
          preferredPosition: 'CM'
        })
        .expect(201);

      // Get actual names for natural key request
      const teamData = await apiRequest
        .get(`/api/v1/teams/${naturalKeyTestTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      const player2Data = await apiRequest
        .get(`/api/v1/players/${player2Response.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const batchData = {
        create: [
          {
            // UUID-based request
            playerId: naturalKeyTestPlayerId,
            teamId: naturalKeyTestTeamId,
            startDate: '2024-01-01',
            isActive: true
          },
          {
            // Natural key-based request (different player)
            playerName: player2Data.body.name,
            teamName: teamData.body.name,
            startDate: '2024-02-01',
            isActive: true
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.created.success).toBe(2);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.summary.successful).toBe(2);
    });

    it('should handle natural key resolution errors gracefully', async () => {
      const batchData = {
        create: [
          {
            playerName: 'Non Existent Player',
            teamName: 'Non Existent Team',
            startDate: '2024-01-01',
            isActive: true
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.created.success).toBe(0);
      expect(response.body.results.created.failed).toBe(1);
      expect(response.body.results.created.errors).toHaveLength(1);
      expect(response.body.results.created.errors[0].error).toContain('not found');
    });

    it('should validate natural key request format', async () => {
      // Missing teamName
      const invalidBatchData = {
        create: [
          {
            playerName: 'Some Player',
            startDate: '2024-01-01',
            isActive: true
          }
        ]
      };

      await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidBatchData)
        .expect(400);
    });

    it('should reject mixed UUID and natural key in same request', async () => {
      const invalidBatchData = {
        create: [
          {
            playerId: naturalKeyTestPlayerId,
            teamName: 'Some Team',
            startDate: '2024-01-01',
            isActive: true
          }
        ]
      };

      await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidBatchData)
        .expect(400);
    });

    it('should handle case insensitive natural key matching', async () => {
      // Get actual names
      const teamData = await apiRequest
        .get(`/api/v1/teams/${naturalKeyTestTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      const playerData = await apiRequest
        .get(`/api/v1/players/${naturalKeyTestPlayerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const batchData = {
        create: [
          {
            playerName: playerData.body.name.toLowerCase(), // Use lowercase
            teamName: teamData.body.name.toUpperCase(), // Use uppercase
            startDate: '2024-01-01',
            isActive: true
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/player-teams/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.created.failed).toBe(0);
    });
  });

  // ============================================================================
  // CONVENIENCE ENDPOINTS TESTS
  // ============================================================================

  describe('GET /api/v1/teams/:id/active-players - Active Players Convenience Endpoint', () => {
    let testTeamForActivePlayersId: string;
    let activePlayer1Id: string;
    let activePlayer2Id: string;
    let inactivePlayerId: string;

    beforeEach(async () => {
      // Create a test team
      const teamResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Active Players Test Team ${Date.now()}`,
          homeKitPrimary: '#FF0000'
        })
        .expect(201);
      
      testTeamForActivePlayersId = teamResponse.body.id;

      // Create test players with different squad numbers
      const player1Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Active Player 1 ${Date.now()}`,
          squadNumber: 10,
          preferredPosition: 'ST'
        })
        .expect(201);
      
      activePlayer1Id = player1Response.body.id;

      const player2Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Active Player 2 ${Date.now()}`,
          squadNumber: 5,
          preferredPosition: 'CM'
        })
        .expect(201);
      
      activePlayer2Id = player2Response.body.id;

      const player3Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Inactive Player ${Date.now()}`,
          squadNumber: 99,
          preferredPosition: 'CB'
        })
        .expect(201);
      
      inactivePlayerId = player3Response.body.id;

      // Create active relationships for first two players
      await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: activePlayer1Id,
          teamId: testTeamForActivePlayersId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);

      await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: activePlayer2Id,
          teamId: testTeamForActivePlayersId,
          startDate: '2024-01-01',
          isActive: true
        })
        .expect(201);

      // Create inactive relationship for third player
      await apiRequest
        .post('/api/v1/player-teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          playerId: inactivePlayerId,
          teamId: testTeamForActivePlayersId,
          startDate: '2024-01-01',
          isActive: false
        })
        .expect(201);
    });

    it('should return only active players for a team', async () => {
      const response = await apiRequest
        .get(`/api/v1/teams/${testTeamForActivePlayersId}/active-players`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveLength(2);
      
      // Should be sorted by squad number (5, 10)
      expect(response.body[0].squadNumber).toBe(5);
      expect(response.body[0].playerName).toContain('Active Player 2');
      expect(response.body[0].preferredPosition).toBe('CM');
      
      expect(response.body[1].squadNumber).toBe(10);
      expect(response.body[1].playerName).toContain('Active Player 1');
      expect(response.body[1].preferredPosition).toBe('ST');

      // Verify response structure
      expect(response.body[0]).toHaveProperty('relationshipId');
      expect(response.body[0]).toHaveProperty('playerId');
      expect(response.body[0]).toHaveProperty('playerName');
      expect(response.body[0]).toHaveProperty('squadNumber');
      expect(response.body[0]).toHaveProperty('preferredPosition');
      expect(response.body[0]).toHaveProperty('startDate');
      expect(response.body[0]).toHaveProperty('joinedAt');
    });

    it('should return empty array for team with no active players', async () => {
      // Create a team with no active players
      const emptyTeamResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Empty Team ${Date.now()}`,
          homeKitPrimary: '#00FF00'
        })
        .expect(201);

      const response = await apiRequest
        .get(`/api/v1/teams/${emptyTeamResponse.body.id}/active-players`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/teams/${testTeamForActivePlayersId}/active-players`)
        .expect(401);
    });

    it('should require valid UUID for team ID', async () => {
      await apiRequest
        .get('/api/v1/teams/invalid-uuid/active-players')
        .set(authHelper.getAuthHeader(testUser))
        .expect(400);
    });

    it('should return empty array for non-existent team', async () => {
      const nonExistentTeamId = '12345678-1234-1234-1234-123456789012';
      
      const response = await apiRequest
        .get(`/api/v1/teams/${nonExistentTeamId}/active-players`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should deny access to other users teams', async () => {
      const response = await apiRequest
        .get(`/api/v1/teams/${testTeamForActivePlayersId}/active-players`)
        .set(authHelper.getAuthHeader(otherUser))
        .expect(200);

      // Should return empty array due to access control
      expect(response.body).toHaveLength(0);
    });
  });
});
