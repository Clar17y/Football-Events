/**
 * Players API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Players API using Supertest.
 * Tests authentication, authorization, and team ownership isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Players API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let adminUser: TestUser;
  let otherUser: TestUser;
  let createdPlayerIds: string[] = [];
  let createdTeamIds: string[] = [];
  let createdUserIds: string[] = [];
  let testTeamId: string;
  let otherUserTeamId: string;

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
    
    createdUserIds.push(testUser.id, otherUser.id, adminUser.id);
    createdTeamIds.push(testTeamId, otherUserTeamId);
    
    console.log('Players API Tests: Database connected and test data created');
  });

  afterAll(async () => {
    // Clean up all players first
    try {
      await prisma.player.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Player cleanup warning:', error);
    }
    
    // Clean up all events
    try {
      await prisma.event.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Event cleanup warning:', error);
    }

    // Clean up all matches
    try {
      await prisma.match.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Match cleanup warning:', error);
    }

    // Clean up all teams
    try {
      await prisma.team.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Team cleanup warning:', error);
    }

    // Clean up all seasons
    try {
      await prisma.seasons.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Season cleanup warning:', error);
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
    createdPlayerIds = [];
  });

  afterEach(async () => {
    // Clean up created players
    if (createdPlayerIds.length > 0) {
      try {
        await prisma.player.deleteMany({
          where: { id: { in: createdPlayerIds } }
        });
        console.log('Players cleaned up successfully');
      } catch (error) {
        console.warn('Player cleanup warning (non-fatal):', error);
      }
    }
  });

  describe('POST /api/v1/players', () => {
    it('should require authentication', async () => {
      const playerData = {
        name: `Test Player ${Date.now()}`
      };
      
      await apiRequest
        .post('/api/v1/players')
        .send(playerData)
        .expect(401);
    });

    it('should create a player successfully for own team', async () => {
      const playerData = {
        name: `Test Player ${Date.now()}`,
        squadNumber: 10
      };
      
      const response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send(playerData)
        .expect(201);
      
      createdPlayerIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: playerData.name,
        squadNumber: playerData.squadNumber
      });
      
      console.log('Player created successfully');
    });

    it('should create a minimal player', async () => {
      const playerData = {
        name: `Minimal Player ${Date.now()}`
      };
      
      const response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send(playerData)
        .expect(201);
      
      createdPlayerIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: playerData.name
      });
      
      console.log('Minimal player created successfully');
    });

    it('should validate required fields', async () => {
      const invalidPlayerData = {}; // Missing required name
      
      const response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidPlayerData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });
  });

  describe('GET /api/v1/players', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get('/api/v1/players')
        .expect(401);
    });

    it('should return only players from user\'s teams', async () => {
      // Create players for different teams
      const testUserPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: `TestUser Player ${Date.now()}` })
        .expect(201);
      
      const otherUserPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(otherUser))
        .send({ name: `OtherUser Player ${Date.now()}`, currentTeam: otherUserTeamId })
        .expect(201);
      
      createdPlayerIds.push(testUserPlayer.body.id, otherUserPlayer.body.id);
      
      // Test user should only see their own team's players
      const testUserResponse = await apiRequest
        .get('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      const testUserPlayerIds = testUserResponse.body.data.map((player: any) => player.id);
      expect(testUserPlayerIds).toContain(testUserPlayer.body.id);
      expect(testUserPlayerIds).not.toContain(otherUserPlayer.body.id);
      
      console.log('Ownership isolation working for GET /players');
    });

    it('should allow admin to see all players', async () => {
      // Create players for different teams
      const testUserPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: `TestUser Player ${Date.now()}`, currentTeam: testTeamId })
        .expect(201);
      
      const otherUserPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(otherUser))
        .send({ name: `OtherUser Player ${Date.now()}`, currentTeam: otherUserTeamId })
        .expect(201);
      
      createdPlayerIds.push(testUserPlayer.body.id, otherUserPlayer.body.id);
      
      // Admin should see all players
      const adminResponse = await apiRequest
        .get('/api/v1/players')
        .set(authHelper.getAuthHeader(adminUser))
        .expect(200);
      
      const adminPlayerIds = adminResponse.body.data.map((player: any) => player.id);
      expect(adminPlayerIds).toContain(testUserPlayer.body.id);
      expect(adminPlayerIds).toContain(otherUserPlayer.body.id);
      
      console.log('Admin can see all players');
    });
  });

  describe('GET /api/v1/players/:id', () => {
    it('should require authentication', async () => {
      const playerId = randomUUID();
      await apiRequest
        .get(`/api/v1/players/${playerId}`)
        .expect(401);
    });

    it('should return player from user\'s team', async () => {
      // Create player
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: `Test Player ${Date.now()}` })
        .expect(201);
      
      createdPlayerIds.push(playerResponse.body.id);
      
      // Get the specific player
      const response = await apiRequest
        .get(`/api/v1/players/${playerResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body.id).toBe(playerResponse.body.id);
      console.log('Player retrieval working');
    });

    it('should deny access to other user\'s player', async () => {
      // Create player with otherUser
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(otherUser))
        .send({ name: `Other User Player ${Date.now()}`, currentTeam: otherUserTeamId })
        .expect(201);
      
      createdPlayerIds.push(playerResponse.body.id);
      
      // testUser should not be able to access otherUser's player
      await apiRequest
        .get(`/api/v1/players/${playerResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Access denied to other user\'s player');
    });
  });

  describe('PUT /api/v1/players/:id', () => {
    it('should require authentication', async () => {
      const playerId = randomUUID();
      await apiRequest
        .put(`/api/v1/players/${playerId}`)
        .send({ name: 'Test' })
        .expect(401);
    });

    it('should update player from user\'s team', async () => {
      // Create player
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: `Update Test Player ${Date.now()}`, currentTeam: testTeamId })
        .expect(201);
      
      createdPlayerIds.push(playerResponse.body.id);
      
      // Update the player
      const updateData = { name: 'Updated Player Name' };
      const response = await apiRequest
        .put(`/api/v1/players/${playerResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body.name).toBe(updateData.name);
      console.log('Player update working');
    });

    it('should deny updating other user\'s player', async () => {
      // Create player with otherUser
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(otherUser))
        .send({ name: `Other User Player ${Date.now()}`, currentTeam: otherUserTeamId })
        .expect(201);
      
      createdPlayerIds.push(playerResponse.body.id);
      
      // testUser should not be able to update otherUser's player
      await apiRequest
        .put(`/api/v1/players/${playerResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: 'Hacked Player' })
        .expect(404);
      
      console.log('Update access denied to other user\'s player');
    });
  });

  describe('DELETE /api/v1/players/:id', () => {
    it('should require authentication', async () => {
      const playerId = randomUUID();
      await apiRequest
        .delete(`/api/v1/players/${playerId}`)
        .expect(401);
    });

    it('should delete player from user\'s team', async () => {
      // Create player
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: `Delete Test Player ${Date.now()}`, currentTeam: testTeamId })
        .expect(201);
      
      const playerId = playerResponse.body.id;
      
      // Delete the player
      await apiRequest
        .delete(`/api/v1/players/${playerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify player is gone from API
      await apiRequest
        .get(`/api/v1/players/${playerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Player deletion working');
    });

    it('should perform soft delete', async () => {
      // Create player
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: `Soft Delete Player ${Date.now()}`, currentTeam: testTeamId })
        .expect(201);
      
      const playerId = playerResponse.body.id;
      
      // Delete the player
      await apiRequest
        .delete(`/api/v1/players/${playerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify soft delete in database
      const deletedPlayer = await prisma.player.findUnique({
        where: { id: playerId }
      });
      
      expect(deletedPlayer).toBeTruthy();
      expect(deletedPlayer!.is_deleted).toBe(true);
      expect(deletedPlayer!.deleted_at).toBeTruthy();
      expect(deletedPlayer!.deleted_by_user_id).toBe(testUser.id);
      
      console.log('Soft delete working correctly');
    });

    it('should deny deleting other user\'s player', async () => {
      // Create player with otherUser
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(otherUser))
        .send({ name: `Other User Player ${Date.now()}`, currentTeam: otherUserTeamId })
        .expect(201);
      
      createdPlayerIds.push(playerResponse.body.id);
      
      // testUser should not be able to delete otherUser's player
      await apiRequest
        .delete(`/api/v1/players/${playerResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Delete access denied to other user\'s player');
    });

    it('should restore soft-deleted player when creating same player again', async () => {
      // 1. Create a player
      const playerData = {
        name: 'Soft Delete Restoration Test Player',
        squadNumber: 99,
        notes: 'Original player notes'
      };

      const createResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send(playerData)
        .expect(201);

      const originalPlayerId = createResponse.body.id;
      console.log('Original player created:', originalPlayerId);

      // 2. Delete the player (soft delete)
      await apiRequest
        .delete(`/api/v1/players/${originalPlayerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Verify it's soft deleted (should return 404)
      await apiRequest
        .get(`/api/v1/players/${originalPlayerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('Player soft deleted successfully');

      // 3. Create the same player again (same unique constraints: name + created_by_user_id)
      const restoredPlayerData = {
        name: 'Soft Delete Restoration Test Player', // Same name
        squadNumber: 99, // Same squad number to match unique constraints
        notes: 'Restored player with new notes'
      };

      const restoreResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send(restoredPlayerData)
        .expect(201);

      // 4. Verify it's the same record restored (same ID)
      expect(restoreResponse.body.id).toBe(originalPlayerId);
      expect(restoreResponse.body.name).toBe(restoredPlayerData.name);
      expect(restoreResponse.body.squadNumber).toBe(restoredPlayerData.squadNumber);
      expect(restoreResponse.body.notes).toBe(restoredPlayerData.notes);

      console.log('Player restored with same ID:', restoreResponse.body.id);

      // 5. Verify the player is now accessible again
      const getResponse = await apiRequest
        .get(`/api/v1/players/${originalPlayerId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.id).toBe(originalPlayerId);
      expect(getResponse.body.notes).toBe(restoredPlayerData.notes);

      console.log('Soft delete restoration working - same player ID restored with updated data');

      // Add to cleanup
      createdPlayerIds.push(originalPlayerId);
    });
  });

  describe('Authorization Tests', () => {
    let testPlayerIdByTestUser: string;
    let testPlayerIdByOtherUser: string;

    beforeEach(async () => {
      // Create a player by testUser
      const testUserPlayer = {
        name: `Test User Player ${Date.now()}`,
        squadNumber: 10,
        notes: 'Player created by test user'
      };

      const testUserResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send(testUserPlayer)
        .expect(201);

      testPlayerIdByTestUser = testUserResponse.body.id;

      // Create a player by otherUser
      const otherUserPlayer = {
        name: `Other User Player ${Date.now()}`,
        squadNumber: 20,
        notes: 'Player created by other user'
      };

      const otherUserResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(otherUser))
        .send(otherUserPlayer)
        .expect(201);

      testPlayerIdByOtherUser = otherUserResponse.body.id;
    });

    afterEach(async () => {
      // Clean up authorization test data
      try {
        await prisma.player.deleteMany({
          where: { 
            id: { in: [testPlayerIdByTestUser, testPlayerIdByOtherUser] }
          }
        });
        console.log('Authorization test data cleaned up successfully');
      } catch (error) {
        console.warn('Authorization cleanup warning (non-fatal):', error);
      }
    });

    describe('User Isolation', () => {
      it('should not allow users to see other users players in list', async () => {
        const response = await apiRequest
          .get('/api/v1/players')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should only see their own players
        expect(response.body.data).toBeInstanceOf(Array);
        
        // Check that otherUser's player is not in the list
        const playerIds = response.body.data.map((player: any) => player.id);
        expect(playerIds).toContain(testPlayerIdByTestUser);
        expect(playerIds).not.toContain(testPlayerIdByOtherUser);

        console.log('User isolation working for GET /players');
      });

      it('should not allow users to access other users players by ID', async () => {
        await apiRequest
          .get(`/api/v1/players/${testPlayerIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to other user\'s player');
      });

      it('should not allow users to update other users players', async () => {
        const updateData = {
          name: 'Hacked Player',
          notes: 'This should not work'
        };

        await apiRequest
          .put(`/api/v1/players/${testPlayerIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to other user\'s player');
      });

      it('should not allow users to delete other users players', async () => {
        await apiRequest
          .delete(`/api/v1/players/${testPlayerIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to other user\'s player');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to see all players in list', async () => {
        const response = await apiRequest
          .get('/api/v1/players')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see players from all users
        expect(response.body.data).toBeInstanceOf(Array);
        
        const playerIds = response.body.data.map((player: any) => player.id);
        expect(playerIds).toContain(testPlayerIdByTestUser);
        expect(playerIds).toContain(testPlayerIdByOtherUser);

        console.log('Admin can see all players');
      });

      it('should allow admin to access any player by ID', async () => {
        // Admin should be able to access testUser's player
        const testUserPlayerResponse = await apiRequest
          .get(`/api/v1/players/${testPlayerIdByTestUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserPlayerResponse.body.id).toBe(testPlayerIdByTestUser);

        // Admin should be able to access otherUser's player
        const otherUserPlayerResponse = await apiRequest
          .get(`/api/v1/players/${testPlayerIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserPlayerResponse.body.id).toBe(testPlayerIdByOtherUser);

        console.log('Admin can access any player');
      });

      it('should allow admin to update any player', async () => {
        const updateData = {
          name: 'Admin Updated Player',
          notes: 'Updated by admin'
        };

        const response = await apiRequest
          .put(`/api/v1/players/${testPlayerIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.name).toBe(updateData.name);
        expect(response.body.notes).toBe(updateData.notes);

        console.log('Admin can update any player');
      });

      it('should allow admin to delete any player', async () => {
        // Create a temporary player to delete
        const tempPlayer = {
          name: `Temp Player for Deletion ${Date.now()}`,
          squadNumber: 99,
          notes: 'This will be deleted by admin'
        };

        const createResponse = await apiRequest
          .post('/api/v1/players')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempPlayer)
          .expect(201);

        const tempPlayerId = createResponse.body.id;

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/players/${tempPlayerId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's soft deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/players/${tempPlayerId}`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        console.log('Admin can delete any player');
      });
    });
  });

  // ============================================================================
  // BATCH OPERATIONS TESTS
  // ============================================================================

  describe('POST /api/v1/players/batch - Players Batch Operations', () => {
    it('should create multiple players in batch', async () => {
      const batchData = {
        create: [
          {
            name: `Batch Player 1 ${Date.now()}`,
            squadNumber: 50
          },
          {
            name: `Batch Player 2 ${Date.now()}`,
            squadNumber: 51
          },
          {
            name: `Batch Player 3 ${Date.now()}`,
            squadNumber: 52
          }
        ]
      };

      const response = await apiRequest
        .post('/api/v1/players/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(3);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.summary.totalSuccess).toBe(3);
      expect(response.body.summary.totalFailed).toBe(0);
    });

    it('should handle mixed batch operations (create, update, delete)', async () => {
      // Create players to update and delete
      const player1Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Update Player ${Date.now()}`,
          squadNumber: 60
        })
        .expect(201);

      const player2Response = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Delete Player ${Date.now()}`,
          squadNumber: 61
        })
        .expect(201);

      const batchData = {
        create: [
          {
            name: `New Batch Player ${Date.now()}`,
            squadNumber: 62
          }
        ],
        update: [
          {
            id: player1Response.body.id,
            data: {
              name: `Updated Player ${Date.now()}`,
              squadNumber: 63
            }
          }
        ],
        delete: [player2Response.body.id]
      };

      const response = await apiRequest
        .post('/api/v1/players/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.updated.success).toBe(1);
      expect(response.body.results.deleted.success).toBe(1);
      expect(response.body.summary.totalSuccess).toBe(3);
      expect(response.body.summary.totalFailed).toBe(0);
    });

    it('should handle partial failures in batch operations', async () => {
      const batchData = {
        create: [
          {
            name: `Valid Player ${Date.now()}`,
            squadNumber: 70
          }
        ],
        update: [
          {
            id: '12345678-1234-1234-1234-123456789012', // Non-existent but valid UUID
            data: {
              name: 'Updated Name'
            }
          }
        ],
        delete: [
          '87654321-4321-4321-4321-210987654321' // Non-existent but valid UUID
        ]
      };

      const response = await apiRequest
        .post('/api/v1/players/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(207); // Multi-Status for partial success

      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.created.failed).toBe(0);
      expect(response.body.results.updated.failed).toBe(1);
      expect(response.body.results.deleted.failed).toBe(1);
      expect(response.body.summary.totalSuccess).toBe(1);
      expect(response.body.summary.totalFailed).toBe(2);
    });

    it('should handle validation failures in batch operations', async () => {
      const batchData = {
        create: [
          {
            name: `Valid Player ${Date.now()}`,
            squadNumber: 80
          },
          {
            name: '', // Invalid - empty name should fail validation
            squadNumber: 81
          }
        ]
      };

      // Should fail validation at request level due to invalid data
      await apiRequest
        .post('/api/v1/players/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(400);
    });

    it('should require authentication for batch operations', async () => {
      const batchData = {
        create: [
          {
            name: 'Test Player',
            squadNumber: 90
          }
        ]
      };

      await apiRequest
        .post('/api/v1/players/batch')
        .send(batchData)
        .expect(401);
    });

    it('should handle empty batch operations', async () => {
      const batchData = {};

      const response = await apiRequest
        .post('/api/v1/players/batch')
        .set(authHelper.getAuthHeader(testUser))
        .send(batchData)
        .expect(200);

      expect(response.body.results.created.success).toBe(0);
      expect(response.body.results.updated.success).toBe(0);
      expect(response.body.results.deleted.success).toBe(0);
      expect(response.body.summary.totalSuccess).toBe(0);
      expect(response.body.summary.totalFailed).toBe(0);
    });

    it('should handle access denied for other users players', async () => {
      // Create a player with the test user
      const playerResponse = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Access Test Player ${Date.now()}`,
          squadNumber: 95
        })
        .expect(201);

      // Try to update/delete with other user (should fail due to access control)
      const batchData = {
        update: [
          {
            id: playerResponse.body.id,
            data: {
              name: 'Unauthorized Update'
            }
          }
        ],
        delete: [playerResponse.body.id]
      };

      const response = await apiRequest
        .post('/api/v1/players/batch')
        .set(authHelper.getAuthHeader(otherUser))
        .send(batchData);

      // Should return 400 for access denied
      expect(response.status).toBe(400);
      expect(response.body.results.updated.success).toBe(0);
      expect(response.body.results.updated.failed).toBe(1);
      expect(response.body.results.deleted.success).toBe(0);
      expect(response.body.results.deleted.failed).toBe(1);
      expect(response.body.results.updated.errors[0].error).toContain('not found or access denied');
      expect(response.body.results.deleted.errors[0].error).toContain('not found or access denied');
    });
  });

  // ============================================================================
  // FRONTEND CONVENIENCE API TESTS
  // ============================================================================

  describe('GET /api/v1/players/:id/season-stats - Player Season Statistics', () => {
    let testMatchId: String;
    let testEventId: String;
    let testLineupId: String;
    let testSeasonId: String;
    let testPlayerId: String;

    beforeAll(async () => {
      // Create a season 
      const seasonData = {
        label: '2025/2026 Test Season',
        startDate: '2025-08-01',
        endDate: '2026-05-31',
        isCurrent: false,
        description: 'Test season for player stats',
      };

      const response = await apiRequest
        .post('/api/v1/seasons')
        .set(authHelper.getAuthHeader(testUser))
        .send(seasonData)
        .expect(201);

      testSeasonId = response.body.id;
      // Create a match for the season
      const testMatch = await apiRequest
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
      testMatchId = testMatch.body.id;

      // Create a player
      const testPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Test Player ${Date.now()}`,
          currentTeam: testTeamId
        })
        .expect(201);
      testPlayerId = testPlayer.body.id;

      // Create events for the player
      const testEvent = await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          kind: 'goal',
          teamId: testTeamId,
          playerId: testPlayerId,
          periodNumber: 1,
          clockMs: 300000,
          notes: 'Test goal for stats'
        })
        .expect(201);
      testEventId = testEvent.body.id;

      // Create lineup for the player
      const testLineup = await apiRequest
        .post('/api/v1/lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          playerId: testPlayerId,
          teamId: testTeamId,
          position: 'ST',
          startMinute: 0
        })
        .expect(201);
      testLineupId = testLineup.body.id;
    });

    it('should return comprehensive player season statistics', async () => {
      const response = await apiRequest
        .get(`/api/v1/players/${testPlayerId}/season-stats?seasonId=${testSeasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body).toHaveProperty('player');
      expect(response.body).toHaveProperty('seasonId');
      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('events');
      expect(response.body).toHaveProperty('lineups');
      expect(response.body).toHaveProperty('matches');

      // Verify player data
      expect(response.body.player.id).toBe(testPlayerId);
      expect(response.body.seasonId).toBe(testSeasonId);

      // Verify stats structure
      const stats = response.body.stats;
      expect(stats).toHaveProperty('matchesPlayed');
      expect(stats).toHaveProperty('goals');
      expect(stats).toHaveProperty('assists');
      expect(stats).toHaveProperty('fouls');
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('appearances');

      // Verify stats values
      expect(typeof stats.matchesPlayed).toBe('number');
      expect(typeof stats.goals).toBe('number');
      expect(typeof stats.assists).toBe('number');
      expect(typeof stats.fouls).toBe('number');
      expect(typeof stats.totalEvents).toBe('number');
      expect(typeof stats.appearances).toBe('number');

      // Should have at least one goal from our test event
      expect(stats.goals).toBeGreaterThan(0);
      expect(stats.totalEvents).toBeGreaterThan(0);
      expect(stats.appearances).toBeGreaterThan(0);

      // Verify events array
      expect(Array.isArray(response.body.events)).toBe(true);
      expect(response.body.events.length).toBeGreaterThan(0);
      const event = response.body.events[0];
      expect(event).toHaveProperty('kind');
      expect(event).toHaveProperty('clockMs');
      expect(event).toHaveProperty('match');

      // Verify lineups array
      expect(Array.isArray(response.body.lineups)).toBe(true);
      expect(response.body.lineups.length).toBeGreaterThan(0);
      const lineup = response.body.lineups[0];
      expect(lineup).toHaveProperty('position');
      expect(lineup).toHaveProperty('match');

      // Verify matches array
      expect(Array.isArray(response.body.matches)).toBe(true);
      expect(response.body.matches.length).toBeGreaterThan(0);
      const match = response.body.matches[0];
      expect(match).toHaveProperty('matchId');
      expect(match).toHaveProperty('kickoffTime');
      expect(match).toHaveProperty('homeTeamId');
      expect(match).toHaveProperty('awayTeamId');
    });

    it('should return empty stats for player with no activity in season', async () => {
      // Create a new player with no activity
      const newPlayer = await apiRequest
        .post('/api/v1/players')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          name: `Inactive Player ${Date.now()}`,
          squadNumber: 99
        })
        .expect(201);

      const response = await apiRequest
        .get(`/api/v1/players/${newPlayer.body.id}/season-stats?seasonId=${testSeasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(response.body.stats.matchesPlayed).toBe(0);
      expect(response.body.stats.goals).toBe(0);
      expect(response.body.stats.assists).toBe(0);
      expect(response.body.stats.yellowCards).toBe(0);
      expect(response.body.stats.redCards).toBe(0);
      expect(response.body.stats.totalEvents).toBe(0);
      expect(response.body.stats.appearances).toBe(0);
      expect(response.body.events).toEqual([]);
      expect(response.body.lineups).toEqual([]);
    });

    it('should require seasonId parameter', async () => {
      await apiRequest
        .get(`/api/v1/players/${testPlayerId}/season-stats`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(400);
    });

    it('should return 404 for non-existent player', async () => {
      const nonExistentId = '12345678-1234-1234-1234-123456789012';
      await apiRequest
        .get(`/api/v1/players/${nonExistentId}/season-stats?seasonId=${testSeasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
    });

    it('should deny access to other users players', async () => {
      await apiRequest
        .get(`/api/v1/players/${testPlayerId}/season-stats?seasonId=${testSeasonId}`)
        .set(authHelper.getAuthHeader(otherUser))
        .expect(404);
    });

    it('should require authentication', async () => {
      await apiRequest
        .get(`/api/v1/players/${testPlayerId}/season-stats?seasonId=${testSeasonId}`)
        .expect(401);
    });

    it('should handle different event types in statistics', async () => {
      // Create additional events of different types
      await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          kind: 'assist',
          teamId: testTeamId,
          playerId: testPlayerId,
          periodNumber: 1,
          clockMs: 400000,
          notes: 'Test assist'
        })
        .expect(201);

      await apiRequest
        .post('/api/v1/events')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          matchId: testMatchId,
          kind: 'foul',
          teamId: testTeamId,
          playerId: testPlayerId,
          periodNumber: 2,
          clockMs: 500000,
          notes: 'Test yellow card'
        })
        .expect(201);

      const response = await apiRequest
        .get(`/api/v1/players/${testPlayerId}/season-stats?seasonId=${testSeasonId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      const stats = response.body.stats;
      expect(stats.goals).toBeGreaterThan(0);
      expect(stats.assists).toBeGreaterThan(0);
      expect(stats.fouls).toBeGreaterThan(0);
      expect(stats.totalEvents).toBeGreaterThanOrEqual(3); // goal + assist + yellow card
    });
  });

});