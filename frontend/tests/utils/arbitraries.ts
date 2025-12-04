/**
 * Shared fast-check arbitraries for property-based testing.
 * 
 * These arbitraries generate random but valid test data for IndexedDB records,
 * ensuring consistent test data generation across all property tests.
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
 * Arbitrary for generating team records compatible with IndexedDB schema
 */
export const teamArbitrary = fc
  .record({
    id: fc.uuid(),
    team_id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    color_primary: hexColorArbitrary,
    color_secondary: hexColorArbitrary,
    created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
    is_deleted: fc.boolean(),
    synced: fc.boolean(),
    synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  })
  .map((t) => ({ ...t, team_id: t.id })); // Ensure team_id matches id

/**
 * Arbitrary for generating player records compatible with IndexedDB schema
 */
export const playerArbitrary = fc.record({
  id: fc.uuid(),
  full_name: fc.string({ minLength: 1, maxLength: 50 }),
  squad_number: fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  preferred_pos: fc.option(fc.constantFrom('GK', 'DEF', 'MID', 'FWD'), { nil: undefined }),
  created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
  is_deleted: fc.boolean(),
  synced: fc.boolean(),
  synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating season records compatible with IndexedDB schema
 */
export const seasonArbitrary = fc
  .record({
    id: fc.uuid(),
    season_id: fc.uuid(),
    label: fc.string({ minLength: 1, maxLength: 30 }),
    created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
    created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
    is_deleted: fc.boolean(),
    synced: fc.boolean(),
    synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  })
  .map((s) => ({ ...s, season_id: s.id })); // Ensure season_id matches id

/**
 * Arbitrary for generating match records compatible with IndexedDB schema
 */
export const matchArbitrary = fc.record({
  id: fc.uuid(),
  match_id: fc.uuid(),
  season_id: fc.uuid(),
  home_team_id: fc.uuid(),
  away_team_id: fc.uuid(),
  kickoff_ts: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  competition: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  venue: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  duration_mins: fc.integer({ min: 40, max: 120 }),
  period_format: fc.constantFrom('half', 'quarter'),
  home_score: fc.integer({ min: 0, max: 20 }),
  away_score: fc.integer({ min: 0, max: 20 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
  is_deleted: fc.boolean(),
  synced: fc.boolean(),
  synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating event records compatible with IndexedDB schema
 */
export const eventArbitrary = fc.record({
  id: fc.uuid(),
  match_id: fc.uuid(),
  ts_server: fc.integer({ min: 0, max: Date.now() }),
  period_number: fc.integer({ min: 1, max: 4 }),
  clock_ms: fc.integer({ min: 0, max: 90 * 60 * 1000 }),
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
  team_id: fc.uuid(),
  player_id: fc.uuid(),
  sentiment: fc.integer({ min: -4, max: 4 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
  is_deleted: fc.boolean(),
  synced: fc.boolean(),
  synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating match period records compatible with IndexedDB schema
 */
export const matchPeriodArbitrary = fc.record({
  id: fc.uuid(),
  match_id: fc.uuid(),
  period_number: fc.integer({ min: 1, max: 4 }),
  period_type: fc.constantFrom('REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'),
  started_at: fc.integer({ min: 0, max: Date.now() }),
  ended_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
  duration_seconds: fc.option(fc.integer({ min: 0, max: 60 * 60 }), { nil: undefined }),
  created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
  is_deleted: fc.boolean(),
  synced: fc.boolean(),
  synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating match state records compatible with IndexedDB schema
 */
export const matchStateArbitrary = fc.record({
  match_id: fc.uuid(),
  status: fc.constantFrom('NOT_STARTED', 'LIVE', 'PAUSED', 'COMPLETED'),
  current_period_id: fc.option(fc.uuid(), { nil: undefined }),
  timer_ms: fc.integer({ min: 0, max: 90 * 60 * 1000 }),
  last_updated_at: fc.integer({ min: 0, max: Date.now() }),
  created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
  is_deleted: fc.boolean(),
  synced: fc.boolean(),
  synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
});

/**
 * Arbitrary for generating lineup records compatible with IndexedDB schema
 */
export const lineupArbitrary = fc.record({
  id: fc.uuid(),
  match_id: fc.uuid(),
  player_id: fc.uuid(),
  start_min: fc.integer({ min: 0, max: 90 }),
  end_min: fc.option(fc.integer({ min: 0, max: 120 }), { nil: undefined }),
  position: fc.constantFrom('GK', 'LB', 'CB', 'RB', 'LM', 'CM', 'RM', 'LW', 'ST', 'RW'),
  created_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  updated_at: fc.integer({ min: 0, max: Date.now() + THIRTY_DAYS_MS * 2 }),
  created_by_user_id: fc.string({ minLength: 1, maxLength: 20 }),
  is_deleted: fc.boolean(),
  synced: fc.boolean(),
  synced_at: fc.option(fc.integer({ min: 0, max: Date.now() }), { nil: undefined }),
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
 * Helper to make team IDs unique (handles both id and team_id)
 */
export function makeTeamIdsUnique<T extends { id: string; team_id?: string }>(
  records: T[],
  prefix: string
): T[] {
  return records.map((r, i) => ({
    ...r,
    id: `${prefix}-${i}-${r.id}`,
    team_id: `${prefix}-${i}-${r.id}`,
  }));
}

/**
 * Helper to make season IDs unique (handles both id and season_id)
 */
export function makeSeasonIdsUnique<T extends { id: string; season_id?: string }>(
  records: T[],
  prefix: string
): T[] {
  return records.map((r, i) => ({
    ...r,
    id: `${prefix}-${i}-${r.id}`,
    season_id: `${prefix}-${i}-${r.id}`,
  }));
}
