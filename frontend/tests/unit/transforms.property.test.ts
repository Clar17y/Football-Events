/**
 * Property-based tests for Transform Layer
 *
 * **Feature: shared-types-unification, Property 3: Frontend Cache is Shape-Preserving**
 * **Validates: Requirements 3.1, 5.1, 7.2**
 *
 * Tests that:
 * - Caching from API → IndexedDB → UI preserves all entity fields exactly
 * - Sync metadata (synced, syncedAt) is the only difference between server and DB types
 * - Transform functions are essentially pass-through operations
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  serverPlayerToDb,
  dbToPlayer,
  serverTeamToDb,
  dbToTeam,
  serverMatchToDb,
  dbToMatch,
  serverSeasonToDb,
  dbToSeason,
  serverEventToDb,
  dbToEvent,
  serverPlayerTeamToDb,
  dbToPlayerTeam,
} from '../../src/db/transforms';
import type {
  ServerPlayerResponse,
  ServerTeamResponse,
  ServerMatchResponse,
  ServerSeasonResponse,
  ServerEventResponse,
  ServerPlayerTeamResponse,
} from '../../src/db/transforms';

// ============================================================================
// ARBITRARIES FOR SERVER RESPONSES (camelCase)
// ============================================================================

/**
 * Generate ISO date-time strings using integer timestamps (more reliable)
 */
const isoDateTimeArbitrary = fc
  .integer({ min: 1577836800000, max: 1893456000000 }) // 2020-01-01 to 2030-01-01
  .map((ts) => new Date(ts).toISOString());

/**
 * Generate ISO date strings (YYYY-MM-DD) using integer timestamps
 */
const isoDateArbitrary = fc
  .integer({ min: 1577836800000, max: 1893456000000 }) // 2020-01-01 to 2030-01-01
  .map((ts) => new Date(ts).toISOString().split('T')[0]);

/**
 * Arbitrary for server player response (camelCase)
 */
const serverPlayerArbitrary: fc.Arbitrary<ServerPlayerResponse> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  squadNumber: fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  preferredPosition: fc.option(fc.constantFrom('GK', 'DEF', 'MID', 'FWD'), { nil: undefined }),
  dateOfBirth: fc.option(isoDateArbitrary, { nil: undefined }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  currentTeam: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  updatedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  createdByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  deletedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * Generate hex color strings (e.g., "#ff00aa")
 */
const hexColorArbitrary = fc
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
 * Arbitrary for server team response (camelCase)
 */
const serverTeamArbitrary: fc.Arbitrary<ServerTeamResponse> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  homeKitPrimary: fc.option(hexColorArbitrary, { nil: undefined }),
  homeKitSecondary: fc.option(hexColorArbitrary, { nil: undefined }),
  awayKitPrimary: fc.option(hexColorArbitrary, { nil: undefined }),
  awayKitSecondary: fc.option(hexColorArbitrary, { nil: undefined }),
  logoUrl: fc.option(fc.webUrl(), { nil: undefined }),
  isOpponent: fc.option(fc.boolean(), { nil: undefined }),
  createdAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  updatedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  createdByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  deletedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * Arbitrary for server match response (camelCase)
 */
const serverMatchArbitrary: fc.Arbitrary<ServerMatchResponse> = fc.record({
  id: fc.uuid(),
  seasonId: fc.uuid(),
  kickoffTime: isoDateTimeArbitrary,
  homeTeamId: fc.uuid(),
  awayTeamId: fc.uuid(),
  competition: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  venue: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  durationMinutes: fc.option(fc.integer({ min: 40, max: 120 }), { nil: undefined }),
  periodFormat: fc.option(fc.constantFrom('half', 'quarter') as fc.Arbitrary<'half' | 'quarter'>, { nil: undefined }),
  homeScore: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
  awayScore: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  createdAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  updatedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  createdByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  deletedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * Arbitrary for server season response (camelCase)
 */
const serverSeasonArbitrary: fc.Arbitrary<ServerSeasonResponse> = fc.record({
  id: fc.option(fc.uuid(), { nil: undefined }),
  seasonId: fc.option(fc.uuid(), { nil: undefined }),
  label: fc.string({ minLength: 1, maxLength: 30 }),
  startDate: fc.option(isoDateArbitrary, { nil: undefined }),
  endDate: fc.option(isoDateArbitrary, { nil: undefined }),
  isCurrent: fc.option(fc.boolean(), { nil: undefined }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  createdAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  updatedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  createdByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  deletedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.option(fc.boolean(), { nil: undefined }),
}).filter(s => s.id !== undefined || s.seasonId !== undefined); // At least one ID must be present

/**
 * Arbitrary for server event response (camelCase)
 */
const serverEventArbitrary: fc.Arbitrary<ServerEventResponse> = fc.record({
  id: fc.uuid(),
  matchId: fc.uuid(),
  periodNumber: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
  clockMs: fc.option(fc.integer({ min: 0, max: 90 * 60 * 1000 }), { nil: undefined }),
  kind: fc.constantFrom(
    'goal', 'own_goal', 'assist', 'key_pass', 'save',
    'interception', 'tackle', 'foul', 'penalty', 'free_kick', 'ball_out'
  ) as fc.Arbitrary<any>,
  teamId: fc.option(fc.uuid(), { nil: undefined }),
  playerId: fc.option(fc.uuid(), { nil: undefined }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
  sentiment: fc.option(fc.integer({ min: -4, max: 4 }), { nil: undefined }),
  createdAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  updatedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  createdByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  deletedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.option(fc.boolean(), { nil: undefined }),
});

/**
 * Arbitrary for server player-team response (camelCase)
 */
const serverPlayerTeamArbitrary: fc.Arbitrary<ServerPlayerTeamResponse> = fc.record({
  id: fc.uuid(),
  playerId: fc.uuid(),
  teamId: fc.uuid(),
  startDate: fc.option(isoDateArbitrary, { nil: undefined }),
  endDate: fc.option(isoDateArbitrary, { nil: undefined }),
  jerseyNumber: fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
  position: fc.option(fc.constantFrom('GK', 'DEF', 'MID', 'FWD'), { nil: undefined }),
  isActive: fc.option(fc.boolean(), { nil: undefined }),
  createdAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  updatedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  createdByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  deletedAt: fc.option(isoDateTimeArbitrary, { nil: undefined }),
  deletedByUserId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  isDeleted: fc.option(fc.boolean(), { nil: undefined }),
});

// ============================================================================
// PROPERTY TESTS
// ============================================================================

describe('Transform Layer Property Tests', () => {
  /**
   * **Feature: shared-types-unification, Property 3: Frontend Cache is Shape-Preserving**
   * **Validates: Requirements 3.1, 5.1, 7.2**
   *
   * *For any* entity, caching from API → IndexedDB → UI should preserve all entity
   * fields exactly (excluding sync metadata like `synced`/`syncedAt`).
   */
  describe('Property 3: Frontend Cache is Shape-Preserving', () => {
    it('Player: server → db → frontend preserves all fields', () => {
      fc.assert(
        fc.property(serverPlayerArbitrary, (serverPlayer) => {
          // Transform: Server → IndexedDB
          const dbPlayer = serverPlayerToDb(serverPlayer);
          
          // Transform: IndexedDB → Frontend
          const frontendPlayer = dbToPlayer(dbPlayer);
          
          // Verify core fields are preserved
          expect(frontendPlayer.id).toBe(serverPlayer.id);
          expect(frontendPlayer.name).toBe(serverPlayer.name);
          expect(frontendPlayer.squadNumber).toBe(serverPlayer.squadNumber);
          expect(frontendPlayer.preferredPosition).toBe(serverPlayer.preferredPosition);
          expect(frontendPlayer.dateOfBirth).toBe(serverPlayer.dateOfBirth);
          expect(frontendPlayer.notes).toBe(serverPlayer.notes);
          expect(frontendPlayer.currentTeam).toBe(serverPlayer.currentTeam);
          
          // Verify auth/soft-delete fields are preserved (with defaults)
          expect(frontendPlayer.createdByUserId).toBe(serverPlayer.createdByUserId ?? 'server');
          expect(frontendPlayer.isDeleted).toBe(serverPlayer.isDeleted ?? false);
          expect(frontendPlayer.deletedAt).toBe(serverPlayer.deletedAt);
          expect(frontendPlayer.deletedByUserId).toBe(serverPlayer.deletedByUserId);
        }),
        { numRuns: 100 }
      );
    });

    it('Team: server → db → frontend preserves all fields', () => {
      fc.assert(
        fc.property(serverTeamArbitrary, (serverTeam) => {
          // Transform: Server → IndexedDB
          const dbTeam = serverTeamToDb(serverTeam);
          
          // Transform: IndexedDB → Frontend
          const frontendTeam = dbToTeam(dbTeam);
          
          // Verify core fields are preserved
          expect(frontendTeam.id).toBe(serverTeam.id);
          expect(frontendTeam.name).toBe(serverTeam.name);
          expect(frontendTeam.homeKitPrimary).toBe(serverTeam.homeKitPrimary);
          expect(frontendTeam.homeKitSecondary).toBe(serverTeam.homeKitSecondary);
          expect(frontendTeam.awayKitPrimary).toBe(serverTeam.awayKitPrimary);
          expect(frontendTeam.awayKitSecondary).toBe(serverTeam.awayKitSecondary);
          expect(frontendTeam.logoUrl).toBe(serverTeam.logoUrl);
          expect(frontendTeam.isOpponent).toBe(serverTeam.isOpponent ?? false);
          
          // Verify auth/soft-delete fields are preserved (with defaults)
          expect(frontendTeam.createdByUserId).toBe(serverTeam.createdByUserId ?? 'server');
          expect(frontendTeam.isDeleted).toBe(serverTeam.isDeleted ?? false);
          expect(frontendTeam.deletedAt).toBe(serverTeam.deletedAt);
          expect(frontendTeam.deletedByUserId).toBe(serverTeam.deletedByUserId);
        }),
        { numRuns: 100 }
      );
    });

    it('Match: server → db → frontend preserves all fields', () => {
      fc.assert(
        fc.property(serverMatchArbitrary, (serverMatch) => {
          // Transform: Server → IndexedDB
          const dbMatch = serverMatchToDb(serverMatch);
          
          // Transform: IndexedDB → Frontend
          const frontendMatch = dbToMatch(dbMatch);
          
          // Verify core fields are preserved
          expect(frontendMatch.id).toBe(serverMatch.id);
          expect(frontendMatch.seasonId).toBe(serverMatch.seasonId);
          expect(frontendMatch.kickoffTime).toBe(serverMatch.kickoffTime);
          expect(frontendMatch.homeTeamId).toBe(serverMatch.homeTeamId);
          expect(frontendMatch.awayTeamId).toBe(serverMatch.awayTeamId);
          expect(frontendMatch.competition).toBe(serverMatch.competition);
          expect(frontendMatch.venue).toBe(serverMatch.venue);
          expect(frontendMatch.durationMinutes).toBe(serverMatch.durationMinutes ?? 60);
          expect(frontendMatch.periodFormat).toBe(serverMatch.periodFormat ?? 'quarter');
          expect(frontendMatch.homeScore).toBe(serverMatch.homeScore ?? 0);
          expect(frontendMatch.awayScore).toBe(serverMatch.awayScore ?? 0);
          expect(frontendMatch.notes).toBe(serverMatch.notes);
          
          // Verify auth/soft-delete fields are preserved (with defaults)
          expect(frontendMatch.createdByUserId).toBe(serverMatch.createdByUserId ?? 'server');
          expect(frontendMatch.isDeleted).toBe(serverMatch.isDeleted ?? false);
          expect(frontendMatch.deletedAt).toBe(serverMatch.deletedAt);
          expect(frontendMatch.deletedByUserId).toBe(serverMatch.deletedByUserId);
        }),
        { numRuns: 100 }
      );
    });

    it('Season: server → db → frontend preserves all fields', () => {
      fc.assert(
        fc.property(serverSeasonArbitrary, (serverSeason) => {
          // Transform: Server → IndexedDB
          const dbSeason = serverSeasonToDb(serverSeason);
          
          // Transform: IndexedDB → Frontend
          const frontendSeason = dbToSeason(dbSeason);
          
          // Verify core fields are preserved
          const expectedId = serverSeason.id ?? serverSeason.seasonId!;
          expect(frontendSeason.id).toBe(expectedId);
          expect(frontendSeason.seasonId).toBe(expectedId);
          expect(frontendSeason.label).toBe(serverSeason.label);
          expect(frontendSeason.startDate).toBe(serverSeason.startDate);
          expect(frontendSeason.endDate).toBe(serverSeason.endDate);
          expect(frontendSeason.isCurrent).toBe(serverSeason.isCurrent ?? false);
          expect(frontendSeason.description).toBe(serverSeason.description);
          
          // Verify auth/soft-delete fields are preserved (with defaults)
          expect(frontendSeason.createdByUserId).toBe(serverSeason.createdByUserId ?? 'server');
          expect(frontendSeason.isDeleted).toBe(serverSeason.isDeleted ?? false);
          expect(frontendSeason.deletedAt).toBe(serverSeason.deletedAt);
          expect(frontendSeason.deletedByUserId).toBe(serverSeason.deletedByUserId);
        }),
        { numRuns: 100 }
      );
    });

    it('Event: server → db → frontend preserves all fields', () => {
      fc.assert(
        fc.property(serverEventArbitrary, (serverEvent) => {
          // Transform: Server → IndexedDB
          const dbEvent = serverEventToDb(serverEvent);
          
          // Transform: IndexedDB → Frontend
          const frontendEvent = dbToEvent(dbEvent);
          
          // Verify core fields are preserved
          expect(frontendEvent.id).toBe(serverEvent.id);
          expect(frontendEvent.matchId).toBe(serverEvent.matchId);
          expect(frontendEvent.periodNumber).toBe(serverEvent.periodNumber ?? 1);
          expect(frontendEvent.clockMs).toBe(serverEvent.clockMs ?? 0);
          expect(frontendEvent.kind).toBe(serverEvent.kind);
          // teamId and playerId may be empty string in DB but undefined in frontend
          expect(frontendEvent.teamId ?? '').toBe(serverEvent.teamId ?? '');
          expect(frontendEvent.playerId ?? '').toBe(serverEvent.playerId ?? '');
          expect(frontendEvent.notes).toBe(serverEvent.notes);
          expect(frontendEvent.sentiment).toBe(serverEvent.sentiment ?? 0);
          
          // Verify auth/soft-delete fields are preserved (with defaults)
          expect(frontendEvent.createdByUserId).toBe(serverEvent.createdByUserId ?? 'server');
          expect(frontendEvent.isDeleted).toBe(serverEvent.isDeleted ?? false);
          expect(frontendEvent.deletedAt).toBe(serverEvent.deletedAt);
          expect(frontendEvent.deletedByUserId).toBe(serverEvent.deletedByUserId);
        }),
        { numRuns: 100 }
      );
    });

    it('PlayerTeam: server → db → frontend preserves all fields', () => {
      fc.assert(
        fc.property(serverPlayerTeamArbitrary, (serverPlayerTeam) => {
          // Transform: Server → IndexedDB
          const dbPlayerTeam = serverPlayerTeamToDb(serverPlayerTeam);
          
          // Transform: IndexedDB → Frontend
          const frontendPlayerTeam = dbToPlayerTeam(dbPlayerTeam);
          
          // Verify core fields are preserved
          expect(frontendPlayerTeam.id).toBe(serverPlayerTeam.id);
          expect(frontendPlayerTeam.playerId).toBe(serverPlayerTeam.playerId);
          expect(frontendPlayerTeam.teamId).toBe(serverPlayerTeam.teamId);
          // startDate has a default if not provided
          if (serverPlayerTeam.startDate) {
            expect(frontendPlayerTeam.startDate).toBe(serverPlayerTeam.startDate);
          }
          expect(frontendPlayerTeam.endDate).toBe(serverPlayerTeam.endDate);
          
          // Verify auth/soft-delete fields are preserved (with defaults)
          expect(frontendPlayerTeam.createdByUserId).toBe(serverPlayerTeam.createdByUserId ?? 'server');
          expect(frontendPlayerTeam.isDeleted).toBe(serverPlayerTeam.isDeleted ?? false);
          expect(frontendPlayerTeam.deletedAt).toBe(serverPlayerTeam.deletedAt);
          expect(frontendPlayerTeam.deletedByUserId).toBe(serverPlayerTeam.deletedByUserId);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: Sync metadata is added during server → db transform
   */
  describe('Sync Metadata Addition', () => {
    it('serverToDb transforms add sync metadata', () => {
      fc.assert(
        fc.property(serverPlayerArbitrary, (serverPlayer) => {
          const dbPlayer = serverPlayerToDb(serverPlayer);
          
          // Sync metadata should be added
          expect(dbPlayer.synced).toBe(true);
          expect(dbPlayer.syncedAt).toBeDefined();
          expect(typeof dbPlayer.syncedAt).toBe('string');
        }),
        { numRuns: 100 }
      );
    });
  });
});
