/**
 * Cache Service for managing local data retention and refresh policies.
 * 
 * This service implements different retention policies for reference vs temporal data:
 * - Reference data (teams, players, seasons): Indefinite retention
 * - Temporal data (matches, events, periods, state, lineups): 30-day retention for synced records
 * - Unsynced data: Never deleted regardless of age
 * 
 * IMPORTANT: This service fetches directly from the server API to populate IndexedDB.
 * It does NOT use the local-first API services (teamsApi, playersApi, etc.) because
 * those read from IndexedDB. The cache service's job is to populate IndexedDB from the server.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1, 6.2, 6.3, 6.4
 */

import { db } from '../db/indexedDB';
import { apiClient } from './api/baseApi';
import {
  serverTeamToDb,
  serverPlayerToDb,
  serverSeasonToDb,
  serverMatchToDb,
  serverPlayerTeamToDb,
  serverDefaultLineupToDb,
} from '../db/transforms';

/**
 * 30 days in milliseconds
 * Requirements: 3.1 - Delete synced temporal data older than 30 days
 */
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Default page size for paginated API requests
 */
const DEFAULT_PAGE_LIMIT = 100;

/**
 * Fetch all pages from a paginated API endpoint.
 * Handles pagination automatically and collects all results.
 * 
 * @param endpoint - API endpoint path (e.g., '/teams', '/players')
 * @param extraParams - Additional query parameters to include
 * @param entityName - Name for logging purposes
 * @returns Array of all fetched records
 */
async function fetchAllPages<T = any>(
  endpoint: string,
  extraParams: Record<string, string> = {},
  entityName: string = 'records'
): Promise<T[]> {
  let page = 1;
  const limit = DEFAULT_PAGE_LIMIT;
  let hasMore = true;
  const allRecords: T[] = [];

  while (hasMore) {
    const queryParams = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...extraParams,
    });
    
    console.log(`[CacheService] Fetching ${entityName} page ${page} from server...`);
    const response = await apiClient.get(`${endpoint}?${queryParams.toString()}`);
    const data = response.data as any;
    const records = data.data || data;
    
    console.log(`[CacheService] Extracted ${Array.isArray(records) ? records.length : 'non-array'} ${entityName} from response`);
    
    if (Array.isArray(records)) {
      allRecords.push(...records);
    }
    
    hasMore = data.hasMore ?? (Array.isArray(records) && records.length === limit);
    page++;
  }

  return allRecords;
}

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
 * Refresh reference data (teams, players, seasons, player_teams, default_lineups) from the server.
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
  
  // Refresh player-team relationships
  await refreshPlayerTeams();
  
  // Refresh default lineups (depends on teams being loaded first)
  await refreshDefaultLineups();
}

/**
 * Refresh teams from server, preserving unsynced local records.
 * Fetches directly from server API (not through local-first teamsApi).
 */
async function refreshTeams(): Promise<void> {
  try {
    // Fetch all teams directly from server (paginated, get all pages)
    const serverTeams = await fetchAllPages('/teams', { includeOpponents: 'true' }, 'teams');

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

      // Use centralized transform: Server API → IndexedDB
      await db.teams.put(serverTeamToDb(serverTeam) as any);
    }

    console.log(`[CacheService] Refreshed ${serverTeams.length} teams, preserved ${unsyncedTeams.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh teams:', err);
    throw err;
  }
}

/**
 * Refresh players from server, preserving unsynced local records.
 * Fetches directly from server API (not through local-first playersApi).
 */
async function refreshPlayers(): Promise<void> {
  try {
    // Fetch all players directly from server (paginated, get all pages)
    const serverPlayers = await fetchAllPages('/players', {}, 'players');

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

      // Use centralized transform: Server API → IndexedDB
      await db.players.put(serverPlayerToDb(serverPlayer) as any);
    }

    console.log(`[CacheService] Refreshed ${serverPlayers.length} players, preserved ${unsyncedPlayers.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh players:', err);
    throw err;
  }
}

/**
 * Refresh seasons from server, preserving unsynced local records.
 * Fetches directly from server API (not through local-first seasonsApi).
 */
async function refreshSeasons(): Promise<void> {
  try {
    // Fetch all seasons directly from server (paginated, get all pages)
    const serverSeasons = await fetchAllPages('/seasons', {}, 'seasons');

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

      // Use centralized transform: Server API → IndexedDB
      await db.seasons.put(serverSeasonToDb(serverSeason) as any);
    }

    console.log(`[CacheService] Refreshed ${serverSeasons.length} seasons, preserved ${unsyncedSeasons.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh seasons:', err);
    throw err;
  }
}

/**
 * Refresh player-team relationships from server, preserving unsynced local records.
 * Fetches directly from server API (not through local-first playerTeamsApi).
 */
async function refreshPlayerTeams(): Promise<void> {
  try {
    // Fetch all player-team relationships directly from server (paginated, get all pages)
    const serverPlayerTeams = await fetchAllPages('/player-teams', {}, 'player-teams');

    // Get local unsynced player-teams to preserve
    const localPlayerTeams = await db.player_teams.toArray();
    const unsyncedPlayerTeams = localPlayerTeams.filter((pt: any) => pt.synced === false);
    const unsyncedIds = new Set(unsyncedPlayerTeams.map((pt: any) => pt.id));

    // Build a map of server player-teams by ID
    const serverPlayerTeamMap = new Map(serverPlayerTeams.map(pt => [pt.id, pt]));

    // Delete synced local player-teams that are not in server response
    for (const localPT of localPlayerTeams) {
      if ((localPT as any).synced && !serverPlayerTeamMap.has(localPT.id) && !unsyncedIds.has(localPT.id)) {
        await db.player_teams.delete(localPT.id);
      }
    }

    // Upsert server player-teams, but skip if there's an unsynced local version
    for (const serverPT of serverPlayerTeams) {
      if (unsyncedIds.has(serverPT.id)) {
        // Preserve unsynced local version
        continue;
      }

      // Use centralized transform: Server API → IndexedDB
      await db.player_teams.put(serverPlayerTeamToDb(serverPT) as any);
    }

    console.log(`[CacheService] Refreshed ${serverPlayerTeams.length} player-teams, preserved ${unsyncedPlayerTeams.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh player-teams:', err);
    throw err;
  }
}

/**
 * Refresh default lineups from server, preserving unsynced local records.
 * Fetches default lineup for each team that has one.
 */
async function refreshDefaultLineups(): Promise<void> {
  try {
    // First, get the list of teams with default lineups from the server
    console.log('[CacheService] Fetching teams with default lineups from server...');
    const teamsResponse = await apiClient.get('/default-lineups');
    const teamsData = teamsResponse.data as any;
    const teamsWithDefaults = teamsData.data || teamsData;
    
    console.log(`[CacheService] Found ${Array.isArray(teamsWithDefaults) ? teamsWithDefaults.length : 0} teams with default lineup info`);
    
    // Filter to teams that have default lineups
    const teamsWithLineups = Array.isArray(teamsWithDefaults) 
      ? teamsWithDefaults.filter((t: any) => t.hasDefaultLineup)
      : [];
    
    console.log(`[CacheService] ${teamsWithLineups.length} teams have default lineups`);
    
    // Get local unsynced default lineups to preserve
    const localDefaultLineups = await db.default_lineups.toArray();
    const unsyncedDefaultLineups = localDefaultLineups.filter((dl: any) => dl.synced === false);
    const unsyncedTeamIds = new Set(unsyncedDefaultLineups.map((dl: any) => dl.team_id));
    
    // Fetch default lineup for each team that has one
    const serverDefaultLineups: any[] = [];
    for (const teamInfo of teamsWithLineups) {
      const teamId = teamInfo.teamId;
      
      // Skip if we have an unsynced local version for this team
      if (unsyncedTeamIds.has(teamId)) {
        console.log(`[CacheService] Skipping default lineup for team ${teamId} - has unsynced local version`);
        continue;
      }
      
      try {
        const lineupResponse = await apiClient.get(`/default-lineups/${teamId}`);
        const lineupData = lineupResponse.data as any;
        const defaultLineup = lineupData.data || lineupData;
        
        if (defaultLineup && defaultLineup.id) {
          serverDefaultLineups.push(defaultLineup);
        }
      } catch (err) {
        console.warn(`[CacheService] Failed to fetch default lineup for team ${teamId}:`, err);
      }
    }
    
    console.log(`[CacheService] Fetched ${serverDefaultLineups.length} default lineups from server`);
    
    // Build a map of server default lineups by team_id
    const serverLineupByTeamId = new Map(serverDefaultLineups.map(dl => [dl.teamId, dl]));
    
    // Delete synced local default lineups for teams that no longer have one on server
    for (const localDL of localDefaultLineups) {
      const teamId = (localDL as any).team_id;
      if ((localDL as any).synced && !serverLineupByTeamId.has(teamId) && !unsyncedTeamIds.has(teamId)) {
        await db.default_lineups.delete(localDL.id);
        console.log(`[CacheService] Deleted local default lineup for team ${teamId} - no longer on server`);
      }
    }
    
    // Upsert server default lineups
    for (const serverDL of serverDefaultLineups) {
      // Use centralized transform: Server API → IndexedDB
      await db.default_lineups.put(serverDefaultLineupToDb(serverDL) as any);
    }
    
    console.log(`[CacheService] Refreshed ${serverDefaultLineups.length} default lineups, preserved ${unsyncedDefaultLineups.length} unsynced`);
  } catch (err) {
    console.error('[CacheService] Failed to refresh default lineups:', err);
    throw err;
  }
}


/**
 * Clean up old synced temporal data (events, periods, state, lineups).
 * Deletes synced records that haven't been accessed in 30 days while preserving unsynced records.
 * 
 * Uses synced_at (last access/sync time) instead of created_at so that:
 * - Recently viewed historical matches keep their cached data
 * - Data you haven't accessed in 30 days gets cleaned up
 * - When you open an old match, fresh data is fetched and cached with new synced_at
 * 
 * NOTE: Matches are NOT cleaned up - they are retained indefinitely for full history access.
 * Only the heavy temporal data (events, periods, state, lineups) is cleaned up to keep IndexedDB lean.
 * 
 * Requirements: 3.1 - Delete synced temporal data not accessed in 30 days
 * Requirements: 3.2 - Preserve all records where synced equals false regardless of age
 */
export async function cleanupOldTemporalData(): Promise<number> {
  const cutoffTime = Date.now() - THIRTY_DAYS_MS;
  let totalDeleted = 0;

  // NOTE: Matches are NOT cleaned up - retained indefinitely for full history browsing
  // The matches table is lightweight (just metadata), so this is acceptable.

  // Clean up old synced events (not accessed in 30 days)
  try {
    const allEvents = await db.events.toArray();
    const eventsToDelete = allEvents.filter(e => 
      e.synced === true && 
      (e.synced_at ?? e.created_at) < cutoffTime
    );
    
    if (eventsToDelete.length > 0) {
      const ids = eventsToDelete.map(e => e.id);
      await db.events.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced events (not accessed in 30 days)`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old events:', err);
  }

  // Clean up old synced match periods (not accessed in 30 days)
  try {
    const allPeriods = await db.match_periods.toArray();
    const periodsToDelete = allPeriods.filter(p => 
      p.synced === true && 
      (p.synced_at ?? p.created_at) < cutoffTime
    );
    
    if (periodsToDelete.length > 0) {
      const ids = periodsToDelete.map(p => p.id);
      await db.match_periods.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced match periods (not accessed in 30 days)`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old match periods:', err);
  }

  // Clean up old synced match state (not accessed in 30 days)
  try {
    const allStates = await db.match_state.toArray();
    const statesToDelete = allStates.filter(s => 
      s.synced === true && 
      (s.synced_at ?? s.created_at) < cutoffTime
    );
    
    if (statesToDelete.length > 0) {
      const ids = statesToDelete.map(s => s.match_id);
      await db.match_state.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced match states (not accessed in 30 days)`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old match states:', err);
  }

  // Clean up old synced lineups (not accessed in 30 days)
  try {
    const allLineups = await db.lineup.toArray();
    const lineupsToDelete = allLineups.filter(l => 
      l.synced === true && 
      (l.synced_at ?? l.created_at) < cutoffTime
    );
    
    if (lineupsToDelete.length > 0) {
      const ids = lineupsToDelete.map(l => l.id);
      await db.lineup.bulkDelete(ids);
      totalDeleted += ids.length;
      console.log(`[CacheService] Deleted ${ids.length} old synced lineups (not accessed in 30 days)`);
    }
  } catch (err) {
    console.error('[CacheService] Failed to cleanup old lineups:', err);
  }

  return totalDeleted;
}

/**
 * Cache matches from the server using progressive loading.
 * First page loads immediately, then remaining pages load in background.
 * Fetches directly from server API (not through local-first matchesApi).
 * 
 * Requirements: 3.4 - Cache matches with progressive loading
 */
export async function cacheRecentMatches(): Promise<number> {
  try {
    // Fetch first page immediately (recent matches first from server)
    const limit = DEFAULT_PAGE_LIMIT;
    const firstPageResponse = await apiClient.get(`/matches?page=1&limit=${limit}`);
    const firstPageData = firstPageResponse.data as any;
    const firstPageMatches = firstPageData.data || firstPageData;
    const hasMore = firstPageData.hasMore ?? (Array.isArray(firstPageMatches) && firstPageMatches.length === limit);

    // Get local unsynced matches to preserve
    const localMatches = await db.matches.toArray();
    const unsyncedIds = new Set(
      localMatches.filter(m => m.synced === false).map(m => m.id)
    );

    // Cache first page immediately
    let cachedCount = await cacheMatchBatch(firstPageMatches, unsyncedIds);
    console.log(`[CacheService] Cached ${cachedCount} matches from first page`);

    // Start background loading of remaining pages if there are more
    if (hasMore) {
      // Don't await - let it run in background
      loadRemainingMatchesInBackground(2, limit, unsyncedIds).catch(err => {
        console.error('[CacheService] Background match loading failed:', err);
      });
    }

    return cachedCount;
  } catch (err) {
    console.error('[CacheService] Failed to cache matches:', err);
    throw err;
  }
}

/**
 * Cache a batch of matches to IndexedDB.
 * @returns Number of matches cached
 */
async function cacheMatchBatch(serverMatches: any[], unsyncedIds: Set<string>): Promise<number> {
  if (!Array.isArray(serverMatches)) return 0;

  let cachedCount = 0;

  for (const serverMatch of serverMatches) {
    if (unsyncedIds.has(serverMatch.id)) {
      // Preserve unsynced local version
      continue;
    }

    // Use centralized transform: Server API → IndexedDB
    await db.matches.put(serverMatchToDb(serverMatch) as any);

    cachedCount++;
  }

  return cachedCount;
}

/**
 * Load remaining match pages in the background.
 * Runs asynchronously without blocking the main cache refresh.
 */
async function loadRemainingMatchesInBackground(
  startPage: number,
  limit: number,
  unsyncedIds: Set<string>
): Promise<void> {
  let page = startPage;
  let hasMore = true;
  let totalCached = 0;

  console.log(`[CacheService] Starting background match loading from page ${startPage}...`);

  while (hasMore) {
    // Check if still online before each request
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[CacheService] Went offline - pausing background match loading');
      break;
    }

    try {
      const response = await apiClient.get(`/matches?page=${page}&limit=${limit}`);
      const data = response.data as any;
      const matches = data.data || data;

      if (!Array.isArray(matches) || matches.length === 0) {
        hasMore = false;
        break;
      }

      const cached = await cacheMatchBatch(matches, unsyncedIds);
      totalCached += cached;

      hasMore = data.hasMore ?? (matches.length === limit);
      page++;

      // Small delay between pages to avoid overwhelming the server/browser
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`[CacheService] Failed to load matches page ${page}:`, err);
      // Stop on error - don't retry indefinitely
      break;
    }
  }

  console.log(`[CacheService] Background loading complete: ${totalCached} additional matches cached from ${page - startPage} pages`);
  
  // Dispatch event to notify UI that more data is available
  try {
    window.dispatchEvent(new CustomEvent('cache:matches:updated', { detail: { totalCached } }));
  } catch { }
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
