/**
 * Cache Service for managing local data retention and refresh policies.
 * 
 * This service implements different retention policies for reference vs temporal data:
 * - Reference data (teams, players, seasons): Indefinite retention
 * - Temporal data (matches, events, periods, state, lineups): 30-day retention for synced records
 * - Unsynced data: Never deleted regardless of age
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4
 */

import { db } from '../db/indexedDB';
import { apiClient } from './api/baseApi';
import { teamsApi } from './api/teamsApi';
import { playersApi } from './api/playersApi';
import { seasonsApi } from './api/seasonsApi';
import { matchesApi } from './api/matchesApi';

/**
 * 30 days in milliseconds
 * Requirements: 3.1 - Delete synced temporal data older than 30 days
 */
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Cache statistics returned after refresh operations
 */
export interface CacheStats {
  referenceDataRefreshed: boolean;
  temporalDataCleaned: number;
  matchesCached: number;
}

/**
 * Main entry point for cache refresh operations.
 * Should be called on app load when online and authenticated.
 * 
 * Requirements: 3.4, 3.5
 * 
 * @returns CacheStats with details about what was refreshed/cleaned
 */
export async function refreshCache(): Promise<CacheStats> {
  const stats: CacheStats = {
    referenceDataRefreshed: false,
    temporalDataCleaned: 0,
    matchesCached: 0,
  };

  // Only proceed if online and authenticated
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('[CacheService] Offline - skipping cache refresh');
    return stats;
  }

  if (!apiClient.isAuthenticated()) {
    console.log('[CacheService] Not authenticated - skipping cache refresh');
    return stats;
  }

  try {
    // Requirements: 3.4 - Refresh reference data from the server
    await refreshReferenceData();
    stats.referenceDataRefreshed = true;
    console.log('[CacheService] Reference data refreshed');
  } catch (err) {
    console.error('[CacheService] Failed to refresh reference data:', err);
  }

  try {
    // Requirements: 3.1 - Delete synced temporal data older than 30 days
    stats.temporalDataCleaned = await cleanupOldTemporalData();
    console.log(`[CacheService] Cleaned up ${stats.temporalDataCleaned} old temporal records`);
  } catch (err) {
    console.error('[CacheService] Failed to cleanup temporal data:', err);
  }

  try {
    // Requirements: 3.4 - Cache recent matches
    stats.matchesCached = await cacheRecentMatches();
    console.log(`[CacheService] Cached ${stats.matchesCached} recent matches`);
  } catch (err) {
    console.error('[CacheService] Failed to cache recent matches:', err);
  }

  return stats;
}


/**
 * Refresh reference data (teams, players, seasons) from the server.
 * Replaces synced records while preserving unsynced local changes.
 * 
 * Requirements: 3.3 - Retain teams, players, and seasons indefinitely for offline access
 * Requirements: 6.3 - Update local reference data with server data while preserving unsynced local changes
 * Requirements: 6.4 - Replace synced records and preserve unsynced records
 */
export async function refreshReferenceData(): Promise<void> {
  // Refresh teams
  await refreshTeams();
  
  // Refresh players
  await refreshPlayers();
  
  // Refresh seasons
  await refreshSeasons();
}

/**
 * Refresh teams from server, preserving unsynced local records.
 */
async function refreshTeams(): Promise<void> {
  try {
    // Fetch all teams from server (paginated, get all pages)
    let page = 1;
    const limit = 100;
    let hasMore = true;
    const serverTeams: any[] = [];

    while (hasMore) {
      const response = await teamsApi.getTeams({ page, limit });
      serverTeams.push(...response.data);
      hasMore = response.hasMore ?? false;
      page++;
    }

    // Get local unsynced teams to preserve
    const localTeams = await db.teams.toArray();
    const unsyncedTeams = localTeams.filter(t => t.synced === false);
    const unsyncedIds = new Set(unsyncedTeams.map(t => t.id));

    // Build a map of server teams by ID
    const serverTeamMap = new Map(serverTeams.map(t => [t.id, t]));

    // Delete synced local teams that are not in server response (they may have been deleted on server)
    for (const localTeam of localTeams) {
      if (localTeam.synced && !serverTeamMap.has(localTeam.id) && !unsyncedIds.has(localTeam.id)) {
        await db.teams.delete(localTeam.id);
      }
    }

    // Upsert server teams, but skip if there's an unsynced local version
    for (const serverTeam of serverTeams) {
      if (unsyncedIds.has(serverTeam.id)) {
        // Preserve unsynced local version
        continue;
      }

      const now = Date.now();
      await db.teams.put({
        id: serverTeam.id,
        team_id: serverTeam.id,
        name: serverTeam.name,
        color_primary: serverTeam.homeKitPrimary,
        color_secondary: serverTeam.homeKitSecondary,
        away_color_primary: serverTeam.awayKitPrimary,
        away_color_secondary: serverTeam.awayKitSecondary,
        logo_url: serverTeam.logoUrl,
        is_opponent: serverTeam.is_opponent ?? false,
        created_at: serverTeam.createdAt ? new Date(serverTeam.createdAt).getTime() : now,
        updated_at: serverTeam.updatedAt ? new Date(serverTeam.updatedAt).getTime() : now,
        created_by_user_id: serverTeam.created_by_user_id || 'server',
        is_deleted: serverTeam.is_deleted ?? false,
        synced: true,
        synced_at: now,
      } as any);
    }

    console.log(`[CacheService] Refreshed ${serverTeams.length} teams, preserved ${unsyncedTeams.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh teams:', err);
    throw err;
  }
}

/**
 * Refresh players from server, preserving unsynced local records.
 */
async function refreshPlayers(): Promise<void> {
  try {
    // Fetch all players from server (paginated, get all pages)
    let page = 1;
    const limit = 100;
    let hasMore = true;
    const serverPlayers: any[] = [];

    while (hasMore) {
      const response = await playersApi.getPlayers({ page, limit });
      serverPlayers.push(...response.data);
      hasMore = response.hasMore ?? false;
      page++;
    }

    // Get local unsynced players to preserve
    const localPlayers = await db.players.toArray();
    const unsyncedPlayers = localPlayers.filter(p => p.synced === false);
    const unsyncedIds = new Set(unsyncedPlayers.map(p => p.id));

    // Build a map of server players by ID
    const serverPlayerMap = new Map(serverPlayers.map(p => [p.id, p]));

    // Delete synced local players that are not in server response
    for (const localPlayer of localPlayers) {
      if (localPlayer.synced && !serverPlayerMap.has(localPlayer.id) && !unsyncedIds.has(localPlayer.id)) {
        await db.players.delete(localPlayer.id);
      }
    }

    // Upsert server players, but skip if there's an unsynced local version
    for (const serverPlayer of serverPlayers) {
      if (unsyncedIds.has(serverPlayer.id)) {
        // Preserve unsynced local version
        continue;
      }

      const now = Date.now();
      await db.players.put({
        id: serverPlayer.id,
        full_name: serverPlayer.name,
        squad_number: serverPlayer.squadNumber,
        preferred_pos: serverPlayer.preferredPosition,
        dob: serverPlayer.dateOfBirth ? new Date(serverPlayer.dateOfBirth).toISOString() : undefined,
        notes: serverPlayer.notes,
        current_team: serverPlayer.currentTeam,
        created_at: serverPlayer.createdAt ? new Date(serverPlayer.createdAt).getTime() : now,
        updated_at: serverPlayer.updatedAt ? new Date(serverPlayer.updatedAt).getTime() : now,
        created_by_user_id: serverPlayer.created_by_user_id || 'server',
        is_deleted: serverPlayer.is_deleted ?? false,
        synced: true,
        synced_at: now,
      } as any);
    }

    console.log(`[CacheService] Refreshed ${serverPlayers.length} players, preserved ${unsyncedPlayers.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh players:', err);
    throw err;
  }
}

/**
 * Refresh seasons from server, preserving unsynced local records.
 */
async function refreshSeasons(): Promise<void> {
  try {
    // Fetch all seasons from server (paginated, get all pages)
    let page = 1;
    const limit = 100;
    let hasMore = true;
    const serverSeasons: any[] = [];

    while (hasMore) {
      const response = await seasonsApi.getSeasons({ page, limit });
      serverSeasons.push(...response.data);
      hasMore = response.hasMore ?? false;
      page++;
    }

    // Get local unsynced seasons to preserve
    const localSeasons = await db.seasons.toArray();
    const unsyncedSeasons = localSeasons.filter(s => s.synced === false);
    const unsyncedIds = new Set(unsyncedSeasons.map(s => s.season_id));

    // Build a map of server seasons by ID
    const serverSeasonMap = new Map(serverSeasons.map(s => [s.id || s.seasonId, s]));

    // Delete synced local seasons that are not in server response
    for (const localSeason of localSeasons) {
      const localId = localSeason.season_id;
      if (localSeason.synced && !serverSeasonMap.has(localId) && !unsyncedIds.has(localId)) {
        await db.seasons.delete(localId);
      }
    }

    // Upsert server seasons, but skip if there's an unsynced local version
    for (const serverSeason of serverSeasons) {
      const seasonId = serverSeason.id || serverSeason.seasonId;
      if (unsyncedIds.has(seasonId)) {
        // Preserve unsynced local version
        continue;
      }

      const now = Date.now();
      await db.seasons.put({
        id: seasonId,
        season_id: seasonId,
        label: serverSeason.label,
        start_date: serverSeason.startDate,
        end_date: serverSeason.endDate,
        is_current: serverSeason.isCurrent ?? false,
        description: serverSeason.description,
        created_at: serverSeason.createdAt ? new Date(serverSeason.createdAt).getTime() : now,
        updated_at: serverSeason.updatedAt ? new Date(serverSeason.updatedAt).getTime() : now,
        created_by_user_id: serverSeason.created_by_user_id || 'server',
        is_deleted: serverSeason.is_deleted ?? false,
        synced: true,
        synced_at: now,
      } as any);
    }

    console.log(`[CacheService] Refreshed ${serverSeasons.length} seasons, preserved ${unsyncedSeasons.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh seasons:', err);
    throw err;
  }
}


/**
 * Clean up old synced temporal data (matches, events, periods, state, lineups).
 * Deletes synced records older than 30 days while preserving all unsynced records.
 * 
 * Requirements: 3.1 - Delete synced temporal data older than 30 days
 * Requirements: 3.2 - Preserve all records where synced equals false regardless of age
 */
export async function cleanupOldTemporalData(): Promise<number> {
  const cutoffTime = Date.now() - THIRTY_DAYS_MS;
  let totalDeleted = 0;

  // Clean up old synced matches
  try {
    const allMatches = await db.matches.toArray();
    const matchesToDelete = allMatches.filter(m => 
      m.synced === true && 
      m.created_at < cutoffTime
    );
    
    if (matchesToDelete.length > 0) {
      const ids = matchesToDelete.map(m => m.id);
      await db.matches.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced matches`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old matches:', err);
  }

  // Clean up old synced events
  try {
    const allEvents = await db.events.toArray();
    const eventsToDelete = allEvents.filter(e => 
      e.synced === true && 
      e.created_at < cutoffTime
    );
    
    if (eventsToDelete.length > 0) {
      const ids = eventsToDelete.map(e => e.id);
      await db.events.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced events`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old events:', err);
  }

  // Clean up old synced match periods
  try {
    const allPeriods = await db.match_periods.toArray();
    const periodsToDelete = allPeriods.filter(p => 
      p.synced === true && 
      p.created_at < cutoffTime
    );
    
    if (periodsToDelete.length > 0) {
      const ids = periodsToDelete.map(p => p.id);
      await db.match_periods.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced match periods`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old match periods:', err);
  }

  // Clean up old synced match state
  try {
    const allStates = await db.match_state.toArray();
    const statesToDelete = allStates.filter(s => 
      s.synced === true && 
      s.created_at < cutoffTime
    );
    
    if (statesToDelete.length > 0) {
      const ids = statesToDelete.map(s => s.match_id);
      await db.match_state.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced match states`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old match states:', err);
  }

  // Clean up old synced lineups
  try {
    const allLineups = await db.lineup.toArray();
    const lineupsToDelete = allLineups.filter(l => 
      l.synced === true && 
      l.created_at < cutoffTime
    );
    
    if (lineupsToDelete.length > 0) {
      const ids = lineupsToDelete.map(l => l.id);
      await db.lineup.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced lineups`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old lineups:', err);
  }

  return totalDeleted;
}

/**
 * Cache recent matches from the server (last 30 days).
 * Adds matches to local cache with synced: true.
 * 
 * Requirements: 3.4 - Cache recent matches
 */
export async function cacheRecentMatches(): Promise<number> {
  try {
    // Fetch recent matches from server
    const response = await matchesApi.getMatches({ page: 1, limit: 100 });
    const serverMatches = response.data;

    // Filter to matches from last 30 days
    const cutoffTime = Date.now() - THIRTY_DAYS_MS;
    const recentMatches = serverMatches.filter(m => {
      const kickoffTime = m.kickoffTime ? new Date(m.kickoffTime).getTime() : 0;
      return kickoffTime >= cutoffTime;
    });

    // Get local unsynced matches to preserve
    const localMatches = await db.matches.toArray();
    const unsyncedIds = new Set(
      localMatches.filter(m => m.synced === false).map(m => m.id)
    );

    let cachedCount = 0;

    // Add/update recent matches in local cache
    for (const serverMatch of recentMatches) {
      if (unsyncedIds.has(serverMatch.id)) {
        // Preserve unsynced local version
        continue;
      }

      const now = Date.now();
      await db.matches.put({
        id: serverMatch.id,
        match_id: serverMatch.id,
        season_id: serverMatch.seasonId,
        kickoff_ts: serverMatch.kickoffTime ? new Date(serverMatch.kickoffTime).getTime() : now,
        competition: serverMatch.competition,
        home_team_id: serverMatch.homeTeamId,
        away_team_id: serverMatch.awayTeamId,
        venue: serverMatch.venue,
        duration_mins: serverMatch.durationMinutes || 60,
        period_format: serverMatch.periodFormat || 'quarter',
        home_score: serverMatch.homeScore || 0,
        away_score: serverMatch.awayScore || 0,
        notes: serverMatch.notes,
        created_at: serverMatch.createdAt ? new Date(serverMatch.createdAt).getTime() : now,
        updated_at: serverMatch.updatedAt ? new Date(serverMatch.updatedAt).getTime() : now,
        created_by_user_id: serverMatch.created_by_user_id || 'server',
        is_deleted: serverMatch.is_deleted ?? false,
        synced: true,
        synced_at: now,
      } as any);

      cachedCount++;
    }

    console.log(`[CacheService] Cached ${cachedCount} recent matches`);
    return cachedCount;
  } catch (err) {
    console.error('[CacheService] Failed to cache recent matches:', err);
    throw err;
  }
}

/**
 * Set up cache refresh triggers for app lifecycle events.
 * Should be called once during app initialization.
 * 
 * Requirements: 3.4 - Call refreshCache() on app load when online and authenticated
 * Requirements: 3.5 - Trigger cache refresh when coming back online
 */
export function setupCacheRefreshTriggers(): void {
  // Trigger cache refresh when coming back online
  if (typeof window !== 'undefined') {
    window.addEventListener('online', async () => {
      console.log('[CacheService] Network online - triggering cache refresh');
      // Small delay to ensure network is stable
      setTimeout(async () => {
        try {
          // First sync any pending local changes
          const { syncService } = await import('./syncService');
          await syncService.flushOnce();
          
          // Then refresh cache
          await refreshCache();
        } catch (err) {
          console.error('[CacheService] Failed to refresh cache on online:', err);
        }
      }, 1000);
    });

    // Also listen for auth events to refresh cache after login
    window.addEventListener('auth:login', async () => {
      console.log('[CacheService] User logged in - triggering cache refresh');
      setTimeout(async () => {
        try {
          await refreshCache();
        } catch (err) {
          console.error('[CacheService] Failed to refresh cache on login:', err);
        }
      }, 500);
    });

    console.log('[CacheService] Cache refresh triggers set up');
  }
}
