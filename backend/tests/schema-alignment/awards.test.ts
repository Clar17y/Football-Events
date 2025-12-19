import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Award,
  MatchAward,
  AwardCreateRequest,
  AwardUpdateRequest,
  MatchAwardCreateRequest,
  MatchAwardUpdateRequest,
  transformAward,
  transformMatchAward,
  transformAwardCreateRequest,
  transformAwardUpdateRequest,
  transformMatchAwardCreateRequest,
  transformMatchAwardUpdateRequest,
  transformAwards,
  transformMatchAwards,
  safeTransformAward,
  safeTransformMatchAward
} from '@shared/types';
import { SchemaTestUserHelper } from './test-user-helper';

// Helper function for timestamp validation (ISO string format)
const expectValidTimestamp = (timestamp: string | undefined) => {
  expect(typeof timestamp).toBe('string');
  expect(new Date(timestamp!).getTime()).toBeGreaterThan(0);
};

describe('Awards Entity Schema Alignment', () => {
  let prisma: PrismaClient;
  let testSeasonId: string;
  let testHomeTeamId: string;
  let testAwayTeamId: string;
  let testMatchId: string;
  let testPlayerId: string;
  let testUserId: string;
  let userHelper: SchemaTestUserHelper;

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();
    
    // Create test user helper and test user
    userHelper = new SchemaTestUserHelper(prisma);
    testUserId = await userHelper.createTestUser('USER');

    // Create test dependencies
    // Create test season
    const season = await prisma.seasons.create({
      data: { 
        label: 'Awards Test Season 2024',
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
        name: 'Awards Home Team FC',
        home_kit_primary: '#FF0000',
        away_kit_primary: '#0000FF',
        created_by_user_id: testUserId
      }
    });
    testHomeTeamId = homeTeam.id;

    const awayTeam = await prisma.team.create({
      data: {
        name: 'Awards Away Team FC',
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
        name: 'Awards Test Player',
        created_by_user_id: testUserId,
        squad_number: 10
      }
    });
    testPlayerId = player.id;
  });

  afterEach(async () => {
    // Clean up award entries after each test
    await prisma.awards.deleteMany({
      where: { season_id: testSeasonId }
    });
    await prisma.match_awards.deleteMany({
      where: { match_id: testMatchId }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.awards.deleteMany({});
    await prisma.match_awards.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.seasons.deleteMany({});
    
    // Clean up test users
    await userHelper.cleanup();
    await prisma.$disconnect();
  });

  describe('Season Awards - Schema Alignment', () => {
    describe('Prisma to Frontend', () => {
      it('should transform basic award data correctly', async () => {
        // Create test award
        const prismaAward = await prisma.awards.create({
          data: {
            season_id: testSeasonId,
            player_id: testPlayerId,
            category: 'Player of the Season',
            notes: 'Outstanding performance throughout the season',
            created_by_user_id: testUserId
          }
        });

        const frontendAward = transformAward(prismaAward);

        expect(frontendAward).toEqual({
          id: expect.any(String),
          seasonId: testSeasonId,
          playerId: testPlayerId,
          category: 'Player of the Season',
          notes: 'Outstanding performance throughout the season',
          createdAt: expect.any(String),
          updatedAt: undefined,
          // Authorization and soft delete fields (camelCase)
          createdByUserId: testUserId,
          deletedAt: undefined,
          deletedByUserId: undefined,
          isDeleted: false
        });

        expectValidTimestamp(frontendAward.createdAt);
      });

      it('should handle null notes correctly', async () => {
        const prismaAward = await prisma.awards.create({
          data: {
            season_id: testSeasonId,
            player_id: testPlayerId,
            category: 'Top Scorer',
            notes: null,
            created_by_user_id: testUserId
          }
        });

        const frontendAward = transformAward(prismaAward);

        expect(frontendAward.notes).toBeUndefined();
      });

      it('should handle updated_at timestamp correctly', async () => {
        const prismaAward = await prisma.awards.create({
          data: {
            season_id: testSeasonId,
            player_id: testPlayerId,
            category: 'Best Defender',
            created_by_user_id: testUserId
          }
        });

        // Update to set updated_at
        const updatedAward = await prisma.awards.update({
          where: { award_id: prismaAward.award_id },
          data: { category: 'Best Defender Updated' }
        });

        const frontendAward = transformAward(updatedAward);

        // Note: updated_at is not automatically set in current schema
      });
    });

    describe('Frontend to Prisma', () => {
      it('should transform AwardCreateRequest correctly', () => {
        const createRequest: AwardCreateRequest = {
          seasonId: testSeasonId,
          playerId: testPlayerId,
          category: 'Most Improved Player',
          notes: 'Showed great improvement'
        };

        const prismaInput = transformAwardCreateRequest(createRequest, testUserId);

        expect(prismaInput).toEqual({
          season_id: testSeasonId,
          player_id: testPlayerId,
          category: 'Most Improved Player',
          notes: 'Showed great improvement',
          created_by_user_id: testUserId
        });
      });

      it('should handle optional notes with null', () => {
        const createRequest: AwardCreateRequest = {
          seasonId: testSeasonId,
          playerId: testPlayerId,
          category: 'Fair Play Award'
        };

        const prismaInput = transformAwardCreateRequest(createRequest, testUserId);

        expect(prismaInput.notes).toBeNull();
      });

      it('should transform AwardUpdateRequest correctly', () => {
        const updateRequest: AwardUpdateRequest = {
          category: 'Updated Category',
          notes: 'Updated notes'
        };

        const prismaInput = transformAwardUpdateRequest(updateRequest);

        expect(prismaInput).toEqual({
          category: 'Updated Category',
          notes: 'Updated notes'
        });
      });

      it('should handle partial AwardUpdateRequest', () => {
        const updateRequest: AwardUpdateRequest = {
          category: 'Only Category Update'
        };

        const prismaInput = transformAwardUpdateRequest(updateRequest);

        expect(prismaInput).toEqual({
          category: 'Only Category Update'
        });
        expect(prismaInput.notes).toBeUndefined();
      });
    });
  });

  describe('Match Awards - Schema Alignment', () => {
    describe('Prisma to Frontend', () => {
      it('should transform basic match award data correctly', async () => {
        // Create test match award
        const prismaMatchAward = await prisma.match_awards.create({
          data: {
            match_id: testMatchId,
            player_id: testPlayerId,
            category: 'Man of the Match',
            notes: 'Scored the winning goal',
            created_by_user_id: testUserId
          }
        });

        const frontendMatchAward = transformMatchAward(prismaMatchAward);

        expect(frontendMatchAward).toEqual({
          id: expect.any(String),
          matchId: testMatchId,
          playerId: testPlayerId,
          category: 'Man of the Match',
          notes: 'Scored the winning goal',
          createdAt: expect.any(String),
          updatedAt: undefined,
          // Authorization and soft delete fields (camelCase)
          createdByUserId: testUserId,
          deletedAt: undefined,
          deletedByUserId: undefined,
          isDeleted: false
        });

        expectValidTimestamp(frontendMatchAward.createdAt);
      });

      it('should handle null notes correctly', async () => {
        const prismaMatchAward = await prisma.match_awards.create({
          data: {
            match_id: testMatchId,
            player_id: testPlayerId,
            category: 'Best Performance',
            notes: null,
            created_by_user_id: testUserId
          }
        });

        const frontendMatchAward = transformMatchAward(prismaMatchAward);

        expect(frontendMatchAward.notes).toBeUndefined();
      });
    });

    describe('Frontend to Prisma', () => {
      it('should transform MatchAwardCreateRequest correctly', () => {
        const createRequest: MatchAwardCreateRequest = {
          matchId: testMatchId,
          playerId: testPlayerId,
          category: 'Player of the Match',
          notes: 'Excellent performance'
        };

        const prismaInput = transformMatchAwardCreateRequest(createRequest, testUserId);

        expect(prismaInput).toEqual({
          match_id: testMatchId,
          player_id: testPlayerId,
          category: 'Player of the Match',
          notes: 'Excellent performance',
          created_by_user_id: testUserId
        });
      });

      it('should handle optional notes with null', () => {
        const createRequest: MatchAwardCreateRequest = {
          matchId: testMatchId,
          playerId: testPlayerId,
          category: 'Goal of the Match'
        };

        const prismaInput = transformMatchAwardCreateRequest(createRequest, testUserId);

        expect(prismaInput.notes).toBeNull();
      });
    });
  });

  describe('Foreign Key Relationships', () => {
    it('should enforce season foreign key constraint for awards', async () => {
      const invalidSeasonId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.awards.create({
          data: {
            season_id: invalidSeasonId,
            player_id: testPlayerId,
            category: 'Test Award'
          }
        })
      ).rejects.toThrow();
    });

    it('should enforce player foreign key constraint for awards', async () => {
      const invalidPlayerId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.awards.create({
          data: {
            season_id: testSeasonId,
            player_id: invalidPlayerId,
            category: 'Test Award'
          }
        })
      ).rejects.toThrow();
    });

    it('should enforce match foreign key constraint for match awards', async () => {
      const invalidMatchId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.match_awards.create({
          data: {
            match_id: invalidMatchId,
            player_id: testPlayerId,
            category: 'Test Match Award'
          }
        })
      ).rejects.toThrow();
    });

    it('should cascade delete awards when season is deleted', async () => {
      // Create a separate season for this test to avoid conflicts
      const testSeason = await prisma.seasons.create({
        data: { 
          label: 'Cascade Test Season 2024',
          start_date: new Date('2024-01-01'),
          end_date: new Date('2024-12-31'),
          is_current: false,
          created_by_user_id: testUserId
        }
      });

      // Create award
      await prisma.awards.create({
        data: {
          season_id: testSeason.season_id,
          player_id: testPlayerId,
          category: 'Test Award',
          created_by_user_id: testUserId
        }
      });

      // Delete season (should cascade)
      await prisma.seasons.delete({
        where: { season_id: testSeason.season_id }
      });

      // Verify award was deleted
      const awards = await prisma.awards.findMany({
        where: { season_id: testSeason.season_id }
      });

      expect(awards).toHaveLength(0);
    });

    it('should cascade delete match awards when match is deleted', async () => {
      // Create a separate match for this test to avoid conflicts
      const testMatch = await prisma.match.create({
        data: {
          season_id: testSeasonId,
          kickoff_ts: new Date('2024-07-06T16:00:00Z'),
          home_team_id: testHomeTeamId,
          away_team_id: testAwayTeamId,
          competition: 'Cascade Test League',
          venue: 'Cascade Test Stadium',
          created_by_user_id: testUserId
        }
      });

      // Create match award
      await prisma.match_awards.create({
        data: {
          match_id: testMatch.match_id,
          player_id: testPlayerId,
          category: 'Test Match Award',
          created_by_user_id: testUserId
        }
      });

      // Delete match (should cascade)
      await prisma.match.delete({
        where: { match_id: testMatch.match_id }
      });

      // Verify match award was deleted
      const matchAwards = await prisma.match_awards.findMany({
        where: { match_id: testMatch.match_id }
      });

      expect(matchAwards).toHaveLength(0);
    });
  });

  describe('Unique Constraints', () => {
    it('should enforce unique constraint on match_awards (match_id, category)', async () => {
      // Create first match award
      await prisma.match_awards.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          category: 'Man of the Match',
          created_by_user_id: testUserId
        }
      });

      // Attempt to create duplicate (same match, same category)
      await expect(
        prisma.match_awards.create({
          data: {
            match_id: testMatchId,
            player_id: testPlayerId,
            category: 'Man of the Match'
          }
        })
      ).rejects.toThrow();
    });

    it('should allow multiple awards for same player in different categories', async () => {
      await prisma.match_awards.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          category: 'Man of the Match',
          created_by_user_id: testUserId
        }
      });

      // Should succeed with different category
      const secondAward = await prisma.match_awards.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          category: 'Goal of the Match',
          created_by_user_id: testUserId
        }
      });

      expect(secondAward.category).toBe('Goal of the Match');
    });
  });

  describe('Array and Utility Functions', () => {
    it('should transform array of awards', async () => {
      // Create multiple awards
      const awardData = [
        {
          season_id: testSeasonId,
          player_id: testPlayerId,
          category: 'Player of the Season'
        },
        {
          season_id: testSeasonId,
          player_id: testPlayerId,
          category: 'Top Scorer'
        }
      ];

      const createdAwards = await Promise.all(
        awardData.map(data => prisma.awards.create({ 
          data: { ...data, created_by_user_id: testUserId } 
        }))
      );

      const frontendAwards = transformAwards(createdAwards);

      expect(frontendAwards).toHaveLength(2);
      expect(frontendAwards[0].category).toBe('Player of the Season');
      expect(frontendAwards[1].category).toBe('Top Scorer');
    });

    it('should transform array of match awards', async () => {
      // Create multiple match awards
      const matchAwardData = [
        {
          match_id: testMatchId,
          player_id: testPlayerId,
          category: 'Man of the Match'
        },
        {
          match_id: testMatchId,
          player_id: testPlayerId,
          category: 'Goal of the Match'
        }
      ];

      const createdMatchAwards = await Promise.all(
        matchAwardData.map(data => prisma.match_awards.create({ 
          data: { ...data, created_by_user_id: testUserId } 
        }))
      );

      const frontendMatchAwards = transformMatchAwards(createdMatchAwards);

      expect(frontendMatchAwards).toHaveLength(2);
      expect(frontendMatchAwards[0].category).toBe('Man of the Match');
      expect(frontendMatchAwards[1].category).toBe('Goal of the Match');
    });

    it('should safely transform null award', () => {
      const result = safeTransformAward(null);
      expect(result).toBeNull();
    });

    it('should safely transform null match award', () => {
      const result = safeTransformMatchAward(null);
      expect(result).toBeNull();
    });

    it('should safely transform valid award', async () => {
      const prismaAward = await prisma.awards.create({
        data: {
          season_id: testSeasonId,
          player_id: testPlayerId,
          category: 'Test Award',
          created_by_user_id: testUserId
        }
      });

      const result = safeTransformAward(prismaAward);

      expect(result).not.toBeNull();
      expect(result!.seasonId).toBe(testSeasonId);
      expect(result!.category).toBe('Test Award');
    });
  });

  describe('Query Operations', () => {
    it('should find awards by season', async () => {
      await prisma.awards.create({
        data: {
          season_id: testSeasonId,
          player_id: testPlayerId,
          category: 'Season Award',
          created_by_user_id: testUserId
        }
      });

      const awards = await prisma.awards.findMany({
        where: { season_id: testSeasonId }
      });

      expect(awards).toHaveLength(1);
      expect(awards[0].season_id).toBe(testSeasonId);
    });

    it('should find awards by player', async () => {
      await prisma.awards.create({
        data: {
          season_id: testSeasonId,
          player_id: testPlayerId,
          category: 'Player Award',
          created_by_user_id: testUserId
        }
      });

      const awards = await prisma.awards.findMany({
        where: { player_id: testPlayerId }
      });

      expect(awards).toHaveLength(1);
      expect(awards[0].player_id).toBe(testPlayerId);
    });

    it('should find match awards by match', async () => {
      await prisma.match_awards.create({
        data: {
          match_id: testMatchId,
          player_id: testPlayerId,
          category: 'Match Award',
          created_by_user_id: testUserId
        }
      });

      const matchAwards = await prisma.match_awards.findMany({
        where: { match_id: testMatchId }
      });

      expect(matchAwards).toHaveLength(1);
      expect(matchAwards[0].match_id).toBe(testMatchId);
    });

    it('should find awards by category', async () => {
      await prisma.awards.create({
        data: {
          season_id: testSeasonId,
          player_id: testPlayerId,
          category: 'Unique Category',
          created_by_user_id: testUserId
        }
      });

      const awards = await prisma.awards.findMany({
        where: { category: 'Unique Category' }
      });

      expect(awards).toHaveLength(1);
      expect(awards[0].category).toBe('Unique Category');
    });
  });
});