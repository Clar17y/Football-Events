/**
 * Shared fast-check arbitraries for property-based testing.
 * 
 * These arbitraries generate random but valid test data for IndexedDB records,
 * ensuring consistent test data generation across all property tests.
 * 
 * NOTE: All field names use camelCase to align with the IndexedDB schema.
 * NOTE: All timestamps use ISO strings (not numeric timestamps).
 */

import * as fc from 'fast-check';
import { THIRTY_DAYS_MS } from '../../src/services/cacheService';

/**
 * Helper to generate ISO date strings
 */
export const isoDateArbitrary = fc
  .integer({ min: 946684800000, max: Date.now() + THIRTY_DAYS_MS * 2 })
  .map(ts => new Date(ts).toISOString());

/**
 * Helper to generate optional ISO date strings
 */
export const optionalIsoDateArbitrary = fc.option(isoDateArbitrary, { nil: undefined });

/**
 * Helper to generate hex color strings (e.g., "#ff00aa")
 */
export const hexColorArbitrary = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  )
  .map(
    ([r, g, b]) =>
      `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  );

/**
 * Arbitrary for generating team records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const teamArbitrary = fc
  .record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    homeKitPrimary: fc.option(hexColorArbitrary, { nil: undefined }),
    homeKitSecondary: fc.option(hexColorArbitrary, { nil: undefined }),
    awayKitPrimary: fc.option(hexColorArbitrary, { nil: undefined }),
    awayKitSecondary: fc.option(hexColorArbitrary, { nil: undefined }),
    logoUrl: fc.option(fc.webUrl(), { nil: undefined }),
    isOpponent: fc.boolean(),
    createdAt: isoDateArbitrary,
    updatedAt: isoDateArbitrary,
    createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
    deletedAt: optionalIsoDateArbitrary,
    deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    isDeleted: fc.boolean(),
    synced: fc.boolean(),
    syncedAt: optionalIsoDateArbitrary,
    // Legacy aliases for backward compatibility
    teamId: fc.uuid(),
    colorPrimary: fc.option(hexColorArbitrary, { nil: undefined }),
    colorSecondary: fc.option(hexColorArbitrary, { nil: undefined }),
    awayColorPrimary: fc.option(hexColorArbitrary, { nil: undefined }),
    awayColorSecondary: fc.option(hexColorArbitrary, { nil: undefined }),
  })
  .map((t) => ({ 
    ...t, 
    teamId: t.id,
    // Ensure legacy aliases match primary fields
    colorPrimary: t.homeKitPrimary,
    colorSecondary: t.homeKitSecondary,
    awayColorPrimary: t.awayKitPrimary,
    awayColorSecondary: t.awayKitSecondary,
  }));

/**
 * Arbitrary for generating player records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const playerArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  squadNumber: fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  preferredPosition: fc.option(fc.constantFrom('GK', 'DEF', 'MID', 'FWD'), { nil: undefined }),
  dateOfBirth: fc.oneof(
    fc.constant(undefined),
    fc.integer({ min: 315532800000, max: 1577836800000 }).map(ts => new Date(ts).toISOString())
  ),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  currentTeam: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: isoDateArbitrary,
  updatedAt: isoDateArbitrary,
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  deletedAt: optionalIsoDateArbitrary,
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: optionalIsoDateArbitrary,
  // Legacy aliases for backward compatibility
  fullName: fc.string({ minLength: 1, maxLength: 50 }),
  preferredPos: fc.option(fc.constantFrom('GK', 'DEF', 'MID', 'FWD'), { nil: undefined }),
  dob: fc.oneof(
    fc.constant(undefined),
    fc.integer({ min: 315532800000, max: 1577836800000 }).map(ts => new Date(ts).toISOString())
  ),
}).map((p) => ({
  ...p,
  // Ensure legacy aliases match primary fields
  fullName: p.name,
  preferredPos: p.preferredPosition,
  dob: p.dateOfBirth,
}));

/**
 * Arbitrary for generating season records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const seasonArbitrary = fc
  .record({
    id: fc.uuid(),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    startDate: fc.oneof(
      fc.constant(undefined),
      fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString().split('T')[0])
    ),
    endDate: fc.oneof(
      fc.constant(undefined),
      fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString().split('T')[0])
    ),
    isCurrent: fc.boolean(),
    description: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
    createdAt: isoDateArbitrary,
    updatedAt: isoDateArbitrary,
    createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
    deletedAt: optionalIsoDateArbitrary,
    deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    isDeleted: fc.boolean(),
    synced: fc.boolean(),
    syncedAt: optionalIsoDateArbitrary,
    // Legacy alias
    seasonId: fc.uuid(),
  })
  .map((s) => ({ ...s, seasonId: s.id }));

/**
 * Arbitrary for generating match records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const matchArbitrary = fc.record({
  id: fc.uuid(),
  seasonId: fc.uuid(),
  homeTeamId: fc.uuid(),
  awayTeamId: fc.uuid(),
  kickoffTime: isoDateArbitrary,
  competition: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  venue: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  durationMinutes: fc.integer({ min: 40, max: 120 }),
  periodFormat: fc.constantFrom('half', 'quarter') as fc.Arbitrary<'half' | 'quarter'>,
  homeScore: fc.integer({ min: 0, max: 20 }),
  awayScore: fc.integer({ min: 0, max: 20 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  createdAt: isoDateArbitrary,
  updatedAt: isoDateArbitrary,
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  deletedAt: optionalIsoDateArbitrary,
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: optionalIsoDateArbitrary,
  // Legacy alias
  matchId: fc.uuid(),
}).map((m) => ({ ...m, matchId: m.id }));

/**
 * Arbitrary for generating event records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const eventArbitrary = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  tsServer: isoDateArbitrary,
  periodNumber: fc.integer({ min: 1, max: 4 }),
  clockMs: fc.integer({ min: 0, max: 90 * 60 * 1000 }),
  kind: fc.constantFrom(
    'goal',
    'own_goal',
    'assist',
    'key_pass',
    'save',
    'interception',
    'tackle',
    'foul',
    'penalty',
    'free_kick',
    'ball_out'
  ),
  teamId: fc.option(fc.uuid(), { nil: undefined }),
  playerId: fc.option(fc.uuid(), { nil: undefined }),
  sentiment: fc.integer({ min: -4, max: 4 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  createdAt: isoDateArbitrary,
  updatedAt: isoDateArbitrary,
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  deletedAt: optionalIsoDateArbitrary,
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: optionalIsoDateArbitrary,
});

/**
 * Arbitrary for generating match period records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const matchPeriodArbitrary = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  periodNumber: fc.integer({ min: 1, max: 4 }),
  periodType: fc.constantFrom('REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT') as fc.Arbitrary<'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'>,
  startedAt: isoDateArbitrary,
  endedAt: optionalIsoDateArbitrary,
  durationSeconds: fc.option(fc.integer({ min: 0, max: 60 * 60 }), { nil: undefined }),
  createdAt: isoDateArbitrary,
  updatedAt: isoDateArbitrary,
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  deletedAt: optionalIsoDateArbitrary,
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: optionalIsoDateArbitrary,
});

/**
 * Arbitrary for generating match state records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const matchStateArbitrary = fc.record({
  matchId: fc.uuid(),
  status: fc.constantFrom('NOT_STARTED', 'LIVE', 'PAUSED', 'COMPLETED') as fc.Arbitrary<'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED'>,
  currentPeriodId: fc.option(fc.uuid(), { nil: undefined }),
  timerMs: fc.integer({ min: 0, max: 90 * 60 * 1000 }),
  lastUpdatedAt: isoDateArbitrary,
  createdAt: isoDateArbitrary,
  updatedAt: isoDateArbitrary,
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  deletedAt: optionalIsoDateArbitrary,
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: optionalIsoDateArbitrary,
});

/**
 * Arbitrary for generating lineup records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const lineupArbitrary = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  playerId: fc.uuid(),
  startMinute: fc.integer({ min: 0, max: 90 }),
  endMinute: fc.option(fc.integer({ min: 0, max: 120 }), { nil: undefined }),
  position: fc.constantFrom('GK', 'LB', 'CB', 'RB', 'LM', 'CM', 'RM', 'LW', 'ST', 'RW'),
  createdAt: isoDateArbitrary,
  updatedAt: isoDateArbitrary,
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  deletedAt: optionalIsoDateArbitrary,
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: optionalIsoDateArbitrary,
});

/**
 * Arbitrary for generating playerTeam records compatible with IndexedDB schema (camelCase + ISO strings)
 */
export const playerTeamArbitrary = fc.record({
  id: fc.uuid(),
  playerId: fc.uuid(),
  teamId: fc.uuid(),
  seasonId: fc.uuid(),
  jerseyNumber: fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  createdAt: isoDateArbitrary,
  updatedAt: isoDateArbitrary,
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  deletedAt: optionalIsoDateArbitrary,
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: optionalIsoDateArbitrary,
});

/**
 * Helper to generate a guest user ID (starts with 'guest-')
 */
export const guestUserIdArbitrary = fc.uuid().map((id) => `guest-${id}`);

/**
 * Helper to generate a non-guest user ID
 */
export const authenticatedUserIdArbitrary = fc.uuid().map((id) => `user-${id}`);

/**
 * Helper to make IDs unique in an array of records
 */
export function makeIdsUnique<T extends { id: string }>(records: T[], prefix: string): T[] {
  return records.map((r, i) => ({
    ...r,
    id: `${prefix}-${i}-${r.id}`,
  }));
}

/**
 * Helper to make team IDs unique (handles both id and teamId)
 */
export function makeTeamIdsUnique<T extends { id: string; teamId?: string }>(
  records: T[],
  prefix: string
): T[] {
  return records.map((r, i) => ({
    ...r,
    id: `${prefix}-${i}-${r.id}`,
    teamId: `${prefix}-${i}-${r.id}`,
  }));
}

/**
 * Helper to make season IDs unique (handles both id and seasonId)
 */
export function makeSeasonIdsUnique<T extends { id: string; seasonId?: string }>(
  records: T[],
  prefix: string
): T[] {
  return records.map((r, i) => ({
    ...r,
    id: `${prefix}-${i}-${r.id}`,
    seasonId: `${prefix}-${i}-${r.id}`,
  }));
}
