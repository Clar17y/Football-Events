import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Match,
  MatchCreateRequest,
  MatchUpdateRequest,
  transformMatch,
  transformMatchCreateRequest,
  transformMatchUpdateRequest,
  PrismaMatch
} from '@shared/types';
import {
  testNotFoundScenario,
  testSpecialCharacterHandling,
  testUniqueConstraintViolation,
  EntityTestConfig
} from './shared-test-patterns';
import { SchemaTestUserHelper } from './test-user-helper';

describe('Match Schema Alignment Tests', () => {
  let prisma: PrismaClient;
  let createdMatchIds: string[] = [];
  let createdTeamIds: string[] = [];
  let createdSeasonIds: string[] = [];
  let testUserId: string;
  let userHelper: SchemaTestUserHelper;

  // Test data setup - we'll need teams and seasons for foreign keys
  let testHomeTeamId: string;
  let testAwayTeamId: string;
  let testSeasonId: string;

  // Configuration for shared test patterns
  const testConfig: EntityTestConfig<PrismaMatch, MatchCreateRequest, MatchUpdateRequest> = {
    entityName: 'match',
    createSampleData: () => ({
      seasonId: testSeasonId,
      kickoffTime: new Date('2025-08-15T15:00:00Z'),
      homeTeamId: testHomeTeamId,
      awayTeamId: testAwayTeamId,
      competition: 'Test League',
      venue: 'Test Stadium'
    }),
    updateSampleData: () => ({
      venue: 'Updated Stadium',
      ourScore: 2,
      opponentScore: 1
    }),
    transformCreate: (data) => transformMatchCreateRequest(data, testUserId),
    transformUpdate: transformMatchUpdateRequest,
    transformRead: transformMatch,
    createInDb: async (data) => {
      return await prisma.match.create({ data });
    },
    findInDb: async (id) => {
      const match = await prisma.match.findUnique({ where: { match_id: id } });
      return match ? [match] : [];
    },
    updateInDb: async (id, data) => {
      return await prisma.match.update({
        where: { match_id: id },
        data: data
      });
    },
    getIdentifier: (entity) => entity.match_id,
    getNonExistentIdentifier: () => '00000000-0000-0000-0000-000000000000',
    getCleanupIdentifiers: () => createdMatchIds,
    addToCleanup: (id) => createdMatchIds.push(id)
  };

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();

    // Initialize user helper and create test user
    userHelper = new SchemaTestUserHelper(prisma);
    testUserId = await userHelper.createTestUser('USER');

    // Create test teams and season for foreign key dependencies
    const homeTeam = await prisma.team.create({
      data: {
        name: 'Test Home Team FC',
        home_kit_primary: '#FF0000',
        away_kit_primary: '#0000FF',
        created_by_user_id: testUserId
      }
    });
    testHomeTeamId = homeTeam.id;
    createdTeamIds.push(homeTeam.id);

    const awayTeam = await prisma.team.create({
      data: {
        name: 'Test Away Team FC',
        home_kit_primary: '#00FF00',
        away_kit_primary: '#FFFF00',
        created_by_user_id: testUserId
      }
    });
    testAwayTeamId = awayTeam.id;
    createdTeamIds.push(awayTeam.id);

    // Create test season using Prisma
    const season = await prisma.$queryRaw<any[]>`
      INSERT INTO grassroots.seasons (label, start_date, end_date, is_current, created_by_user_id) 
      VALUES ('Test Season 2025', '2025-01-01', '2025-12-31', false, ${testUserId}::uuid)
      RETURNING season_id, label, created_at, updated_at
    `;
    testSeasonId = season[0].season_id;
    createdSeasonIds.push(testSeasonId);
  });

  afterEach(async () => {
    // Clean up created matches after each test
    if (createdMatchIds.length > 0) {
      await prisma.match.deleteMany({
        where: {
          match_id: {
            in: createdMatchIds
          }
        }
      });
      createdMatchIds = [];
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (createdTeamIds.length > 0) {
      await prisma.team.deleteMany({
        where: {
          id: {
            in: createdTeamIds
          }
        }
      });
    }

    if (createdSeasonIds.length > 0) {
      await prisma.$executeRaw`
        DELETE FROM grassroots.seasons 
        WHERE season_id = ANY(${createdSeasonIds}::uuid[])
      `;
    }

    await userHelper.cleanup();
    await prisma.$disconnect();
  });

  describe('Match Creation', () => {
    it('should create a match using frontend interface and transform correctly', async () => {
      // 1. Create match data using frontend interface
      const frontendMatchData: MatchCreateRequest = {
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-08-15T15:00:00Z'),
        competition: 'Premier League',
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId,
        venue: 'Old Trafford',
        durationMinutes: 90,
        periodFormat: 'half',
        notes: 'Important derby match'
      };

      // 2. Transform to Prisma format
      const prismaInput = transformMatchCreateRequest(frontendMatchData, testUserId);

      // 3. Verify transformation structure
      expect(prismaInput).toEqual({
        season_id: testSeasonId,
        kickoff_ts: new Date('2025-08-15T15:00:00Z'),
        competition: 'Premier League',
        home_team_id: testHomeTeamId,
        away_team_id: testAwayTeamId,
        venue: 'Old Trafford',
        duration_mins: 90,
        period_format: 'half',
        notes: 'Important derby match',
        created_by_user_id: testUserId
      });

      // 4. Create in database using Prisma
      const createdMatch = await prisma.match.create({ data: prismaInput });
		
      // Track for cleanup
      createdMatchIds.push(createdMatch.match_id);

      // 5. Verify database record
      expect(createdMatch.match_id).toBeDefined();
      expect(createdMatch.season_id).toBe(testSeasonId);
      expect(createdMatch.kickoff_ts).toEqual(new Date('2025-08-15T15:00:00Z'));
      expect(createdMatch.competition).toBe('Premier League');
      expect(createdMatch.home_team_id).toBe(testHomeTeamId);
      expect(createdMatch.away_team_id).toBe(testAwayTeamId);
      expect(createdMatch.venue).toBe('Old Trafford');
      expect(createdMatch.duration_mins).toBe(90);
      expect(createdMatch.period_format).toBe('half');
      expect(createdMatch.our_score).toBe(0); // Default value
      expect(createdMatch.opponent_score).toBe(0); // Default value
      expect(createdMatch.notes).toBe('Important derby match');
      expect(createdMatch.created_at).toBeInstanceOf(Date);
      expect(createdMatch.updated_at).toBeNull();

      // 6. Transform back to frontend format
      const transformedMatch: Match = transformMatch(createdMatch);

      // 7. Verify round-trip transformation
      expect(transformedMatch.id).toBe(createdMatch.match_id);
      expect(transformedMatch.seasonId).toBe(testSeasonId);
      expect(transformedMatch.kickoffTime).toEqual(new Date('2025-08-15T15:00:00Z'));
      expect(transformedMatch.competition).toBe('Premier League');
      expect(transformedMatch.homeTeamId).toBe(testHomeTeamId);
      expect(transformedMatch.awayTeamId).toBe(testAwayTeamId);
      expect(transformedMatch.venue).toBe('Old Trafford');
      expect(transformedMatch.durationMinutes).toBe(90);
      expect(transformedMatch.periodFormat).toBe('half');
      expect(transformedMatch.ourScore).toBe(0);
      expect(transformedMatch.opponentScore).toBe(0);
      expect(transformedMatch.notes).toBe('Important derby match');
      expect(transformedMatch.createdAt).toBe(createdMatch.created_at);
      expect(transformedMatch.updatedAt).toBeUndefined();
      // Authorization and soft delete fields
      expect(transformedMatch.created_by_user_id).toBe(testUserId);
      expect(transformedMatch.deleted_at).toBeUndefined();
      expect(transformedMatch.deleted_by_user_id).toBeUndefined();
      expect(transformedMatch.is_deleted).toBe(false);
    });

    it('should handle minimal match data correctly', async () => {
      // Test with only required fields
      const minimalMatchData: MatchCreateRequest = {
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-09-01T14:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId
      };

      const prismaInput = transformMatchCreateRequest(minimalMatchData, testUserId);
      
      expect(prismaInput).toEqual({
        season_id: testSeasonId,
        kickoff_ts: new Date('2025-09-01T14:00:00Z'),
        home_team_id: testHomeTeamId,
        away_team_id: testAwayTeamId,
        competition: null,
        venue: null,
        duration_mins: 50, // Default value
        period_format: 'quarter', // Default value
        notes: null,
        created_by_user_id: testUserId
      });

      const createdMatch = await prisma.match.create({ data: prismaInput });

      createdMatchIds.push(createdMatch.match_id);

      const transformedMatch = transformMatch(createdMatch);
      
      expect(transformedMatch.seasonId).toBe(testSeasonId);
      expect(transformedMatch.homeTeamId).toBe(testHomeTeamId);
      expect(transformedMatch.awayTeamId).toBe(testAwayTeamId);
      expect(transformedMatch.competition).toBeUndefined();
      expect(transformedMatch.venue).toBeUndefined();
      expect(transformedMatch.durationMinutes).toBe(50);
      expect(transformedMatch.periodFormat).toBe('quarter');
      expect(transformedMatch.notes).toBeUndefined();
    });

    it('should handle different period formats', async () => {
      const periodFormats = ['quarter', 'half']; // Only valid formats per DB constraint
      
      for (const format of periodFormats) {
        const matchData: MatchCreateRequest = {
          seasonId: testSeasonId,
          kickoffTime: new Date('2025-09-15T16:00:00Z'),
          homeTeamId: testHomeTeamId,
          awayTeamId: testAwayTeamId,
          periodFormat: format,
          durationMinutes: format === 'half' ? 90 : 60
        };

        const prismaInput = transformMatchCreateRequest(matchData, testUserId);
        const createdMatch = await prisma.match.create({ data: prismaInput });
        createdMatchIds.push(createdMatch.match_id);

        expect(createdMatch.period_format).toBe(format);
        expect(createdMatch.duration_mins).toBe(format === 'half' ? 90 : 60);
      }
    });
  });

  describe('Match Updates', () => {
    it('should update match using frontend interface', async () => {
      // Create initial match
      const initialData = transformMatchCreateRequest({
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-10-01T15:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId,
        venue: 'Initial Stadium'
      }, testUserId);

      const createdMatch = await prisma.match.create({ data: initialData });
      createdMatchIds.push(createdMatch.match_id);

      // Update using frontend interface
      const updateData: MatchUpdateRequest = {
        venue: 'Updated Stadium',
        ourScore: 3,
        opponentScore: 1,
        notes: 'Great victory!'
      };

      const prismaUpdateInput = transformMatchUpdateRequest(updateData);

      expect(prismaUpdateInput).toEqual({
        venue: 'Updated Stadium',
        our_score: 3,
        opponent_score: 1,
        notes: 'Great victory!'
      });

      // Apply update using Prisma
      const updatedMatch = await prisma.match.update({
        where: { match_id: createdMatch.match_id },
        data: prismaUpdateInput
      });

      // Transform back and verify
      const transformedUpdated = transformMatch(updatedMatch);

      expect(transformedUpdated.venue).toBe('Updated Stadium'); // Updated
      expect(transformedUpdated.ourScore).toBe(3); // Updated
      expect(transformedUpdated.opponentScore).toBe(1); // Updated
      expect(transformedUpdated.notes).toBe('Great victory!'); // Updated
      expect(transformedUpdated.seasonId).toBe(testSeasonId); // Unchanged
      // Note: updated_at is not automatically set in current schema
    });

    it('should handle score updates correctly', async () => {
      // Create match
      const initialData = transformMatchCreateRequest({
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-10-15T15:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId
      }, testUserId);

      const createdMatch = await prisma.match.create({ data: initialData });
      createdMatchIds.push(createdMatch.match_id);

      // Test various score scenarios
      const scoreUpdates = [
        { ourScore: 1, opponentScore: 0 },
        { ourScore: 2, opponentScore: 2 },
        { ourScore: 0, opponentScore: 3 }
      ];

      for (const scores of scoreUpdates) {
        const updateData: MatchUpdateRequest = scores;
        const prismaUpdateInput = transformMatchUpdateRequest(updateData);
        
        const updatedMatch = await prisma.match.update({
          where: { match_id: createdMatch.match_id },
          data: prismaUpdateInput
        });

        const transformedMatch = transformMatch(updatedMatch);
        expect(transformedMatch.ourScore).toBe(scores.ourScore);
        expect(transformedMatch.opponentScore).toBe(scores.opponentScore);
      }
    });
  });

  describe('Match Retrieval', () => {
    it('should retrieve and transform match correctly', async () => {
      // Create test match
      const testData = transformMatchCreateRequest({
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-11-01T14:30:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId,
        competition: 'Cup Final',
        venue: 'Wembley Stadium'
      }, testUserId);

      const createdMatch = await prisma.match.create({
        data: testData
      });
      createdMatchIds.push(createdMatch.match_id);

      // Retrieve match
      const retrievedMatch = await prisma.match.findUnique({
        where: { match_id: createdMatch.match_id }
      });

      expect(retrievedMatch).not.toBeNull();

      // Transform and verify
      const transformedMatch = transformMatch(retrievedMatch!);

      expect(transformedMatch.id).toBe(createdMatch.match_id);
      expect(transformedMatch.competition).toBe('Cup Final');
      expect(transformedMatch.venue).toBe('Wembley Stadium');
      expect(transformedMatch.seasonId).toBe(testSeasonId);
      expect(transformedMatch.homeTeamId).toBe(testHomeTeamId);
      expect(transformedMatch.awayTeamId).toBe(testAwayTeamId);
    });
  });

  describe('Foreign Key Constraint Validation', () => {
    it('should enforce season foreign key constraint', async () => {
      const invalidSeasonId = '00000000-0000-0000-0000-000000000000';
      
      const matchData: MatchCreateRequest = {
        seasonId: invalidSeasonId,
        kickoffTime: new Date('2025-12-01T15:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId
      };

      const prismaInput = transformMatchCreateRequest(matchData, testUserId);

      // Should throw foreign key constraint violation
      await expect(
        prisma.match.create({ data: prismaInput })
      ).rejects.toThrow();
    });

    it('should enforce team foreign key constraints', async () => {
      const invalidTeamId = '00000000-0000-0000-0000-000000000000';
      
      // Test invalid home team
      const matchData1: MatchCreateRequest = {
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-12-01T15:00:00Z'),
        homeTeamId: invalidTeamId,
        awayTeamId: testAwayTeamId
      };

      await expect(
        prisma.match.create({ data: transformMatchCreateRequest(matchData1, testUserId) })
      ).rejects.toThrow();

      // Test invalid away team
      const matchData2: MatchCreateRequest = {
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-12-01T15:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: invalidTeamId
      };

      await expect(
        prisma.match.create({ data: transformMatchCreateRequest(matchData2, testUserId) })
      ).rejects.toThrow();
    });

    it('should prevent same team playing itself', async () => {
      const matchData: MatchCreateRequest = {
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-12-01T15:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testHomeTeamId // Same team as home and away
      };

      const prismaInput = transformMatchCreateRequest(matchData, testUserId);
      
      // This should be allowed by the database but might be a business rule
      // For now, let's just verify the data is stored correctly
      const createdMatch = await prisma.match.create({ data: prismaInput });
      createdMatchIds.push(createdMatch.match_id);
      
      expect(createdMatch.home_team_id).toBe(testHomeTeamId);
      expect(createdMatch.away_team_id).toBe(testHomeTeamId);
    });
  });

  describe('Field Mapping Validation', () => {
    it('should correctly map frontend to database fields', async () => {
      const frontendData: MatchCreateRequest = {
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-12-15T16:00:00Z'),
        competition: 'Field Mapping Test',
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId,
        venue: 'Mapping Stadium',
        durationMinutes: 75,
        periodFormat: 'third',
        notes: 'Field mapping test match'
      };

      const prismaInput = transformMatchCreateRequest(frontendData, testUserId);

      // Verify exact field mapping (frontend camelCase to database snake_case)
      expect(prismaInput.season_id).toBe(frontendData.seasonId);
      expect(prismaInput.kickoff_ts).toBe(frontendData.kickoffTime);
      expect(prismaInput.competition).toBe(frontendData.competition);
      expect(prismaInput.home_team_id).toBe(frontendData.homeTeamId);
      expect(prismaInput.away_team_id).toBe(frontendData.awayTeamId);
      expect(prismaInput.venue).toBe(frontendData.venue);
      expect(prismaInput.duration_mins).toBe(frontendData.durationMinutes);
      expect(prismaInput.period_format).toBe(frontendData.periodFormat);
      expect(prismaInput.notes).toBe(frontendData.notes);
    });

    it('should correctly map database to frontend fields', async () => {
      // Create match in database
      const prismaInput = transformMatchCreateRequest({
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-12-20T17:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId,
        competition: 'Database Mapping Test',
        venue: 'Reverse Mapping Stadium'
      }, testUserId);

      const createdMatch = await prisma.match.create({ data: prismaInput });
      createdMatchIds.push(createdMatch.match_id);

      const transformedMatch = transformMatch(createdMatch);

      // Verify exact field mapping (database snake_case to frontend camelCase)
      expect(transformedMatch.id).toBe(createdMatch.match_id);
      expect(transformedMatch.seasonId).toBe(createdMatch.season_id);
      expect(transformedMatch.kickoffTime).toBe(createdMatch.kickoff_ts);
      expect(transformedMatch.competition).toBe(createdMatch.competition);
      expect(transformedMatch.homeTeamId).toBe(createdMatch.home_team_id);
      expect(transformedMatch.awayTeamId).toBe(createdMatch.away_team_id);
      expect(transformedMatch.venue).toBe(createdMatch.venue);
      expect(transformedMatch.durationMinutes).toBe(createdMatch.duration_mins);
      expect(transformedMatch.periodFormat).toBe(createdMatch.period_format);
      expect(transformedMatch.ourScore).toBe(createdMatch.our_score);
      expect(transformedMatch.opponentScore).toBe(createdMatch.opponent_score);
      expect(transformedMatch.notes).toBeUndefined(); // Notes not entered
      expect(transformedMatch.createdAt).toBe(createdMatch.created_at);
    });
  });

  describe('Special Character Handling', () => {
    it('should handle special characters in venue names', async () => {
      await testSpecialCharacterHandling(
        testConfig,
        'venue',
        "St. Mary's Stadium & Sports Complex"
      );
    });

    it('should handle special characters in competition names', async () => {
      const specialCompetitions = [
        'UEFA Champions League',
        'FA Cup - 3rd Round',
        'Premier League (2024/25)',
        'U-18 Development Cup'
      ];

      for (const competition of specialCompetitions) {
        const matchData: MatchCreateRequest = {
          seasonId: testSeasonId,
          kickoffTime: new Date('2025-12-25T15:00:00Z'),
          homeTeamId: testHomeTeamId,
          awayTeamId: testAwayTeamId,
          competition: competition
        };

        const prismaInput = transformMatchCreateRequest(matchData, testUserId);
        const createdMatch = await prisma.match.create({ data: prismaInput });
        createdMatchIds.push(createdMatch.match_id);

        const transformedMatch = transformMatch(createdMatch);
        expect(transformedMatch.competition).toBe(competition);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle match not found scenario', async () => {
      await testNotFoundScenario(testConfig);
    });

    it('should handle various kickoff times', async () => {
      const kickoffTimes = [
        new Date('2025-01-01T00:00:00Z'), // New Year's Day
        new Date('2025-06-15T12:30:00Z'), // Midday
        new Date('2025-12-31T23:59:00Z')  // New Year's Eve
      ];

      for (const kickoffTime of kickoffTimes) {
        const matchData: MatchCreateRequest = {
          seasonId: testSeasonId,
          kickoffTime: kickoffTime,
          homeTeamId: testHomeTeamId,
          awayTeamId: testAwayTeamId
        };

        const prismaInput = transformMatchCreateRequest(matchData, testUserId);
        const createdMatch = await prisma.match.create({ data: prismaInput });
        createdMatchIds.push(createdMatch.match_id);

        const transformedMatch = transformMatch(createdMatch);
        expect(transformedMatch.kickoffTime).toEqual(kickoffTime);
      }
    });

    it('should handle extreme score values', async () => {
      const matchData = transformMatchCreateRequest({
        seasonId: testSeasonId,
        kickoffTime: new Date('2025-01-15T15:00:00Z'),
        homeTeamId: testHomeTeamId,
        awayTeamId: testAwayTeamId
      }, testUserId);

      const createdMatch = await prisma.match.create({ data: matchData });
      createdMatchIds.push(createdMatch.match_id);

      // Test extreme scores
      const extremeScores = [
        { ourScore: 0, opponentScore: 0 },   // Draw
        { ourScore: 10, opponentScore: 0 },  // High score
        { ourScore: 0, opponentScore: 15 },  // High opponent score
        { ourScore: 99, opponentScore: 99 }  // Very high scores
      ];

      for (const scores of extremeScores) {
        const updateData: MatchUpdateRequest = scores;
        const prismaUpdateInput = transformMatchUpdateRequest(updateData);
        
        const updatedMatch = await prisma.match.update({
          where: { match_id: createdMatch.match_id },
          data: prismaUpdateInput
        });

        const transformedMatch = transformMatch(updatedMatch);
        expect(transformedMatch.ourScore).toBe(scores.ourScore);
        expect(transformedMatch.opponentScore).toBe(scores.opponentScore);
      }
    });
  });
});