/**
 * Teams API Integration Tests
 * 
 * Comprehensive HTTP endpoint testing for the Teams API using Supertest.
 * Tests authentication, authorization, and ownership isolation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { app } from '../../src/app';
import { randomUUID } from 'crypto';
import { AuthTestHelper, TestUser } from './auth-helpers';

describe('Teams API Integration', () => {
  let prisma: PrismaClient;
  let apiRequest: request.SuperTest<request.Test>;
  let authHelper: AuthTestHelper;
  let testUser: TestUser;
  let adminUser: TestUser;
  let otherUser: TestUser;
  let createdTeamIds: string[] = [];
  let createdUserIds: string[] = [];

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
    
    console.log('Teams API Tests: Database connected and users created');
  });

  afterAll(async () => {
    // Clean up all teams first (to avoid foreign key constraints)
    try {
      await prisma.team.deleteMany({
        where: { created_by_user_id: { in: createdUserIds } }
      });
    } catch (error) {
      console.warn('Team cleanup warning:', error);
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
    createdTeamIds = [];
  });

  afterEach(async () => {
    // Clean up created teams
    if (createdTeamIds.length > 0) {
      try {
        await prisma.team.deleteMany({
          where: { id: { in: createdTeamIds } }
        });
        console.log('Teams cleaned up successfully');
      } catch (error) {
        console.warn('Team cleanup warning (non-fatal):', error);
      }
    }
  });

  describe('POST /api/v1/teams', () => {
    it('should require authentication', async () => {
      const teamData = {
        name: `Test Team ${Date.now()}`
      };
      
      await apiRequest
        .post('/api/v1/teams')
        .send(teamData)
        .expect(401);
    });

    it('should create a team successfully', async () => {
      const teamData = {
        name: `Test Team ${Date.now()}`,
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF',
        awayKitPrimary: '#000000',
        awayKitSecondary: '#FFD700',
        logoUrl: 'https://example.com/logo.png'
      };
      
      const response = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      createdTeamIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: teamData.name,
        homeKitPrimary: teamData.homeKitPrimary,
        homeKitSecondary: teamData.homeKitSecondary,
        awayKitPrimary: teamData.awayKitPrimary,
        awayKitSecondary: teamData.awayKitSecondary,
        logoUrl: teamData.logoUrl
      });
      
      console.log('Team created successfully:', response.body.id);
    });

    it('should create a minimal team', async () => {
      const teamData = {
        name: `Minimal Team ${Date.now()}`
      };
      
      const response = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      createdTeamIds.push(response.body.id);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: teamData.name
      });
      
      console.log('Minimal team created successfully:', response.body.id);
    });

    it('should validate required fields', async () => {
      const invalidTeamData = {}; // Missing required name
      
      const response = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(invalidTeamData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Validation working:', response.body.error || response.body.message);
    });

    // TODO: Add color validation test once API validation is stricter
    it.skip('should validate color format', async () => {
      const teamData = {
        name: `Color Test Team ${Date.now()}`,
        homeKitPrimary: 'red' // Invalid format - should be hex like #FF0000
      };
      
      const response = await apiRequest
        .post('/api/v1/teams')
        .send(teamData)
        .expect(400);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('Color validation working:', response.body.error || response.body.message);
    });

    // TODO: Add duplicate name test once API properly handles unique constraints
    it.skip('should handle duplicate team names', async () => {
      const teamName = `Duplicate Team ${Date.now()}`;
      const teamData = { name: teamName };
      
      // Create first team
      const firstResponse = await apiRequest
        .post('/api/v1/teams')
        .send(teamData)
        .expect(201);
      
      createdTeamIds.push(firstResponse.body.id);
      
      // Try to create duplicate - should return 409 Conflict
      const duplicateResponse = await apiRequest
        .post('/api/v1/teams')
        .send(teamData)
        .expect(409);
      
      expect(duplicateResponse.body.error || duplicateResponse.body.message).toBeDefined();
      console.log('Duplicate name validation working');
    });
  });

  describe('GET /api/v1/teams', () => {
    it('should require authentication', async () => {
      await apiRequest
        .get('/api/v1/teams')
        .expect(401);
    });

    it('should return only user\'s own teams', async () => {
      // Create teams for different users
      const testUserTeam = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send({ name: `TestUser Team ${Date.now()}` })
        .expect(201);
      
      const otherUserTeam = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(otherUser))
        .send({ name: `OtherUser Team ${Date.now()}` })
        .expect(201);
      
      createdTeamIds.push(testUserTeam.body.id, otherUserTeam.body.id);
      
      // Test user should only see their own team
      const testUserResponse = await apiRequest
        .get('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      const testUserTeamIds = testUserResponse.body.data.map((team: any) => team.id);
      expect(testUserTeamIds).toContain(testUserTeam.body.id);
      expect(testUserTeamIds).not.toContain(otherUserTeam.body.id);
      
      console.log('Ownership isolation working for GET /teams');
    });


    it('should support search functionality', async () => {
      // Create a test team first
      const teamData = {
        name: `Searchable United FC ${Date.now()}`
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      createdTeamIds.push(createResponse.body.id);
      
      // Search for the team
      const searchTerm = 'United';
      const response = await apiRequest
        .get(`/api/v1/teams?search=${searchTerm}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      // Should find our team
      const foundTeam = response.body.data.find((team: any) => team.id === createResponse.body.id);
      expect(foundTeam).toBeDefined();
      
      console.log('Search functionality working, found teams:', response.body.data.length);
    });
  });

  describe('GET /api/v1/teams/:id', () => {
    it('should require authentication', async () => {
      const teamId = randomUUID();
      await apiRequest
        .get(`/api/v1/teams/${teamId}`)
        .expect(401);
    });

    it('should return user\'s own team', async () => {
      // Create team first
      const teamData = {
        name: `Specific Team ${Date.now()}`,
        homeKitPrimary: '#FF0000'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      createdTeamIds.push(createResponse.body.id);
      
      // Get the specific team
      const response = await apiRequest
        .get(`/api/v1/teams/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        name: teamData.name,
        homeKitPrimary: teamData.homeKitPrimary
      });
      
      console.log('Specific team retrieval working');
    });


    it('should return 404 for non-existent team', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .get(`/api/v1/teams/${nonExistentId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for non-existent team');
    });
  });

  describe('PUT /api/v1/teams/:id', () => {
    it('should require authentication', async () => {
      const teamId = randomUUID();
      await apiRequest
        .put(`/api/v1/teams/${teamId}`)
        .send({ name: 'Test' })
        .expect(401);
    });

    it('should update a team', async () => {
      // Create team first
      const teamData = {
        name: `Updatable Team ${Date.now()}`,
        homeKitPrimary: '#FF0000'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      createdTeamIds.push(createResponse.body.id);
      
      // Update the team
      const updateData = {
        name: `Updated Team ${Date.now()}`,
        homeKitPrimary: '#00FF00'
      };
      
      const response = await apiRequest
        .put(`/api/v1/teams/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        name: updateData.name,
        homeKitPrimary: updateData.homeKitPrimary
      });
      
      console.log('Team update working');
    });

    it('should handle partial updates', async () => {
      // Create team first
      const teamData = {
        name: `Partial Update Team ${Date.now()}`,
        homeKitPrimary: '#FF0000',
        homeKitSecondary: '#FFFFFF'
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      createdTeamIds.push(createResponse.body.id);
      
      // Partial update (only name)
      const updateData = {
        name: `Partially Updated Team ${Date.now()}`
      };
      
      const response = await apiRequest
        .put(`/api/v1/teams/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .send(updateData)
        .expect(200);
      
      expect(response.body).toMatchObject({
        id: createResponse.body.id,
        name: updateData.name,
        homeKitPrimary: teamData.homeKitPrimary, // Should remain unchanged
        homeKitSecondary: teamData.homeKitSecondary // Should remain unchanged
      });
      
      console.log('Partial team update working');
    });

  });

  describe('DELETE /api/v1/teams/:id', () => {
    it('should require authentication', async () => {
      const teamId = randomUUID();
      await apiRequest
        .delete(`/api/v1/teams/${teamId}`)
        .expect(401);
    });

    it('should delete a team', async () => {
      // Create team first
      const teamData = {
        name: `Deletable Team ${Date.now()}`
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      // Delete the team
      await apiRequest
        .delete(`/api/v1/teams/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify deletion - should return 404
      await apiRequest
        .get(`/api/v1/teams/${createResponse.body.id}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      console.log('Team deletion working');
      
      // Don't add to cleanup array since it's already deleted
    });

    it('should return 404 when deleting non-existent team', async () => {
      const nonExistentId = randomUUID();
      
      const response = await apiRequest
        .delete(`/api/v1/teams/${nonExistentId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);
      
      expect(response.body.error || response.body.message).toBeDefined();
      console.log('404 handling working for team deletion');
    });


    it('should perform soft delete (set deletedAt)', async () => {
      // Create team
      const teamData = {
        name: `Soft Delete Team ${Date.now()}`
      };
      
      const createResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);
      
      const teamId = createResponse.body.id;
      
      // Delete the team
      await apiRequest
        .delete(`/api/v1/teams/${teamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);
      
      // Verify soft delete in database
      const deletedTeam = await prisma.team.findUnique({
        where: { id: teamId }
      });
      
      expect(deletedTeam).toBeTruthy();
      expect(deletedTeam!.is_deleted).toBe(true);
      expect(deletedTeam!.deleted_at).toBeTruthy();
      expect(deletedTeam!.deleted_by_user_id).toBe(testUser.id);
      
      console.log('Soft delete working correctly');
    });

    it('should restore soft-deleted team when creating same team again', async () => {
      // 1. Create a team
      const teamData = {
        name: 'Soft Delete Restoration Test Team',
        homeKitPrimary: '#FF0000'
      };

      const createResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(teamData)
        .expect(201);

      const originalTeamId = createResponse.body.id;
      console.log('Original team created:', originalTeamId);

      // 2. Delete the team (soft delete)
      await apiRequest
        .delete(`/api/v1/teams/${originalTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(204);

      // Verify it's soft deleted (should return 404)
      await apiRequest
        .get(`/api/v1/teams/${originalTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(404);

      console.log('Team soft deleted successfully');

      // 3. Create the same team again (same unique constraints: name + created_by_user_id)
      const restoredTeamData = {
        name: 'Soft Delete Restoration Test Team', // Same name
        homeKitPrimary: '#00FF00' // Different color
      };

      const restoreResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(restoredTeamData)
        .expect(201);

      // 4. Verify it's the same record restored (same ID)
      expect(restoreResponse.body.id).toBe(originalTeamId);
      expect(restoreResponse.body.name).toBe(restoredTeamData.name);
      expect(restoreResponse.body.homeKitPrimary).toBe(restoredTeamData.homeKitPrimary);

      console.log('Team restored with same ID:', restoreResponse.body.id);

      // 5. Verify the team is now accessible again
      const getResponse = await apiRequest
        .get(`/api/v1/teams/${originalTeamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .expect(200);

      expect(getResponse.body.id).toBe(originalTeamId);
      expect(getResponse.body.homeKitPrimary).toBe(restoredTeamData.homeKitPrimary);

      console.log('Soft delete restoration working - same team ID restored with updated data');

      // Add to cleanup
      createdTeamIds.push(originalTeamId);
    });
  });

  describe('Authorization Tests', () => {
    let testTeamIdByTestUser: string;
    let testTeamIdByOtherUser: string;

    beforeEach(async () => {
      // Create a team by testUser
      const testUserTeam = {
        name: `Test User Team ${Date.now()}`,
        homeKitPrimary: '#FF0000'
      };

      const testUserResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(testUser))
        .send(testUserTeam)
        .expect(201);

      testTeamIdByTestUser = testUserResponse.body.id;

      // Create a team by otherUser
      const otherUserTeam = {
        name: `Other User Team ${Date.now()}`,
        homeKitPrimary: '#0000FF'
      };

      const otherUserResponse = await apiRequest
        .post('/api/v1/teams')
        .set(authHelper.getAuthHeader(otherUser))
        .send(otherUserTeam)
        .expect(201);

      testTeamIdByOtherUser = otherUserResponse.body.id;
    });

    afterEach(async () => {
      // Clean up authorization test data
      try {
        await prisma.team.deleteMany({
          where: { 
            id: { in: [testTeamIdByTestUser, testTeamIdByOtherUser] }
          }
        });
        console.log('Authorization test data cleaned up successfully');
      } catch (error) {
        console.warn('Authorization cleanup warning (non-fatal):', error);
      }
    });

    describe('User Isolation', () => {
      it('should not allow users to see other users teams in list', async () => {
        const response = await apiRequest
          .get('/api/v1/teams')
          .set(authHelper.getAuthHeader(testUser))
          .expect(200);

        // testUser should only see their own teams
        expect(response.body.data).toBeInstanceOf(Array);
        
        // Check that otherUser's team is not in the list
        const teamIds = response.body.data.map((team: any) => team.id);
        expect(teamIds).toContain(testTeamIdByTestUser);
        expect(teamIds).not.toContain(testTeamIdByOtherUser);

        console.log('User isolation working for GET /teams');
      });

      it('should not allow users to access other users teams by ID', async () => {
        await apiRequest
          .get(`/api/v1/teams/${testTeamIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Access denied to other user\'s team');
      });

      it('should not allow users to update other users teams', async () => {
        const updateData = {
          name: 'Hacked Team',
          homeKitPrimary: '#FFFFFF'
        };

        await apiRequest
          .put(`/api/v1/teams/${testTeamIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .send(updateData)
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Update access denied to other user\'s team');
      });

      it('should not allow users to delete other users teams', async () => {
        await apiRequest
          .delete(`/api/v1/teams/${testTeamIdByOtherUser}`)
          .set(authHelper.getAuthHeader(testUser))
          .expect(404); // Should return 404 (not found) for access denied

        console.log('Delete access denied to other user\'s team');
      });
    });

    describe('Admin Privileges', () => {
      it('should allow admin to see all teams in list', async () => {
        const response = await apiRequest
          .get('/api/v1/teams')
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        // Admin should see teams from all users
        expect(response.body.data).toBeInstanceOf(Array);
        
        const teamIds = response.body.data.map((team: any) => team.id);
        expect(teamIds).toContain(testTeamIdByTestUser);
        expect(teamIds).toContain(testTeamIdByOtherUser);

        console.log('Admin can see all teams');
      });

      it('should allow admin to access any team by ID', async () => {
        // Admin should be able to access testUser's team
        const testUserTeamResponse = await apiRequest
          .get(`/api/v1/teams/${testTeamIdByTestUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(testUserTeamResponse.body.id).toBe(testTeamIdByTestUser);

        // Admin should be able to access otherUser's team
        const otherUserTeamResponse = await apiRequest
          .get(`/api/v1/teams/${testTeamIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(200);

        expect(otherUserTeamResponse.body.id).toBe(testTeamIdByOtherUser);

        console.log('Admin can access any team');
      });

      it('should allow admin to update any team', async () => {
        const updateData = {
          name: 'Admin Updated Team',
          homeKitPrimary: '#FFFF00'
        };

        const response = await apiRequest
          .put(`/api/v1/teams/${testTeamIdByOtherUser}`)
          .set(authHelper.getAuthHeader(adminUser))
          .send(updateData)
          .expect(200);

        expect(response.body.name).toBe(updateData.name);
        expect(response.body.homeKitPrimary).toBe(updateData.homeKitPrimary);

        console.log('Admin can update any team');
      });

      it('should allow admin to delete any team', async () => {
        // Create a temporary team to delete
        const tempTeam = {
          name: `Temp Team for Deletion ${Date.now()}`,
          homeKitPrimary: '#FFFF00'
        };

        const createResponse = await apiRequest
          .post('/api/v1/teams')
          .set(authHelper.getAuthHeader(otherUser))
          .send(tempTeam)
          .expect(201);

        const tempTeamId = createResponse.body.id;

        // Admin should be able to delete it
        await apiRequest
          .delete(`/api/v1/teams/${tempTeamId}`)
          .set(authHelper.getAuthHeader(adminUser))
          .expect(204);

        // Verify it's soft deleted (should return 404 for regular users)
        await apiRequest
          .get(`/api/v1/teams/${tempTeamId}`)
          .set(authHelper.getAuthHeader(otherUser))
          .expect(404);

        console.log('Admin can delete any team');
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple team creation', async () => {
      const teamCount = 5;
      const teams = Array.from({ length: teamCount }, (_, i) => ({
        name: `Performance Team ${i + 1} ${Date.now()}`
      }));
      
      const startTime = Date.now();
      
      const promises = teams.map(team =>
        apiRequest.post('/api/v1/teams').set(authHelper.getAuthHeader(testUser)).send(team)
      );
      
      const responses = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
        createdTeamIds.push(response.body.id);
      });
      
      const avgTime = totalTime / teamCount;
      expect(avgTime).toBeLessThan(200); // Average < 200ms per team
      
      console.log(`${teamCount} teams created: ${totalTime}ms total, ${avgTime.toFixed(1)}ms avg`);
    });
  });
});