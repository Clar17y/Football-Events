import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { 
  transformPlayerTeam, 
  transformPlayerTeamCreateRequest, 
  transformPlayerTeamUpdateRequest,
  transformPlayerTeams,
  safeTransformPlayerTeam
} from '../../../shared/types/transformers';
import type { 
  PrismaPlayerTeam, 
  PrismaPlayerTeamCreateInput, 
  PrismaPlayerTeamUpdateInput 
} from '../../../shared/types/prisma';
import type { 
  PlayerTeam, 
  PlayerTeamCreateRequest, 
  PlayerTeamUpdateRequest 
} from '../../../shared/types/frontend';
import { 
  validateTimestamps,
  validateRoundTripTransformation
} from './shared-test-patterns';
import { SchemaTestUserHelper } from './test-user-helper';

const prisma = new PrismaClient();

describe('PlayerTeam Schema Alignment Tests', () => {
  let testUserId: string;
  let testPlayerId: string;
  let testTeamId: string;
  let userHelper: SchemaTestUserHelper;

  beforeAll(async () => {
    // Create test user helper
    userHelper = new SchemaTestUserHelper(prisma);
    testUserId = await userHelper.createTestUser('USER');
    
    // Create test player
    const testPlayer = await prisma.player.create({
      data: {
        name: 'Test Player',
        created_by_user_id: testUserId,
      }
    });
    testPlayerId = testPlayer.id;
    
    // Create test team
    const testTeam = await prisma.team.create({
      data: {
        name: 'Test Team',
        created_by_user_id: testUserId,
      }
    });
    testTeamId = testTeam.id;
  });

  afterEach(async () => {
    // Clean up player_teams created during tests
    await prisma.player_teams.deleteMany({
      where: {
        created_by_user_id: testUserId
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.player_teams.deleteMany({
      where: {
        created_by_user_id: testUserId
      }
    });
    await prisma.player.deleteMany({
      where: {
        created_by_user_id: testUserId
      }
    });
    await prisma.team.deleteMany({
      where: {
        created_by_user_id: testUserId
      }
    });
    await userHelper.cleanup();
    await prisma.$disconnect();
  });

  describe('transformPlayerTeam', () => {
    it('should correctly transform PrismaPlayerTeam to PlayerTeam', async () => {
      // Create a player team in the database
      const prismaPlayerTeam = await prisma.player_teams.create({
        data: {
          player_id: testPlayerId,
          team_id: testTeamId,
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-12-31'),
          created_by_user_id: testUserId,
        }
      });

      const frontendPlayerTeam = transformPlayerTeam(prismaPlayerTeam);

      // Verify the transformation
      expect(frontendPlayerTeam).toEqual({
        id: prismaPlayerTeam.id,
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        createdAt: prismaPlayerTeam.created_at.toISOString(),
        updatedAt: undefined,
        createdByUserId: testUserId,
        deletedAt: undefined,
        deletedByUserId: undefined,
        isDeleted: false,
      });
    });

    it('should handle null end_date correctly', async () => {
      const prismaPlayerTeam = await prisma.player_teams.create({
        data: {
          player_id: testPlayerId,
          team_id: testTeamId,
          start_date: new Date('2024-01-01'),
          created_by_user_id: testUserId,
        }
      });

      const frontendPlayerTeam = transformPlayerTeam(prismaPlayerTeam);

      expect(frontendPlayerTeam.endDate).toBeUndefined();
    });
  });

  describe('transformPlayerTeamCreateRequest', () => {
    it('should correctly transform PlayerTeamCreateRequest to PrismaPlayerTeamCreateInput', () => {
      const createRequest: PlayerTeamCreateRequest = {
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };

      const prismaInput = transformPlayerTeamCreateRequest(createRequest, testUserId);

      expect(prismaInput).toEqual({
        player_id: testPlayerId,
        team_id: testTeamId,
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        created_by_user_id: testUserId,
      });
    });

    it('should handle optional endDate correctly', () => {
      const createRequest: PlayerTeamCreateRequest = {
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: new Date('2024-01-01'),
      };

      const prismaInput = transformPlayerTeamCreateRequest(createRequest, testUserId);

      expect(prismaInput.end_date).toBeNull();
    });
  });

  describe('transformPlayerTeamUpdateRequest', () => {
    it('should correctly transform PlayerTeamUpdateRequest to PrismaPlayerTeamUpdateInput', () => {
      const updateRequest: PlayerTeamUpdateRequest = {
        playerId: testPlayerId,
        teamId: testTeamId,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-11-30'),
      };

      const prismaInput = transformPlayerTeamUpdateRequest(updateRequest);

      expect(prismaInput).toEqual({
        player_id: testPlayerId,
        team_id: testTeamId,
        start_date: new Date('2024-02-01'),
        end_date: new Date('2024-11-30'),
      });
    });

    it('should handle partial updates correctly', () => {
      const updateRequest: PlayerTeamUpdateRequest = {
        endDate: new Date('2024-06-30'),
      };

      const prismaInput = transformPlayerTeamUpdateRequest(updateRequest);

      expect(Object.keys(prismaInput)).toEqual(['end_date']);
      expect(prismaInput.end_date).toEqual(new Date('2024-06-30'));
    });
  });

  describe('transformPlayerTeams (array transformation)', () => {
    it('should correctly transform array of PrismaPlayerTeam to PlayerTeam[]', async () => {
      // Create multiple player teams
      const prismaPlayerTeams = await Promise.all([
        prisma.player_teams.create({
          data: {
            player_id: testPlayerId,
            team_id: testTeamId,
            start_date: new Date('2024-01-01'),
            created_by_user_id: testUserId,
          }
        }),
        prisma.player_teams.create({
          data: {
            player_id: testPlayerId,
            team_id: testTeamId,
            start_date: new Date('2024-06-01'),
            end_date: new Date('2024-12-31'),
            created_by_user_id: testUserId,
          }
        })
      ]);

      const frontendPlayerTeams = transformPlayerTeams(prismaPlayerTeams);

      expect(frontendPlayerTeams).toHaveLength(2);
      expect(frontendPlayerTeams[0].playerId).toBe(testPlayerId);
      expect(frontendPlayerTeams[0].teamId).toBe(testTeamId);
      expect(frontendPlayerTeams[0].startDate).toEqual(new Date('2024-01-01'));
      expect(frontendPlayerTeams[0].endDate).toBeUndefined();
      
      expect(frontendPlayerTeams[1].playerId).toBe(testPlayerId);
      expect(frontendPlayerTeams[1].teamId).toBe(testTeamId);
      expect(frontendPlayerTeams[1].startDate).toEqual(new Date('2024-06-01'));
      expect(frontendPlayerTeams[1].endDate).toEqual(new Date('2024-12-31'));
    });
  });

  describe('safeTransformPlayerTeam', () => {
    it('should safely transform valid PrismaPlayerTeam', async () => {
      const prismaPlayerTeam = await prisma.player_teams.create({
        data: {
          player_id: testPlayerId,
          team_id: testTeamId,
          start_date: new Date('2024-01-01'),
          created_by_user_id: testUserId,
        }
      });

      const result = safeTransformPlayerTeam(prismaPlayerTeam);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(prismaPlayerTeam.id);
      expect(result?.playerId).toBe(testPlayerId);
      expect(result?.teamId).toBe(testTeamId);
      expect(result?.startDate).toEqual(new Date('2024-01-01'));
    });

    it('should safely handle null input', () => {
      const result = safeTransformPlayerTeam(null);
      expect(result).toBeNull();
    });
  });

  describe('PlayerTeam business logic validation', () => {
    it('should maintain referential integrity with player and team', async () => {
      const prismaPlayerTeam = await prisma.player_teams.create({
        data: {
          player_id: testPlayerId,
          team_id: testTeamId,
          start_date: new Date('2024-01-01'),
          created_by_user_id: testUserId,
        }
      });

      const frontendPlayerTeam = transformPlayerTeam(prismaPlayerTeam);

      // Verify the relationships exist
      const player = await prisma.player.findUnique({
        where: { id: frontendPlayerTeam.playerId }
      });
      const team = await prisma.team.findUnique({
        where: { id: frontendPlayerTeam.teamId }
      });

      expect(player).toBeTruthy();
      expect(team).toBeTruthy();
    });

    it('should handle date range logic correctly', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const prismaPlayerTeam = await prisma.player_teams.create({
        data: {
          player_id: testPlayerId,
          team_id: testTeamId,
          start_date: startDate,
          end_date: endDate,
          created_by_user_id: testUserId,
        }
      });

      const frontendPlayerTeam = transformPlayerTeam(prismaPlayerTeam);

      expect(frontendPlayerTeam.startDate.getTime()).toBe(startDate.getTime());
      expect(frontendPlayerTeam.endDate?.getTime()).toBe(endDate.getTime());
    });
  });
});