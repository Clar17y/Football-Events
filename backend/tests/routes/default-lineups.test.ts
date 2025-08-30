import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { app } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import { AuthTestHelper, TestUser } from '../api/auth-helpers';

const prisma = new PrismaClient();
const authHelper = new AuthTestHelper(app);

describe('Default Lineups API', () => {
  let testUser: TestUser;
  let teamId: string;
  let playerId1: string;
  let playerId2: string;

  beforeAll(async () => {
    // Create test user
    testUser = await authHelper.createTestUser();

    // Create test team
    const team = await prisma.team.create({
      data: {
        name: 'Test Team for Default Lineups',
        created_by_user_id: testUser.id
      }
    });
    teamId = team.id;

    // Create test players
    const player1 = await prisma.player.create({
      data: {
        name: 'Test Player 1',
        created_by_user_id: testUser.id
      }
    });
    playerId1 = player1.id;

    const player2 = await prisma.player.create({
      data: {
        name: 'Test Player 2',
        created_by_user_id: testUser.id
      }
    });
    playerId2 = player2.id;

    // Add players to team
    await prisma.player_teams.createMany({
      data: [
        {
          player_id: playerId1,
          team_id: teamId,
          start_date: new Date(),
          is_active: true,
          created_by_user_id: testUser.id
        },
        {
          player_id: playerId2,
          team_id: teamId,
          start_date: new Date(),
          is_active: true,
          created_by_user_id: testUser.id
        }
      ]
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.default_lineups.deleteMany({
      where: { created_by_user_id: testUser.id }
    });
    await prisma.player_teams.deleteMany({
      where: { created_by_user_id: testUser.id }
    });
    await prisma.player.deleteMany({
      where: { created_by_user_id: testUser.id }
    });
    await prisma.team.deleteMany({
      where: { created_by_user_id: testUser.id }
    });
    
    // Clean up users created by auth helper
    const userIds = authHelper.getCreatedUserIds();
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: userIds } }
      });
    }
    
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up any existing default lineups before each test
    await prisma.default_lineups.deleteMany({
      where: { team_id: teamId }
    });
  });

  describe('POST /api/v1/default-lineups', () => {
    it('should create a new default lineup successfully', async () => {
      const formationData = [
        {
          playerId: playerId1,
          position: 'GK',
          pitchX: 50,
          pitchY: 10
        },
        {
          playerId: playerId2,
          position: 'CB',
          pitchX: 50,
          pitchY: 30
        }
      ];

      const response = await request(app)
        .post('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          teamId,
          formation: formationData
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.teamId).toBe(teamId);
      expect(response.body.data.formation).toHaveLength(2);
      expect(response.body.message).toBe('Default lineup saved successfully');
    });

    it('should return 400 for invalid formation data', async () => {
      const response = await request(app)
        .post('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          teamId,
          formation: [] // Empty formation
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for formation with more than 11 players', async () => {
      const formationData = Array.from({ length: 12 }, (_, i) => ({
        playerId: playerId1, // Using same player (will fail validation)
        position: 'CB',
        pitchX: 50,
        pitchY: 30 + i
      }));

      const response = await request(app)
        .post('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          teamId,
          formation: formationData
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for formation with duplicate players', async () => {
      const formationData = [
        {
          playerId: playerId1,
          position: 'GK',
          pitchX: 50,
          pitchY: 10
        },
        {
          playerId: playerId1, // Duplicate player
          position: 'CB',
          pitchX: 50,
          pitchY: 30
        }
      ];

      const response = await request(app)
        .post('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          teamId,
          formation: formationData
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/api/v1/default-lineups')
        .send({
          teamId,
          formation: []
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/default-lineups/:teamId', () => {
    beforeEach(async () => {
      // Create a default lineup for testing
      const formationData = [
        {
          playerId: playerId1,
          position: 'GK',
          pitchX: 50,
          pitchY: 10
        }
      ];

      await request(app)
        .post('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          teamId,
          formation: formationData
        });
    });

    it('should retrieve default lineup successfully', async () => {
      const response = await request(app)
        .get(`/api/v1/default-lineups/${teamId}`)
        .set(authHelper.getAuthHeader(testUser));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.teamId).toBe(teamId);
      expect(response.body.data.formation).toHaveLength(1);
    });

    it('should return 404 for non-existent team', async () => {
      const fakeTeamId = '550e8400-e29b-41d4-a716-446655440000';
      
      const response = await request(app)
        .get(`/api/v1/default-lineups/${fakeTeamId}`)
        .set(authHelper.getAuthHeader(testUser));

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for invalid UUID', async () => {
      const response = await request(app)
        .get('/api/v1/default-lineups/invalid-uuid')
        .set(authHelper.getAuthHeader(testUser));

      expect(response.status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get(`/api/v1/default-lineups/${teamId}`);

      expect(response.status).toBe(401);
    });
  });

  describe('PUT /api/v1/default-lineups/:teamId', () => {
    beforeEach(async () => {
      // Create initial default lineup
      const formationData = [
        {
          playerId: playerId1,
          position: 'GK',
          pitchX: 50,
          pitchY: 10
        }
      ];

      await request(app)
        .post('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          teamId,
          formation: formationData
        });
    });

    it('should update default lineup successfully', async () => {
      const updatedFormation = [
        {
          playerId: playerId1,
          position: 'GK',
          pitchX: 50,
          pitchY: 15
        },
        {
          playerId: playerId2,
          position: 'CB',
          pitchX: 50,
          pitchY: 35
        }
      ];

      const response = await request(app)
        .put(`/api/v1/default-lineups/${teamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .send({
          formation: updatedFormation
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.formation).toHaveLength(2);
      expect(response.body.message).toBe('Default lineup updated successfully');
    });

    it('should return 400 when formation is missing', async () => {
      const response = await request(app)
        .put(`/api/v1/default-lineups/${teamId}`)
        .set(authHelper.getAuthHeader(testUser))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Formation data is required for update');
    });
  });

  describe('DELETE /api/v1/default-lineups/:teamId', () => {
    beforeEach(async () => {
      // Create default lineup to delete
      const formationData = [
        {
          playerId: playerId1,
          position: 'GK',
          pitchX: 50,
          pitchY: 10
        }
      ];

      await request(app)
        .post('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          teamId,
          formation: formationData
        });
    });

    it('should delete default lineup successfully', async () => {
      const response = await request(app)
        .delete(`/api/v1/default-lineups/${teamId}`)
        .set(authHelper.getAuthHeader(testUser));

      expect(response.status).toBe(204);
    });

    it('should return 404 for non-existent default lineup', async () => {
      // Delete the lineup first
      await request(app)
        .delete(`/api/v1/default-lineups/${teamId}`)
        .set(authHelper.getAuthHeader(testUser));

      // Try to delete again
      const response = await request(app)
        .delete(`/api/v1/default-lineups/${teamId}`)
        .set(authHelper.getAuthHeader(testUser));

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/default-lineups', () => {
    it('should return teams with default lineup status', async () => {
      const response = await request(app)
        .get('/api/v1/default-lineups')
        .set(authHelper.getAuthHeader(testUser));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      
      // Should include our test team
      const testTeam = response.body.data.find((team: any) => team.teamId === teamId);
      expect(testTeam).toBeDefined();
      expect(testTeam.teamName).toBe('Test Team for Default Lineups');
    });
  });

  describe('POST /api/v1/default-lineups/validate', () => {
    it('should validate formation successfully', async () => {
      const formationData = [
        {
          playerId: playerId1,
          position: 'GK',
          pitchX: 50,
          pitchY: 10
        }
      ];

      const response = await request(app)
        .post('/api/v1/default-lineups/validate')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          formation: formationData
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(true);
      expect(response.body.data.errors).toHaveLength(0);
    });

    it('should return validation errors for invalid formation', async () => {
      const invalidFormation = [
        {
          playerId: 'invalid-id',
          position: '',
          pitchX: -10,
          pitchY: 150
        }
      ];

      const response = await request(app)
        .post('/api/v1/default-lineups/validate')
        .set(authHelper.getAuthHeader(testUser))
        .send({
          formation: invalidFormation
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBe(false);
      expect(response.body.data.errors.length).toBeGreaterThan(0);
    });

    it('should return 400 when formation is missing', async () => {
      const response = await request(app)
        .post('/api/v1/default-lineups/validate')
        .set(authHelper.getAuthHeader(testUser))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});