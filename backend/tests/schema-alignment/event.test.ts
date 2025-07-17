import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  Event,
  EventCreateRequest,
  transformEvent,
  transformEventCreateRequest,
  transformEvents,
  safeTransformEvent
} from '@shared/types';
import { SchemaTestUserHelper } from './test-user-helper';

// Helper function for timestamp validation
const expectValidTimestamp = (timestamp: Date | undefined) => {
  expect(timestamp).toBeInstanceOf(Date);
  expect(timestamp!.getTime()).toBeGreaterThan(0);
};

describe('Event Entity Schema Alignment', () => {
  let prisma: PrismaClient;
  let testHomeTeamId: string;
  let testAwayTeamId: string;
  let testMatchId: string;
  let testPlayerId: string;
  let testUserId: string;
  let userHelper: SchemaTestUserHelper;

  async function clearTestData(prisma: PrismaClient) {
    // Delete in order of dependencies (children first)
    await prisma.event.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.team.deleteMany({});
  }

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();

    // Initialize user helper and create test user
    userHelper = new SchemaTestUserHelper(prisma);
    testUserId = await userHelper.createTestUser('USER');

    // Create test dependencies
    await clearTestData(prisma);

    // Create test teams
    const homeTeam = await prisma.team.create({
      data: {
        name: 'Event Home Team FC',
        home_kit_primary: '#FF0000',
        away_kit_primary: '#0000FF',
        created_by_user_id: testUserId
      }
    });
    testHomeTeamId = homeTeam.id;

    const awayTeam = await prisma.team.create({
      data: {
        name: 'Event Away Team FC',
        home_kit_primary: '#00FF00',
        away_kit_primary: '#FFFF00',
        created_by_user_id: testUserId
      }
    });
    testAwayTeamId = awayTeam.id;

    // Create minimal test season for match dependency
    const season = await prisma.seasons.create({
      data: { 
        label: 'Event Test Season 2024',
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        is_current: false,
        created_by_user_id: testUserId
      }
    });

    // Create test match
    const match = await prisma.match.create({
      data: {
        season_id: season.season_id,
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
        name: 'Event Test Player',
        squad_number: 10,
        created_by_user_id: testUserId
      }
    });
    testPlayerId = player.id;
  });

  afterEach(async () => {
    // Clean up event entries after each test
    await prisma.event.deleteMany({
      where: { match_id: testMatchId }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.event.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.seasons.deleteMany({});
    
    await userHelper.cleanup();
    await prisma.$disconnect();
  });

  describe('Schema Alignment - Prisma to Frontend', () => {
    it('should transform basic event data correctly', async () => {
      // Create test event with minimal data first to avoid foreign key issues
      const prismaEvent = await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'ball_out', // Use ball_out which doesn't require team/player
          period_number: 1,
          clock_ms: 45000,
          notes: 'Test event',
          sentiment: 0,
          created_by_user_id: testUserId
        }
      });

      console.log('Prisma Event:', prismaEvent);
      const frontendEvent = transformEvent(prismaEvent);
      console.log('Transformed Frontend Event:', frontendEvent);

      expect(frontendEvent).toEqual({
        id: expect.any(String),
        matchId: testMatchId,
        kind: 'ball_out',
        teamId: undefined,
        playerId: undefined,
        periodNumber: 1,
        clockMs: 45000,
        notes: 'Test event',
        sentiment: 0,
        createdAt: expect.any(Date),
        updatedAt: undefined,
        // Authorization and soft delete fields
        created_by_user_id: testUserId,
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false
      });

      expectValidTimestamp(frontendEvent.createdAt);
    });

    it('should handle null optional fields correctly', async () => {
      const prismaEvent = await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'ball_out',
          created_by_user_id: testUserId
          // All other fields are optional/nullable
        }
      });

      const frontendEvent = transformEvent(prismaEvent);

      expect(frontendEvent.teamId).toBeUndefined();
      expect(frontendEvent.playerId).toBeUndefined();
      expect(frontendEvent.periodNumber).toBeUndefined();
      expect(frontendEvent.clockMs).toBeUndefined();
      expect(frontendEvent.notes).toBeUndefined();
      expect(frontendEvent.sentiment).toBe(0); // Default value
    });
  });

  describe('Schema Alignment - Frontend to Prisma', () => {
    it('should transform EventCreateRequest correctly', () => {
      const createRequest: EventCreateRequest = {
        matchId: testMatchId,
        kind: 'goal',
        teamId: testHomeTeamId,
        playerId: testPlayerId,
        periodNumber: 2,
        clockMs: 120000,
        notes: 'Amazing strike!',
        sentiment: 2
      };

      const prismaInput = transformEventCreateRequest(createRequest, testUserId);

      expect(prismaInput).toEqual({
        match_id: testMatchId,
        kind: 'goal',
        team_id: testHomeTeamId,
        player_id: testPlayerId,
        period_number: 2,
        clock_ms: 120000,
        notes: 'Amazing strike!',
        sentiment: 2,
        created_by_user_id: testUserId
      });
    });

    it('should handle optional fields with defaults', () => {
      const createRequest: EventCreateRequest = {
        matchId: testMatchId,
        kind: 'foul'
      };

      const prismaInput = transformEventCreateRequest(createRequest, testUserId);

      expect(prismaInput.team_id).toBeNull();
      expect(prismaInput.player_id).toBeNull();
      expect(prismaInput.period_number).toBeNull();
      expect(prismaInput.clock_ms).toBeNull();
      expect(prismaInput.notes).toBeNull();
      expect(prismaInput.sentiment).toBe(0);
      expect(prismaInput.created_by_user_id).toBe(testUserId);
    });
  });

  describe('Event Kind Enum Validation', () => {
    const eventKinds = [
      'goal', 'assist', 'key_pass', 'save', 'interception', 
      'tackle', 'foul', 'penalty', 'free_kick', 'ball_out', 'own_goal'
    ];

    eventKinds.forEach(kind => {
      it(`should create event with kind: ${kind}`, async () => {
        const event = await prisma.event.create({
          data: {
            match_id: testMatchId,
            kind: kind as any,
            created_by_user_id: testUserId
          }
        });

        expect(event.kind).toBe(kind);
      });
    });

    it('should reject invalid event kind', async () => {
      await expect(
        prisma.event.create({
          data: {
            match_id: testMatchId,
            kind: 'invalid_kind' as any,
            created_by_user_id: testUserId
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Foreign Key Relationships', () => {
    it('should enforce match foreign key constraint', async () => {
      const invalidMatchId = '00000000-0000-0000-0000-000000000000';

      await expect(
        prisma.event.create({
          data: {
            match_id: invalidMatchId,
            kind: 'goal',
            created_by_user_id: testUserId
          }
        })
      ).rejects.toThrow();
    });

    it('should allow null team and player IDs', async () => {
      const event = await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'ball_out',
          team_id: null,
          player_id: null,
          created_by_user_id: testUserId
        }
      });

      expect(event.team_id).toBeNull();
      expect(event.player_id).toBeNull();
    });
  });

  describe('Array and Utility Functions', () => {
    it('should transform array of events', async () => {
      // Create multiple events
      const eventData = [
        {
          match_id: testMatchId,
          kind: 'goal' as const,
          team_id: testHomeTeamId,
          created_by_user_id: testUserId
        },
        {
          match_id: testMatchId,
          kind: 'assist' as const,
          player_id: testPlayerId,
          created_by_user_id: testUserId
        }
      ];

      const createdEvents = await Promise.all(
        eventData.map(data => prisma.event.create({ data }))
      );

      const frontendEvents = transformEvents(createdEvents);

      expect(frontendEvents).toHaveLength(2);
      expect(frontendEvents[0].kind).toBe('goal');
      expect(frontendEvents[1].kind).toBe('assist');
    });

    it('should safely transform null event', () => {
      const result = safeTransformEvent(null);
      expect(result).toBeNull();
    });

    it('should safely transform valid event', async () => {
      const prismaEvent = await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'save',
          created_by_user_id: testUserId
        }
      });

      const result = safeTransformEvent(prismaEvent);

      expect(result).not.toBeNull();
      expect(result!.matchId).toBe(testMatchId);
      expect(result!.kind).toBe('save');
    });
  });

  describe('Query Operations', () => {
    it('should find events by match', async () => {
      await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'goal',
          created_by_user_id: testUserId
        }
      });

      const events = await prisma.event.findMany({
        where: { match_id: testMatchId }
      });

      expect(events).toHaveLength(1);
      expect(events[0].match_id).toBe(testMatchId);
    });

    it('should find events by kind', async () => {
      await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'penalty',
          created_by_user_id: testUserId
        }
      });

      const events = await prisma.event.findMany({
        where: { kind: 'penalty' }
      });

      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('penalty');
    });

    it('should order events by created_at', async () => {
      // Create events with slight delay
      const event1 = await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'goal',
          created_by_user_id: testUserId
        }
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const event2 = await prisma.event.create({
        data: {
          match_id: testMatchId,
          kind: 'assist',
          created_by_user_id: testUserId
        }
      });

      const events = await prisma.event.findMany({
        where: { match_id: testMatchId },
        orderBy: { created_at: 'asc' }
      });

      expect(events).toHaveLength(2);
      expect(events[0].id).toBe(event1.id);
      expect(events[1].id).toBe(event2.id);
    });
  });
});