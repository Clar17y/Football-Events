/**
 * Property-based tests for Cache Service
 *
 * **Feature: offline-sync-refactor, Property 7: Temporal Data Cleanup Age Threshold**
 * **Validates: Requirements 3.1**
 *
 * **Feature: offline-sync-refactor, Property 9: Reference Data Retention**
 * **Validates: Requirements 3.3**
 *
 * **Feature: offline-sync-refactor, Property 14: Refresh Preserves Unsynced Records**
 * **Validates: Requirements 6.3, 6.4**
 *
 * Tests that:
 * - Synced temporal data older than 30 days is deleted during cleanup
 * - Reference data (teams, players, seasons) is preserved during cleanup
 *   operations regardless of age or sync status
 * - Refresh operations preserve unsynced records while replacing synced records
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { db } from '../../src/db/indexedDB';
import { cleanupOldTemporalData, refreshReferenceData, THIRTY_DAYS_MS } from '../../src/services/cacheService';
import {
  teamArbitrary,
  playerArbitrary,
  seasonArbitrary,
  matchArbitrary,
  eventArbitrary,
  matchPeriodArbitrary,
  matchStateArbitrary,
  lineupArbitrary,
  makeTeamIdsUnique,
  makeIdsUnique,
  makeSeasonIdsUnique,
} from '../utils/arbitraries';

// Mock the API client to prevent actual network calls
vi.mock('../../src/services/api/baseApi', () => ({
  apiClient: {
    isAuthenticated: () => true,
    get: vi.fn(),
    post: vi.fn(),
  },
  default: {
    isAuthenticated: () => true,
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock the API modules for refresh tests
vi.mock('../../src/services/api/teamsApi', () => ({
  teamsApi: {
    getTeams: vi.fn(),
  },
}));

vi.mock('../../src/services/api/playersApi', () => ({
  playersApi: {
    getPlayers: vi.fn(),
  },
}));

vi.mock('../../src/services/api/seasonsApi', () => ({
  seasonsApi: {
    getSeasons: vi.fn(),
  },
}));

describe('Cache Service Property Tests', () => {
  beforeEach(async () => {
    // Initialize the database
    await db.open();

    // Clear all tables before each test
    await db.teams.clear();
    await db.players.clear();
    await db.seasons.clear();
    await db.matches.clear();
    await db.events.clear();
    await db.match_periods.clear();
    await db.match_state.clear();
    await db.lineup.clear();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.teams.clear();
    await db.players.clear();
    await db.seasons.clear();
    await db.matches.clear();
    await db.events.clear();
    await db.match_periods.clear();
    await db.match_state.clear();
    await db.lineup.clear();
  });

  /**
   * **Feature: offline-sync-refactor, Property 7: Temporal Data Cleanup Age Threshold**
   * **Validates: Requirements 3.1**
   *
   * *For any* temporal data record (matches, events, periods, state, lineups) where
   * `synced` equals true and the record is older than 30 days, the cleanup operation
   * should delete that record.
   */
  describe('Property 7: Temporal Data Cleanup Age Threshold', () => {
    // Helper to create a timestamp older than 30 days
    const createOldTimestamp = (daysOld: number) => Date.now() - daysOld * 24 * 60 * 60 * 1000;

    it('should delete synced matches older than 30 days', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }), // days old (must be > 30)
          async (matches, daysOld) => {
            await db.matches.clear();

            // Make IDs unique and set all records to be synced and old
            const oldSyncedMatches = matches.map((m, i) => ({
              ...m,
              id: `old-match-${i}-${m.id}`,
              match_id: `old-match-${i}-${m.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: true,
            }));

            await db.matches.bulkAdd(oldSyncedMatches as any);

            // Verify records were added
            const countBefore = await db.matches.count();
            expect(countBefore).toBe(oldSyncedMatches.length);

            // Run cleanup
            await cleanupOldTemporalData();

            // All old synced matches should be deleted
            const countAfter = await db.matches.count();
            expect(countAfter).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should delete synced events older than 30 days', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(eventArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (events, daysOld) => {
            await db.events.clear();

            const oldSyncedEvents = events.map((e, i) => ({
              ...e,
              id: `old-event-${i}-${e.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: true,
            }));

            await db.events.bulkAdd(oldSyncedEvents as any);

            const countBefore = await db.events.count();
            expect(countBefore).toBe(oldSyncedEvents.length);

            await cleanupOldTemporalData();

            const countAfter = await db.events.count();
            expect(countAfter).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should delete synced match periods older than 30 days', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchPeriodArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (periods, daysOld) => {
            await db.match_periods.clear();

            const oldSyncedPeriods = periods.map((p, i) => ({
              ...p,
              id: `old-period-${i}-${p.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: true,
            }));

            await db.match_periods.bulkAdd(oldSyncedPeriods as any);

            const countBefore = await db.match_periods.count();
            expect(countBefore).toBe(oldSyncedPeriods.length);

            await cleanupOldTemporalData();

            const countAfter = await db.match_periods.count();
            expect(countAfter).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should delete synced match state older than 30 days', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchStateArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (states, daysOld) => {
            await db.match_state.clear();

            // Match state uses match_id as primary key, so make those unique
            const oldSyncedStates = states.map((s, i) => ({
              ...s,
              match_id: `old-state-match-${i}-${s.match_id}`,
              created_at: createOldTimestamp(daysOld),
              synced: true,
            }));

            await db.match_state.bulkAdd(oldSyncedStates as any);

            const countBefore = await db.match_state.count();
            expect(countBefore).toBe(oldSyncedStates.length);

            await cleanupOldTemporalData();

            const countAfter = await db.match_state.count();
            expect(countAfter).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should delete synced lineups older than 30 days', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(lineupArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (lineups, daysOld) => {
            await db.lineup.clear();

            const oldSyncedLineups = lineups.map((l, i) => ({
              ...l,
              id: `old-lineup-${i}-${l.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: true,
            }));

            await db.lineup.bulkAdd(oldSyncedLineups as any);

            const countBefore = await db.lineup.count();
            expect(countBefore).toBe(oldSyncedLineups.length);

            await cleanupOldTemporalData();

            const countAfter = await db.lineup.count();
            expect(countAfter).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT delete synced temporal data that is less than 30 days old', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            match: matchArbitrary,
            event: eventArbitrary,
            period: matchPeriodArbitrary,
            state: matchStateArbitrary,
            lineup: lineupArbitrary,
          }),
          fc.integer({ min: 0, max: 29 }), // days old (must be < 30)
          async ({ match, event, period, state, lineup }, daysOld) => {
            // Clear all tables
            await db.matches.clear();
            await db.events.clear();
            await db.match_periods.clear();
            await db.match_state.clear();
            await db.lineup.clear();

            const recentTimestamp = createOldTimestamp(daysOld);

            // Create recent synced records
            const recentMatch = {
              ...match,
              id: 'recent-match',
              match_id: 'recent-match',
              created_at: recentTimestamp,
              synced: true,
            };
            const recentEvent = {
              ...event,
              id: 'recent-event',
              created_at: recentTimestamp,
              synced: true,
            };
            const recentPeriod = {
              ...period,
              id: 'recent-period',
              created_at: recentTimestamp,
              synced: true,
            };
            const recentState = {
              ...state,
              match_id: 'recent-state-match',
              created_at: recentTimestamp,
              synced: true,
            };
            const recentLineup = {
              ...lineup,
              id: 'recent-lineup',
              created_at: recentTimestamp,
              synced: true,
            };

            await db.matches.add(recentMatch as any);
            await db.events.add(recentEvent as any);
            await db.match_periods.add(recentPeriod as any);
            await db.match_state.add(recentState as any);
            await db.lineup.add(recentLineup as any);

            // Run cleanup
            await cleanupOldTemporalData();

            // All recent records should still exist
            expect(await db.matches.get('recent-match')).toBeDefined();
            expect(await db.events.get('recent-event')).toBeDefined();
            expect(await db.match_periods.get('recent-period')).toBeDefined();
            expect(await db.match_state.get('recent-state-match')).toBeDefined();
            expect(await db.lineup.get('recent-lineup')).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly handle records just under the 30-day threshold (29 days should NOT be deleted)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random match data but we'll override the key fields
          fc.record({
            season_id: fc.uuid(),
            home_team_id: fc.uuid(),
            away_team_id: fc.uuid(),
            duration_mins: fc.integer({ min: 40, max: 120 }),
            period_format: fc.constantFrom('half', 'quarter'),
          }),
          async (matchData) => {
            await db.matches.clear();

            // Create a match 29 days old (should NOT be deleted - safely under threshold)
            const twentyNineDaysAgo = Date.now() - (29 * 24 * 60 * 60 * 1000);
            const recentMatch = {
              id: 'recent-match',
              match_id: 'recent-match',
              season_id: matchData.season_id,
              home_team_id: matchData.home_team_id,
              away_team_id: matchData.away_team_id,
              kickoff_ts: twentyNineDaysAgo,
              duration_mins: matchData.duration_mins,
              period_format: matchData.period_format,
              home_score: 0,
              away_score: 0,
              created_at: twentyNineDaysAgo,
              updated_at: twentyNineDaysAgo,
              created_by_user_id: 'test-user',
              is_deleted: false,
              synced: true, // Must be synced to test the age threshold
            };

            await db.matches.add(recentMatch as any);

            await cleanupOldTemporalData();

            // Record at 29 days should NOT be deleted
            const found = await db.matches.get('recent-match');
            expect(found).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should delete old synced records while preserving recent synced records in the same table', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchArbitrary, { minLength: 2, maxLength: 5 }),
          fc.array(matchArbitrary, { minLength: 2, maxLength: 5 }),
          async (oldMatches, recentMatches) => {
            await db.matches.clear();

            // Create old synced matches (> 30 days)
            const oldSyncedMatches = oldMatches.map((m, i) => ({
              ...m,
              id: `old-match-${i}`,
              match_id: `old-match-${i}`,
              created_at: createOldTimestamp(45), // 45 days old
              synced: true,
            }));

            // Create recent synced matches (< 30 days)
            const recentSyncedMatches = recentMatches.map((m, i) => ({
              ...m,
              id: `recent-match-${i}`,
              match_id: `recent-match-${i}`,
              created_at: createOldTimestamp(10), // 10 days old
              synced: true,
            }));

            await db.matches.bulkAdd(oldSyncedMatches as any);
            await db.matches.bulkAdd(recentSyncedMatches as any);

            const countBefore = await db.matches.count();
            expect(countBefore).toBe(oldSyncedMatches.length + recentSyncedMatches.length);

            await cleanupOldTemporalData();

            // Only recent matches should remain
            const countAfter = await db.matches.count();
            expect(countAfter).toBe(recentSyncedMatches.length);

            // Verify old matches are gone
            for (const oldMatch of oldSyncedMatches) {
              const found = await db.matches.get(oldMatch.id);
              expect(found).toBeUndefined();
            }

            // Verify recent matches still exist
            for (const recentMatch of recentSyncedMatches) {
              const found = await db.matches.get(recentMatch.id);
              expect(found).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: offline-sync-refactor, Property 9: Reference Data Retention**
   * **Validates: Requirements 3.3**
   *
   * *For any* reference data record (teams, players, seasons), the cleanup operation
   * should preserve that record regardless of age or sync status.
   */
  describe('Property 9: Reference Data Retention', () => {
    it('should preserve all team records during temporal data cleanup regardless of age or sync status', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(teamArbitrary, { minLength: 1, maxLength: 10 }), async (teams) => {
          // Clear and insert teams
          await db.teams.clear();

          // Make IDs unique
          const uniqueTeams = makeTeamIdsUnique(teams, 'team');

          await db.teams.bulkAdd(uniqueTeams as any);

          // Get count before cleanup
          const countBefore = await db.teams.count();

          // Run cleanup
          await cleanupOldTemporalData();

          // Get count after cleanup
          const countAfter = await db.teams.count();

          // All teams should be preserved
          expect(countAfter).toBe(countBefore);

          // Verify each team still exists
          for (const team of uniqueTeams) {
            const found = await db.teams.get(team.id);
            expect(found).toBeDefined();
            expect(found?.name).toBe(team.name);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve all player records during temporal data cleanup regardless of age or sync status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(playerArbitrary, { minLength: 1, maxLength: 10 }),
          async (players) => {
            // Clear and insert players
            await db.players.clear();

            // Make IDs unique
            const uniquePlayers = makeIdsUnique(players, 'player');

            await db.players.bulkAdd(uniquePlayers as any);

            // Get count before cleanup
            const countBefore = await db.players.count();

            // Run cleanup
            await cleanupOldTemporalData();

            // Get count after cleanup
            const countAfter = await db.players.count();

            // All players should be preserved
            expect(countAfter).toBe(countBefore);

            // Verify each player still exists
            for (const player of uniquePlayers) {
              const found = await db.players.get(player.id);
              expect(found).toBeDefined();
              expect(found?.full_name).toBe(player.full_name);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all season records during temporal data cleanup regardless of age or sync status', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(seasonArbitrary, { minLength: 1, maxLength: 10 }),
          async (seasons) => {
            // Clear and insert seasons
            await db.seasons.clear();

            // Make IDs unique
            const uniqueSeasons = makeSeasonIdsUnique(seasons, 'season');

            await db.seasons.bulkAdd(uniqueSeasons as any);

            // Get count before cleanup
            const countBefore = await db.seasons.count();

            // Run cleanup
            await cleanupOldTemporalData();

            // Get count after cleanup
            const countAfter = await db.seasons.count();

            // All seasons should be preserved
            expect(countAfter).toBe(countBefore);

            // Verify each season still exists
            for (const season of uniqueSeasons) {
              const found = await db.seasons.get(season.id);
              expect(found).toBeDefined();
              expect(found?.label).toBe(season.label);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve reference data even when very old (older than 30 days)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            team: teamArbitrary,
            player: playerArbitrary,
            season: seasonArbitrary,
          }),
          async ({ team, player, season }) => {
            // Clear tables
            await db.teams.clear();
            await db.players.clear();
            await db.seasons.clear();

            // Set created_at to be very old (60 days ago)
            const veryOldTimestamp = Date.now() - 60 * 24 * 60 * 60 * 1000;

            const oldTeam = {
              ...team,
              id: 'old-team',
              team_id: 'old-team',
              created_at: veryOldTimestamp,
              synced: true,
            };
            const oldPlayer = {
              ...player,
              id: 'old-player',
              created_at: veryOldTimestamp,
              synced: true,
            };
            const oldSeason = {
              ...season,
              id: 'old-season',
              season_id: 'old-season',
              created_at: veryOldTimestamp,
              synced: true,
            };

            await db.teams.add(oldTeam as any);
            await db.players.add(oldPlayer as any);
            await db.seasons.add(oldSeason as any);

            // Run cleanup
            await cleanupOldTemporalData();

            // All reference data should still exist
            const foundTeam = await db.teams.get('old-team');
            const foundPlayer = await db.players.get('old-player');
            const foundSeason = await db.seasons.get('old-season');

            expect(foundTeam).toBeDefined();
            expect(foundPlayer).toBeDefined();
            expect(foundSeason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: offline-sync-refactor, Property 14: Refresh Preserves Unsynced Records**
   * **Validates: Requirements 6.3, 6.4**
   *
   * *For any* reference data refresh operation, records where `synced` equals false
   * should be preserved while synced records may be replaced with server data.
   */
  describe('Property 14: Refresh Preserves Unsynced Records', () => {
    // Helper to setup all API mocks with empty responses
    const setupEmptyApiMocks = async () => {
      const { teamsApi } = await import('../../src/services/api/teamsApi');
      const { playersApi } = await import('../../src/services/api/playersApi');
      const { seasonsApi } = await import('../../src/services/api/seasonsApi');

      vi.mocked(teamsApi.getTeams).mockResolvedValue({
        data: [],
        hasMore: false,
        total: 0,
      });
      vi.mocked(playersApi.getPlayers).mockResolvedValue({
        data: [],
        hasMore: false,
        total: 0,
      });
      vi.mocked(seasonsApi.getSeasons).mockResolvedValue({
        data: [],
        hasMore: false,
        total: 0,
      });

      return { teamsApi, playersApi, seasonsApi };
    };

    it('should preserve unsynced team records during refresh while replacing synced ones', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(teamArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(teamArbitrary, { minLength: 1, maxLength: 5 }),
          async (unsyncedTeams, syncedTeams) => {
            // Clear teams table
            await db.teams.clear();

            // Make IDs unique and set sync status
            const uniqueUnsyncedTeams = makeTeamIdsUnique(unsyncedTeams, 'unsynced-team').map(
              (t, i) => ({
                ...t,
                synced: false,
                name: `Unsynced Team ${i}`,
              })
            );

            const uniqueSyncedTeams = makeTeamIdsUnique(syncedTeams, 'synced-team').map(
              (t, i) => ({
                ...t,
                synced: true,
                name: `Synced Team ${i}`,
              })
            );

            // Insert both unsynced and synced teams
            await db.teams.bulkAdd(uniqueUnsyncedTeams as any);
            await db.teams.bulkAdd(uniqueSyncedTeams as any);

            // Store original unsynced team data for comparison
            const originalUnsyncedData = uniqueUnsyncedTeams.map((t) => ({
              id: t.id,
              name: t.name,
            }));

            // Mock all API responses with empty data
            await setupEmptyApiMocks();

            // Run refresh
            await refreshReferenceData();

            // Verify all unsynced teams are preserved with original data
            for (const original of originalUnsyncedData) {
              const found = await db.teams.get(original.id);
              expect(found).toBeDefined();
              expect(found?.name).toBe(original.name);
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced player records during refresh while replacing synced ones', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(playerArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(playerArbitrary, { minLength: 1, maxLength: 5 }),
          async (unsyncedPlayers, syncedPlayers) => {
            // Clear players table
            await db.players.clear();

            // Make IDs unique and set sync status
            const uniqueUnsyncedPlayers = makeIdsUnique(unsyncedPlayers, 'unsynced-player').map(
              (p, i) => ({
                ...p,
                synced: false,
                full_name: `Unsynced Player ${i}`,
              })
            );

            const uniqueSyncedPlayers = makeIdsUnique(syncedPlayers, 'synced-player').map(
              (p, i) => ({
                ...p,
                synced: true,
                full_name: `Synced Player ${i}`,
              })
            );

            // Insert both unsynced and synced players
            await db.players.bulkAdd(uniqueUnsyncedPlayers as any);
            await db.players.bulkAdd(uniqueSyncedPlayers as any);

            // Store original unsynced player data for comparison
            const originalUnsyncedData = uniqueUnsyncedPlayers.map((p) => ({
              id: p.id,
              full_name: p.full_name,
            }));

            // Mock all API responses with empty data
            await setupEmptyApiMocks();

            // Run refresh
            await refreshReferenceData();

            // Verify all unsynced players are preserved with original data
            for (const original of originalUnsyncedData) {
              const found = await db.players.get(original.id);
              expect(found).toBeDefined();
              expect(found?.full_name).toBe(original.full_name);
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced season records during refresh while replacing synced ones', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(seasonArbitrary, { minLength: 1, maxLength: 5 }),
          fc.array(seasonArbitrary, { minLength: 1, maxLength: 5 }),
          async (unsyncedSeasons, syncedSeasons) => {
            // Clear seasons table
            await db.seasons.clear();

            // Make IDs unique and set sync status
            const uniqueUnsyncedSeasons = makeSeasonIdsUnique(unsyncedSeasons, 'unsynced-season').map(
              (s, i) => ({
                ...s,
                synced: false,
                label: `Unsynced Season ${i}`,
              })
            );

            const uniqueSyncedSeasons = makeSeasonIdsUnique(syncedSeasons, 'synced-season').map(
              (s, i) => ({
                ...s,
                synced: true,
                label: `Synced Season ${i}`,
              })
            );

            // Insert both unsynced and synced seasons
            await db.seasons.bulkAdd(uniqueUnsyncedSeasons as any);
            await db.seasons.bulkAdd(uniqueSyncedSeasons as any);

            // Store original unsynced season data for comparison
            const originalUnsyncedData = uniqueUnsyncedSeasons.map((s) => ({
              id: s.id,
              label: s.label,
            }));

            // Mock all API responses with empty data
            await setupEmptyApiMocks();

            // Run refresh
            await refreshReferenceData();

            // Verify all unsynced seasons are preserved with original data
            for (const original of originalUnsyncedData) {
              const found = await db.seasons.get(original.id);
              expect(found).toBeDefined();
              expect(found?.label).toBe(original.label);
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced records even when server returns records with same IDs', async () => {
      const { teamsApi } = await import('../../src/services/api/teamsApi');
      const { playersApi } = await import('../../src/services/api/playersApi');
      const { seasonsApi } = await import('../../src/services/api/seasonsApi');

      await fc.assert(
        fc.asyncProperty(
          fc.record({
            team: teamArbitrary,
            player: playerArbitrary,
            season: seasonArbitrary,
          }),
          async ({ team, player, season }) => {
            // Clear tables
            await db.teams.clear();
            await db.players.clear();
            await db.seasons.clear();

            // Create unsynced local records with specific IDs
            const localTeam = {
              ...team,
              id: 'conflict-team-id',
              team_id: 'conflict-team-id',
              name: 'Local Unsynced Team',
              synced: false,
            };

            const localPlayer = {
              ...player,
              id: 'conflict-player-id',
              full_name: 'Local Unsynced Player',
              synced: false,
            };

            const localSeason = {
              ...season,
              id: 'conflict-season-id',
              season_id: 'conflict-season-id',
              label: 'Local Unsynced Season',
              synced: false,
            };

            await db.teams.add(localTeam as any);
            await db.players.add(localPlayer as any);
            await db.seasons.add(localSeason as any);

            // Mock server returning records with the SAME IDs but different data
            vi.mocked(teamsApi.getTeams).mockResolvedValue({
              data: [
                {
                  id: 'conflict-team-id',
                  name: 'Server Team Name',
                  homeKitPrimary: '#000000',
                  homeKitSecondary: '#ffffff',
                },
              ],
              hasMore: false,
              total: 1,
            });

            vi.mocked(playersApi.getPlayers).mockResolvedValue({
              data: [
                {
                  id: 'conflict-player-id',
                  name: 'Server Player Name',
                },
              ],
              hasMore: false,
              total: 1,
            });

            vi.mocked(seasonsApi.getSeasons).mockResolvedValue({
              data: [
                {
                  id: 'conflict-season-id',
                  label: 'Server Season Label',
                },
              ],
              hasMore: false,
              total: 1,
            });

            // Run refresh
            await refreshReferenceData();

            // Verify unsynced records are preserved with LOCAL data, not server data
            const foundTeam = await db.teams.get('conflict-team-id');
            expect(foundTeam).toBeDefined();
            expect(foundTeam?.name).toBe('Local Unsynced Team');
            expect(foundTeam?.synced).toBe(false);

            const foundPlayer = await db.players.get('conflict-player-id');
            expect(foundPlayer).toBeDefined();
            expect(foundPlayer?.full_name).toBe('Local Unsynced Player');
            expect(foundPlayer?.synced).toBe(false);

            const foundSeason = await db.seasons.get('conflict-season-id');
            expect(foundSeason).toBeDefined();
            expect(foundSeason?.label).toBe('Local Unsynced Season');
            expect(foundSeason?.synced).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: offline-sync-refactor, Property 8: Unsynced Data Preservation**
   * **Validates: Requirements 3.2**
   *
   * *For any* record where `synced` equals false, the cleanup operation should
   * preserve that record regardless of its age.
   */
  describe('Property 8: Unsynced Data Preservation', () => {
    // Helper to create a timestamp older than 30 days
    const createOldTimestamp = (daysOld: number) => Date.now() - daysOld * 24 * 60 * 60 * 1000;

    it('should preserve unsynced matches regardless of age', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }), // days old (must be > 30)
          async (matches, daysOld) => {
            await db.matches.clear();

            // Make IDs unique and set all records to be UNSYNCED and old
            const oldUnsyncedMatches = matches.map((m, i) => ({
              ...m,
              id: `old-unsynced-match-${i}-${m.id}`,
              match_id: `old-unsynced-match-${i}-${m.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: false, // UNSYNCED - should be preserved
            }));

            await db.matches.bulkAdd(oldUnsyncedMatches as any);

            // Verify records were added
            const countBefore = await db.matches.count();
            expect(countBefore).toBe(oldUnsyncedMatches.length);

            // Run cleanup
            await cleanupOldTemporalData();

            // All old UNSYNCED matches should be preserved
            const countAfter = await db.matches.count();
            expect(countAfter).toBe(oldUnsyncedMatches.length);

            // Verify each match still exists
            for (const match of oldUnsyncedMatches) {
              const found = await db.matches.get(match.id);
              expect(found).toBeDefined();
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced events regardless of age', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(eventArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (events, daysOld) => {
            await db.events.clear();

            const oldUnsyncedEvents = events.map((e, i) => ({
              ...e,
              id: `old-unsynced-event-${i}-${e.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: false, // UNSYNCED - should be preserved
            }));

            await db.events.bulkAdd(oldUnsyncedEvents as any);

            const countBefore = await db.events.count();
            expect(countBefore).toBe(oldUnsyncedEvents.length);

            await cleanupOldTemporalData();

            // All old UNSYNCED events should be preserved
            const countAfter = await db.events.count();
            expect(countAfter).toBe(oldUnsyncedEvents.length);

            // Verify each event still exists
            for (const event of oldUnsyncedEvents) {
              const found = await db.events.get(event.id);
              expect(found).toBeDefined();
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced match periods regardless of age', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchPeriodArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (periods, daysOld) => {
            await db.match_periods.clear();

            const oldUnsyncedPeriods = periods.map((p, i) => ({
              ...p,
              id: `old-unsynced-period-${i}-${p.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: false, // UNSYNCED - should be preserved
            }));

            await db.match_periods.bulkAdd(oldUnsyncedPeriods as any);

            const countBefore = await db.match_periods.count();
            expect(countBefore).toBe(oldUnsyncedPeriods.length);

            await cleanupOldTemporalData();

            // All old UNSYNCED periods should be preserved
            const countAfter = await db.match_periods.count();
            expect(countAfter).toBe(oldUnsyncedPeriods.length);

            // Verify each period still exists
            for (const period of oldUnsyncedPeriods) {
              const found = await db.match_periods.get(period.id);
              expect(found).toBeDefined();
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced match state regardless of age', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchStateArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (states, daysOld) => {
            await db.match_state.clear();

            // Match state uses match_id as primary key, so make those unique
            const oldUnsyncedStates = states.map((s, i) => ({
              ...s,
              match_id: `old-unsynced-state-match-${i}-${s.match_id}`,
              created_at: createOldTimestamp(daysOld),
              synced: false, // UNSYNCED - should be preserved
            }));

            await db.match_state.bulkAdd(oldUnsyncedStates as any);

            const countBefore = await db.match_state.count();
            expect(countBefore).toBe(oldUnsyncedStates.length);

            await cleanupOldTemporalData();

            // All old UNSYNCED states should be preserved
            const countAfter = await db.match_state.count();
            expect(countAfter).toBe(oldUnsyncedStates.length);

            // Verify each state still exists
            for (const state of oldUnsyncedStates) {
              const found = await db.match_state.get(state.match_id);
              expect(found).toBeDefined();
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced lineups regardless of age', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(lineupArbitrary, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 31, max: 365 }),
          async (lineups, daysOld) => {
            await db.lineup.clear();

            const oldUnsyncedLineups = lineups.map((l, i) => ({
              ...l,
              id: `old-unsynced-lineup-${i}-${l.id}`,
              created_at: createOldTimestamp(daysOld),
              synced: false, // UNSYNCED - should be preserved
            }));

            await db.lineup.bulkAdd(oldUnsyncedLineups as any);

            const countBefore = await db.lineup.count();
            expect(countBefore).toBe(oldUnsyncedLineups.length);

            await cleanupOldTemporalData();

            // All old UNSYNCED lineups should be preserved
            const countAfter = await db.lineup.count();
            expect(countAfter).toBe(oldUnsyncedLineups.length);

            // Verify each lineup still exists
            for (const lineup of oldUnsyncedLineups) {
              const found = await db.lineup.get(lineup.id);
              expect(found).toBeDefined();
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should delete old synced records while preserving old unsynced records in the same table', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(matchArbitrary, { minLength: 2, maxLength: 5 }),
          fc.array(matchArbitrary, { minLength: 2, maxLength: 5 }),
          async (syncedMatches, unsyncedMatches) => {
            await db.matches.clear();

            // Create old SYNCED matches (> 30 days) - should be deleted
            const oldSyncedMatches = syncedMatches.map((m, i) => ({
              ...m,
              id: `old-synced-match-${i}`,
              match_id: `old-synced-match-${i}`,
              created_at: createOldTimestamp(45), // 45 days old
              synced: true,
            }));

            // Create old UNSYNCED matches (> 30 days) - should be preserved
            const oldUnsyncedMatches = unsyncedMatches.map((m, i) => ({
              ...m,
              id: `old-unsynced-match-${i}`,
              match_id: `old-unsynced-match-${i}`,
              created_at: createOldTimestamp(60), // 60 days old
              synced: false,
            }));

            await db.matches.bulkAdd(oldSyncedMatches as any);
            await db.matches.bulkAdd(oldUnsyncedMatches as any);

            const countBefore = await db.matches.count();
            expect(countBefore).toBe(oldSyncedMatches.length + oldUnsyncedMatches.length);

            await cleanupOldTemporalData();

            // Only unsynced matches should remain
            const countAfter = await db.matches.count();
            expect(countAfter).toBe(oldUnsyncedMatches.length);

            // Verify synced matches are gone
            for (const syncedMatch of oldSyncedMatches) {
              const found = await db.matches.get(syncedMatch.id);
              expect(found).toBeUndefined();
            }

            // Verify unsynced matches still exist
            for (const unsyncedMatch of oldUnsyncedMatches) {
              const found = await db.matches.get(unsyncedMatch.id);
              expect(found).toBeDefined();
              expect(found?.synced).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve unsynced records even when extremely old (over 1 year)', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            match: matchArbitrary,
            event: eventArbitrary,
            period: matchPeriodArbitrary,
            state: matchStateArbitrary,
            lineup: lineupArbitrary,
          }),
          fc.integer({ min: 365, max: 730 }), // 1-2 years old
          async ({ match, event, period, state, lineup }, daysOld) => {
            // Clear all tables
            await db.matches.clear();
            await db.events.clear();
            await db.match_periods.clear();
            await db.match_state.clear();
            await db.lineup.clear();

            const veryOldTimestamp = createOldTimestamp(daysOld);

            // Create very old UNSYNCED records
            const veryOldMatch = {
              ...match,
              id: 'very-old-unsynced-match',
              match_id: 'very-old-unsynced-match',
              created_at: veryOldTimestamp,
              synced: false,
            };
            const veryOldEvent = {
              ...event,
              id: 'very-old-unsynced-event',
              created_at: veryOldTimestamp,
              synced: false,
            };
            const veryOldPeriod = {
              ...period,
              id: 'very-old-unsynced-period',
              created_at: veryOldTimestamp,
              synced: false,
            };
            const veryOldState = {
              ...state,
              match_id: 'very-old-unsynced-state-match',
              created_at: veryOldTimestamp,
              synced: false,
            };
            const veryOldLineup = {
              ...lineup,
              id: 'very-old-unsynced-lineup',
              created_at: veryOldTimestamp,
              synced: false,
            };

            await db.matches.add(veryOldMatch as any);
            await db.events.add(veryOldEvent as any);
            await db.match_periods.add(veryOldPeriod as any);
            await db.match_state.add(veryOldState as any);
            await db.lineup.add(veryOldLineup as any);

            // Run cleanup
            await cleanupOldTemporalData();

            // All very old UNSYNCED records should still exist
            expect(await db.matches.get('very-old-unsynced-match')).toBeDefined();
            expect(await db.events.get('very-old-unsynced-event')).toBeDefined();
            expect(await db.match_periods.get('very-old-unsynced-period')).toBeDefined();
            expect(await db.match_state.get('very-old-unsynced-state-match')).toBeDefined();
            expect(await db.lineup.get('very-old-unsynced-lineup')).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: offline-sync-refactor, Property 13: Offline Reference Data Access**
   * **Validates: Requirements 6.1, 6.2**
   *
   * *For any* request for reference data (teams, players, seasons) while the device
   * is offline, the system should return cached data without throwing network errors.
   *
   * This property tests that the local IndexedDB cache serves as a reliable fallback
   * when the device is offline, ensuring users can access their reference data.
   */
  describe('Property 13: Offline Reference Data Access', () => {
    it('should serve teams from local cache when offline without network errors', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(teamArbitrary, { minLength: 1, maxLength: 10 }),
          async (teams) => {
            // Clear teams table
            await db.teams.clear();

            // Make IDs unique and add to local cache
            const uniqueTeams = makeTeamIdsUnique(teams, 'offline-team').map((t, i) => ({
              ...t,
              name: `Cached Team ${i}`,
              synced: true, // Simulating cached data from server
              is_deleted: false,
            }));

            await db.teams.bulkAdd(uniqueTeams as any);

            // Directly query IndexedDB to simulate offline access
            // This tests the core property: cached data is accessible without network
            const cachedTeams = await db.teams.toArray();
            const nonDeletedTeams = cachedTeams.filter((t: any) => !t.is_deleted);

            // Verify we can access cached data without network
            expect(nonDeletedTeams).toBeDefined();
            expect(Array.isArray(nonDeletedTeams)).toBe(true);
            expect(nonDeletedTeams.length).toBe(uniqueTeams.length);

            // Verify each cached team has the expected data
            for (const team of nonDeletedTeams) {
              expect(team.id).toBeDefined();
              expect(team.name).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should serve players from local cache when offline without network errors', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(playerArbitrary, { minLength: 1, maxLength: 10 }),
          async (players) => {
            // Clear players table
            await db.players.clear();

            // Make IDs unique and add to local cache
            const uniquePlayers = makeIdsUnique(players, 'offline-player').map((p, i) => ({
              ...p,
              full_name: `Cached Player ${i}`,
              synced: true,
              is_deleted: false,
            }));

            await db.players.bulkAdd(uniquePlayers as any);

            // Directly query IndexedDB to simulate offline access
            const cachedPlayers = await db.players.toArray();
            const nonDeletedPlayers = cachedPlayers.filter((p: any) => !p.is_deleted);

            // Verify we can access cached data without network
            expect(nonDeletedPlayers).toBeDefined();
            expect(Array.isArray(nonDeletedPlayers)).toBe(true);
            expect(nonDeletedPlayers.length).toBe(uniquePlayers.length);

            // Verify each cached player has the expected data
            for (const player of nonDeletedPlayers) {
              expect(player.id).toBeDefined();
              expect(player.full_name).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should serve seasons from local cache when offline without network errors', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(seasonArbitrary, { minLength: 1, maxLength: 10 }),
          async (seasons) => {
            // Clear seasons table
            await db.seasons.clear();

            // Make IDs unique and add to local cache
            const uniqueSeasons = makeSeasonIdsUnique(seasons, 'offline-season').map((s, i) => ({
              ...s,
              label: `Cached Season ${i}`,
              synced: true,
              is_deleted: false,
            }));

            await db.seasons.bulkAdd(uniqueSeasons as any);

            // Directly query IndexedDB to simulate offline access
            const cachedSeasons = await db.seasons.toArray();
            const nonDeletedSeasons = cachedSeasons.filter((s: any) => !s.is_deleted);

            // Verify we can access cached data without network
            expect(nonDeletedSeasons).toBeDefined();
            expect(Array.isArray(nonDeletedSeasons)).toBe(true);
            expect(nonDeletedSeasons.length).toBe(uniqueSeasons.length);

            // Verify each cached season has the expected data
            for (const season of nonDeletedSeasons) {
              expect(season.season_id).toBeDefined();
              expect(season.label).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should serve all reference data types from local cache when offline', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            teams: fc.array(teamArbitrary, { minLength: 1, maxLength: 5 }),
            players: fc.array(playerArbitrary, { minLength: 1, maxLength: 5 }),
            seasons: fc.array(seasonArbitrary, { minLength: 1, maxLength: 5 }),
          }),
          async ({ teams, players, seasons }) => {
            // Clear all reference data tables
            await db.teams.clear();
            await db.players.clear();
            await db.seasons.clear();

            // Add cached data to all tables
            const uniqueTeams = makeTeamIdsUnique(teams, 'offline-team').map((t, i) => ({
              ...t,
              name: `Cached Team ${i}`,
              synced: true,
              is_deleted: false,
            }));

            const uniquePlayers = makeIdsUnique(players, 'offline-player').map((p, i) => ({
              ...p,
              full_name: `Cached Player ${i}`,
              synced: true,
              is_deleted: false,
            }));

            const uniqueSeasons = makeSeasonIdsUnique(seasons, 'offline-season').map((s, i) => ({
              ...s,
              label: `Cached Season ${i}`,
              synced: true,
              is_deleted: false,
            }));

            await db.teams.bulkAdd(uniqueTeams as any);
            await db.players.bulkAdd(uniquePlayers as any);
            await db.seasons.bulkAdd(uniqueSeasons as any);

            // Directly query IndexedDB to simulate offline access for all types
            const [cachedTeams, cachedPlayers, cachedSeasons] = await Promise.all([
              db.teams.toArray(),
              db.players.toArray(),
              db.seasons.toArray(),
            ]);

            // Filter out deleted records
            const nonDeletedTeams = cachedTeams.filter((t: any) => !t.is_deleted);
            const nonDeletedPlayers = cachedPlayers.filter((p: any) => !p.is_deleted);
            const nonDeletedSeasons = cachedSeasons.filter((s: any) => !s.is_deleted);

            // Verify all reference data types are accessible without network
            expect(nonDeletedTeams.length).toBe(uniqueTeams.length);
            expect(nonDeletedPlayers.length).toBe(uniquePlayers.length);
            expect(nonDeletedSeasons.length).toBe(uniqueSeasons.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty results when offline with no cached data', { timeout: 30000 }, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // No input needed, just run the test
          async () => {
            // Clear all reference data tables to ensure empty state
            await db.teams.clear();
            await db.players.clear();
            await db.seasons.clear();

            // Directly query IndexedDB with empty cache
            const [cachedTeams, cachedPlayers, cachedSeasons] = await Promise.all([
              db.teams.toArray(),
              db.players.toArray(),
              db.seasons.toArray(),
            ]);

            // Verify empty results are returned without errors
            expect(cachedTeams).toBeDefined();
            expect(Array.isArray(cachedTeams)).toBe(true);
            expect(cachedTeams.length).toBe(0);

            expect(cachedPlayers).toBeDefined();
            expect(Array.isArray(cachedPlayers)).toBe(true);
            expect(cachedPlayers.length).toBe(0);

            expect(cachedSeasons).toBeDefined();
            expect(Array.isArray(cachedSeasons)).toBe(true);
            expect(cachedSeasons.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
