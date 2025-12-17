/**
 * Property-based tests for Transform Round-Trip Consistency
 *
 * **Feature: indexeddb-camelcase-migration, Property 3: Transform Round-Trip Consistency**
 * **Validates: Requirements 3.1, 3.2, 7.2**
 *
 * Tests that:
 * - Transforming from server response to database format and back preserves semantic data
 * - Transform functions handle all valid inputs correctly
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  teamArbitrary,
  playerArbitrary,
  seasonArbitrary,
  matchArbitrary,
  eventArbitrary,
  lineupArbitrary,
  matchPeriodArbitrary,
  matchStateArbitrary,
} from '../../utils/arbitraries';
import {
  dbToTeam,
  dbToPlayer,
  dbToSeason,
  dbToMatch,
  dbToEvent,
  dbToLineup,
  dbToMatchPeriod,
  dbToMatchState,
  serverTeamToDb,
  serverPlayerToDb,
  serverSeasonToDb,
  serverMatchToDb,
} from '../../../src/db/transforms';
import type {
  EnhancedTeam,
  EnhancedPlayer,
  EnhancedSeason,
  EnhancedMatch,
  EnhancedEvent,
  EnhancedLineup,
  LocalMatchPeriod,
  LocalMatchState,
} from '../../../src/db/schema';
import type {
  ServerTeamResponse,
  ServerPlayerResponse,
  ServerSeasonResponse,
  ServerMatchResponse,
} from '../../../src/db/transforms';

describe('Transform Round-Trip Property Tests', () => {
  /**
   * **Feature: indexeddb-camelcase-migration, Property 3: Transform Round-Trip Consistency**
   * **Validates: Requirements 3.1, 3.2, 7.2**
   *
   * *For any* valid entity data, transforming from database format to frontend type
   * should preserve all semantic data.
   */
  describe('Property 3: Transform Round-Trip Consistency', () => {
    it('should preserve team data through dbToTeam transform', () => {
      fc.assert(
        fc.property(teamArbitrary, (dbTeam) => {
          const team = dbToTeam(dbTeam as EnhancedTeam);

          // Core fields should be preserved
          expect(team.id).toBe(dbTeam.id);
          expect(team.name).toBe(dbTeam.name);

          // Color fields should map correctly
          expect(team.homeKitPrimary).toBe(dbTeam.colorPrimary ?? undefined);
          expect(team.homeKitSecondary).toBe(dbTeam.colorSecondary ?? undefined);
          expect(team.awayKitPrimary).toBe(dbTeam.awayColorPrimary ?? undefined);
          expect(team.awayKitSecondary).toBe(dbTeam.awayColorSecondary ?? undefined);

          // Boolean fields should be coerced correctly
          expect(team.is_opponent).toBe(!!dbTeam.isOpponent);
          expect(team.is_deleted).toBe(!!dbTeam.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve player data through dbToPlayer transform', () => {
      fc.assert(
        fc.property(playerArbitrary, (dbPlayer) => {
          const player = dbToPlayer(dbPlayer as EnhancedPlayer);

          // Core fields should be preserved
          expect(player.id).toBe(dbPlayer.id);
          expect(player.name).toBe(dbPlayer.fullName);

          // Optional fields should map correctly
          expect(player.squadNumber).toBe(dbPlayer.squadNumber ?? undefined);
          expect(player.preferredPosition).toBe(dbPlayer.preferredPos ?? undefined);
          expect(player.notes).toBe(dbPlayer.notes ?? undefined);
          expect(player.currentTeam).toBe(dbPlayer.currentTeam ?? undefined);

          // Boolean fields should be coerced correctly
          expect(player.is_deleted).toBe(!!dbPlayer.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve season data through dbToSeason transform', () => {
      fc.assert(
        fc.property(seasonArbitrary, (dbSeason) => {
          const season = dbToSeason(dbSeason as EnhancedSeason);

          // Core fields should be preserved
          expect(season.id).toBe(dbSeason.seasonId || dbSeason.id);
          expect(season.label).toBe(dbSeason.label);

          // Optional fields should map correctly
          expect(season.startDate).toBe(dbSeason.startDate ?? undefined);
          expect(season.endDate).toBe(dbSeason.endDate ?? undefined);
          expect(season.description).toBe(dbSeason.description ?? undefined);

          // Boolean fields should be coerced correctly
          expect(season.isCurrent).toBe(!!dbSeason.isCurrent);
          expect(season.is_deleted).toBe(!!dbSeason.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve match data through dbToMatch transform', () => {
      fc.assert(
        fc.property(matchArbitrary, (dbMatch) => {
          const match = dbToMatch(dbMatch as EnhancedMatch);

          // Core fields should be preserved
          expect(match.id).toBe(dbMatch.id);
          expect(match.seasonId).toBe(dbMatch.seasonId);
          expect(match.homeTeamId).toBe(dbMatch.homeTeamId);
          expect(match.awayTeamId).toBe(dbMatch.awayTeamId);

          // Numeric fields should be preserved
          expect(match.durationMinutes).toBe(dbMatch.durationMins);
          expect(match.homeScore).toBe(dbMatch.homeScore ?? 0);
          expect(match.awayScore).toBe(dbMatch.awayScore ?? 0);

          // Optional fields should map correctly
          expect(match.competition).toBe(dbMatch.competition ?? undefined);
          expect(match.venue).toBe(dbMatch.venue ?? undefined);
          expect(match.notes).toBe(dbMatch.notes ?? undefined);

          // Period format should be preserved
          expect(match.periodFormat).toBe(dbMatch.periodFormat);

          // Boolean fields should be coerced correctly
          expect(match.is_deleted).toBe(!!dbMatch.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve event data through dbToEvent transform', () => {
      fc.assert(
        fc.property(eventArbitrary, (dbEvent) => {
          const event = dbToEvent(dbEvent as EnhancedEvent);

          // Core fields should be preserved
          expect(event.id).toBe(dbEvent.id);
          expect(event.matchId).toBe(dbEvent.matchId);
          expect(event.kind).toBe(dbEvent.kind);

          // Numeric fields should be preserved
          expect(event.periodNumber).toBe(dbEvent.periodNumber);
          expect(event.clockMs).toBe(dbEvent.clockMs);
          expect(event.sentiment).toBe(dbEvent.sentiment);

          // Optional fields should map correctly (empty string becomes undefined)
          expect(event.teamId).toBe(dbEvent.teamId || undefined);
          expect(event.playerId).toBe(dbEvent.playerId || undefined);
          expect(event.notes).toBe(dbEvent.notes ?? undefined);

          // Boolean fields should be coerced correctly
          expect(event.is_deleted).toBe(!!dbEvent.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve lineup data through dbToLineup transform', () => {
      fc.assert(
        fc.property(lineupArbitrary, (dbLineup) => {
          const lineup = dbToLineup(dbLineup as EnhancedLineup);

          // Core fields should be preserved
          expect(lineup.id).toBe(dbLineup.id);
          expect(lineup.matchId).toBe(dbLineup.matchId);
          expect(lineup.playerId).toBe(dbLineup.playerId);
          expect(lineup.position).toBe(dbLineup.position);

          // Numeric fields should be preserved
          expect(lineup.startMinute).toBe(dbLineup.startMin);
          expect(lineup.endMinute).toBe(dbLineup.endMin ?? undefined);

          // Boolean fields should be coerced correctly
          expect(lineup.is_deleted).toBe(!!dbLineup.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve match period data through dbToMatchPeriod transform', () => {
      fc.assert(
        fc.property(matchPeriodArbitrary, (dbPeriod) => {
          const period = dbToMatchPeriod(dbPeriod as LocalMatchPeriod);

          // Core fields should be preserved
          expect(period.id).toBe(dbPeriod.id);
          expect(period.matchId).toBe(dbPeriod.matchId);
          expect(period.periodNumber).toBe(dbPeriod.periodNumber);
          expect(period.periodType).toBe(dbPeriod.periodType);

          // Optional fields should map correctly
          expect(period.durationSeconds).toBe(dbPeriod.durationSeconds ?? undefined);

          // Boolean fields should be coerced correctly
          expect(period.is_deleted).toBe(!!dbPeriod.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve match state data through dbToMatchState transform', () => {
      fc.assert(
        fc.property(matchStateArbitrary, (dbState) => {
          const state = dbToMatchState(dbState as LocalMatchState);

          // Core fields should be preserved
          expect(state.matchId).toBe(dbState.matchId);

          // Status should map correctly (NOT_STARTED -> SCHEDULED)
          const expectedStatus = dbState.status === 'NOT_STARTED' ? 'SCHEDULED' : dbState.status;
          expect(state.status).toBe(expectedStatus);

          // Timer should be converted to seconds
          expect(state.totalElapsedSeconds).toBe(Math.floor(dbState.timerMs / 1000));

          // Boolean fields should be coerced correctly
          expect(state.is_deleted).toBe(!!dbState.isDeleted);

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Server-to-DB transform tests
   * These verify that server responses are correctly transformed to IndexedDB format
   */
  describe('Server-to-DB Transform Consistency', () => {
    // Helper to create optional ISO date string arbitrary
    const optionalIsoDateArbitrary = fc.oneof(
      fc.constant(undefined),
      fc.integer({ min: 946684800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString())
    );

    it('should correctly transform server team response to DB format', () => {
      const serverTeamArbitrary = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        homeKitPrimary: fc.option(fc.string(), { nil: undefined }),
        homeKitSecondary: fc.option(fc.string(), { nil: undefined }),
        awayKitPrimary: fc.option(fc.string(), { nil: undefined }),
        awayKitSecondary: fc.option(fc.string(), { nil: undefined }),
        logoUrl: fc.option(fc.string(), { nil: undefined }),
        is_opponent: fc.option(fc.boolean(), { nil: undefined }),
        createdAt: optionalIsoDateArbitrary,
        updatedAt: optionalIsoDateArbitrary,
        created_by_user_id: fc.option(fc.string(), { nil: undefined }),
        is_deleted: fc.option(fc.boolean(), { nil: undefined }),
      });

      fc.assert(
        fc.property(serverTeamArbitrary, (serverTeam) => {
          const dbTeam = serverTeamToDb(serverTeam as ServerTeamResponse);

          // ID fields should be set correctly
          expect(dbTeam.id).toBe(serverTeam.id);
          expect(dbTeam.teamId).toBe(serverTeam.id);

          // Name should be preserved
          expect(dbTeam.name).toBe(serverTeam.name);

          // Color fields should map correctly
          expect(dbTeam.colorPrimary).toBe(serverTeam.homeKitPrimary);
          expect(dbTeam.colorSecondary).toBe(serverTeam.homeKitSecondary);
          expect(dbTeam.awayColorPrimary).toBe(serverTeam.awayKitPrimary);
          expect(dbTeam.awayColorSecondary).toBe(serverTeam.awayKitSecondary);

          // Boolean fields should default correctly
          expect(dbTeam.isOpponent).toBe(serverTeam.is_opponent ?? false);
          expect(dbTeam.isDeleted).toBe(serverTeam.is_deleted ?? false);

          // Sync fields should be set
          expect(dbTeam.synced).toBe(true);
          expect(typeof dbTeam.syncedAt).toBe('number');

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly transform server player response to DB format', () => {
      const serverPlayerArbitrary = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        squadNumber: fc.option(fc.integer({ min: 1, max: 99 }), { nil: undefined }),
        preferredPosition: fc.option(fc.string(), { nil: undefined }),
        dateOfBirth: optionalIsoDateArbitrary,
        notes: fc.option(fc.string(), { nil: undefined }),
        currentTeam: fc.option(fc.uuid(), { nil: undefined }),
        createdAt: optionalIsoDateArbitrary,
        updatedAt: optionalIsoDateArbitrary,
        created_by_user_id: fc.option(fc.string(), { nil: undefined }),
        is_deleted: fc.option(fc.boolean(), { nil: undefined }),
      });

      fc.assert(
        fc.property(serverPlayerArbitrary, (serverPlayer) => {
          const dbPlayer = serverPlayerToDb(serverPlayer as ServerPlayerResponse);

          // ID should be preserved
          expect(dbPlayer.id).toBe(serverPlayer.id);

          // Name should map to fullName
          expect(dbPlayer.fullName).toBe(serverPlayer.name);

          // Optional fields should map correctly
          expect(dbPlayer.squadNumber).toBe(serverPlayer.squadNumber);
          expect(dbPlayer.preferredPos).toBe(serverPlayer.preferredPosition);
          expect(dbPlayer.notes).toBe(serverPlayer.notes);
          expect(dbPlayer.currentTeam).toBe(serverPlayer.currentTeam);

          // Boolean fields should default correctly
          expect(dbPlayer.isDeleted).toBe(serverPlayer.is_deleted ?? false);

          // Sync fields should be set
          expect(dbPlayer.synced).toBe(true);
          expect(typeof dbPlayer.syncedAt).toBe('number');

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly transform server season response to DB format', () => {
      const serverSeasonArbitrary = fc.record({
        id: fc.option(fc.uuid(), { nil: undefined }),
        seasonId: fc.option(fc.uuid(), { nil: undefined }),
        label: fc.string({ minLength: 1, maxLength: 30 }),
        startDate: fc.option(fc.string(), { nil: undefined }),
        endDate: fc.option(fc.string(), { nil: undefined }),
        isCurrent: fc.option(fc.boolean(), { nil: undefined }),
        description: fc.option(fc.string(), { nil: undefined }),
        createdAt: optionalIsoDateArbitrary,
        updatedAt: optionalIsoDateArbitrary,
        created_by_user_id: fc.option(fc.string(), { nil: undefined }),
        is_deleted: fc.option(fc.boolean(), { nil: undefined }),
      }).filter(s => s.id !== undefined || s.seasonId !== undefined); // At least one ID must be present

      fc.assert(
        fc.property(serverSeasonArbitrary, (serverSeason) => {
          const dbSeason = serverSeasonToDb(serverSeason as ServerSeasonResponse);

          const expectedId = serverSeason.id || serverSeason.seasonId;

          // ID fields should be set correctly
          expect(dbSeason.id).toBe(expectedId);
          expect(dbSeason.seasonId).toBe(expectedId);

          // Label should be preserved
          expect(dbSeason.label).toBe(serverSeason.label);

          // Optional fields should map correctly
          expect(dbSeason.startDate).toBe(serverSeason.startDate);
          expect(dbSeason.endDate).toBe(serverSeason.endDate);
          expect(dbSeason.description).toBe(serverSeason.description);

          // Boolean fields should default correctly
          expect(dbSeason.isCurrent).toBe(serverSeason.isCurrent ?? false);
          expect(dbSeason.isDeleted).toBe(serverSeason.is_deleted ?? false);

          // Sync fields should be set
          expect(dbSeason.synced).toBe(true);
          expect(typeof dbSeason.syncedAt).toBe('number');

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly transform server match response to DB format', () => {
      const isoDateArbitrary = fc.integer({ min: 946684800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString());
      const serverMatchArbitrary = fc.record({
        id: fc.uuid(),
        seasonId: fc.uuid(),
        kickoffTime: fc.oneof(
          isoDateArbitrary,
          fc.integer({ min: 0, max: Date.now() * 2 })
        ),
        homeTeamId: fc.uuid(),
        awayTeamId: fc.uuid(),
        competition: fc.option(fc.string(), { nil: undefined }),
        venue: fc.option(fc.string(), { nil: undefined }),
        durationMinutes: fc.option(fc.integer({ min: 40, max: 120 }), { nil: undefined }),
        periodFormat: fc.option(fc.constantFrom('half', 'quarter') as fc.Arbitrary<'half' | 'quarter'>, { nil: undefined }),
        homeScore: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
        awayScore: fc.option(fc.integer({ min: 0, max: 20 }), { nil: undefined }),
        notes: fc.option(fc.string(), { nil: undefined }),
        createdAt: optionalIsoDateArbitrary,
        updatedAt: optionalIsoDateArbitrary,
        created_by_user_id: fc.option(fc.string(), { nil: undefined }),
        is_deleted: fc.option(fc.boolean(), { nil: undefined }),
      });

      fc.assert(
        fc.property(serverMatchArbitrary, (serverMatch) => {
          const dbMatch = serverMatchToDb(serverMatch as ServerMatchResponse);

          // ID fields should be set correctly
          expect(dbMatch.id).toBe(serverMatch.id);
          expect(dbMatch.matchId).toBe(serverMatch.id);

          // Foreign keys should be preserved
          expect(dbMatch.seasonId).toBe(serverMatch.seasonId);
          expect(dbMatch.homeTeamId).toBe(serverMatch.homeTeamId);
          expect(dbMatch.awayTeamId).toBe(serverMatch.awayTeamId);

          // Optional fields should map correctly with defaults
          expect(dbMatch.competition).toBe(serverMatch.competition);
          expect(dbMatch.venue).toBe(serverMatch.venue);
          expect(dbMatch.notes).toBe(serverMatch.notes);
          expect(dbMatch.durationMins).toBe(serverMatch.durationMinutes || 60);
          expect(dbMatch.periodFormat).toBe(serverMatch.periodFormat || 'quarter');
          expect(dbMatch.homeScore).toBe(serverMatch.homeScore || 0);
          expect(dbMatch.awayScore).toBe(serverMatch.awayScore || 0);

          // Boolean fields should default correctly
          expect(dbMatch.isDeleted).toBe(serverMatch.is_deleted ?? false);

          // Sync fields should be set
          expect(dbMatch.synced).toBe(true);
          expect(typeof dbMatch.syncedAt).toBe('number');

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
