/**
 * Property-Based Test: Backend Transform Output Matches Shared Types
 * 
 * **Feature: shared-types-unification, Property 2: Backend Transform Output Matches Shared Types**
 * **Validates: Requirements 4.1, 4.3, 4.4**
 * 
 * This test verifies that:
 * 1. All Prisma → Frontend transformers output camelCase field names (no snake_case)
 * 2. All Date fields from Prisma are serialized to ISO strings in the output
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  transformPlayer,
  transformTeam,
  transformMatch,
  transformEvent,
  transformSeason,
  transformLineup,
  transformAward,
  transformMatchAward,
  transformPlayerTeam,
  transformMatchState,
  transformMatchPeriod,
  transformPosition,
} from '../types/transformers';
import type {
  PrismaPlayer,
  PrismaTeam,
  PrismaMatch,
  PrismaEvent,
  PrismaSeason,
  PrismaLineup,
  PrismaAward,
  PrismaMatchAward,
  PrismaPlayerTeam,
  PrismaMatchState,
  PrismaMatchPeriod,
  PrismaPosition,
} from '../types/prisma';

// ============================================================================
// ARBITRARIES FOR PRISMA TYPES
// ============================================================================

const arbUuid = fc.uuid();
// Use a valid date range to avoid NaN dates
const arbDate = fc.date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2030-12-31T23:59:59.999Z') })
  .filter(d => !isNaN(d.getTime())); // Ensure valid dates only
const arbOptionalDate = fc.option(arbDate, { nil: null });
const arbString = fc.string({ minLength: 1, maxLength: 100 });
const arbOptionalString = fc.option(arbString, { nil: null });
const arbNumber = fc.integer({ min: 0, max: 1000 });
const arbOptionalNumber = fc.option(arbNumber, { nil: null });
const arbBoolean = fc.boolean();

const arbPrismaPlayer: fc.Arbitrary<PrismaPlayer> = fc.record({
  id: arbUuid,
  name: arbString,
  squad_number: arbOptionalNumber,
  preferred_pos: arbOptionalString,
  dob: arbOptionalDate,
  notes: arbOptionalString,
  current_team: arbOptionalString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaTeam: fc.Arbitrary<PrismaTeam> = fc.record({
  id: arbUuid,
  name: arbString,
  home_kit_primary: arbOptionalString,
  home_kit_secondary: arbOptionalString,
  away_kit_primary: arbOptionalString,
  away_kit_secondary: arbOptionalString,
  logo_url: arbOptionalString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
  is_opponent: arbBoolean,
});

const arbPrismaMatch: fc.Arbitrary<PrismaMatch> = fc.record({
  match_id: arbUuid,
  season_id: arbUuid,
  kickoff_ts: arbDate,
  competition: arbOptionalString,
  home_team_id: arbUuid,
  away_team_id: arbUuid,
  venue: arbOptionalString,
  duration_mins: arbNumber,
  period_format: arbString,
  home_score: arbNumber,
  away_score: arbNumber,
  notes: arbOptionalString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbEventKind = fc.constantFrom(
  'goal', 'assist', 'key_pass', 'save', 'interception', 
  'tackle', 'foul', 'penalty', 'free_kick', 'ball_out', 'own_goal', 'formation_change'
) as fc.Arbitrary<'goal' | 'assist' | 'key_pass' | 'save' | 'interception' | 'tackle' | 'foul' | 'penalty' | 'free_kick' | 'ball_out' | 'own_goal' | 'formation_change'>;

const arbPrismaEvent: fc.Arbitrary<PrismaEvent> = fc.record({
  id: arbUuid,
  match_id: arbUuid,
  period_number: arbOptionalNumber,
  clock_ms: arbOptionalNumber,
  kind: arbEventKind,
  team_id: arbOptionalString,
  player_id: arbOptionalString,
  notes: arbOptionalString,
  sentiment: arbNumber,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaSeason: fc.Arbitrary<PrismaSeason> = fc.record({
  season_id: arbUuid,
  label: arbString,
  start_date: arbOptionalDate,
  end_date: arbOptionalDate,
  is_current: arbBoolean,
  description: arbOptionalString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaLineup: fc.Arbitrary<PrismaLineup> = fc.record({
  id: arbUuid,
  match_id: arbUuid,
  player_id: arbUuid,
  start_min: arbNumber,
  end_min: arbOptionalNumber,
  position: arbString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaAward: fc.Arbitrary<PrismaAward> = fc.record({
  award_id: arbUuid,
  season_id: arbUuid,
  player_id: arbUuid,
  category: arbString,
  notes: arbOptionalString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaMatchAward: fc.Arbitrary<PrismaMatchAward> = fc.record({
  match_award_id: arbUuid,
  match_id: arbUuid,
  player_id: arbUuid,
  category: arbString,
  notes: arbOptionalString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaPlayerTeam: fc.Arbitrary<PrismaPlayerTeam> = fc.record({
  id: arbUuid,
  player_id: arbUuid,
  team_id: arbUuid,
  start_date: arbDate,
  end_date: arbOptionalDate,
  is_active: arbBoolean,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbMatchStatus = fc.constantFrom('scheduled', 'live', 'paused', 'completed', 'cancelled', 'postponed');
const arbPeriodType = fc.constantFrom('regular', 'extra_time', 'penalty_shootout');

const arbPrismaMatchState: fc.Arbitrary<PrismaMatchState> = fc.record({
  id: arbUuid,
  match_id: arbUuid,
  status: arbMatchStatus,
  current_period: arbOptionalNumber,
  current_period_type: fc.option(arbPeriodType, { nil: null }),
  match_started_at: arbOptionalDate,
  match_ended_at: arbOptionalDate,
  total_elapsed_seconds: arbNumber,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaMatchPeriod: fc.Arbitrary<PrismaMatchPeriod> = fc.record({
  id: arbUuid,
  match_id: arbUuid,
  period_number: arbNumber,
  period_type: arbPeriodType,
  started_at: arbOptionalDate,
  ended_at: arbOptionalDate,
  duration_seconds: arbOptionalNumber,
  created_at: arbDate,
  updated_at: arbOptionalDate,
  created_by_user_id: arbUuid,
  deleted_at: arbOptionalDate,
  deleted_by_user_id: arbOptionalString,
  is_deleted: arbBoolean,
});

const arbPrismaPosition: fc.Arbitrary<PrismaPosition> = fc.record({
  pos_code: arbString,
  long_name: arbString,
  created_at: arbDate,
  updated_at: arbOptionalDate,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const CAMEL_CASE_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks if a field name follows camelCase convention (no underscores)
 */
function isCamelCase(fieldName: string): boolean {
  return CAMEL_CASE_PATTERN.test(fieldName);
}

/**
 * Checks if a value is an ISO date-time string
 */
function isIsoDateTimeString(value: unknown): boolean {
  return typeof value === 'string' && ISO_DATE_TIME_PATTERN.test(value);
}

/**
 * Checks if a value is an ISO date string (YYYY-MM-DD)
 */
function isIsoDateString(value: unknown): boolean {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value);
}

/**
 * Checks if a value is a Date object (which should NOT be in the output)
 */
function isDateObject(value: unknown): boolean {
  return value instanceof Date;
}

/**
 * Gets all field names from an object
 */
function getFieldNames(obj: Record<string, unknown>): string[] {
  return Object.keys(obj);
}

/**
 * Validates that all field names in an object are camelCase
 */
function validateCamelCaseFields(obj: Record<string, unknown>, entityName: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const fieldName of getFieldNames(obj)) {
    if (!isCamelCase(fieldName)) {
      errors.push(`${entityName}.${fieldName} is not camelCase`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates that no Date objects exist in the output (all dates should be ISO strings)
 */
function validateNoDateObjects(obj: Record<string, unknown>, entityName: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [fieldName, value] of Object.entries(obj)) {
    if (isDateObject(value)) {
      errors.push(`${entityName}.${fieldName} is a Date object instead of ISO string`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validates that date/time fields are ISO strings
 */
function validateDateFieldsAreIsoStrings(
  obj: Record<string, unknown>, 
  entityName: string,
  dateTimeFields: string[],
  dateOnlyFields: string[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const fieldName of dateTimeFields) {
    const value = obj[fieldName];
    if (value !== undefined && value !== null) {
      if (!isIsoDateTimeString(value)) {
        errors.push(`${entityName}.${fieldName} should be ISO date-time string but got: ${typeof value} = ${value}`);
      }
    }
  }
  
  for (const fieldName of dateOnlyFields) {
    const value = obj[fieldName];
    if (value !== undefined && value !== null) {
      if (!isIsoDateString(value)) {
        errors.push(`${entityName}.${fieldName} should be ISO date string but got: ${typeof value} = ${value}`);
      }
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// PROPERTY TESTS
// ============================================================================

describe('Property 2: Backend Transform Output Matches Shared Types', () => {
  const dateTimeFields = ['createdAt', 'updatedAt', 'deletedAt', 'kickoffTime', 'matchStartedAt', 'matchEndedAt', 'startedAt', 'endedAt'];
  const dateOnlyFields = ['dateOfBirth', 'startDate', 'endDate'];

  describe('transformPlayer outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaPlayer, (prismaPlayer) => {
          const result = transformPlayer(prismaPlayer);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Player');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaPlayer, (prismaPlayer) => {
          const result = transformPlayer(prismaPlayer);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Player');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should output date fields as ISO strings', () => {
      fc.assert(
        fc.property(arbPrismaPlayer, (prismaPlayer) => {
          const result = transformPlayer(prismaPlayer);
          const validation = validateDateFieldsAreIsoStrings(
            result as unknown as Record<string, unknown>,
            'Player',
            dateTimeFields,
            dateOnlyFields
          );
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformTeam outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaTeam, (prismaTeam) => {
          const result = transformTeam(prismaTeam);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Team');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaTeam, (prismaTeam) => {
          const result = transformTeam(prismaTeam);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Team');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformMatch outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaMatch, (prismaMatch) => {
          const result = transformMatch(prismaMatch);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Match');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaMatch, (prismaMatch) => {
          const result = transformMatch(prismaMatch);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Match');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformEvent outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaEvent, (prismaEvent) => {
          const result = transformEvent(prismaEvent);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Event');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaEvent, (prismaEvent) => {
          const result = transformEvent(prismaEvent);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Event');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformSeason outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaSeason, (prismaSeason) => {
          const result = transformSeason(prismaSeason);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Season');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaSeason, (prismaSeason) => {
          const result = transformSeason(prismaSeason);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Season');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformLineup outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaLineup, (prismaLineup) => {
          const result = transformLineup(prismaLineup);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Lineup');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaLineup, (prismaLineup) => {
          const result = transformLineup(prismaLineup);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Lineup');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformAward outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaAward, (prismaAward) => {
          const result = transformAward(prismaAward);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Award');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaAward, (prismaAward) => {
          const result = transformAward(prismaAward);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Award');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformMatchAward outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaMatchAward, (prismaMatchAward) => {
          const result = transformMatchAward(prismaMatchAward);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'MatchAward');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaMatchAward, (prismaMatchAward) => {
          const result = transformMatchAward(prismaMatchAward);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'MatchAward');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformPlayerTeam outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaPlayerTeam, (prismaPlayerTeam) => {
          const result = transformPlayerTeam(prismaPlayerTeam);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'PlayerTeam');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaPlayerTeam, (prismaPlayerTeam) => {
          const result = transformPlayerTeam(prismaPlayerTeam);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'PlayerTeam');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformMatchState outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaMatchState, (prismaMatchState) => {
          const result = transformMatchState(prismaMatchState);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'MatchState');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaMatchState, (prismaMatchState) => {
          const result = transformMatchState(prismaMatchState);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'MatchState');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformMatchPeriod outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaMatchPeriod, (prismaMatchPeriod) => {
          const result = transformMatchPeriod(prismaMatchPeriod);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'MatchPeriod');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaMatchPeriod, (prismaMatchPeriod) => {
          const result = transformMatchPeriod(prismaMatchPeriod);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'MatchPeriod');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('transformPosition outputs camelCase fields and ISO strings', () => {
    it('should output all camelCase field names', () => {
      fc.assert(
        fc.property(arbPrismaPosition, (prismaPosition) => {
          const result = transformPosition(prismaPosition);
          const validation = validateCamelCaseFields(result as unknown as Record<string, unknown>, 'Position');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });

    it('should not output any Date objects', () => {
      fc.assert(
        fc.property(arbPrismaPosition, (prismaPosition) => {
          const result = transformPosition(prismaPosition);
          const validation = validateNoDateObjects(result as unknown as Record<string, unknown>, 'Position');
          expect(validation.errors).toEqual([]);
          return validation.valid;
        }),
        { numRuns: 100 }
      );
    });
  });
});
