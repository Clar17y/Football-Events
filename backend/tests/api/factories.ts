/**
 * Test Data Factories
 * 
 * Provides factory functions for creating test data with realistic values.
 * These factories ensure consistent test data and reduce duplication across tests.
 */

import { 
  TeamCreateRequest, 
  PlayerCreateRequest, 
  EventCreateRequest,
  MatchCreateRequest,
  SeasonCreateRequest,
  PositionCreateRequest,
  AwardCreateRequest,
  LineupCreateRequest
} from '@shared/types';

/**
 * Generate unique test identifiers as valid UUIDs
 */
import { randomUUID } from 'crypto';

const generateId = (prefix?: string) => randomUUID();

/**
 * Team factory
 */
export class TeamFactory {
  static create(overrides: Partial<TeamCreateRequest> = {}): TeamCreateRequest {
    return {
      name: `Test Team ${Date.now()}`,
      homeKitPrimary: '#FF0000',
      homeKitSecondary: '#FFFFFF',
      awayKitPrimary: '#000000',
      awayKitSecondary: '#FFD700',
      logoUrl: 'https://example.com/logos/test-team.png',
      ...overrides
    };
  }

  static createMinimal(overrides: Partial<TeamCreateRequest> = {}): TeamCreateRequest {
    return {
      name: `Minimal Team ${Date.now()}`,
      ...overrides
    };
  }

  static createBatch(count: number): TeamCreateRequest[] {
    return Array.from({ length: count }, (_, i) => 
      this.create({ name: `Batch Team ${i + 1} ${Date.now()}` })
    );
  }
}

/**
 * Player factory
 */
export class PlayerFactory {
  static create(teamId?: string, overrides: Partial<PlayerCreateRequest> = {}): PlayerCreateRequest {
    return {
      name: `Test Player ${Date.now()}`,
      squadNumber: Math.floor(Math.random() * 99) + 1,
      preferredPosition: 'FW',
      dateOfBirth: '2010-01-15T00:00:00.000Z', // U10 appropriate age
      notes: 'Test player notes',
      currentTeam: teamId || generateId('team'),
      ...overrides
    };
  }

  static createMinimal(overrides: Partial<PlayerCreateRequest> = {}): PlayerCreateRequest {
    return {
      name: `Minimal Player ${Date.now()}`,
      ...overrides
    };
  }

  static createBatch(count: number, teamId?: string): PlayerCreateRequest[] {
    return Array.from({ length: count }, (_, i) => 
      this.create(teamId, { 
        name: `Batch Player ${i + 1} ${Date.now()}`,
        squadNumber: i + 1 
      })
    );
  }
}

/**
 * Event factory
 */
export class EventFactory {
  static create(matchId?: string, overrides: Partial<EventCreateRequest> = {}): EventCreateRequest {
    return {
      matchId: matchId || generateId('match'),
      seasonId: generateId('season'),
      kind: 'goal',
      teamId: generateId('team'),
      playerId: generateId('player'),
      periodNumber: 1,
      clockMs: 30000, // 30 seconds
      notes: 'Test event notes',
      sentiment: 1,
      ...overrides
    };
  }

  static createGoal(matchId?: string, overrides: Partial<EventCreateRequest> = {}): EventCreateRequest {
    return this.create(matchId, {
      kind: 'goal',
      sentiment: 2,
      notes: 'Test goal event',
      ...overrides
    });
  }

  static createAssist(matchId?: string, overrides: Partial<EventCreateRequest> = {}): EventCreateRequest {
    return this.create(matchId, {
      kind: 'assist',
      sentiment: 1,
      notes: 'Test assist event',
      ...overrides
    });
  }

  static createSave(matchId?: string, overrides: Partial<EventCreateRequest> = {}): EventCreateRequest {
    return this.create(matchId, {
      kind: 'save',
      sentiment: 1,
      notes: 'Test save event',
      ...overrides
    });
  }

  static createBatch(count: number, matchId?: string): EventCreateRequest[] {
    const eventTypes = ['goal', 'assist', 'save', 'foul', 'ball_out'] as const;
    
    return Array.from({ length: count }, (_, i) => 
      this.create(matchId, {
        kind: eventTypes[i % eventTypes.length],
        clockMs: i * 1000, // Spread events across time
        notes: `Batch event ${i + 1}`
      })
    );
  }

  static createRapidEvents(count: number, matchId?: string): EventCreateRequest[] {
    // Create events with very close timestamps (simulate rapid real-time events)
    return Array.from({ length: count }, (_, i) => 
      this.create(matchId, {
        kind: 'ball_out',
        clockMs: 30000 + (i * 100), // Events 100ms apart
        notes: `Rapid event ${i + 1}`
      })
    );
  }
}

/**
 * Match factory
 */
export class MatchFactory {
  static create(overrides: Partial<MatchCreateRequest> = {}): MatchCreateRequest {
    const now = new Date();
    const kickoffTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    
    return {
      seasonId: generateId('season'),
      kickoffTime: kickoffTime.toISOString(),
      homeTeamId: generateId('home-team'),
      awayTeamId: generateId('away-team'),
      competition: 'Test League',
      venue: 'Test Stadium',
      durationMinutes: 90,
      periodFormat: 'half',
      ourScore: 0,
      opponentScore: 0,
      notes: 'Test match notes',
      ...overrides
    };
  }

  static createU10Match(overrides: Partial<MatchCreateRequest> = {}): MatchCreateRequest {
    return this.create({
      durationMinutes: 60, // U10 matches are shorter
      periodFormat: 'half',
      competition: 'U10 League',
      ...overrides
    });
  }
}

/**
 * Season factory
 */
export class SeasonFactory {
  static create(overrides: Partial<SeasonCreateRequest> = {}): SeasonCreateRequest {
    const currentYear = new Date().getFullYear();
    
    return {
      label: `${currentYear}/${currentYear + 1} Season`,
      ...overrides
    };
  }

  static createBatch(count: number): SeasonCreateRequest[] {
    const currentYear = new Date().getFullYear();
    
    return Array.from({ length: count }, (_, i) => ({
      label: `${currentYear + i}/${currentYear + i + 1} Test Season ${i + 1}`
    }));
  }
}

/**
 * Position factory
 */
export class PositionFactory {
  static create(overrides: Partial<PositionCreateRequest> = {}): PositionCreateRequest {
    const positions = [
      { code: 'GK', longName: 'Goalkeeper' },
      { code: 'DEF', longName: 'Defender' },
      { code: 'MID', longName: 'Midfielder' },
      { code: 'FW', longName: 'Forward' }
    ];
    
    const randomPosition = positions[Math.floor(Math.random() * positions.length)];
    
    return {
      code: `${randomPosition.code}_${Date.now()}`,
      longName: `Test ${randomPosition.longName}`,
      ...overrides
    };
  }

  static createStandardPositions(): PositionCreateRequest[] {
    return [
      { code: 'GK_TEST', longName: 'Test Goalkeeper' },
      { code: 'DEF_TEST', longName: 'Test Defender' },
      { code: 'MID_TEST', longName: 'Test Midfielder' },
      { code: 'FW_TEST', longName: 'Test Forward' }
    ];
  }
}

/**
 * Award factory
 */
export class AwardFactory {
  static create(overrides: Partial<AwardCreateRequest> = {}): AwardCreateRequest {
    return {
      seasonId: generateId('season'),
      playerId: generateId('player'),
      category: 'Player of the Match',
      notes: 'Test award notes',
      ...overrides
    };
  }

  static createBatch(count: number, seasonId?: string): AwardCreateRequest[] {
    const categories = [
      'Player of the Match',
      'Goal of the Month',
      'Most Improved Player',
      'Fair Play Award',
      'Top Scorer'
    ];
    
    return Array.from({ length: count }, (_, i) => 
      this.create({
        seasonId: seasonId || generateId('season'),
        category: categories[i % categories.length],
        notes: `Batch award ${i + 1}`
      })
    );
  }
}

/**
 * Lineup factory
 */
export class LineupFactory {
  static create(overrides: Partial<LineupCreateRequest> = {}): LineupCreateRequest {
    return {
      matchId: generateId('match'),
      playerId: generateId('player'),
      startMinute: 0,
      endMinute: 90,
      position: 'FW',
      ...overrides
    };
  }

  static createStartingLineup(matchId: string, playerIds: string[]): LineupCreateRequest[] {
    const positions = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'FW', 'FW'];
    
    return playerIds.slice(0, 7).map((playerId, i) => ({
      matchId,
      playerId,
      startMinute: 0,
      endMinute: 45, // First half
      position: positions[i] || 'FW'
    }));
  }

  static createSubstitution(matchId: string, playerOutId: string, playerInId: string, minute: number): LineupCreateRequest[] {
    return [
      {
        matchId,
        playerId: playerOutId,
        startMinute: 0,
        endMinute: minute,
        position: 'FW'
      },
      {
        matchId,
        playerId: playerInId,
        startMinute: minute,
        endMinute: 90,
        position: 'FW'
      }
    ];
  }
}

/**
 * Batch operation factory
 */
export class BatchFactory {
  static createEventBatch(matchId?: string) {
    return {
      create: EventFactory.createBatch(3, matchId),
      update: [
        {
          id: generateId('event'),
          data: { notes: 'Updated event notes', sentiment: 2 }
        }
      ],
      delete: [generateId('event'), generateId('event')]
    };
  }

  static createLineupBatch(matchId?: string) {
    const testMatchId = matchId || generateId('match');
    
    return {
      create: LineupFactory.createStartingLineup(testMatchId, [
        generateId('player'),
        generateId('player'),
        generateId('player')
      ]),
      update: [
        {
          matchId: testMatchId,
          playerId: generateId('player'),
          startMinute: 0,
          data: { endMinute: 45, position: 'MID' }
        }
      ],
      delete: [
        {
          matchId: testMatchId,
          playerId: generateId('player'),
          startMinute: 45
        }
      ]
    };
  }
}

/**
 * Export all factories
 */
export const TestDataFactory = {
  Team: TeamFactory,
  Player: PlayerFactory,
  Event: EventFactory,
  Match: MatchFactory,
  Season: SeasonFactory,
  Position: PositionFactory,
  Award: AwardFactory,
  Lineup: LineupFactory,
  Batch: BatchFactory,
  generateId
};