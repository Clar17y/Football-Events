import { apiClient } from './api/baseApi';
import eventsApi from './api/eventsApi';
import { matchesApi } from './api/matchesApi';
import { isGuestId } from './importService';
import { db } from '../db/indexedDB';
import { seasonsApi } from './api/seasonsApi';
import { teamsApi } from './api/teamsApi';
import { playersApi } from './api/playersApi';
import { lineupsApi } from './api/lineupsApi';
import { defaultLineupsApi } from './api/defaultLineupsApi';

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
    const seasonsToSync = allSeasons
      .filter(s => s.synced === false && !isGuestId(s.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const season of seasonsToSync) {
      try {
        await seasonsApi.createSeason({
          label: season.label,
          startDate: (season as any).start_date || new Date().toISOString().slice(0, 10),
          endDate: (season as any).end_date || new Date().toISOString().slice(0, 10),
          isCurrent: !!(season as any).is_current,
          description: (season as any).description,
        });

        await db.seasons.update(season.season_id, {
          synced: true,
          synced_at: Date.now(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'seasons',
          recordId: season.season_id,
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
    const teamsToSync = allTeams
      .filter(t => t.synced === false && !isGuestId(t.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const team of teamsToSync) {
      try {
        await teamsApi.createTeam({
          name: team.name,
          homeKitPrimary: (team as any).color_primary,
          homeKitSecondary: (team as any).color_secondary,
          awayKitPrimary: (team as any).away_color_primary,
          awayKitSecondary: (team as any).away_color_secondary,
          logoUrl: (team as any).logo_url,
          isOpponent: !!(team as any).is_opponent,
        } as any);

        await db.teams.update(team.id, {
          synced: true,
          synced_at: Date.now(),
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
    const playersToSync = allPlayers
      .filter(p => p.synced === false && !isGuestId(p.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const player of playersToSync) {
      try {
        if (player.current_team) {
          await playersApi.createPlayerWithTeam({
            name: player.full_name,
            squadNumber: player.squad_number,
            preferredPosition: player.preferred_pos,
            dateOfBirth: player.dob,
            notes: player.notes,
            teamId: player.current_team,
          } as any);
        } else {
          await playersApi.createPlayer({
            name: player.full_name,
            squadNumber: player.squad_number,
            preferredPosition: player.preferred_pos,
            dateOfBirth: player.dob ? new Date(player.dob) : undefined,
            notes: player.notes,
          });
        }

        await db.players.update(player.id, {
          synced: true,
          synced_at: Date.now(),
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
    const matchesToSync = allMatches
      .filter(m => m.synced === false && !isGuestId(m.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const match of matchesToSync) {
      try {
        await apiClient.post('/matches', {
          seasonId: match.season_id,
          kickoffTime: match.kickoff_ts,
          homeTeamId: match.home_team_id,
          awayTeamId: match.away_team_id,
          competition: match.competition,
          venue: match.venue,
          durationMinutes: match.duration_mins,
          periodFormat: match.period_format,
          notes: match.notes,
        });

        await db.matches.update(match.id, {
          synced: true,
          synced_at: Date.now(),
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
    const lineupsToSync = allLineups
      .filter(l => l.synced === false && !isGuestId(l.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const lineup of lineupsToSync) {
      try {
        await lineupsApi.create({
          matchId: lineup.match_id,
          playerId: lineup.player_id,
          startMinute: lineup.start_min,
          endMinute: lineup.end_min,
          position: lineup.position,
        });

        await db.lineup.update(lineup.id, {
          synced: true,
          synced_at: Date.now(),
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
    if (!db.default_lineups) {
      return result;
    }

    let allDefaultLineups;
    try {
      allDefaultLineups = await db.default_lineups.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Default lineups table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const defaultLineupsToSync = allDefaultLineups
      .filter(dl => dl.synced === false && !isGuestId(dl.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const defaultLineup of defaultLineupsToSync) {
      try {
        await defaultLineupsApi.saveDefaultLineup({
          teamId: defaultLineup.team_id,
          formation: defaultLineup.formation,
        });

        await db.default_lineups.update(defaultLineup.id, {
          synced: true,
          synced_at: Date.now(),
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
    const eventsToSync = allEvents
      .filter(e => e.synced === false && !isGuestId(e.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const event of eventsToSync) {
      try {
        // POST to events API endpoint
        await eventsApi.create({
          matchId: event.match_id,
          kind: event.kind,
          periodNumber: event.period_number,
          clockMs: event.clock_ms,
          teamId: event.team_id,
          playerId: event.player_id,
          notes: event.notes,
          sentiment: event.sentiment,
        } as any);

        // Update synced to true and set synced_at on success (Requirements: 2.4)
        await db.events.update(event.id, {
          synced: true,
          synced_at: Date.now(),
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
    if (!db.match_periods) {
      return result;
    }

    // Query all periods and filter in JavaScript to avoid IndexedDB boolean indexing issues
    // IndexedDB indexes don't work well with boolean values
    let allPeriods;
    try {
      allPeriods = await db.match_periods.toArray();
    } catch (dbErr) {
      // Table might not be ready yet, skip this sync cycle
      console.debug('[SyncService] Match periods table not ready:', dbErr);
      return result;
    }
    
    // Filter for unsynced, non-guest records (Requirements: 2.6)
    const periodsToSync = allPeriods
      .filter(p => p.synced === false && !isGuestId(p.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const period of periodsToSync) {
      try {
        // Use appropriate API based on period completion status
        if (period.ended_at) {
          // Period is complete - use the import endpoint to preserve timestamps
          await apiClient.post(`/matches/${period.match_id}/periods/import`, {
            periodNumber: period.period_number,
            periodType: period.period_type || 'REGULAR',
            startedAt: new Date(period.started_at).toISOString(),
            endedAt: new Date(period.ended_at).toISOString(),
            durationSeconds: period.duration_seconds,
          });
        } else {
          // Period is still in progress - start it on the server
          // First check if the match has been started
          try {
            const state = await matchesApi.getMatchState(period.match_id);
            // Server uses 'SCHEDULED' for not-started matches
            if (state.status === 'SCHEDULED') {
              await matchesApi.startMatch(period.match_id);
            }
          } catch {
            // Match state might not exist, try to start it
            try {
              await matchesApi.startMatch(period.match_id);
            } catch {
              // Match might already be started, continue
            }
          }

          // Start the period
          const periodType = (period.period_type || 'REGULAR').toLowerCase() as 'regular' | 'extra_time' | 'penalty_shootout';
          await matchesApi.startPeriod(period.match_id, periodType);
        }

        // Update synced to true and set synced_at on success (Requirements: 2.4)
        await db.match_periods.update(period.id, {
          synced: true,
          synced_at: Date.now(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'match_periods',
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
    if (!db.match_state) {
      return result;
    }

    // Query all states and filter in JavaScript to avoid IndexedDB boolean indexing issues
    // IndexedDB indexes don't work well with boolean values
    let allStates;
    try {
      allStates = await db.match_state.toArray();
    } catch (dbErr) {
      // Table might not be ready yet, skip this sync cycle
      console.debug('[SyncService] Match state table not ready:', dbErr);
      return result;
    }
    
    // Filter for unsynced, non-guest records (Requirements: 2.6)
    const statesToSync = allStates
      .filter(s => s.synced === false && !isGuestId(s.created_by_user_id))
      .slice(0, BATCH_SIZE);

    for (const state of statesToSync) {
      try {
        // Sync state changes to server based on status
        // Note: Local schema uses 'NOT_STARTED', server uses 'SCHEDULED'
        const status = state.status;
        
        if (status === 'LIVE') {
          // Ensure match is started
          try {
            await matchesApi.startMatch(state.match_id);
          } catch {
            // Match might already be started
          }
        } else if (status === 'PAUSED') {
          await matchesApi.pauseMatch(state.match_id);
        } else if (status === 'COMPLETED') {
          // Get match to retrieve final score
          try {
            const match = await db.matches.get(state.match_id);
            if (match) {
              await matchesApi.completeMatch(state.match_id, {
                home: match.home_score || 0,
                away: match.away_score || 0,
              });
            } else {
              await matchesApi.completeMatch(state.match_id);
            }
          } catch {
            // Try without score
            await matchesApi.completeMatch(state.match_id);
          }
        }
        // For 'NOT_STARTED' status, nothing to sync

        // Update synced to true and set synced_at on success (Requirements: 2.4)
        await db.match_state.update(state.match_id, {
          synced: true,
          synced_at: Date.now(),
        });

        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          table: 'match_state',
          recordId: state.match_id,
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
      try { await this.flushOnce(); } catch {}
      this.timer = window.setTimeout(tick, intervalMs);
    };
    // Also attach to online events
    try { window.addEventListener('online', () => this.flushOnce()); } catch {}
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
        db.default_lineups?.toArray().catch(() => []) || [],
        db.events?.toArray().catch(() => []) || [],
        db.match_periods?.toArray().catch(() => []) || [],
        db.match_state?.toArray().catch(() => []) || [],
      ]);

      progress.seasons = seasons.filter(s => s.synced === false && !isGuestId(s.created_by_user_id)).length;
      progress.teams = teams.filter(t => t.synced === false && !isGuestId(t.created_by_user_id)).length;
      progress.players = players.filter(p => p.synced === false && !isGuestId(p.created_by_user_id)).length;
      progress.matches = matches.filter(m => m.synced === false && !isGuestId(m.created_by_user_id)).length;
      progress.lineups = lineups.filter(l => l.synced === false && !isGuestId(l.created_by_user_id)).length;
      progress.defaultLineups = defaultLineups.filter(dl => dl.synced === false && !isGuestId(dl.created_by_user_id)).length;
      progress.events = events.filter(e => e.synced === false && !isGuestId(e.created_by_user_id)).length;
      progress.matchPeriods = matchPeriods.filter(p => p.synced === false && !isGuestId(p.created_by_user_id)).length;
      progress.matchState = matchState.filter(s => s.synced === false && !isGuestId(s.created_by_user_id)).length;

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

    if (this.running) return combinedResult;
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
        } catch {}
        return combinedResult;
      }
    } catch (err) {
      console.error('[SyncService] Error checking for guest data:', err);
    }

    this.running = true;
    try {
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
