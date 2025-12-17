/**
 * Property-based tests for Database CRUD Round-Trip
 *
 * **Feature: indexeddb-camelcase-migration, Property 4: Database CRUD Round-Trip**
 * **Validates: Requirements 7.2, 7.3, 7.4**
 *
 * Tests that:
 * - Creating a record and reading it back returns equivalent data
 * - CRUD operations preserve all field values correctly
 * - IndexedDB stores and retrieves data with camelCase field names
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { db } from '../../../src/db/indexedDB';
import {
  teamArbitrary,
  playerArbitrary,
  seasonArbitrary,
  matchArbitrary,
} from '../../utils/arbitraries';
import type {
  EnhancedTeam,
  EnhancedPlayer,
  EnhancedSeason,
  EnhancedMatch,
} from '../../../src/db/schema';

describe('Database CRUD Round-Trip Property Tests', () => {
  beforeEach(async () => {
    await db.open();
    // Clear all tables before each test
    await db.teams.clear();
    await db.players.clear();
    await db.seasons.clear();
    await db.matches.clear();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.teams.clear();
    await db.players.clear();
    await db.seasons.clear();
    await db.matches.clear();
  });

  /**
   * **Feature: indexeddb-camelcase-migration, Property 4: Database CRUD Round-Trip**
   * **Validates: Requirements 7.2, 7.3, 7.4**
   *
   * *For any* valid team, player, season, or match data, creating a record
   * and then reading it back should return equivalent data.
   */
  describe('Property 4: Database CRUD Round-Trip', () => {
    it('should preserve team data through create and read', async () => {
      await fc.assert(
        fc.asyncProperty(teamArbitrary, async (team) => {
          // Clear before each iteration to avoid ID conflicts
          await db.teams.clear();

          // Create the team record
          await db.teams.add(team as EnhancedTeam);

          // Read it back
          const retrieved = await db.teams.get(team.id);

          // Verify all fields are preserved
          expect(retrieved).toBeDefined();
          expect(retrieved!.id).toBe(team.id);
          expect(retrieved!.teamId).toBe(team.teamId);
          expect(retrieved!.name).toBe(team.name);
          expect(retrieved!.colorPrimary).toBe(team.colorPrimary);
          expect(retrieved!.colorSecondary).toBe(team.colorSecondary);
          expect(retrieved!.awayColorPrimary).toBe(team.awayColorPrimary);
          expect(retrieved!.awayColorSecondary).toBe(team.awayColorSecondary);
          expect(retrieved!.logoUrl).toBe(team.logoUrl);
          expect(retrieved!.isOpponent).toBe(team.isOpponent);
          expect(retrieved!.createdAt).toBe(team.createdAt);
          expect(retrieved!.updatedAt).toBe(team.updatedAt);
          expect(retrieved!.createdByUserId).toBe(team.createdByUserId);
          expect(retrieved!.isDeleted).toBe(team.isDeleted);
          expect(retrieved!.synced).toBe(team.synced);
          expect(retrieved!.syncedAt).toBe(team.syncedAt);

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve player data through create and read', async () => {
      await fc.assert(
        fc.asyncProperty(playerArbitrary, async (player) => {
          // Clear before each iteration to avoid ID conflicts
          await db.players.clear();

          // Create the player record
          await db.players.add(player as EnhancedPlayer);

          // Read it back
          const retrieved = await db.players.get(player.id);

          // Verify all fields are preserved
          expect(retrieved).toBeDefined();
          expect(retrieved!.id).toBe(player.id);
          expect(retrieved!.fullName).toBe(player.fullName);
          expect(retrieved!.squadNumber).toBe(player.squadNumber);
          expect(retrieved!.preferredPos).toBe(player.preferredPos);
          expect(retrieved!.dob).toBe(player.dob);
          expect(retrieved!.notes).toBe(player.notes);
          expect(retrieved!.currentTeam).toBe(player.currentTeam);
          expect(retrieved!.createdAt).toBe(player.createdAt);
          expect(retrieved!.updatedAt).toBe(player.updatedAt);
          expect(retrieved!.createdByUserId).toBe(player.createdByUserId);
          expect(retrieved!.isDeleted).toBe(player.isDeleted);
          expect(retrieved!.synced).toBe(player.synced);
          expect(retrieved!.syncedAt).toBe(player.syncedAt);

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve season data through create and read', async () => {
      await fc.assert(
        fc.asyncProperty(seasonArbitrary, async (season) => {
          // Clear before each iteration to avoid ID conflicts
          await db.seasons.clear();

          // Create the season record
          await db.seasons.add(season as EnhancedSeason);

          // Read it back - seasons use seasonId as primary key
          const retrieved = await db.seasons.get(season.seasonId);

          // Verify all fields are preserved
          expect(retrieved).toBeDefined();
          expect(retrieved!.id).toBe(season.id);
          expect(retrieved!.seasonId).toBe(season.seasonId);
          expect(retrieved!.label).toBe(season.label);
          expect(retrieved!.startDate).toBe(season.startDate);
          expect(retrieved!.endDate).toBe(season.endDate);
          expect(retrieved!.isCurrent).toBe(season.isCurrent);
          expect(retrieved!.description).toBe(season.description);
          expect(retrieved!.createdAt).toBe(season.createdAt);
          expect(retrieved!.updatedAt).toBe(season.updatedAt);
          expect(retrieved!.createdByUserId).toBe(season.createdByUserId);
          expect(retrieved!.isDeleted).toBe(season.isDeleted);
          expect(retrieved!.synced).toBe(season.synced);
          expect(retrieved!.syncedAt).toBe(season.syncedAt);

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should preserve match data through create and read', async () => {
      await fc.assert(
        fc.asyncProperty(matchArbitrary, async (match) => {
          // Clear before each iteration to avoid ID conflicts
          await db.matches.clear();

          // Create the match record
          await db.matches.add(match as EnhancedMatch);

          // Read it back
          const retrieved = await db.matches.get(match.id);

          // Verify all fields are preserved
          expect(retrieved).toBeDefined();
          expect(retrieved!.id).toBe(match.id);
          expect(retrieved!.matchId).toBe(match.matchId);
          expect(retrieved!.seasonId).toBe(match.seasonId);
          expect(retrieved!.homeTeamId).toBe(match.homeTeamId);
          expect(retrieved!.awayTeamId).toBe(match.awayTeamId);
          expect(retrieved!.kickoffTs).toBe(match.kickoffTs);
          expect(retrieved!.competition).toBe(match.competition);
          expect(retrieved!.venue).toBe(match.venue);
          expect(retrieved!.durationMins).toBe(match.durationMins);
          expect(retrieved!.periodFormat).toBe(match.periodFormat);
          expect(retrieved!.homeScore).toBe(match.homeScore);
          expect(retrieved!.awayScore).toBe(match.awayScore);
          expect(retrieved!.notes).toBe(match.notes);
          expect(retrieved!.createdAt).toBe(match.createdAt);
          expect(retrieved!.updatedAt).toBe(match.updatedAt);
          expect(retrieved!.createdByUserId).toBe(match.createdByUserId);
          expect(retrieved!.isDeleted).toBe(match.isDeleted);
          expect(retrieved!.synced).toBe(match.synced);
          expect(retrieved!.syncedAt).toBe(match.syncedAt);

          return true;
        }),
        { numRuns: 50 }
      );
    });

    it('should support update operations preserving data integrity', async () => {
      await fc.assert(
        fc.asyncProperty(
          teamArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (team, newName) => {
            // Clear before each iteration
            await db.teams.clear();

            // Create the team record
            await db.teams.add(team as EnhancedTeam);

            // Update the name
            await db.teams.update(team.id, { name: newName });

            // Read it back
            const retrieved = await db.teams.get(team.id);

            // Verify the name was updated
            expect(retrieved!.name).toBe(newName);

            // Verify other fields are preserved
            expect(retrieved!.id).toBe(team.id);
            expect(retrieved!.colorPrimary).toBe(team.colorPrimary);
            expect(retrieved!.isOpponent).toBe(team.isOpponent);

            return true;
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should support delete operations', async () => {
      await fc.assert(
        fc.asyncProperty(playerArbitrary, async (player) => {
          // Clear before each iteration
          await db.players.clear();

          // Create the player record
          await db.players.add(player as EnhancedPlayer);

          // Verify it exists
          const beforeDelete = await db.players.get(player.id);
          expect(beforeDelete).toBeDefined();

          // Delete the record
          await db.players.delete(player.id);

          // Verify it's gone
          const afterDelete = await db.players.get(player.id);
          expect(afterDelete).toBeUndefined();

          return true;
        }),
        { numRuns: 30 }
      );
    });

    it('should support querying by indexed fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(teamArbitrary, { minLength: 1, maxLength: 5 }),
          async (teams) => {
            // Clear before each iteration
            await db.teams.clear();

            // Make IDs unique to avoid conflicts
            const uniqueTeams = teams.map((t, i) => ({
              ...t,
              id: `team-${i}-${t.id}`,
              teamId: `team-${i}-${t.id}`,
            }));

            // Add all teams
            await db.teams.bulkAdd(uniqueTeams as EnhancedTeam[]);

            // Query by name (indexed field)
            const firstTeam = uniqueTeams[0];
            const results = await db.teams.where('name').equals(firstTeam.name).toArray();

            // Should find at least the first team
            expect(results.length).toBeGreaterThanOrEqual(1);
            expect(results.some(r => r.id === firstTeam.id)).toBe(true);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should support filtering by isDeleted field', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(playerArbitrary, { minLength: 2, maxLength: 5 }),
          async (players) => {
            // Clear before each iteration
            await db.players.clear();

            // Make IDs unique and set some as deleted
            const uniquePlayers = players.map((p, i) => ({
              ...p,
              id: `player-${i}-${p.id}`,
              isDeleted: i % 2 === 0, // Alternate deleted status
            }));

            // Add all players
            await db.players.bulkAdd(uniquePlayers as EnhancedPlayer[]);

            // Get all players and filter by isDeleted
            const allPlayers = await db.players.toArray();
            const activeResults = allPlayers.filter(p => !p.isDeleted);
            const deletedResults = allPlayers.filter(p => p.isDeleted);

            // Verify counts match expected
            const expectedActive = uniquePlayers.filter(p => !p.isDeleted).length;
            const expectedDeleted = uniquePlayers.filter(p => p.isDeleted).length;

            expect(activeResults.length).toBe(expectedActive);
            expect(deletedResults.length).toBe(expectedDeleted);

            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
