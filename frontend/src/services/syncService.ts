import { apiClient } from './api/baseApi';
import eventsApi from './api/eventsApi';
import { matchesApi } from './api/matchesApi';
import { isGuestId } from './importService';
import { db } from '../db/indexedDB';

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
   * Flush all unsynced data to the server.
   * 
   * Requirements: 5.2 - Use table-based sync exclusively without reading from the outbox
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
      // Sync events from events table (Requirements: 2.1)
      const eventsResult = await syncEvents();
      combinedResult.synced += eventsResult.synced;
      combinedResult.failed += eventsResult.failed;
      combinedResult.errors.push(...eventsResult.errors);

      // Sync match periods from match_periods table (Requirements: 2.2)
      const periodsResult = await syncMatchPeriods();
      combinedResult.synced += periodsResult.synced;
      combinedResult.failed += periodsResult.failed;
      combinedResult.errors.push(...periodsResult.errors);

      // Sync match state from match_state table (Requirements: 2.3)
      const stateResult = await syncMatchState();
      combinedResult.synced += stateResult.synced;
      combinedResult.failed += stateResult.failed;
      combinedResult.errors.push(...stateResult.errors);

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
