/**
 * Property-based tests for IndexedDB CRUD Round-Trip
 *
 * **Feature: shared-types-unification, Property 4: IndexedDB CRUD Round-Trip**
 * **Validates: Requirements 7.2, 7.4**
 *
 * Tests that:
 * - For any entity stored in IndexedDB, writing then reading should return equivalent data
 * - ISO strings remain ISO strings through the round-trip
 * - All camelCase field names are preserved
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { db } from '../../../src/db/indexedDB';
import {
  teamArbitrary,
  playerArbitrary,
  seasonArbitrary,
  matchArbitrary,
  eventArbitrary,
  lineupArbitrary,
  matchPeriodArbitrary,
  matchStateArbitrary,
  makeIdsUnique,
  makeTeamIdsUnique,
  makeSeasonIdsUnique,
} from '../../utils/arbitraries';

describe('IndexedDB CRUD Round-Trip Property Tests', () => {
  beforeEach(async () => {
    // Initialize the database
    await db.open();

    // Clear all tables before each test
    await db.teams.clear();
    await db.players.clear();
    await db.seasons.clear();
    await db.matches.clear();
    await db.events.clear();
    await db.lineup.clear();
    await db.matchPeriods.clear();
    await db.matchState.clear();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.teams.clear();
    await db.players.clear();
    await db.seasons.clear();
    await db.matches.clear();
    await db.events.clear();
    await db.lineup.clear();
    await db.matchPeriods.clear();
    await db.matchState.clear();
  });

  /**
   * **Feature: shared-types-unification, Property 4: IndexedDB CRUD Round-Trip**
   * **Validates: Requirements 7.2, 7.4**
   *
   * *For any* entity stored in IndexedDB, writing then reading should return
   * equivalent data (ISO strings remain ISO strings).
   */
  describe('Property 4: IndexedDB CRUD Round-Trip', () => {
    it('should preserve team data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(teamArbitrary, async (team) => {
          // Write to IndexedDB
          await db.teams.put(team as any);

          // Read back from IndexedDB
          const retrieved = await db.teams.get(team.id);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(team.id);
          expect(retrieved?.name).toBe(team.name);
          expect(retrieved?.homeKitPrimary).toBe(team.homeKitPrimary);
          expect(retrieved?.homeKitSecondary).toBe(team.homeKitSecondary);
          expect(retrieved?.awayKitPrimary).toBe(team.awayKitPrimary);
          expect(retrieved?.awayKitSecondary).toBe(team.awayKitSecondary);
          expect(retrieved?.logoUrl).toBe(team.logoUrl);
          expect(retrieved?.isOpponent).toBe(team.isOpponent);

          // Verify ISO strings are preserved as strings
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(team.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(team.createdByUserId);
          expect(retrieved?.isDeleted).toBe(team.isDeleted);
          expect(retrieved?.deletedAt).toBe(team.deletedAt);
          expect(retrieved?.deletedByUserId).toBe(team.deletedByUserId);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve player data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(playerArbitrary, async (player) => {
          // Write to IndexedDB
          await db.players.put(player as any);

          // Read back from IndexedDB
          const retrieved = await db.players.get(player.id);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(player.id);
          expect(retrieved?.name).toBe(player.name);
          expect(retrieved?.squadNumber).toBe(player.squadNumber);
          expect(retrieved?.preferredPosition).toBe(player.preferredPosition);
          expect(retrieved?.notes).toBe(player.notes);

          // Verify ISO strings are preserved as strings
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(player.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(player.createdByUserId);
          expect(retrieved?.isDeleted).toBe(player.isDeleted);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve season data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(seasonArbitrary, async (season) => {
          // Write to IndexedDB
          await db.seasons.put(season as any);

          // Read back from IndexedDB
          const retrieved = await db.seasons.get(season.id);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(season.id);
          expect(retrieved?.label).toBe(season.label);
          expect(retrieved?.startDate).toBe(season.startDate);
          expect(retrieved?.endDate).toBe(season.endDate);
          expect(retrieved?.isCurrent).toBe(season.isCurrent);
          expect(retrieved?.description).toBe(season.description);

          // Verify ISO strings are preserved as strings
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(season.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(season.createdByUserId);
          expect(retrieved?.isDeleted).toBe(season.isDeleted);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve match data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(matchArbitrary, async (match) => {
          // Write to IndexedDB
          await db.matches.put(match as any);

          // Read back from IndexedDB
          const retrieved = await db.matches.get(match.id);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(match.id);
          expect(retrieved?.seasonId).toBe(match.seasonId);
          expect(retrieved?.homeTeamId).toBe(match.homeTeamId);
          expect(retrieved?.awayTeamId).toBe(match.awayTeamId);
          expect(retrieved?.competition).toBe(match.competition);
          expect(retrieved?.venue).toBe(match.venue);
          expect(retrieved?.durationMinutes).toBe(match.durationMinutes);
          expect(retrieved?.periodFormat).toBe(match.periodFormat);
          expect(retrieved?.homeScore).toBe(match.homeScore);
          expect(retrieved?.awayScore).toBe(match.awayScore);
          expect(retrieved?.notes).toBe(match.notes);

          // Verify ISO strings are preserved as strings
          expect(typeof retrieved?.kickoffTime).toBe('string');
          expect(retrieved?.kickoffTime).toBe(match.kickoffTime);
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(match.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(match.createdByUserId);
          expect(retrieved?.isDeleted).toBe(match.isDeleted);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve event data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(eventArbitrary, async (event) => {
          // Write to IndexedDB
          await db.events.put(event as any);

          // Read back from IndexedDB
          const retrieved = await db.events.get(event.id);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(event.id);
          expect(retrieved?.matchId).toBe(event.matchId);
          expect(retrieved?.periodNumber).toBe(event.periodNumber);
          expect(retrieved?.clockMs).toBe(event.clockMs);
          expect(retrieved?.kind).toBe(event.kind);
          expect(retrieved?.teamId).toBe(event.teamId);
          expect(retrieved?.playerId).toBe(event.playerId);
          expect(retrieved?.sentiment).toBe(event.sentiment);
          expect(retrieved?.notes).toBe(event.notes);

          // Verify ISO strings are preserved as strings
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(event.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(event.createdByUserId);
          expect(retrieved?.isDeleted).toBe(event.isDeleted);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve lineup data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(lineupArbitrary, async (lineup) => {
          // Write to IndexedDB
          await db.lineup.put(lineup as any);

          // Read back from IndexedDB
          const retrieved = await db.lineup.get(lineup.id);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(lineup.id);
          expect(retrieved?.matchId).toBe(lineup.matchId);
          expect(retrieved?.playerId).toBe(lineup.playerId);
          expect(retrieved?.startMinute).toBe(lineup.startMinute);
          expect(retrieved?.endMinute).toBe(lineup.endMinute);
          expect(retrieved?.position).toBe(lineup.position);

          // Verify ISO strings are preserved as strings
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(lineup.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(lineup.createdByUserId);
          expect(retrieved?.isDeleted).toBe(lineup.isDeleted);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve match period data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(matchPeriodArbitrary, async (period) => {
          // Write to IndexedDB
          await db.matchPeriods.put(period as any);

          // Read back from IndexedDB
          const retrieved = await db.matchPeriods.get(period.id);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.id).toBe(period.id);
          expect(retrieved?.matchId).toBe(period.matchId);
          expect(retrieved?.periodNumber).toBe(period.periodNumber);
          expect(retrieved?.periodType).toBe(period.periodType);
          expect(retrieved?.durationSeconds).toBe(period.durationSeconds);

          // Verify numeric timestamps are preserved as numbers
          if (retrieved?.startedAt !== undefined) {
            expect(typeof retrieved.startedAt).toBe('number');
            expect(retrieved.startedAt).toBe(period.startedAt);
          }
          if (retrieved?.endedAt !== undefined) {
            expect(typeof retrieved.endedAt).toBe('number');
            expect(retrieved.endedAt).toBe(period.endedAt);
          }
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(period.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(period.createdByUserId);
          expect(retrieved?.isDeleted).toBe(period.isDeleted);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve match state data through write-read round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(matchStateArbitrary, async (state) => {
          // Write to IndexedDB
          await db.matchState.put(state as any);

          // Read back from IndexedDB (matchState uses matchId as primary key)
          const retrieved = await db.matchState.get(state.matchId);

          // Verify data is preserved
          expect(retrieved).toBeDefined();
          expect(retrieved?.matchId).toBe(state.matchId);
          expect(retrieved?.status).toBe(state.status);
          expect(retrieved?.currentPeriodId).toBe(state.currentPeriodId);
          expect(retrieved?.timerMs).toBe(state.timerMs);

          // Verify numeric timestamps are preserved as numbers
          expect(typeof retrieved?.lastUpdatedAt).toBe('number');
          expect(retrieved?.lastUpdatedAt).toBe(state.lastUpdatedAt);
          expect(typeof retrieved?.createdAt).toBe('string');
          expect(retrieved?.createdAt).toBe(state.createdAt);

          // Verify camelCase auth fields are preserved
          expect(retrieved?.createdByUserId).toBe(state.createdByUserId);
          expect(retrieved?.isDeleted).toBe(state.isDeleted);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle bulk write-read operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(teamArbitrary, { minLength: 1, maxLength: 10 }),
          async (teams) => {
            // Clear table before each property run
            await db.teams.clear();

            // Make IDs unique
            const uniqueTeams = makeTeamIdsUnique(teams, 'bulk-team');

            // Bulk write to IndexedDB
            await db.teams.bulkPut(uniqueTeams as any);

            // Read all back
            const retrieved = await db.teams.toArray();

            // Verify count matches
            expect(retrieved.length).toBe(uniqueTeams.length);

            // Verify each team is preserved
            for (const original of uniqueTeams) {
              const found = retrieved.find((t) => t.id === original.id);
              expect(found).toBeDefined();
              expect(found?.name).toBe(original.name);
              expect(found?.createdByUserId).toBe(original.createdByUserId);
              expect(found?.isDeleted).toBe(original.isDeleted);
              // Verify ISO string preserved
              expect(typeof found?.createdAt).toBe('string');
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle update operations correctly (put overwrites)', async () => {
      await fc.assert(
        fc.asyncProperty(
          teamArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (team, newName) => {
            // Initial write
            await db.teams.put(team as any);

            // Update with new name
            const updated = { ...team, name: newName };
            await db.teams.put(updated as any);

            // Read back
            const retrieved = await db.teams.get(team.id);

            // Verify update was applied
            expect(retrieved?.name).toBe(newName);
            // Verify other fields preserved
            expect(retrieved?.createdByUserId).toBe(team.createdByUserId);
            expect(retrieved?.isDeleted).toBe(team.isDeleted);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should handle delete operations correctly', async () => {
      await fc.assert(
        fc.asyncProperty(teamArbitrary, async (team) => {
          // Write to IndexedDB
          await db.teams.put(team as any);

          // Verify it exists
          const beforeDelete = await db.teams.get(team.id);
          expect(beforeDelete).toBeDefined();

          // Delete
          await db.teams.delete(team.id);

          // Verify it's gone
          const afterDelete = await db.teams.get(team.id);
          expect(afterDelete).toBeUndefined();
        }),
        { numRuns: 50 }
      );
    });
  });
});
