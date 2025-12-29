/**
 * Property-Based Test: Shared Types Follow camelCase and Are JSON-Native
 * 
 * **Feature: shared-types-unification, Property 1: Shared Types Follow camelCase and Are JSON-Native**
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * 
 * This test verifies that:
 * 1. All field names in shared entity interfaces match camelCase pattern (no underscores)
 * 2. Date/time fields use ISO strings (no Date objects in shared types)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Import all entity interfaces from frontend.ts to inspect their structure
import type {
  Player,
  Team,
  Match,
  Event,
  Season,
  Lineup,
  Award,
  MatchAward,
  PlayerTeam,
  MatchState,
  MatchPeriod,
  Position,
  PlayerCreateRequest,
  PlayerUpdateRequest,
  TeamCreateRequest,
  TeamUpdateRequest,
  MatchCreateRequest,
  MatchUpdateRequest,
  EventCreateRequest,
  EventUpdateRequest,
  SeasonCreateRequest,
  SeasonUpdateRequest,
  LineupCreateRequest,
  LineupUpdateRequest,
  AwardCreateRequest,
  AwardUpdateRequest,
  MatchAwardCreateRequest,
  MatchAwardUpdateRequest,
  PlayerTeamCreateRequest,
  PlayerTeamUpdateRequest,
} from '../types/frontend';

// camelCase pattern: starts with lowercase, no underscores
const CAMEL_CASE_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Checks if a field name follows camelCase convention
 */
function isCamelCase(fieldName: string): boolean {
  return CAMEL_CASE_PATTERN.test(fieldName);
}

/**
 * Gets all field names from a sample object
 */
function getFieldNames(obj: Record<string, unknown>): string[] {
  return Object.keys(obj);
}

/**
 * Creates a sample entity with all fields populated for inspection
 */
function createSamplePlayer(): Player {
  return {
    id: 'test-id',
    name: 'Test Player',
    squadNumber: 10,
    preferredPosition: 'MF',
    dateOfBirth: '2000-01-01',
    notes: 'Test notes',
    currentTeam: 'team-id',
    stats: { matches: 0 },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleTeam(): Team {
  return {
    id: 'test-id',
    name: 'Test Team',
    homeKitPrimary: '#000000',
    homeKitSecondary: '#FFFFFF',
    awayKitPrimary: '#FF0000',
    awayKitSecondary: '#00FF00',
    logoUrl: 'https://example.com/logo.png',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
    isOpponent: false,
  };
}

function createSampleMatch(): Match {
  return {
    id: 'test-id',
    seasonId: 'season-id',
    kickoffTime: '2025-01-01T15:00:00.000Z',
    competition: 'League',
    homeTeamId: 'home-team-id',
    awayTeamId: 'away-team-id',
    venue: 'Stadium',
    durationMinutes: 90,
    periodFormat: '2x45',
    homeScore: 0,
    awayScore: 0,
    ourScore: 0,
    opponentScore: 0,
    notes: 'Test notes',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleEvent(): Event {
  return {
    id: 'test-id',
    matchId: 'match-id',
    createdAt: '2025-01-01T00:00:00.000Z',
    periodNumber: 1,
    clockMs: 0,
    kind: 'GOAL',
    teamId: 'team-id',
    playerId: 'player-id',
    notes: 'Test notes',
    sentiment: 1,
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleSeason(): Season {
  return {
    id: 'test-id',
    seasonId: 'test-id',
    label: 'Test Season',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    isCurrent: true,
    description: 'Test description',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleLineup(): Lineup {
  return {
    id: 'test-id',
    matchId: 'match-id',
    playerId: 'player-id',
    startMinute: 0,
    endMinute: 90,
    position: 'MF',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleAward(): Award {
  return {
    id: 'test-id',
    seasonId: 'season-id',
    playerId: 'player-id',
    category: 'MVP',
    notes: 'Test notes',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleMatchAward(): MatchAward {
  return {
    id: 'test-id',
    matchId: 'match-id',
    playerId: 'player-id',
    category: 'MOTM',
    notes: 'Test notes',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSamplePlayerTeam(): PlayerTeam {
  return {
    id: 'test-id',
    playerId: 'player-id',
    teamId: 'team-id',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleMatchState(): MatchState {
  return {
    id: 'test-id',
    matchId: 'match-id',
    status: 'SCHEDULED',
    currentPeriod: 1,
    currentPeriodType: 'REGULAR',
    matchStartedAt: '2025-01-01T15:00:00.000Z',
    matchEndedAt: '2025-01-01T17:00:00.000Z',
    totalElapsedSeconds: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

function createSampleMatchPeriod(): MatchPeriod {
  return {
    id: 'test-id',
    matchId: 'match-id',
    periodNumber: 1,
    periodType: 'REGULAR',
    startedAt: '2025-01-01T15:00:00.000Z',
    endedAt: '2025-01-01T15:45:00.000Z',
    durationSeconds: 2700,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    createdByUserId: 'user-id',
    deletedAt: '2025-01-01T00:00:00.000Z',
    deletedByUserId: 'user-id',
    isDeleted: false,
  };
}

// Request type samples
function createSampleTeamCreateRequest(): TeamCreateRequest {
  return {
    name: 'Test Team',
    homeKitPrimary: '#000000',
    homeKitSecondary: '#FFFFFF',
    awayKitPrimary: '#FF0000',
    awayKitSecondary: '#00FF00',
    logoUrl: 'https://example.com/logo.png',
    isOpponent: false,
  };
}

function createSampleMatchCreateRequest(): MatchCreateRequest {
  return {
    seasonId: 'season-id',
    kickoffTime: '2025-01-01T15:00:00.000Z',
    competition: 'League',
    homeTeamId: 'home-team-id',
    awayTeamId: 'away-team-id',
    venue: 'Stadium',
    durationMinutes: 90,
    periodFormat: '2x45',
    notes: 'Test notes',
  };
}

function createSamplePlayerTeamCreateRequest(): PlayerTeamCreateRequest {
  return {
    playerId: 'player-id',
    teamId: 'team-id',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
  };
}

describe('Property 1: Shared Types Follow camelCase and Are JSON-Native', () => {
  // All entity types to test
  const entitySamples: Array<{ name: string; sample: Record<string, unknown> }> = [
    { name: 'Player', sample: createSamplePlayer() },
    { name: 'Team', sample: createSampleTeam() },
    { name: 'Match', sample: createSampleMatch() },
    { name: 'Event', sample: createSampleEvent() },
    { name: 'Season', sample: createSampleSeason() },
    { name: 'Lineup', sample: createSampleLineup() },
    { name: 'Award', sample: createSampleAward() },
    { name: 'MatchAward', sample: createSampleMatchAward() },
    { name: 'PlayerTeam', sample: createSamplePlayerTeam() },
    { name: 'MatchState', sample: createSampleMatchState() },
    { name: 'MatchPeriod', sample: createSampleMatchPeriod() },
    { name: 'TeamCreateRequest', sample: createSampleTeamCreateRequest() },
    { name: 'MatchCreateRequest', sample: createSampleMatchCreateRequest() },
    { name: 'PlayerTeamCreateRequest', sample: createSamplePlayerTeamCreateRequest() },
  ];

  describe('All field names follow camelCase pattern', () => {
    it.each(entitySamples)('$name has all camelCase field names', ({ name, sample }) => {
      const fieldNames = getFieldNames(sample);
      
      // Property: For any field name in the entity, it should match camelCase pattern
      fc.assert(
        fc.property(
          fc.constantFrom(...fieldNames),
          (fieldName) => {
            const result = isCamelCase(fieldName);
            if (!result) {
              console.error(`Field "${fieldName}" in ${name} does not follow camelCase pattern`);
            }
            return result;
          }
        ),
        { numRuns: fieldNames.length }
      );
    });
  });

  describe('No Date objects in shared types (JSON-native)', () => {
    it.each(entitySamples)('$name has no Date object values', ({ name, sample }) => {
      const fieldNames = getFieldNames(sample);
      
      // Property: For any field value in the entity, it should not be a Date object
      fc.assert(
        fc.property(
          fc.constantFrom(...fieldNames),
          (fieldName) => {
            const value = sample[fieldName];
            const isDateObject = value instanceof Date;
            if (isDateObject) {
              console.error(`Field "${fieldName}" in ${name} contains a Date object instead of ISO string`);
            }
            return !isDateObject;
          }
        ),
        { numRuns: fieldNames.length }
      );
    });
  });

  describe('Date/time fields are ISO strings', () => {
    const dateTimeFields = [
      'createdAt',
      'updatedAt',
      'deletedAt',
      'kickoffTime',
      'matchStartedAt',
      'matchEndedAt',
      'startedAt',
      'endedAt',
    ];

    const dateOnlyFields = [
      'dateOfBirth',
      'startDate',
      'endDate',
    ];

    const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

    it.each(entitySamples)('$name date/time fields are ISO strings', ({ name, sample }) => {
      const fieldNames = getFieldNames(sample);
      
      // Check date-time fields
      for (const fieldName of fieldNames) {
        const value = sample[fieldName];
        if (value === undefined || value === null) continue;
        
        if (dateTimeFields.includes(fieldName)) {
          expect(typeof value).toBe('string');
          expect(value).toMatch(isoDateTimePattern);
        }
        
        if (dateOnlyFields.includes(fieldName)) {
          expect(typeof value).toBe('string');
          expect(value).toMatch(isoDatePattern);
        }
      }
    });
  });

  describe('No snake_case fields in shared types', () => {
    const snakeCasePattern = /_/;

    it.each(entitySamples)('$name has no snake_case field names', ({ name, sample }) => {
      const fieldNames = getFieldNames(sample);
      
      // Property: For any field name, it should not contain underscores
      fc.assert(
        fc.property(
          fc.constantFrom(...fieldNames),
          (fieldName) => {
            const hasUnderscore = snakeCasePattern.test(fieldName);
            if (hasUnderscore) {
              console.error(`Field "${fieldName}" in ${name} contains underscore (snake_case)`);
            }
            return !hasUnderscore;
          }
        ),
        { numRuns: fieldNames.length }
      );
    });
  });
});
