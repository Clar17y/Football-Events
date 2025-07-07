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

// Helper function for timestamp validation
const expectValidTimestamp = (timestamp: Date | undefined) => {
  expect(timestamp).toBeInstanceOf(Date);
  expect(timestamp!.getTime()).toBeGreaterThan(0);
};

describe('Event Entity Schema Alignment', () => {
  let prisma: PrismaClient;
  let testSeasonId: string;
  let testHomeTeamId: string;
  let testAwayTeamId: string;
  let testMatchId: string;
  let testPlayerId: string;

  async function clearTestData(prisma: PrismaClient) {
    // Delete in order of dependencies (children first)
    await prisma.event.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.seasons.deleteMany({ where: { label: 'Event Test Season 2024' } });
  }

  beforeAll(async () => {
    // Initialize Prisma client directly for tests
    prisma = new PrismaClient();
    await prisma.$connect();

    // Create test dependencies
    // Create test season
    await clearTestData(prisma);
    const season = await prisma.seasons.create({
      data: { label: 'Event Test Season 2024' }
    });
    testSeasonId = season.season_id;

    // Create test teams
    const homeTeam = await prisma.team.create({
      data: {
        name: 'Event Home Team FC',
        home_kit_primary: '#FF0000',
        away_kit_primary: '#0000FF'
      }
    });
    testHomeTeamId = homeTeam.id;

    const awayTeam = await prisma.team.create({
      data: {
        name: 'Event Away Team FC',
        home_kit_primary: '#00FF00',
        away_kit_primary: '#FFFF00'
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
        venue: 'Test Stadium'
      }
    });
    testMatchId = match.match_id;

    // Create test player
    const player = await prisma.player.create({
      data: {
        name: 'Event Test Player',
        current_team: testHomeTeamId,
        squad_number: 10
      }
    });
    testPlayerId = player.id;
  });

  afterEach(async () => {
    // Clean up event entries after each test
    await prisma.event.deleteMany({
      where: { matchId: testMatchId }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.event.deleteMany({});
    await prisma.match.deleteMany({});
    await prisma.player.deleteMany({});
    await prisma.team.deleteMany({});
    await prisma.seasons.deleteMany({});
    
    await prisma.$disconnect();
  });

  describe('Schema Alignment - Prisma to Frontend', () => {
    it('should transform basic event data correctly', async () => {
      // Create test event with minimal data first to avoid foreign key issues
      const prismaEvent = await prisma.event.create({
        data: {
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'ball_out', // Use ball_out which doesn't require team/player
          period_number: 1,
          clockMs: 45000,
          notes: 'Test event',
          sentiment: 0
        }
      });

      console.log('Prisma Event:', prismaEvent);
      const frontendEvent = transformEvent(prismaEvent);
      console.log('Transformed Frontend Event:', frontendEvent);

      expect(frontendEvent).toEqual({
        id: expect.any(String),
        matchId: testMatchId,
        seasonId: testSeasonId,
        kind: 'ball_out',
        teamId: undefined,
        playerId: undefined,
        periodNumber: 1,
        clockMs: 45000,
        notes: 'Test event',
        sentiment: 0,
        createdAt: expect.any(Date),
        updatedAt: undefined
      });

      expectValidTimestamp(frontendEvent.createdAt);
    });

    it('should handle null optional fields correctly', async () => {
      const prismaEvent = await prisma.event.create({
        data: {
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'ball_out'
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
        seasonId: testSeasonId,
        kind: 'goal',
        teamId: testHomeTeamId,
        playerId: testPlayerId,
        periodNumber: 2,
        clockMs: 120000,
        notes: 'Amazing strike!',
        sentiment: 2
      };

      const prismaInput = transformEventCreateRequest(createRequest);

      expect(prismaInput).toEqual({
        matchId: testMatchId,
        season_id: testSeasonId,
        kind: 'goal',
        teamId: testHomeTeamId,
        playerId: testPlayerId,
        period_number: 2,
        clockMs: 120000,
        notes: 'Amazing strike!',
        sentiment: 2
      });
    });

    it('should handle optional fields with defaults', () => {
      const createRequest: EventCreateRequest = {
        matchId: testMatchId,
        seasonId: testSeasonId,
        kind: 'foul'
      };

      const prismaInput = transformEventCreateRequest(createRequest);

      expect(prismaInput.teamId).toBeNull();
      expect(prismaInput.playerId).toBeNull();
      expect(prismaInput.period_number).toBeNull();
      expect(prismaInput.clockMs).toBeNull();
      expect(prismaInput.notes).toBeNull();
      expect(prismaInput.sentiment).toBe(0);
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
            matchId: testMatchId,
            season_id: testSeasonId,
            kind: kind as any
          }
        });

        expect(event.kind).toBe(kind);
      });
    });

    it('should reject invalid event kind', async () => {
      await expect(
        prisma.event.create({
          data: {
            matchId: testMatchId,
            season_id: testSeasonId,
            kind: 'invalid_kind' as any
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
            matchId: invalidMatchId,
            season_id: testSeasonId,
            kind: 'goal'
          }
        })
      ).rejects.toThrow();
    });

    it('should allow null team and player IDs', async () => {
      const event = await prisma.event.create({
        data: {
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'ball_out',
          teamId: null,
          playerId: null
        }
      });

      expect(event.teamId).toBeNull();
      expect(event.playerId).toBeNull();
    });
  });

  describe('Array and Utility Functions', () => {
    it('should transform array of events', async () => {
      // Create multiple events
      const eventData = [
        {
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'goal' as const,
          teamId: testHomeTeamId
        },
        {
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'assist' as const,
          playerId: testPlayerId
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
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'save'
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
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'goal'
        }
      });

      const events = await prisma.event.findMany({
        where: { matchId: testMatchId }
      });

      expect(events).toHaveLength(1);
      expect(events[0].matchId).toBe(testMatchId);
    });

    it('should find events by kind', async () => {
      await prisma.event.create({
        data: {
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'penalty'
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
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'goal'
        }
      });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const event2 = await prisma.event.create({
        data: {
          matchId: testMatchId,
          season_id: testSeasonId,
          kind: 'assist'
        }
      });

      const events = await prisma.event.findMany({
        where: { matchId: testMatchId },
        orderBy: { created_at: 'asc' }
      });

      expect(events).toHaveLength(2);
      expect(events[0].id).toBe(event1.id);
      expect(events[1].id).toBe(event2.id);
    });
  });
});