import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Lineup,
  LineupCreateRequest,
  LineupUpdateRequest,
  transformLineup,
  transformLineupCreateRequest,
  transformLineupUpdateRequest,
  transformLineups,
  safeTransformLineup,
  PrismaLineup
} from '@shared/types';
import { SchemaTestUserHelper } from './test-user-helper';

// Helper function for timestamp validation
const expectValidTimestamp = (timestamp: Date | undefined) => {
  expect(timestamp).toBeInstanceOf(Date);
  expect(timestamp!.getTime()).toBeGreaterThan(0);
};

describe('Lineup Entity Schema Alignment', () => {
  let prisma: PrismaClient;
  let testSeasonId: string;
  let testHomeTeamId: string;
  let testAwayTeamId: string;
  let testMatchId: string;
  let testPlayerId: string;
  let testPositionCode: string;
  let testUserId: string;
  let userHelper: SchemaTestUserHelper;

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();

    // Initialize user helper and create test user
    userHelper = new SchemaTestUserHelper(prisma);
    testUserId = await userHelper.createTestUser('USER');

    // Create test dependencies
    // Create test season
    const season = await prisma.seasons.create({
      data: { 
        label: 'Lineup Test Season 2024',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        is_current: false,
        created_by_user_id: testUserId
      }
    });
    testSeasonId = season.season_id;

    // Create test teams
    const homeTeam = await prisma.team.create({
      data: {
        name: 'Lineup Home Team FC',
        home_kit_primary: '#FF0000',
        away_kit_primary: '#0000FF',
        created_by_user_id: testUserId
      }
    });
    testHomeTeamId = homeTeam.id;

    const awayTeam = await prisma.team.create({
      data: {
        name: 'Lineup Away Team FC',
        home_kit_primary: '#00FF00',
        away_kit_primary: '#FFFF00',
        created_by_user_id: testUserId
      }
    });
    testAwayTeamId = awayTeam.id;

    // Create test match
    const match = await prisma.match.create({
      data: {
        season_id: testSeasonId,
        kickoff_ts: new Date('2024-07-06T15:00:00Z'),
        home_team_id: testHomeTeamId,
        away_team_id: testAwayTeamId,
        competition: 'Test League',
        venue: 'Test Stadium',
        created_by_user_id: testUserId
      }
    });
    testMatchId = match.match_id;

    // Create test player
    const player = await prisma.player.create({
      data: {
        name: 'Test Player',
        squad_number: 10,
        created_by_user_id: testUserId
      }
    });
    testPlayerId = player.id;

    // Create test positions or use existing
    const positionsToCreate = [
      { pos_code: 'GK', long_name: 'Goalkeeper' },
      { pos_code: 'CB', long_name: 'Centre Back' },
      { pos_code: 'LB', long_name: 'Left Back' }
    ];

    for (const posData of positionsToCreate) {
      const existing = await prisma.positions.findUnique({
        where: { pos_code: posData.pos_code }
      });
      
      if (!existing) {
        await prisma.positions.create({ data: posData });
      }
    }
    
    testPositionCode = 'GK';
  });

  afterEach(async () => {
    // Clean up lineup entries after each test
    await prisma.lineup.deleteMany({
      where: { match_id: testMatchId }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.lineup.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.positions.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.seasons.deleteMany({});
    
    await userHelper.cleanup();
    await prisma.$disconnect();
  });

  describe('Schema Alignment - Prisma to Frontend', () => {
    it('should transform basic lineup data correctly', async () => {
      // Create test lineup
      const prismaLineup = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          end_min: 45,
          position: testPositionCode,
          created_by_user_id: testUserId
        }
      });

      const frontendLineup = transformLineup(prismaLineup);

      expect(frontendLineup).toEqual({
        matchId: testMatchId,
        playerId: testPlayerId,
        startMinute: 0,
        endMinute: 45,
        position: testPositionCode,
        createdAt: expect.any(Date),
        updatedAt: undefined
      });

      expectValidTimestamp(frontendLineup.createdAt);
    });

    it('should handle null end_min correctly', async () => {
      const prismaLineup = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          end_min: null,
          position: testPositionCode,
          created_by_user_id: testUserId
        }
      });

      const frontendLineup = transformLineup(prismaLineup);

      expect(frontendLineup.endMinute).toBeUndefined();
    });

    it('should handle updated_at timestamp correctly', async () => {
      const prismaLineup = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      // Update to set updated_at
      const updatedLineup = await prisma.lineup.update({
        where: {
          match_id_player_id_start_min: {
            match_id: testMatchId,
            player_id: testPlayerId,
            start_min: 0
          }
        },
        data: { position: 'CB' }
      });

      const frontendLineup = transformLineup(updatedLineup);

      expect(frontendLineup.updatedAt).toBeDefined();
      expectValidTimestamp(frontendLineup.updatedAt!);
    });
  });

  describe('Schema Alignment - Frontend to Prisma', () => {
    it('should transform LineupCreateRequest correctly', () => {
      const createRequest: LineupCreateRequest = {
        matchId: testMatchId,
        playerId: testPlayerId,
        startMinute: 0,
        endMinute: 90,
        position: testPositionCode
      };

      const prismaInput = transformLineupCreateRequest(createRequest, testUserId);

      expect(prismaInput).toEqual({
        match_id: testMatchId,
        player_id: testPlayerId,
        start_min: 0,
        end_min: 90,
        position: testPositionCode,
        created_by_user_id: testUserId
      });
    });

    it('should handle optional startMinute with default', () => {
      const createRequest: LineupCreateRequest = {
        matchId: testMatchId,
        playerId: testPlayerId,
        position: testPositionCode
      };

      const prismaInput = transformLineupCreateRequest(createRequest, testUserId);

      expect(prismaInput.start_min).toBe(0);
      expect(prismaInput.end_min).toBeNull();
      expect(prismaInput.created_by_user_id).toBe(testUserId);
    });

    it('should transform LineupUpdateRequest correctly', () => {
      const updateRequest: LineupUpdateRequest = {
        startMinute: 15,
        endMinute: 75,
        position: 'CB'
      };

      const prismaInput = transformLineupUpdateRequest(updateRequest);

      expect(prismaInput).toEqual({
        start_min: 15,
        end_min: 75,
        position: 'CB'
      });
    });

    it('should handle partial LineupUpdateRequest', () => {
      const updateRequest: LineupUpdateRequest = {
        position: 'LB'
      };

      const prismaInput = transformLineupUpdateRequest(updateRequest);

      expect(prismaInput).toEqual({
        position: 'LB'
      });
      expect(prismaInput.start_min).toBeUndefined();
      expect(prismaInput.end_min).toBeUndefined();
    });
  });

  describe('Composite Primary Key Operations', () => {
    it('should create lineup with composite key', async () => {
      const lineupData = {
        match_id: testMatchId,
        player_id: testPlayerId,
        start_min: 0,
        position: testPositionCode
      };

      const created = await prisma.lineup.create({ data: lineupData });

      expect(created.match_id).toBe(testMatchId);
      expect(created.player_id).toBe(testPlayerId);
      expect(created.start_min).toBe(0);
    });

    it('should allow same player multiple lineup entries with different start times', async () => {
      // Create initial lineup
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          end_min: 45,
          position: testPositionCode
        }
      });

      // Create substitution entry (same player, different start time)
      const substitution = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 60,
          position: 'CB'
        }
      });

      expect(substitution.start_min).toBe(60);
      expect(substitution.position).toBe('CB');
    });

    it('should prevent duplicate composite keys', async () => {
      // Create initial lineup
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      // Attempt to create duplicate
      await expect(
        prisma.lineup.create({
          data: {
            match_id: testMatchId,
            player_id: testPlayerId,
            start_min: 0,
            position: 'CB'
          }
        })
      ).rejects.toThrow();
    });

    it('should update using composite key', async () => {
      // Create lineup
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      // Update using composite key
      const updated = await prisma.lineup.update({
        where: {
          match_id_player_id_start_min: {
            match_id: testMatchId,
            player_id: testPlayerId,
            start_min: 0
          }
        },
        data: { end_min: 90 }
      });

      expect(updated.end_min).toBe(90);
    });

    it('should delete using composite key', async () => {
      // Create lineup
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      // Delete using composite key
      await prisma.lineup.delete({
        where: {
          match_id_player_id_start_min: {
            match_id: testMatchId,
            player_id: testPlayerId,
            start_min: 0
          }
        }
      });

      // Verify deletion
      const found = await prisma.lineup.findUnique({
        where: {
          match_id_player_id_start_min: {
            match_id: testMatchId,
            player_id: testPlayerId,
            start_min: 0
          }
        }
      });

      expect(found).toBeNull();
    });
  });

  describe('Foreign Key Relationships', () => {
    it('should enforce match foreign key constraint', async () => {
      const invalidMatchId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.lineup.create({
          data: {
            match_id: invalidMatchId,
            player_id: testPlayerId,
            start_min: 0,
            position: testPositionCode
          }
        })
      ).rejects.toThrow();
    });

    it('should enforce player foreign key constraint', async () => {
      const invalidPlayerId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.lineup.create({
          data: {
            match_id: testMatchId,
            player_id: invalidPlayerId,
            start_min: 0,
            position: testPositionCode
          }
        })
      ).rejects.toThrow();
    });

    it('should enforce position foreign key constraint', async () => {
      await expect(
        prisma.lineup.create({
          data: {
            match_id: testMatchId,
            player_id: testPlayerId,
            start_min: 0,
            position: 'INVALID_POS'
          }
        })
      ).rejects.toThrow();
    });

    it('should cascade delete when match is deleted', async () => {
      // Create lineup
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      // Delete match (should cascade)
      await prisma.match.delete({
        where: { match_id: testMatchId }
      });

      // Verify lineup was deleted
      const lineups = await prisma.lineup.findMany({
        where: { match_id: testMatchId }
      });

      expect(lineups).toHaveLength(0);

      // Recreate match for other tests
      const newMatch = await prisma.match.create({
        data: {
          season_id: testSeasonId,
          kickoff_ts: new Date('2024-07-06T15:00:00Z'),
          home_team_id: testHomeTeamId,
          away_team_id: testAwayTeamId,
          competition: 'Test League',
          venue: 'Test Stadium'
        }
      });
      testMatchId = newMatch.match_id;
    });

    it('should cascade delete when player is deleted', async () => {
      // Create lineup
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      // Delete player (should cascade)
      await prisma.player.delete({
        where: { id: testPlayerId }
      });

      // Verify lineup was deleted
      const lineups = await prisma.lineup.findMany({
        where: { player_id: testPlayerId }
      });

      expect(lineups).toHaveLength(0);

      // Recreate player for other tests
      const newPlayer = await prisma.player.create({
        data: {
          name: 'Test Player Recreated',
          current_team: testHomeTeamId,
          squad_number: 11
        }
      });
      testPlayerId = newPlayer.id;
    });
  });

  describe('Time Validation and Business Logic', () => {
    it('should handle start_min of 0 (match start)', async () => {
      const lineup = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      expect(lineup.start_min).toBe(0);
    });

    it('should handle fractional minutes for precise timing', async () => {
      const lineup = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 45.5,
          end_min: 90.25,
          position: testPositionCode
        }
      });

      expect(lineup.start_min).toBe(45.5);
      expect(lineup.end_min).toBe(90.25);
    });

    it('should handle substitution scenario', async () => {
      // Player starts match
      const starter = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          end_min: 60,
          position: testPositionCode
        }
      });

      // Same player comes back as substitute
      const substitute = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 75,
          position: 'CB'
        }
      });

      expect(starter.end_min).toBe(60);
      expect(substitute.start_min).toBe(75);
      expect(substitute.end_min).toBeNull();
    });
  });

  describe('Array and Utility Functions', () => {
    it('should transform array of lineups', async () => {
      // Create multiple lineups
      const lineupData = [
        {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          end_min: 45,
          position: testPositionCode
        },
        {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 60,
          position: 'CB'
        }
      ];

      const createdLineups = await Promise.all(
        lineupData.map(data => prisma.lineup.create({ data }))
      );

      const frontendLineups = transformLineups(createdLineups);

      expect(frontendLineups).toHaveLength(2);
      expect(frontendLineups[0].endMinute).toBe(45);
      expect(frontendLineups[1].endMinute).toBeUndefined();
    });

    it('should safely transform null lineup', () => {
      const result = safeTransformLineup(null);
      expect(result).toBeNull();
    });

    it('should safely transform valid lineup', async () => {
      const prismaLineup = await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      const result = safeTransformLineup(prismaLineup);

      expect(result).not.toBeNull();
      expect(result!.matchId).toBe(testMatchId);
    });
  });

  describe('Query Operations', () => {
    it('should find lineups by match', async () => {
      // Create test lineups
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      const lineups = await prisma.lineup.findMany({
        where: { match_id: testMatchId }
      });

      expect(lineups).toHaveLength(1);
      expect(lineups[0].match_id).toBe(testMatchId);
    });

    it('should find lineups by player', async () => {
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      const lineups = await prisma.lineup.findMany({
        where: { player_id: testPlayerId }
      });

      expect(lineups).toHaveLength(1);
      expect(lineups[0].player_id).toBe(testPlayerId);
    });

    it('should find lineups by position', async () => {
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      const lineups = await prisma.lineup.findMany({
        where: { position: testPositionCode }
      });

      expect(lineups).toHaveLength(1);
      expect(lineups[0].position).toBe(testPositionCode);
    });

    it('should order lineups by start_min', async () => {
      // Create lineups in random order
      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 60,
          position: 'CB'
        }
      });

      await prisma.lineup.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          start_min: 0,
          position: testPositionCode
        }
      });

      const lineups = await prisma.lineup.findMany({
        where: { match_id: testMatchId },
        orderBy: { start_min: 'asc' }
      });

      expect(lineups).toHaveLength(2);
      expect(lineups[0].start_min).toBe(0);
      expect(lineups[1].start_min).toBe(60);
    });
  });
});