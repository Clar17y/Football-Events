/**
 * Shared fast-check arbitraries for property-based testing.
 * 
 * These arbitraries generate random but valid test data for IndexedDB records,
 * ensuring consistent test data generation across all property tests.
 * 
 * NOTE: All field names use camelCase to align with the IndexedDB schema.
 */

import * as fc from 'fast-check';
import { THIRTY_DAYS_MS } from '../../src/services/cacheService';

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
 * Arbitrary for generating team records compatible with IndexedDB schema (camelCase)
 */
export const teamArbitrary = fc
  .record({
    id: fc.uuid(),
    teamId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    colorPrimary: hexColorArbitrary,
    colorSecondary: hexColorArbitrary,
    awayColorPrimary: fc.option(hexColorArbitrary, { nil: undefined }),
    awayColorSecondary: fc.option(hexColorArbitrary, { nil: undefined }),
    logoUrl: fc.option(fc.webUrl(), { nil: undefined }),
    isOpponent: fc.boolean(),
    createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
    isDeleted: fc.boolean(),
    synced: fc.boolean(),
    syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  })
  .map((t) => ({ ...t, teamId: t.id })); // Ensure teamId matches id

/**
 * Arbitrary for generating player records compatible with IndexedDB schema (camelCase)
 */
export const playerArbitrary = fc.record({
  id: fc.uuid(),
  fullName: fc.string({ minLength: 1, maxLength: 50 }),
  squadNumber: fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  preferredPos: fc.option(fc.constantFrom('GK', 'DEF', 'MID', 'FWD'), { nil: undefined }),
  dob: fc.oneof(
    fc.constant(undefined),
    fc.integer({ min: 315532800000, max: 1577836800000 }).map(ts => new Date(ts).toISOString())
  ),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  currentTeam: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating season records compatible with IndexedDB schema (camelCase)
 */
export const seasonArbitrary = fc
  .record({
    id: fc.uuid(),
    seasonId: fc.uuid(),
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
    createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
    isDeleted: fc.boolean(),
    synced: fc.boolean(),
    syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  })
  .map((s) => ({ ...s, seasonId: s.id })); // Ensure seasonId matches id

/**
 * Arbitrary for generating match records compatible with IndexedDB schema (camelCase)
 */
export const matchArbitrary = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  seasonId: fc.uuid(),
  homeTeamId: fc.uuid(),
  awayTeamId: fc.uuid(),
  kickoffTs: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  competition: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  venue: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  durationMins: fc.integer({ min: 40, max: 120 }),
  periodFormat: fc.constantFrom('half', 'quarter') as fc.Arbitrary<'half' | 'quarter'>,
  homeScore: fc.integer({ min: 0, max: 20 }),
  awayScore: fc.integer({ min: 0, max: 20 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
}).map((m) => ({ ...m, matchId: m.id })); // Ensure matchId matches id

/**
 * Arbitrary for generating event records compatible with IndexedDB schema (camelCase)
 */
export const eventArbitrary = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  tsServer: fc.integer({ min: 0, max: Date.now() }),
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
  teamId: fc.uuid(),
  playerId: fc.uuid(),
  sentiment: fc.integer({ min: -4, max: 4 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating match period records compatible with IndexedDB schema (camelCase)
 */
export const matchPeriodArbitrary = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  periodNumber: fc.integer({ min: 1, max: 4 }),
  periodType: fc.constantFrom('REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT') as fc.Arbitrary<'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'>,
  startedAt: fc.integer({ min: 0, max: Date.now() }),
  endedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  durationSeconds: fc.option(fc.integer({ min: 0, max: 60 * 60 }), { nil: undefined }),
  createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating match state records compatible with IndexedDB schema (camelCase)
 */
export const matchStateArbitrary = fc.record({
  matchId: fc.uuid(),
  status: fc.constantFrom('NOT_STARTED', 'LIVE', 'PAUSED', 'COMPLETED') as fc.Arbitrary<'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED'>,
  currentPeriodId: fc.option(fc.uuid(), { nil: undefined }),
  timerMs: fc.integer({ min: 0, max: 90 * 60 * 1000 }),
  lastUpdatedAt: fc.integer({ min: 0, max: Date.now() }),
  createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating lineup records compatible with IndexedDB schema (camelCase)
 */
export const lineupArbitrary = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  playerId: fc.uuid(),
  startMin: fc.integer({ min: 0, max: 90 }),
  endMin: fc.option(fc.integer({ min: 0, max: 120 }), { nil: undefined }),
  position: fc.constantFrom('GK', 'LB', 'CB', 'RB', 'LM', 'CM', 'RM', 'LW', 'ST', 'RW'),
  createdAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updatedAt: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  createdByUserId: fc.string({ minLength: 1, maxLength: 20 }),
  isDeleted: fc.boolean(),
  synced: fc.boolean(),
  syncedAt: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
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
