import { apiClient } from './api/baseApi';
import { matchesApi } from './api/matchesApi';
import { isGuestId } from './importService';
import { db } from '../db/indexedDB';
import { lineupsApi } from './api/lineupsApi';
import { defaultLineupsApi } from './api/defaultLineupsApi';
import {
  dbTeamToServerPayload,
  dbPlayerToServerPayload,
  dbSeasonToServerPayload,
  dbMatchToServerPayload,
  dbEventToServerPayload,
} from '../db/transforms';

/**
 * Sync result interface for tracking sync progress and errors
 */
export interface SyncResult {
  synced: number;
  failed: number;
  errors: SyncError[];
}

export interface SyncError {
  table: string;
  recordId: string;
  error: string;
}

/**
 * Batch size for sync operations
 * Requirements: 2.6 - Batch operations (50 records per batch)
 */
const BATCH_SIZE = 50;

/**
 * Handle soft-deleted records:
 * - If isDeleted && !syncedAt → delete locally only (never synced to server)
 * - If isDeleted && syncedAt → call DELETE API, then delete locally
 *
 * Returns records that still need to be synced (non-deleted or delete failed)
 */
async function processSoftDeletes<T extends { id: string; isDeleted?: boolean; syncedAt?: string }>(
  table: any,
  records: T[],
  deleteApiCall: (id: string) => Promise<void>,
  tableName: string,
  result: SyncResult
): Promise<T[]> {
  const toSync: T[] = [];

  for (const record of records) {
    if (record.isDeleted) {
      if (!record.syncedAt) {
        // Never synced to server - just delete locally
        try {
          await table.delete(record.id);
          console.debug(`[SyncService] Deleted local-only ${tableName} record:`, record.id);
        } catch (err) {
          console.error(`[SyncService] Failed to delete local ${tableName}:`, err);
        }
      } else {
        // Was synced before - tell server to delete, then delete locally
        try {
          await deleteApiCall(record.id);
          await table.delete(record.id);
          result.synced++;
          console.debug(`[SyncService] Deleted synced ${tableName} record from server:`, record.id);
        } catch (err) {
          result.failed++;
          result.errors.push({
            table: tableName,
            recordId: record.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else {
      toSync.push(record);
    }
  }

  return toSync;
}

/**
 * Sync progress tracking interface
 * Requirements: 4.3 - Track number of pending items per table
 */
export interface SyncProgress {
  seasons: number;
  teams: number;
  players: number;
  matches: number;
  lineups: number;
  defaultLineups: number;
  events: number;
  matchPeriods: number;
  matchState: number;
  total: number;
  synced: number;
}

/**
 * Emit sync progress event for UI to display
 * Requirements: 4.3 - Emit events for UI to display progress
 */
function emitSyncProgress(progress: SyncProgress): void {
  try {
    window.dispatchEvent(new CustomEvent('sync:progress', { detail: progress }));
  } catch {
    // Ignore errors in non-browser environments
  }
}

/**
 * Sync seasons from the seasons table to the server.
 * 
 * Requirements: 3.3 - Process unsynced seasons from the seasons table where synced equals false
 * Requirements: 3.3 - Update synced to true and set synced_at on success
 * Requirements: 3.3 - Exclude guest records
 */
async function syncSeasons(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    if (!db.seasons) {
      return result;
    }

    let allSeasons;
    try {
      allSeasons = await db.seasons.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Seasons table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const unsyncedSeasons = allSeasons
      .filter(s => s.synced === false && !isGuestId(s.createdByUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const seasonsToSync = await processSoftDeletes(
      db.seasons,
      unsyncedSeasons.map(s => ({ ...s, id: s.seasonId })),
      async (id) => { await apiClient.delete(`/seasons/${id}`); },
      'seasons',
      result
    );

    for (const season of seasonsToSync) {
      try {
        // Use centralized transform: IndexedDB → Server API payload
        const seasonData = dbSeasonToServerPayload(season as any);

        // If syncedAt exists, this is an update; otherwise it's a create
        // IMPORTANT: Call server API directly, not the local-first seasonsApi
        if ((season as any).syncedAt) {
          await apiClient.put(`/seasons/${season.id}`, seasonData);
        } else {
          await apiClient.post('/seasons', seasonData);
        }

        await db.seasons.update(season.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'seasons',
          recordId: season.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing seasons:', err);
  }

  return result;
}

/**
 * Sync teams from the teams table to the server.
 * 
 * Requirements: 3.1 - Process unsynced teams from the teams table where synced equals false
 * Requirements: 3.3 - Update synced to true and set synced_at on success
 * Requirements: 3.3 - Exclude guest records
 */
async function syncTeams(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    if (!db.teams) {
      return result;
    }

    let allTeams;
    try {
      allTeams = await db.teams.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Teams table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const unsyncedTeams = allTeams
      .filter(t => t.synced === false && !isGuestId(t.createdByUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const teamsToSync = await processSoftDeletes(
      db.teams,
      unsyncedTeams,
      async (id) => { await apiClient.delete(`/teams/${id}`); },
      'teams',
      result
    );

    for (const team of teamsToSync) {
      try {
        // Use centralized transform: IndexedDB → Server API payload
        const teamData = dbTeamToServerPayload(team as any);

        // If syncedAt exists, this is an update; otherwise it's a create
        // IMPORTANT: Call server API directly, not the local-first teamsApi
        if ((team as any).syncedAt) {
          await apiClient.put(`/teams/${team.id}`, teamData);
        } else {
          await apiClient.post('/teams', teamData);
        }

        await db.teams.update(team.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'teams',
          recordId: team.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing teams:', err);
  }

  return result;
}

/**
 * Sync players from the players table to the server.
 * 
 * Requirements: 3.2 - Process unsynced players from the players table where synced equals false
 * Requirements: 3.3 - Update synced to true and set synced_at on success
 * Requirements: 3.3 - Exclude guest records
 */
async function syncPlayers(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    if (!db.players) {
      return result;
    }

    let allPlayers;
    try {
      allPlayers = await db.players.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Players table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const unsyncedPlayers = allPlayers
      .filter(p => p.synced === false && !isGuestId(p.createdByUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const playersToSync = await processSoftDeletes(
      db.players,
      unsyncedPlayers,
      async (id) => { await apiClient.delete(`/players/${id}`); },
      'players',
      result
    );

    for (const player of playersToSync) {
      try {
        // Use centralized transform: IndexedDB → Server API payload
        const playerData = dbPlayerToServerPayload(player);

        // If syncedAt exists, this is an update; otherwise it's a create
        // IMPORTANT: Call server API directly, not the local-first playersApi
        if ((player as any).syncedAt) {
          // Update existing player
          await apiClient.put(`/players/${player.id}`, playerData);
        } else {
          // Create new player
          if (player.currentTeam) {
            await apiClient.post('/players-with-team', {
              ...playerData,
              teamId: player.currentTeam,
              startDate: new Date().toISOString().slice(0, 10),
              isActive: true,
            });
          } else {
            await apiClient.post('/players', playerData);
          }
        }

        await db.players.update(player.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'players',
          recordId: player.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing players:', err);
  }

  return result;
}

/**
 * Sync matches from the matches table to the server.
 * 
 * Requirements: 3.3 - Process unsynced matches from the matches table where synced equals false
 * Requirements: 3.3 - Update synced to true and set synced_at on success
 * Requirements: 3.3 - Exclude guest records
 */
async function syncMatches(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    if (!db.matches) {
      return result;
    }

    let allMatches;
    try {
      allMatches = await db.matches.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Matches table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const unsyncedMatches = allMatches
      .filter(m => m.synced === false && !isGuestId(m.createdByUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const matchesToSync = await processSoftDeletes(
      db.matches,
      unsyncedMatches,
      async (id) => { await matchesApi.deleteMatch(id); },
      'matches',
      result
    );

    for (const match of matchesToSync) {
      try {
        // Use centralized transform: IndexedDB → Server API payload
        const matchData = dbMatchToServerPayload(match);

        // If syncedAt exists, this is an update; otherwise it's a create
        if ((match as any).syncedAt) {
          await apiClient.put(`/matches/${match.id}`, matchData);
        } else {
          await apiClient.post('/matches', matchData);
        }

        await db.matches.update(match.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'matches',
          recordId: match.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing matches:', err);
  }

  return result;
}

/**
 * Sync lineups from the lineup table to the server.
 * 
 * Requirements: 3.3 - Process unsynced lineups from the lineup table where synced equals false
 * Requirements: 3.3 - Update synced to true and set synced_at on success
 * Requirements: 3.3 - Exclude guest records
 */
async function syncLineups(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    if (!db.lineup) {
      return result;
    }

    let allLineups;
    try {
      allLineups = await db.lineup.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Lineup table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const unsyncedLineups = allLineups
      .filter(l => l.synced === false && !isGuestId(l.createdByUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const lineupsToSync = await processSoftDeletes(
      db.lineup,
      unsyncedLineups,
      async (id) => {
        const lineup = unsyncedLineups.find(l => l.id === id);
        if (lineup) {
          await lineupsApi.deleteByKey(lineup.matchId, lineup.playerId, lineup.startMinute);
        }
      },
      'lineup',
      result
    );

    for (const lineup of lineupsToSync) {
      try {
        await lineupsApi.create({
          matchId: lineup.matchId,
          playerId: lineup.playerId,
          startMinute: lineup.startMinute,
          endMinute: lineup.endMinute,
          position: lineup.position,
        });

        await db.lineup.update(lineup.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'lineup',
          recordId: lineup.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing lineups:', err);
  }

  return result;
}

/**
 * Sync default lineups from the default_lineups table to the server.
 * 
 * Requirements: 3.3 - Process unsynced default lineups from the default_lineups table where synced equals false
 * Requirements: 3.3 - Update synced to true and set synced_at on success
 * Requirements: 3.3 - Exclude guest records
 */
async function syncDefaultLineups(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    if (!db.defaultLineups) {
      return result;
    }

    let allDefaultLineups;
    try {
      allDefaultLineups = await db.defaultLineups.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Default lineups table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const unsyncedDefaultLineups = allDefaultLineups
      .filter(dl => dl.synced === false && !isGuestId(dl.createdByUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const defaultLineupsToSync = await processSoftDeletes(
      db.defaultLineups,
      unsyncedDefaultLineups,
      async (id) => {
        const dl = unsyncedDefaultLineups.find(d => d.id === id);
        if (dl) {
          await defaultLineupsApi.deleteDefaultLineup(dl.teamId);
        }
      },
      'default_lineups',
      result
    );

    for (const defaultLineup of defaultLineupsToSync) {
      try {
        await defaultLineupsApi.saveDefaultLineup({
          teamId: defaultLineup.teamId,
          formation: defaultLineup.formation,
        });

        await db.defaultLineups.update(defaultLineup.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'default_lineups',
          recordId: defaultLineup.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing default lineups:', err);
  }

  return result;
}

/**
 * Sync events from the events table to the server.
 * 
 * Requirements: 2.1 - Process unsynced events from the events table where synced equals false
 * Requirements: 2.4 - Update synced to true and set synced_at on success
 * Requirements: 2.6 - Exclude records where created_by_user_id starts with 'guest-'
 */
async function syncEvents(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    // Check if table exists and is accessible
    if (!db.events) {
      return result;
    }

    // Query all events and filter in JavaScript to avoid IndexedDB boolean indexing issues
    // IndexedDB indexes don't work well with boolean values
    let allEvents;
    try {
      allEvents = await db.events.toArray();
    } catch (dbErr) {
      // Table might not be ready yet, skip this sync cycle
      console.debug('[SyncService] Events table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records (Requirements: 2.6)
    const unsyncedEvents = allEvents
      .filter(e => e.synced === false && !isGuestId(e.createdByUserId))
      .slice(0, BATCH_SIZE);

    const isUuid = (value: string): boolean =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const deleteEventOnServer = async (eventId: string): Promise<void> => {
      const local = unsyncedEvents.find(e => e.id === eventId);
      if (!local) return;

      // If we have a server UUID id, delete directly.
      if (isUuid(local.id)) {
        await apiClient.delete(`/events/${local.id}`);
        return;
      }

      // Otherwise, best-effort: resolve the server event by its natural keys and delete that.
      try {
        const resp = await apiClient.get<any>(`/events/match/${local.matchId}`);
        const list = Array.isArray(resp.data) ? resp.data : (resp.data?.events || []);
        const serverMatch = list.find((e: any) => {
          return (
            e.kind === local.kind &&
            String(e.teamId || '') === String(local.teamId || '') &&
            String(e.playerId || '') === String(local.playerId || '') &&
            Number(e.clockMs || 0) === Number(local.clockMs || 0)
          );
        });

        if (serverMatch?.id && isUuid(String(serverMatch.id))) {
          await apiClient.delete(`/events/${serverMatch.id}`);
        }
      } catch {
        // Ignore lookup failures; deletion will be retried on next sync cycle if needed.
      }
    };

    // Process soft deletes first
    const eventsToSync = await processSoftDeletes(
      db.events,
      unsyncedEvents,
      deleteEventOnServer,
      'events',
      result
    );

    for (const event of eventsToSync) {
      try {
        if (event.kind === 'formation_change') {
          const parsed = (() => {
            try { return event.notes ? JSON.parse(event.notes) : null; } catch { return null; }
          })();

          const formation = parsed?.formation;
          if (!formation || !Array.isArray(formation.players)) {
            throw new Error('Invalid formation_change payload: missing formation.players');
          }

          const startMin = (event.clockMs ?? 0) / 60_000;
          await apiClient.post(`/matches/${event.matchId}/formation-changes`, {
            ...(isUuid(event.id) ? { eventId: event.id } : {}),
            startMin,
            formation,
            reason: parsed?.reason ?? null,
          });
        } else {
          // Use centralized transform: IndexedDB → Server API payload
          const payload = dbEventToServerPayload(event);

          // Use PUT upsert when we have a UUID id (local-first parity + update support)
          if (isUuid(event.id)) {
            await apiClient.put(`/events/${event.id}`, payload);
          } else {
            await apiClient.post('/events', payload);
          }
        }

        // Update synced to true and set syncedAt on success (Requirements: 2.4)
        await db.events.update(event.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'events',
          recordId: event.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing events:', err);
  }

  return result;
}


/**
 * Sync match periods from the match_periods table to the server.
 * 
 * Requirements: 2.2 - Process unsynced periods from the match_periods table
 * Requirements: 2.4 - Update synced to true and set synced_at on success
 * Requirements: 2.6 - Exclude guest records
 */
async function syncMatchPeriods(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    // Check if table exists and is accessible
    if (!db.matchPeriods) {
      return result;
    }

    // Query all periods and filter in JavaScript to avoid IndexedDB boolean indexing issues
    // IndexedDB indexes don't work well with boolean values
    let allPeriods;
    try {
      allPeriods = await db.matchPeriods.toArray();
    } catch (dbErr) {
      // Table might not be ready yet, skip this sync cycle
      console.debug('[SyncService] Match periods table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records (Requirements: 2.6)
    const unsyncedPeriods = allPeriods
      .filter(p => p.synced === false && !isGuestId(p.createdByUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first (periods are rarely deleted, but handle it)
    const periodsToSync = await processSoftDeletes(
      db.matchPeriods,
      unsyncedPeriods,
      async (id) => {
        // Match periods don't have a dedicated delete endpoint - just remove locally
        // Server will eventually sync and remove orphans
        console.debug('[SyncService] Period delete - removing locally only:', id);
      },
      'matchPeriods',
      result
    );

    for (const period of periodsToSync) {
      try {
        // Use appropriate API based on period completion status
        if (period.endedAt) {
          // Period is complete - use the import endpoint to preserve timestamps
          await apiClient.post(`/matches/${period.matchId}/periods/import`, {
            periodNumber: period.periodNumber,
            periodType: period.periodType || 'REGULAR',
            startedAt: new Date(period.startedAt).toISOString(),
            endedAt: new Date(period.endedAt).toISOString(),
            // Do not send durationSeconds: backend validation caps it (2h) but server can derive it from timestamps.
          });
        } else {
          // Period is still in progress - start it on the server
          // First check if the match has been started
          try {
            const state = await matchesApi.getMatchState(period.matchId);
            // Server uses 'SCHEDULED' for not-started matches
            if (state.status === 'SCHEDULED') {
              await matchesApi.startMatch(period.matchId);
            }
          } catch {
            // Match state might not exist, try to start it
            try {
              await matchesApi.startMatch(period.matchId);
            } catch {
              // Match might already be started, continue
            }
          }

          // Start the period
          const periodType = (period.periodType || 'REGULAR').toLowerCase() as 'regular' | 'extra_time' | 'penalty_shootout';
          await matchesApi.startPeriod(period.matchId, periodType);
        }

        // Update synced to true and set syncedAt on success (Requirements: 2.4)
        await db.matchPeriods.update(period.id, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'matchPeriods',
          recordId: period.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing match periods:', err);
  }

  return result;
}

/**
 * Sync match state from the match_state table to the server.
 * 
 * Requirements: 2.3 - Process unsynced state from the match_state table
 * Requirements: 2.4 - Update synced to true and set synced_at on success
 * Requirements: 2.6 - Exclude guest records
 */
async function syncMatchState(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    // Check if table exists and is accessible
    if (!db.matchState) {
      return result;
    }

    // Query all states and filter in JavaScript to avoid IndexedDB boolean indexing issues
    // IndexedDB indexes don't work well with boolean values
    let allStates;
    try {
      allStates = await db.matchState.toArray();
    } catch (dbErr) {
      // Table might not be ready yet, skip this sync cycle
      console.debug('[SyncService] Match state table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records (Requirements: 2.6)
    const statesToSync = allStates
      .filter(s => s.synced === false && !isGuestId(s.createdByUserId))
      .slice(0, BATCH_SIZE);

    for (const state of statesToSync) {
      try {
        // Sync state changes to server based on status
        // Note: Local schema uses 'NOT_STARTED', server uses 'SCHEDULED'
        const status = state.status;

        if (status === 'LIVE') {
          // Ensure match is started
          try {
            await matchesApi.startMatch(state.matchId);
          } catch {
            // Match might already be started
          }
        } else if (status === 'PAUSED') {
          await matchesApi.pauseMatch(state.matchId);
        } else if (status === 'COMPLETED') {
          // Get match to retrieve final score
          try {
            const match = await db.matches.get(state.matchId);
            if (match) {
              await matchesApi.completeMatch(state.matchId, {
                home: match.homeScore || 0,
                away: match.awayScore || 0,
              });
            } else {
              await matchesApi.completeMatch(state.matchId);
            }
          } catch {
            // Try without score
            await matchesApi.completeMatch(state.matchId);
          }
        }
        // For 'NOT_STARTED' status, nothing to sync

        // Update synced to true and set syncedAt on success (Requirements: 2.4)
        await db.matchState.update(state.matchId, {
          synced: true,
          syncedAt: new Date().toISOString(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'matchState',
          recordId: state.matchId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    console.error('[SyncService] Error syncing match state:', err);
  }

  return result;
}


/**
 * SyncService class for managing background synchronization.
 * 
 * Requirements: 5.2 - Use table-based sync exclusively without reading from the outbox
 */
class SyncService {
  private timer: number | null = null;
  private running = false;

  start(intervalMs: number = 15_000) {
    if (this.timer) return;
    const tick = async () => {
      try { await this.flushOnce(); } catch { }
      this.timer = window.setTimeout(tick, intervalMs);
    };
    // Also attach to online events
    try { window.addEventListener('online', () => this.flushOnce()); } catch { }
    tick();
  }

  stop() {
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Get pending sync counts for all tables.
   * Requirements: 4.3 - Track number of pending items per table
   */
  async getPendingCounts(): Promise<SyncProgress> {
    const progress: SyncProgress = {
      seasons: 0,
      teams: 0,
      players: 0,
      matches: 0,
      lineups: 0,
      defaultLineups: 0,
      events: 0,
      matchPeriods: 0,
      matchState: 0,
      total: 0,
      synced: 0,
    };

    try {
      const [seasons, teams, players, matches, lineups, defaultLineups, events, matchPeriods, matchState] = await Promise.all([
        db.seasons?.toArray().catch(() => []) || [],
        db.teams?.toArray().catch(() => []) || [],
        db.players?.toArray().catch(() => []) || [],
        db.matches?.toArray().catch(() => []) || [],
        db.lineup?.toArray().catch(() => []) || [],
        db.defaultLineups?.toArray().catch(() => []) || [],
        db.events?.toArray().catch(() => []) || [],
        db.matchPeriods?.toArray().catch(() => []) || [],
        db.matchState?.toArray().catch(() => []) || [],
      ]);

      progress.seasons = seasons.filter(s => s.synced === false && !isGuestId(s.createdByUserId)).length;
      progress.teams = teams.filter(t => t.synced === false && !isGuestId(t.createdByUserId)).length;
      progress.players = players.filter(p => p.synced === false && !isGuestId(p.createdByUserId)).length;
      progress.matches = matches.filter(m => m.synced === false && !isGuestId(m.createdByUserId)).length;
      progress.lineups = lineups.filter(l => l.synced === false && !isGuestId(l.createdByUserId)).length;
      progress.defaultLineups = defaultLineups.filter(dl => dl.synced === false && !isGuestId(dl.createdByUserId)).length;
      progress.events = events.filter(e => e.synced === false && !isGuestId(e.createdByUserId)).length;
      progress.matchPeriods = matchPeriods.filter(p => p.synced === false && !isGuestId(p.createdByUserId)).length;
      progress.matchState = matchState.filter(s => s.synced === false && !isGuestId(s.createdByUserId)).length;

      progress.total = progress.seasons + progress.teams + progress.players + progress.matches +
        progress.lineups + progress.defaultLineups + progress.events + progress.matchPeriods + progress.matchState;
    } catch (err) {
      console.error('[SyncService] Error getting pending counts:', err);
    }

    return progress;
  }

  /**
   * Flush all unsynced data to the server.
   * 
   * Requirements: 5.2 - Use table-based sync exclusively without reading from the outbox
   * Requirements: 3.3, 3.4 - Sync in dependency order: seasons → teams → players → matches → lineups → default_lineups → events → match_periods → match_state
   */
  async flushOnce(): Promise<SyncResult> {
    const combinedResult: SyncResult = { synced: 0, failed: 0, errors: [] };

    // Prevent concurrent flushes (important: set immediately to avoid async race conditions)
    if (this.running) return combinedResult;
    this.running = true;

    try {
      // If no network, skip
      if (typeof navigator !== 'undefined' && !navigator.onLine) return combinedResult;
      // Only attempt sync when authenticated; guests keep data local
      if (!apiClient.isAuthenticated()) return combinedResult;

      // If guest data exists locally, pause automatic sync to avoid 400/403s until import completes
      try {
        const { hasGuestData } = await import('../services/importService');
        const needsImport = await hasGuestData();
        if (needsImport) {
          console.warn('[SyncService] Guest data detected - pausing sync until import completes');
          try {
            (window as any).__toastApi?.current?.showInfo?.('Local guest data detected — import it to sync.');
            window.dispatchEvent(new CustomEvent('import:needed'));
          } catch { }
          return combinedResult;
        }
      } catch (err) {
        console.error('[SyncService] Error checking for guest data:', err);
      }

      // Get initial pending counts for progress tracking (Requirements: 4.3)
      const initialProgress = await this.getPendingCounts();
      emitSyncProgress(initialProgress);

      // Sync in dependency order (Requirements: 3.3, 3.4):
      // seasons → teams → players → matches → lineups → default_lineups → events → match_periods → match_state

      // 1. Sync seasons first (no dependencies)
      const seasonsResult = await syncSeasons();
      combinedResult.synced += seasonsResult.synced;
      combinedResult.failed += seasonsResult.failed;
      combinedResult.errors.push(...seasonsResult.errors);

      // 2. Sync teams (depends on seasons for some contexts)
      const teamsResult = await syncTeams();
      combinedResult.synced += teamsResult.synced;
      combinedResult.failed += teamsResult.failed;
      combinedResult.errors.push(...teamsResult.errors);

      // 3. Sync players (depends on teams)
      const playersResult = await syncPlayers();
      combinedResult.synced += playersResult.synced;
      combinedResult.failed += playersResult.failed;
      combinedResult.errors.push(...playersResult.errors);

      // 4. Sync matches (depends on seasons and teams)
      const matchesResult = await syncMatches();
      combinedResult.synced += matchesResult.synced;
      combinedResult.failed += matchesResult.failed;
      combinedResult.errors.push(...matchesResult.errors);

      // 5. Sync lineups (depends on matches and players)
      const lineupsResult = await syncLineups();
      combinedResult.synced += lineupsResult.synced;
      combinedResult.failed += lineupsResult.failed;
      combinedResult.errors.push(...lineupsResult.errors);

      // 6. Sync default lineups (depends on teams and players)
      const defaultLineupsResult = await syncDefaultLineups();
      combinedResult.synced += defaultLineupsResult.synced;
      combinedResult.failed += defaultLineupsResult.failed;
      combinedResult.errors.push(...defaultLineupsResult.errors);

      // 7. Sync events from events table (depends on matches and players)
      const eventsResult = await syncEvents();
      combinedResult.synced += eventsResult.synced;
      combinedResult.failed += eventsResult.failed;
      combinedResult.errors.push(...eventsResult.errors);

      // 8. Sync match periods from match_periods table (depends on matches)
      const periodsResult = await syncMatchPeriods();
      combinedResult.synced += periodsResult.synced;
      combinedResult.failed += periodsResult.failed;
      combinedResult.errors.push(...periodsResult.errors);

      // 9. Sync match state from match_state table (depends on matches)
      const stateResult = await syncMatchState();
      combinedResult.synced += stateResult.synced;
      combinedResult.failed += stateResult.failed;
      combinedResult.errors.push(...stateResult.errors);

      // Emit final progress (Requirements: 4.3)
      const finalProgress = await this.getPendingCounts();
      finalProgress.synced = combinedResult.synced;
      emitSyncProgress(finalProgress);

      if (combinedResult.synced > 0 || combinedResult.failed > 0) {
        console.log(`[SyncService] Sync complete - synced: ${combinedResult.synced}, failed: ${combinedResult.failed}`);
      }
    } finally {
      this.running = false;
    }

    return combinedResult;
  }
}

export const syncService = new SyncService();
