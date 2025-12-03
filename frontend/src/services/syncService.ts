import { getUnsyncedItems, markAsSynced, markSyncFailed } from '../db/utils';
import { apiClient } from './api/baseApi';
import teamsApi from './api/teamsApi';
import playersApi from './api/playersApi';
import eventsApi from './api/eventsApi';
import { matchesApi } from './api/matchesApi';
import { seasonsApi } from './api/seasonsApi';
import { defaultLineupsApi } from './api/defaultLineupsApi';

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

  async flushOnce(): Promise<void> {
    if (this.running) return;
    // If no network, skip
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    // Only attempt sync when authenticated; guests keep data local
    if (!apiClient.isAuthenticated()) return;

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
        return;
      }
    } catch (err) {
      console.error('[SyncService] Error checking for guest data:', err);
    }

    // Additional check: if outbox has items from guest user, pause sync
    try {
      const { getGuestId } = await import('../utils/guest');
      const guestId = getGuestId();
      const batch = await getUnsyncedItems(1);
      if (batch.length > 0 && batch[0].created_by_user_id === guestId) {
        console.warn('[SyncService] Outbox contains guest items - pausing sync');
        try {
          (window as any).__toastApi?.current?.showInfo?.('Please import your guest data before syncing.');
          window.dispatchEvent(new CustomEvent('import:needed'));
        } catch {}
        return;
      }
    } catch (err) {
      console.error('[SyncService] Error checking outbox for guest items:', err);
    }
    this.running = true;
    try {
      const batch = await getUnsyncedItems(50);
      for (const item of batch) {
        try {
          if (item.table_name === 'events') {
            const p = (item as any).data || (item as any).payload || item;
            await eventsApi.create({
              matchId: p.match_id,
              kind: p.kind,
              periodNumber: p.period || p.period_number,
              clockMs: (p.minute != null || p.second != null) ? ((p.minute || 0) * 60000 + (p.second || 0) * 1000) : p.clock_ms,
              teamId: p.team_id,
              playerId: p.player_id,
              notes: p.notes || p.data?.notes,
              sentiment: p.sentiment,
            } as any);
          } else if (item.table_name === 'teams') {
            const data: any = item.data || {};
            const name: string = (data.name || '').toString();
            const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
            let exists = false;
            try {
              // Search both own teams and opponents for a name match
              const resp = await teamsApi.getTeams({ limit: 25, search: name, includeOpponents: true });
              const opp = await teamsApi.getOpponentTeams(name);
              const all = [...(resp.data || []), ...(opp || [])] as any[];
              exists = all.some(t => norm(t.name || '') === norm(name));
            } catch {}
            if (!exists) {
              await teamsApi.createTeam((item.data || {}) as any);
            }
          } else if (item.table_name === 'players') {
            await playersApi.createPlayer((item.data || {}) as any);
          } else if (item.table_name === 'seasons') {
            if (item.operation === 'INSERT') {
              await seasonsApi.createSeason((item.data || {}) as any);
            } else if (item.operation === 'UPDATE') {
              await seasonsApi.updateSeason(item.record_id as any, (item.data || {}) as any);
            } else if (item.operation === 'DELETE') {
              await seasonsApi.deleteSeason(item.record_id as any);
            }
          } else if (item.table_name === 'matches') {
            const data: any = item.data || {};
            if (item.operation === 'INSERT' && data.quickStart) {
              await matchesApi.quickStart(data);
            } else if (item.operation === 'UPDATE') {
              await matchesApi.updateMatch(item.record_id as any, data);
            } else if (item.operation === 'DELETE') {
              await matchesApi.deleteMatch(item.record_id as any);
            }
          } else if (item.table_name === 'default_lineups') {
            const data: any = item.data || {};
            const teamId = (data.teamId || item.record_id) as string;
            if (item.operation === 'DELETE') {
              await defaultLineupsApi.deleteDefaultLineup(teamId);
            } else {
              // INSERT/UPDATE -> save (idempotent)
              await defaultLineupsApi.saveDefaultLineup({ teamId, formation: data.formation || [] });
            }
          } else if (item.table_name === 'match_commands') {
            const cmd: any = item.data || {};
            const matchId = cmd.matchId;
            if (!matchId) { await markAsSynced(item.id!); continue; }
            if (cmd.cmd === 'start_match') {
              await matchesApi.startMatch(matchId);
            } else if (cmd.cmd === 'pause') {
              await matchesApi.pauseMatch(matchId);
            } else if (cmd.cmd === 'resume') {
              await matchesApi.resumeMatch(matchId);
            } else if (cmd.cmd === 'start_period') {
              const type = (cmd.periodType || 'regular') as any;
              await matchesApi.startPeriod(matchId, type);
            } else if (cmd.cmd === 'end_period') {
              // Find current open period
              const periods = await matchesApi.getMatchPeriods(matchId);
              const open = periods.find((p: any) => !p.endedAt);
              if (open) await matchesApi.endPeriod(matchId, open.id, {});
            } else if (cmd.cmd === 'complete') {
              await matchesApi.completeMatch(matchId);
            }
          } else {
            // Unknown table: skip for now
          }
          await markAsSynced(item.id!);
        } catch (e: any) {
          await markSyncFailed(item.id!, e?.message || 'Sync failed');
        }
      }
    } finally {
      this.running = false;
    }
  }
}

export const syncService = new SyncService();
