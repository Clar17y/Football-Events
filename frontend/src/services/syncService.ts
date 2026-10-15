import { apiClient, ApiRequestError } from './api/baseApi';
import { captureSyncSession, assertSyncSession, isSyncSessionCurrent, SyncSessionChangedError, seasonRemoteId, lookupOwnedSeason, type SyncSession, type SeasonIdentity } from './seasonIdentity';
import { serverSeasonToDb } from '../db/transforms/seasons';
import type { DbSeason } from '../db/schema';
import { isGuestId } from './importService';
import { db } from '../db/indexedDB';
import { getAuthUserId } from '../utils/network';
import { bumpRecordingRevision, isReplayableMatchStatus, reclaimLegacyRecordings } from './dataLayer';
import {
  dbTeamToServerPayload,
  dbPlayerToServerPayload,
  dbSeasonToServerPayload,
  dbMatchToServerPayload,
  dbEventToServerPayload,
  dbPlayerTeamToServerPayload,
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
const LEGACY_USER_IDS = new Set(['authenticated-user', 'local-user']);

const ENABLE_SYNC_QUARANTINE = (() => {
  try {
    return (import.meta as any).env?.VITE_ENABLE_SYNC_QUARANTINE !== 'false';
  } catch {
    return true;
  }
})();

// Feature flag visibility (helps avoid rollout/debug confusion)
try {
  const mode = (import.meta as any).env?.MODE;
  if (mode !== 'test' && !ENABLE_SYNC_QUARANTINE) {
    // eslint-disable-next-line no-console
    console.info('[SyncService] Quarantine/backoff disabled (VITE_ENABLE_SYNC_QUARANTINE=false)');
  }
} catch { }

const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 24 * 60 * 60 * 1000;
const BACKOFF_JITTER = 0.2;

let globalBackoffUntilMs = 0;

function jitter(ms: number): number {
  const j = (Math.random() * 2 - 1) * BACKOFF_JITTER;
  return Math.max(0, Math.round(ms * (1 + j)));
}

type FailureDisposition = 'auth' | 'transient' | 'permanent';
type FailureClassification = {
  disposition: FailureDisposition;
  status?: number;
  code?: string;
  retryAfterMs?: number;
  reasonCode?: string;
  message?: string;
};

function classifySyncError(error: unknown): FailureClassification {
  if (typeof ApiRequestError === 'function' && error instanceof ApiRequestError) {
    const status = error.status;
    if (status === 401) return { disposition: 'auth', status, code: error.code, message: error.message };
    if (status === 429) return { disposition: 'transient', status, code: error.code, retryAfterMs: error.retryAfterMs, reasonCode: 'RATE_LIMIT', message: error.message };
    if (status >= 500) return { disposition: 'transient', status, code: error.code, reasonCode: 'SERVER_ERROR', message: error.message };
    if (status >= 400) {
      const reasonCode =
        error.code ||
        (status === 403 ? 'ACCESS_DENIED' : status === 402 ? 'QUOTA_EXCEEDED' : status === 400 ? 'INVALID_PAYLOAD' : `HTTP_${status}`);
      return { disposition: 'permanent', status, code: error.code, reasonCode, message: error.message };
    }
  }

  // Network / fetch errors (TypeError in browsers)
  if (error instanceof TypeError) {
    return { disposition: 'transient', status: 0, reasonCode: 'NETWORK', message: error.message };
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('offline') || msg.includes('timeout')) {
      return { disposition: 'transient', status: 0, reasonCode: 'NETWORK', message: error.message };
    }
    if (msg.includes('invalid') && msg.includes('payload')) {
      return { disposition: 'permanent', status: 400, reasonCode: 'INVALID_PAYLOAD', message: error.message };
    }
    return { disposition: 'transient', status: 0, reasonCode: 'TRANSIENT', message: error.message };
  }

  return { disposition: 'transient', status: 0, reasonCode: 'TRANSIENT', message: String(error) };
}

function isAuthStopError(error: unknown): boolean {
  return error instanceof SyncSessionChangedError || classifySyncError(error).disposition === 'auth';
}

async function getSyncFailure(table: string, recordId: string) {
  try {
    if (!db.syncFailures) return null;
    return await db.syncFailures.get([table, recordId]);
  } catch {
    return null;
  }
}

async function shouldAttemptSync(table: string, recordId: string): Promise<boolean> {
  if (!ENABLE_SYNC_QUARANTINE) return true;
  const now = Date.now();
  if (globalBackoffUntilMs > now) return false;

  const failure = await getSyncFailure(table, recordId);
  if (!failure) return true;
  if (failure.permanent) return false;
  if (failure.nextRetryAt && failure.nextRetryAt > now) return false;
  return true;
}

async function clearSyncFailure(table: string, recordId: string): Promise<void> {
  if (!ENABLE_SYNC_QUARANTINE) return;
  try {
    await db.syncFailures?.delete([table, recordId]);
  } catch { }
}

async function recordSyncFailure(table: string, recordId: string, error: unknown): Promise<{ abortAll: boolean }> {
  const classification = classifySyncError(error);

  if (classification.disposition === 'auth') {
    return { abortAll: true };
  }

  if (!ENABLE_SYNC_QUARANTINE || !db.syncFailures) {
    return { abortAll: false };
  }

  const now = Date.now();
  const existing = await getSyncFailure(table, recordId);
  const attemptCount = (existing?.attemptCount ?? 0) + 1;

  const permanent = classification.disposition === 'permanent';
  let nextRetryAt = now;

  if (!permanent) {
    const retryAfterMs = classification.retryAfterMs;
    const delay = retryAfterMs != null ? Math.min(BACKOFF_MAX_MS, Math.max(0, retryAfterMs)) : jitter(Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(attemptCount - 1, 16)));
    nextRetryAt = now + delay;

    if (classification.status === 429) {
      globalBackoffUntilMs = Math.max(globalBackoffUntilMs, nextRetryAt);
    }
  }

  await db.syncFailures.put({
    table,
    recordId,
    attemptCount,
    lastAttemptAt: now,
    nextRetryAt,
    lastStatus: classification.status,
    lastError: classification.message || (error instanceof Error ? error.message : String(error)),
    permanent,
    reasonCode: classification.reasonCode || classification.code,
  } as any);

  return { abortAll: false };
}

function isOwnedByAuth(record: { createdByUserId?: string }, authUserId: string): boolean {
  return record.createdByUserId === authUserId || LEGACY_USER_IDS.has(record.createdByUserId || '');
}

function sessionClient(session: SyncSession) {
  async function request<T>(method: 'get' | 'post' | 'put' | 'delete', path: string, data?: any) {
    assertSyncSession(session);
    const response = method === 'delete'
      ? await apiClient.delete<T>(path)
      : await apiClient[method]<T>(path, data);
    assertSyncSession(session);
    return response;
  }
  return {
    get: <T = any>(path: string, data?: URLSearchParams) => request<T>('get', path, data),
    post: <T = any>(path: string, data?: any) => request<T>('post', path, data),
    put: <T = any>(path: string, data?: any) => request<T>('put', path, data),
    delete: <T = any>(path: string) => request<T>('delete', path),
  };
}

async function parentConfirmed(table: 'seasons' | 'matches', id: string, ownerId: string): Promise<boolean> {
  const parent = await db[table]?.get(id);
  return !!parent && isOwnedByAuth(parent, ownerId) && !parent.isDeleted &&
    (parent.synced === true || !!parent.syncedAt);
}

async function recoverRecordingFailures(matchId: string, session: SyncSession): Promise<void> {
  await db.transaction('rw', [db.matches, db.events, db.matchPeriods, db.matchState, db.lineup, db.syncFailures], async () => {
    assertSyncSession(session);
    const match = await db.matches.get(matchId);
    if (!match?.prerequisiteRecovery || !match.syncedAt || match.createdByUserId !== session.ownerId) return;
    for (const table of [db.events, db.matchPeriods, db.matchState, db.lineup]) {
      const rows = await table.where('matchId').equals(matchId).toArray();
      for (const row of rows) {
        const id = 'id' in row ? row.id : row.matchId;
        const failure = await getSyncFailure(table.name, id);
        if (row.createdByUserId === session.ownerId && !row.syncedAt && failure?.lastStatus === 403 &&
            failure.reasonCode === 'ACCESS_DENIED') await clearSyncFailure(table.name, id);
      }
    }
    assertSyncSession(session);
    await db.matches.update(matchId, { prerequisiteRecovery: false });
  });
}

async function bindSeason(submitted: DbSeason, identity: SeasonIdentity, session: SyncSession): Promise<boolean> {
  const { remote, provenance } = identity;
  return db.transaction('rw', db.seasons, db.matches, db.syncFailures, async () => {
    assertSyncSession(session);
    const current = await db.seasons.get(submitted.seasonId);
    if (!current || current.createdByUserId !== session.ownerId) return false;
    const remoteId = remote.id ?? remote.seasonId;
    const existingAliases = await db.seasons.filter(row => row.seasonId !== current.seasonId &&
      row.remoteSeasonId === remoteId).toArray();
    if (existingAliases.length) return false;
    const canonical = await db.seasons.get(remoteId);
    if (canonical && canonical.id !== current.id &&
        (canonical.createdByUserId !== session.ownerId || !canonical.synced || canonical.isDeleted)) return false;
    const references = canonical && canonical.id !== current.id
      ? await db.matches.where('seasonId').equals(remoteId).toArray() : [];
    if (references.some(match => match.createdByUserId !== session.ownerId)) return false;
    const priorFailure = await getSyncFailure('seasons', current.seasonId);
    const metadata = serverSeasonToDb(remote);
    const unchanged = sameSnapshot(current, submitted);
    const fields = ['label', 'startDate', 'endDate', 'isCurrent', 'description'] as const;
    const fieldValue = (row: DbSeason, field: typeof fields[number]) =>
      field === 'startDate' || field === 'endDate' ? row[field]?.split('T')[0] : row[field] ?? (field === 'isCurrent' ? false : '');
    const baseline: Partial<DbSeason> = {};
    // Natural-key adoption imports cloud fields only where this draft was not edited.
    // Exact-ID proof establishes existence, never acknowledges an unpersisted local edit.
    if (provenance === 'natural-key') {
      for (const field of fields) {
        if (fieldValue(current, field) === fieldValue(submitted, field)) Object.assign(baseline, { [field]: metadata[field] });
      }
    }
    const merged = { ...current, ...baseline };
    const persisted = fields.every(field => fieldValue(merged, field) === fieldValue(metadata, field));
    await db.seasons.update(current.seasonId, {
      ...baseline,
      remoteSeasonId: remoteId, syncedAt: new Date().toISOString(), synced: unchanged && persisted && !current.isDeleted,
    });
    if (canonical && canonical.id !== current.id) {
      for (const match of references) await db.matches.update(match.id, { seasonId: current.seasonId });
      await db.seasons.delete(remoteId);
    }
    if (priorFailure?.lastStatus === 409) {
      const matches = await db.matches.where('seasonId').equals(current.seasonId).toArray();
      for (const match of matches) {
        const failure = await getSyncFailure('matches', match.id);
        if (match.createdByUserId === session.ownerId && !match.syncedAt && failure?.lastStatus === 403 &&
            failure.reasonCode === 'ACCESS_DENIED') {
          await clearSyncFailure('matches', match.id);
          await db.matches.update(match.id, { prerequisiteRecovery: true });
        }
      }
    }
    assertSyncSession(session);
    if (priorFailure?.lastStatus === 409 || !priorFailure?.permanent) await clearSyncFailure('seasons', current.seasonId);
    return true;
  });
}

type SyncSnapshot = { syncRevision?: string; createdByUserId?: string; syncAttempted?: boolean; remoteId?: string };

function sameSnapshot(current: any, submitted: any): boolean {
  if (current.createdByUserId !== submitted.createdByUserId) return false;
  if (submitted.syncRevision) return current.syncRevision === submitted.syncRevision;
  const content = (row: any) => JSON.stringify(Object.entries(row)
    .filter(([key]) => !['synced', 'syncedAt', 'syncAttempted', 'remoteId', 'remoteSeasonId', 'prerequisiteRecovery', 'linkedEvents', 'autoLinkedAt'].includes(key))
    .sort(([a], [b]) => a.localeCompare(b)));
  return content(current) === content(submitted);
}

async function acknowledgeSnapshot(table: any, key: string, submitted: any, session: SyncSession, remoteId?: string) {
  await db.transaction('rw', table, db.matches, db.syncFailures, async () => {
    const current = await table.get(key);
    if (!current || current.createdByUserId !== submitted.createdByUserId || !isSyncSessionCurrent(session)) return;
    await table.update(key, {
      synced: sameSnapshot(current, submitted), syncedAt: new Date().toISOString(),
      ...(remoteId ? { remoteId } : {}),
    });
    if (sameSnapshot(current, submitted)) await clearSyncFailure(table.name, key);
    if (typeof submitted.matchId === 'string') await bumpRecordingRevision(submitted.matchId);
    assertSyncSession(session);
  });
}

async function recordSnapshotFailure(tableName: string, table: any, key: string, submitted: any, error: unknown, session: SyncSession) {
  if (isAuthStopError(error) || !isSyncSessionCurrent(session)) return { abortAll: true };
  return db.transaction('rw', table, db.syncFailures, async () => {
    const current = await table.get(key);
    // An error for old contents must not quarantine an edit or Undo made while waiting.
    if (!isSyncSessionCurrent(session) || !current || !sameSnapshot(current, submitted)) return { abortAll: false };
    const result = await recordSyncFailure(tableName, key, error);
    assertSyncSession(session);
    return result;
  });
}

async function removeSnapshot(table: any, submitted: any, session: SyncSession) {
  await db.transaction('rw', table, db.matches, db.syncFailures, async () => {
    const current = await table.get(submitted.id);
    if (isSyncSessionCurrent(session) && current && sameSnapshot(current, submitted)) {
      await table.delete(submitted.id);
      await clearSyncFailure(table.name, submitted.id);
      if (typeof submitted.matchId === 'string') await bumpRecordingRevision(submitted.matchId);
      assertSyncSession(session);
    }
  });
}

async function markSnapshotAttempted(table: any, key: string, submitted: any, session: SyncSession): Promise<boolean> {
  return db.transaction('rw', table, async () => {
    assertSyncSession(session);
    const current = await table.get(key);
    if (!current || !sameSnapshot(current, submitted)) return false;
    await table.update(key, { syncAttempted: true });
    assertSyncSession(session);
    return true;
  });
}

async function eligibleBatch<T extends { id: string }>(tableName: string, records: T[], session: SyncSession, dependency?: (row: T) => Promise<boolean>): Promise<T[]> {
  const eligible: T[] = [];
  for (const row of records) {
    assertSyncSession(session);
    if (await shouldAttemptSync(tableName, row.id) && (!dependency || await dependency(row))) eligible.push(row);
    if (eligible.length === BATCH_SIZE) break;
  }
  return eligible;
}

/**
 * Retire only the submitted tombstone. Events always attempt idempotent remote deletion:
 * a lost PUT response cannot establish that an event never reached the server.
 * Returns the non-deleted records; failed deletions stay pending locally.
 */
async function processSoftDeletes<T extends { id: string; isDeleted?: boolean; syncedAt?: string }>(
  table: any,
  records: T[],
  deleteApiCall: (id: string) => Promise<void>,
  tableName: string,
  result: SyncResult,
  session: SyncSession
): Promise<T[]> {
  const toSync: T[] = [];

  for (const record of records) {
    if (record.isDeleted) {
      if (!record.syncedAt && !(record as SyncSnapshot).syncAttempted && tableName !== 'events') {
        // Never synced to server - just delete locally
        try {
          await removeSnapshot(table, record, session);
          console.debug(`[SyncService] Deleted local-only ${tableName} record:`, record.id);
        } catch (err) {
          console.error(`[SyncService] Failed to delete local ${tableName}:`, err);
        }
      } else {
        if (!(await shouldAttemptSync(tableName, record.id))) {
          continue;
        }
        // Was synced before - tell server to delete, then delete locally
        try {
          try {
            await deleteApiCall(record.id);
          } catch (error) {
            if (classifySyncError(error).status !== 404) throw error;
          }
          await removeSnapshot(table, record, session);
          result.synced++;
          console.debug(`[SyncService] Deleted synced ${tableName} record from server:`, record.id);
        } catch (err) {
          const { abortAll } = await recordSnapshotFailure(tableName, table, record.id, record, err, session);
          if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
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
  playerTeams: number;
  matches: number;
  lineups: number;
  defaultLineups: number;
  events: number;
  matchPeriods: number;
  matchState: number;
  total: number;
  eligible: number;
  blocked: number;
  synced: number;
  nextRetryAtMs?: number;
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
async function syncSeasons(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  const client = sessionClient(session);
  const seasons = await db.seasons.toArray();
  let attempted = 0;
  for (const season of seasons.filter(s => !s.synced && isOwnedByAuth(s, authUserId) && !isGuestId(s.createdByUserId))) {
    assertSyncSession(session);
    const failure = await getSyncFailure('seasons', season.seasonId);
    const repairConflict = !season.syncedAt && failure?.lastStatus === 409;
    if (!repairConflict && !await shouldAttemptSync('seasons', season.seasonId)) continue;
    if (++attempted > BATCH_SIZE) break;
    try {
      if (season.isDeleted) {
        await processSoftDeletes(db.seasons, [season], async () => {
          await client.delete(`/seasons/${seasonRemoteId(season)}`);
        }, 'seasons', result, session);
        continue;
      }
      if (!season.syncedAt) {
        const existing = await lookupOwnedSeason(season, session);
        if (existing) {
          if (!await bindSeason(season, existing, session)) throw new Error('Local season identity conflict');
          result.synced++;
          continue;
        }
        // An old conflict must remain blocked until identity has actually been proved.
        if (repairConflict) continue;
      }
      const payload = dbSeasonToServerPayload(season);
      if (season.syncedAt) {
        await client.put(`/seasons/${seasonRemoteId(season)}`, payload);
      } else {
        assertSyncSession(session);
        if (!await markSnapshotAttempted(db.seasons, season.seasonId, season, session)) continue;
        try { await client.post('/seasons', payload); }
        catch (error) {
          if (classifySyncError(error).status !== 409) throw error;
          const existing = await lookupOwnedSeason({ ...season, syncAttempted: true }, session);
          if (!existing || !await bindSeason(season, existing, session)) throw error;
          result.synced++;
          continue;
        }
      }
      await acknowledgeSnapshot(db.seasons, season.seasonId, season, session);
      result.synced++;
    } catch (error) {
      const { abortAll } = await recordSnapshotFailure('seasons', db.seasons, season.seasonId, season, error, session);
      if (abortAll) throw error;
      result.failed++;
      result.errors.push({ table: 'seasons', recordId: season.seasonId, error: String(error) });
    }
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
async function syncTeams(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
      .filter(t => t.synced === false && !isGuestId(t.createdByUserId) && isOwnedByAuth(t, authUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const teamsToSync = await processSoftDeletes(
      db.teams,
      unsyncedTeams,
      async (id) => { await client.delete(`/teams/${id}`); },
      'teams',
      result, session
    );

    for (const team of teamsToSync) {
      try {
        if (!(await shouldAttemptSync('teams', team.id))) {
          continue;
        }
        // Use centralized transform: IndexedDB → Server API payload
        const teamData = dbTeamToServerPayload(team as any);

        // If syncedAt exists, this is an update; otherwise it's a create
        // IMPORTANT: Call server API directly, not the local-first teamsApi
        if ((team as any).syncedAt) {
          await client.put(`/teams/${team.id}`, teamData);
        } else {
          await client.post('/teams', teamData);
        }

        await acknowledgeSnapshot(db.teams, team.id, team, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('teams', db.teams, team.id, team, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'teams',
          recordId: team.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
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
async function syncPlayers(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
      .filter(p => p.synced === false && !isGuestId(p.createdByUserId) && isOwnedByAuth(p, authUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const playersToSync = await processSoftDeletes(
      db.players,
      unsyncedPlayers,
      async (id) => { await client.delete(`/players/${id}`); },
      'players',
      result, session
    );

    for (const player of playersToSync) {
      try {
        if (!(await shouldAttemptSync('players', player.id))) {
          continue;
        }
        // Use centralized transform: IndexedDB → Server API payload
        const playerData = dbPlayerToServerPayload(player);

        // If syncedAt exists, this is an update; otherwise it's a create
        // IMPORTANT: Call server API directly, not the local-first playersApi
        if ((player as any).syncedAt) {
          // Update existing player
          await client.put(`/players/${player.id}`, playerData);
        } else {
          // Create new player
          if (player.currentTeam) {
            await client.post('/players-with-team', {
              ...playerData,
              teamId: player.currentTeam,
              startDate: new Date().toISOString().slice(0, 10),
              isActive: true,
            });
          } else {
            await client.post('/players', playerData);
          }
        }

        await acknowledgeSnapshot(db.players, player.id, player, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('players', db.players, player.id, player, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'players',
          recordId: player.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
    console.error('[SyncService] Error syncing players:', err);
  }

  return result;
}

/**
 * Sync player-teams from the player_teams table to the server.
 * 
 * Requirements: 3.3 - Process unsynced player-teams where synced equals false
 * Requirements: 3.3 - Update synced to true and set synced_at on success
 * Requirements: 3.3 - Exclude guest records
 */
async function syncPlayerTeams(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

  try {
    if (!db.playerTeams) {
      return result;
    }

    let allPlayerTeams;
    try {
      allPlayerTeams = await db.playerTeams.toArray();
    } catch (dbErr) {
      console.debug('[SyncService] Player teams table not ready:', dbErr);
      return result;
    }

    // Filter for unsynced, non-guest records
    const unsyncedPlayerTeams = allPlayerTeams
      .filter(pt => pt.synced === false && !isGuestId(pt.createdByUserId) && isOwnedByAuth(pt, authUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const playerTeamsToSync = await processSoftDeletes(
      db.playerTeams,
      unsyncedPlayerTeams,
      async (id) => {
        await client.delete(`/player-teams/${id}`);
      },
      'playerTeams',
      result, session
    );

    for (const playerTeam of playerTeamsToSync) {
      try {
        if (!(await shouldAttemptSync('playerTeams', playerTeam.id))) {
          continue;
        }
        const payload = dbPlayerTeamToServerPayload(playerTeam);

        // Use PUT for upsert behavior with client-generated ID
        await client.put(`/player-teams/${playerTeam.id}`, payload);

        await acknowledgeSnapshot(db.playerTeams, playerTeam.id, playerTeam, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('playerTeams', db.playerTeams, playerTeam.id, playerTeam, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'playerTeams',
          recordId: playerTeam.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
    console.error('[SyncService] Error syncing player teams:', err);
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
async function syncMatches(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
    const unsyncedMatches = await eligibleBatch('matches', allMatches
      .filter(m => m.synced === false && !isGuestId(m.createdByUserId) && isOwnedByAuth(m, authUserId)), session,
      m => m.isDeleted ? Promise.resolve(true) : parentConfirmed('seasons', m.seasonId, authUserId));

    // Process soft deletes first
    // IMPORTANT: Use direct API call for delete, NOT matchesApi.deleteMatch which is local-first
    const matchesToSync = await processSoftDeletes(
      db.matches,
      unsyncedMatches,
      async (id) => { await client.delete(`/matches/${id}`); },
      'matches',
      result, session
    );

    for (const match of matchesToSync) {
      try {
        if (!(await shouldAttemptSync('matches', match.id))) {
          continue;
        }
        // Use centralized transform: IndexedDB → Server API payload
        const season = await db.seasons.get(match.seasonId);
        assertSyncSession(session);
        if (!season || !await parentConfirmed('seasons', match.seasonId, authUserId)) continue;
        const matchData = { ...dbMatchToServerPayload(match), seasonId: seasonRemoteId(season) };

        // If syncedAt exists, this is an update; otherwise it's a create
        if ((match as any).syncedAt) {
          await client.put(`/matches/${match.id}`, matchData);
        } else {
          await client.post('/matches', matchData);
        }

        await acknowledgeSnapshot(db.matches, match.id, match, session);
        await recoverRecordingFailures(match.id, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('matches', db.matches, match.id, match, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'matches',
          recordId: match.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
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
async function syncLineups(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
    const unsyncedLineups = await eligibleBatch('lineup', allLineups
      .filter(l => l.synced === false && !isGuestId(l.createdByUserId) && isOwnedByAuth(l, authUserId)), session,
      l => parentConfirmed('matches', l.matchId, authUserId));

    // Process soft deletes first
    const lineupsToSync = await processSoftDeletes(
      db.lineup,
      unsyncedLineups,
      async (id) => {
        const lineup = unsyncedLineups.find(l => l.id === id);
        if (lineup) {
          await client.delete(`/lineups/by-key/${lineup.matchId}/${lineup.playerId}/${lineup.startMinute}`);
        }
      },
      'lineup',
      result, session
    );

    for (const lineup of lineupsToSync) {
      try {
        if (!(await shouldAttemptSync('lineup', lineup.id))) {
          continue;
        }
        await client.put(`/lineups/by-key/${lineup.matchId}/${lineup.playerId}/${lineup.startMinute}`, {
          endMinute: lineup.endMinute,
          position: lineup.position,
        });

        await acknowledgeSnapshot(db.lineup, lineup.id, lineup, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('lineup', db.lineup, lineup.id, lineup, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'lineup',
          recordId: lineup.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
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
async function syncDefaultLineups(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
      .filter(dl => dl.synced === false && !isGuestId(dl.createdByUserId) && isOwnedByAuth(dl, authUserId))
      .slice(0, BATCH_SIZE);

    // Process soft deletes first
    const defaultLineupsToSync = await processSoftDeletes(
      db.defaultLineups,
      unsyncedDefaultLineups,
      async (id) => {
        const dl = unsyncedDefaultLineups.find(d => d.id === id);
        if (dl) {
          await client.delete(`/default-lineups/${dl.teamId}`);
        }
      },
      'defaultLineups',
      result, session
    );

    for (const defaultLineup of defaultLineupsToSync) {
      try {
        if (!(await shouldAttemptSync('defaultLineups', defaultLineup.id))) {
          continue;
        }
        await client.post('/default-lineups', {
          teamId: defaultLineup.teamId,
          formation: defaultLineup.formation,
        });

        await acknowledgeSnapshot(db.defaultLineups, defaultLineup.id, defaultLineup, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('defaultLineups', db.defaultLineups, defaultLineup.id, defaultLineup, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'defaultLineups',
          recordId: defaultLineup.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
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
async function syncEvents(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
    const unsyncedEvents = await eligibleBatch('events', allEvents
      .filter(e => e.synced === false && e.createdByUserId === authUserId), session,
      row => parentConfirmed('matches', row.matchId, authUserId));

    const isUuid = (value: string): boolean =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const deleteEventOnServer = async (eventId: string): Promise<void> => {
      if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError();
      const local = unsyncedEvents.find(e => e.id === eventId)!;
      const remoteId = (local as SyncSnapshot).remoteId;
      if (isUuid(remoteId || local.id)) {
        await client.delete(`/events/${remoteId || local.id}`);
        return;
      }
      if (!local.syncedAt && !(local as SyncSnapshot).syncAttempted) return;
      const resp = await client.get<any>(`/events/match/${local.matchId}`);
      const list = Array.isArray(resp.data) ? resp.data : resp.data?.events;
      if (!Array.isArray(list)) throw new Error('Invalid legacy event lookup response');
      const matches = list.filter((e: any) => e.kind === local.kind &&
        String(e.teamId || '') === String(local.teamId || '') && String(e.playerId || '') === String(local.playerId || '') &&
        Number(e.clockMs || 0) === Number(local.clockMs || 0) && Number(e.periodNumber || 1) === Number(local.periodNumber || 1));
      if (matches.length !== 1 || !isUuid(String(matches[0].id))) {
        throw new Error('Legacy event identity is uncertain; pending deletion retained');
      }
      await db.transaction('rw', db.events, async () => {
        const current = await db.events.get(local.id);
        if (isSyncSessionCurrent(session) && current?.createdByUserId === local.createdByUserId) {
          await db.events.update(local.id, { remoteId: matches[0].id } as any);
        }
      });
      await client.delete(`/events/${matches[0].id}`);
    };

    // Process soft deletes first
    const eventsToSync = await processSoftDeletes(
      db.events,
      unsyncedEvents,
      deleteEventOnServer,
      'events',
      result, session
    );

    for (const event of eventsToSync) {
      try {
        if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError();
        // Persist uncertainty before sending: a lost response is not evidence of absence.
        if (!await markSnapshotAttempted(db.events, event.id, event, session)) continue;
        let response: any;
        if (!(await shouldAttemptSync('events', event.id))) {
          continue;
        }
        if (event.kind === 'formation_change') {
          const parsed = (() => {
            try { return event.notes ? JSON.parse(event.notes) : null; } catch { return null; }
          })();

          const formation = parsed?.formation;
          if (!formation || !Array.isArray(formation.players)) {
            throw new Error('Invalid formation_change payload: missing formation.players');
          }

          const startMin = (event.clockMs ?? 0) / 60_000;
          response = await client.post(`/matches/${event.matchId}/formation-changes`, {
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
            response = await client.put(`/events/${event.id}`, payload);
          } else {
            const remoteId = (event as SyncSnapshot).remoteId;
            if (remoteId) response = await client.put(`/events/${remoteId}`, payload);
            else if ((event as SyncSnapshot).syncAttempted) throw new Error('Legacy event create response was lost; identity repair required');
            else response = await client.post('/events', payload);
          }
        }

        // Update synced to true and set syncedAt on success (Requirements: 2.4)
        await acknowledgeSnapshot(db.events, event.id, event, session,
          response?.data?.id || response?.data?.event?.id);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('events', db.events, event.id, event, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'events',
          recordId: event.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
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
async function syncMatchPeriods(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
    const periodsToSync = await eligibleBatch('matchPeriods', allPeriods
      .filter(p => p.synced === false && !p.isDeleted && p.createdByUserId === authUserId), session,
      row => parentConfirmed('matches', row.matchId, authUserId));

    for (const period of periodsToSync) {
      try {
        if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError();
        await client.post(`/matches/${period.matchId}/periods/import`, {
          periodNumber: period.periodNumber,
          periodType: period.periodType || 'REGULAR',
          startedAt: new Date(period.startedAt).toISOString(),
          ...(period.endedAt != null ? { endedAt: new Date(period.endedAt).toISOString() } : {}),
          ...(period.durationSeconds != null ? { durationSeconds: period.durationSeconds } : {}),
        });
        await acknowledgeSnapshot(db.matchPeriods, period.id, period, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('matchPeriods', db.matchPeriods, period.id, period, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'matchPeriods',
          recordId: period.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
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
async function syncMatchState(authUserId: string, session: SyncSession): Promise<SyncResult> {
  const client = sessionClient(session);
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  if (!authUserId) {
    return result;
  }

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
    const statesToSync = [];
    for (const state of allStates.filter(s => s.synced === false && !s.isDeleted && s.createdByUserId === authUserId &&
        isReplayableMatchStatus(s.status))) {
      if (!(await shouldAttemptSync('matchState', state.matchId)) || !await parentConfirmed('matches', state.matchId, authUserId)) continue;
      const periods = await db.matchPeriods.where('matchId').equals(state.matchId)
        .filter(p => !p.isDeleted && p.createdByUserId === authUserId).toArray();
      if (periods.some(period => !period.synced)) continue;
      statesToSync.push(state);
      if (statesToSync.length === BATCH_SIZE) break;
    }

    for (const state of statesToSync) {
      try {
        if (!(await shouldAttemptSync('matchState', state.matchId))) {
          continue;
        }
        if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError();
        const periods = await db.matchPeriods.where('matchId').equals(state.matchId)
          .filter(p => !p.isDeleted && p.createdByUserId === authUserId).toArray();
        // Never acknowledge a final state while a prerequisite period is still pending.
        if (periods.some(p => !p.synced)) continue;
        const current = periods.find(p => p.id === state.currentPeriodId);
        const endedTotal = periods.reduce((sum, p) => sum + (p.endedAt != null ? p.durationSeconds ?? 0 : 0), 0);
        const match = await db.matches.get(state.matchId);
        const plannedSeconds = (match?.durationMinutes ?? 60) * 60;
        const perSeconds = plannedSeconds / (match?.periodFormat === 'half' ? 2 : match?.periodFormat === 'third' ? 3 : match?.periodFormat === 'whole' ? 1 : 4);
        const offset = current?.periodType === 'EXTRA_TIME' ? plannedSeconds + (current.periodNumber - 1) * 900 :
          current?.periodType === 'PENALTY_SHOOTOUT' ? state.timerMs / 1000 : (current ? (current.periodNumber - 1) * perSeconds : 0);
        const activeSeconds = current && current.endedAt == null ? Math.max(0, state.timerMs / 1000 - offset) : 0;
        const explicitTotal = state.totalElapsedSeconds;
        const totalElapsedSeconds = Math.floor(explicitTotal ?? endedTotal + activeSeconds);
        await client.post(`/matches/${state.matchId}/state/reconcile`, {
          status: state.status, totalElapsedSeconds,
          currentPeriod: current?.periodNumber ?? null,
          currentPeriodType: current?.periodType ?? null,
          ...(state.status === 'LIVE' ? { activeSince: new Date(state.lastUpdatedAt).toISOString() } : {}),
          ...(periods.length ? { matchStartedAt: new Date(Math.min(...periods.map(p => p.startedAt))).toISOString() } : {}),
          ...(state.status === 'COMPLETED' ? { matchEndedAt: new Date(state.lastUpdatedAt).toISOString() } : {}),
        });
        await acknowledgeSnapshot(db.matchState, state.matchId, state, session);

        result.synced++;
      } catch (err) {
        const { abortAll } = await recordSnapshotFailure('matchState', db.matchState, state.matchId, state, err, session);
        if (abortAll) { if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError(); throw err; }
        result.failed++;
        result.errors.push({
          table: 'matchState',
          recordId: state.matchId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    if (isAuthStopError(err)) throw err;
    console.error('[SyncService] Error syncing match state:', err);
  }

  return result;
}


/**
 * SyncService class for managing background synchronization.
 * 
 * Uses table-based sync exclusively - sync state is tracked on entity tables.
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
      playerTeams: 0,
      matches: 0,
      lineups: 0,
      defaultLineups: 0,
      events: 0,
      matchPeriods: 0,
      matchState: 0,
      total: 0,
      eligible: 0,
      blocked: 0,
      synced: 0,
    };

    try {
      const authUserId = getAuthUserId();
      if (!authUserId) {
        return progress;
      }
      const session = captureSyncSession(authUserId);
      await reclaimLegacyRecordings(authUserId);
      assertSyncSession(session);

      const failures = ENABLE_SYNC_QUARANTINE && db.syncFailures ? await db.syncFailures.toArray().catch(() => []) : [];
      const failureMap = new Map<string, any>();
      for (const f of failures) {
        failureMap.set(`${f.table}:${f.recordId}`, f);
      }

      const now = Date.now();
      const globalBackoffActive = globalBackoffUntilMs > now;
      let nextRetryAtMs: number | null = globalBackoffActive ? globalBackoffUntilMs : null;

      const [seasons, teams, players, playerTeams, matches, lineups, defaultLineups, events, matchPeriods, matchState] = await Promise.all([
        db.seasons?.toArray().catch(() => []) || [],
        db.teams?.toArray().catch(() => []) || [],
        db.players?.toArray().catch(() => []) || [],
        db.playerTeams?.toArray().catch(() => []) || [],
        db.matches?.toArray().catch(() => []) || [],
        db.lineup?.toArray().catch(() => []) || [],
        db.defaultLineups?.toArray().catch(() => []) || [],
        db.events?.toArray().catch(() => []) || [],
        db.matchPeriods?.toArray().catch(() => []) || [],
        db.matchState?.toArray().catch(() => []) || [],
      ]);
      assertSyncSession(session);
      const dependency = (table: 'seasons' | 'matches', id: string): 'permanent' | 'deferred' | undefined => {
        const rows = table === 'seasons' ? seasons : matches;
        const parent = rows.find(row => row.id === id);
        if (parent && isOwnedByAuth(parent, authUserId) && !parent.isDeleted && (parent.synced || parent.syncedAt)) return undefined;
        const failure = failureMap.get(`${table}:${id}`);
        if (failure?.nextRetryAt > now && !failure.permanent) {
          nextRetryAtMs = nextRetryAtMs == null ? failure.nextRetryAt : Math.min(nextRetryAtMs, failure.nextRetryAt);
        }
        const repairableSeason = table === 'seasons' && failure?.lastStatus === 409 && parent && !parent.syncedAt;
        return !parent || !isOwnedByAuth(parent, authUserId) || parent.isDeleted || (failure?.permanent && !repairableSeason)
          ? 'permanent' : 'deferred';
      };

      const count = (
        table: string,
        recordId: string | undefined | null,
        createdByUserId: string | undefined,
        ownedCheck: boolean,
        synced: boolean,
        dependency?: 'permanent' | 'deferred'
      ): { include: boolean; eligible: boolean } => {
        if (!recordId) return { include: false, eligible: false };
        if (synced !== false) return { include: false, eligible: false };
        if (!createdByUserId || isGuestId(createdByUserId)) return { include: false, eligible: false };
        if (!ownedCheck) return { include: false, eligible: false };
        const failure = failureMap.get(`${table}:${recordId}`);
        const repairableSeason = table === 'seasons' && failure?.lastStatus === 409 &&
          seasons.some(season => season.id === recordId && !season.syncedAt && !season.isDeleted);
        if ((failure?.permanent && !repairableSeason) || dependency === 'permanent') {
          progress.blocked++;
          return { include: false, eligible: false };
        }
        if (globalBackoffActive) {
          nextRetryAtMs = nextRetryAtMs == null ? globalBackoffUntilMs : Math.min(nextRetryAtMs, globalBackoffUntilMs);
          return { include: true, eligible: false };
        }
        if (failure?.nextRetryAt && failure.nextRetryAt > now) {
          nextRetryAtMs = nextRetryAtMs == null ? failure.nextRetryAt : Math.min(nextRetryAtMs, failure.nextRetryAt);
          return { include: true, eligible: false };
        }
        return { include: true, eligible: dependency !== 'deferred' };
      };

      for (const s of seasons) {
        const recordId = (s as any).id || (s as any).seasonId;
        const { include, eligible } = count('seasons', recordId, s.createdByUserId, isOwnedByAuth(s, authUserId), s.synced);
        if (include) {
          progress.seasons++;
          if (eligible) progress.eligible++;
        }
      }

      for (const t of teams) {
        const { include, eligible } = count('teams', t.id || t.teamId, t.createdByUserId, isOwnedByAuth(t, authUserId), t.synced);
        if (include) {
          progress.teams++;
          if (eligible) progress.eligible++;
        }
      }

      for (const p of players) {
        const { include, eligible } = count('players', p.id, p.createdByUserId, isOwnedByAuth(p, authUserId), p.synced);
        if (include) {
          progress.players++;
          if (eligible) progress.eligible++;
        }
      }

      for (const pt of playerTeams) {
        const { include, eligible } = count('playerTeams', pt.id, pt.createdByUserId, isOwnedByAuth(pt, authUserId), pt.synced);
        if (include) {
          progress.playerTeams++;
          if (eligible) progress.eligible++;
        }
      }

      for (const m of matches) {
        const recordId = (m as any).id || (m as any).matchId;
        const { include, eligible } = count('matches', recordId, m.createdByUserId, isOwnedByAuth(m, authUserId), m.synced,
          m.isDeleted ? undefined : dependency('seasons', m.seasonId));
        if (include) {
          progress.matches++;
          if (eligible) progress.eligible++;
        }
      }

      for (const l of lineups) {
        const { include, eligible } = count('lineup', l.id, l.createdByUserId, isOwnedByAuth(l, authUserId), l.synced, dependency('matches', l.matchId));
        if (include) {
          progress.lineups++;
          if (eligible) progress.eligible++;
        }
      }

      for (const dl of defaultLineups) {
        const { include, eligible } = count('defaultLineups', dl.id, dl.createdByUserId, isOwnedByAuth(dl, authUserId), dl.synced);
        if (include) {
          progress.defaultLineups++;
          if (eligible) progress.eligible++;
        }
      }

      for (const e of events) {
        const { include, eligible } = count('events', e.id, e.createdByUserId, e.createdByUserId === authUserId, e.synced, dependency('matches', e.matchId));
        if (include) {
          progress.events++;
          if (eligible) progress.eligible++;
        }
      }

      for (const mp of matchPeriods) {
        const { include, eligible } = count('matchPeriods', mp.id, mp.createdByUserId, mp.createdByUserId === authUserId, mp.synced,
          mp.isDeleted ? 'permanent' : dependency('matches', mp.matchId));
        if (include) {
          progress.matchPeriods++;
          if (eligible) progress.eligible++;
        }
      }

      for (const ms of matchState) {
        const recordId = (ms as any).matchId;
        const pendingPeriods = matchPeriods.filter(period => period.matchId === ms.matchId && !period.isDeleted &&
          period.createdByUserId === authUserId && period.synced === false);
        const parentDependency = dependency('matches', ms.matchId);
        const stateDependency = ms.isDeleted || !isReplayableMatchStatus(ms.status) || parentDependency === 'permanent' || pendingPeriods.some(period => failureMap.get(`matchPeriods:${period.id}`)?.permanent)
          ? 'permanent' : pendingPeriods.length || parentDependency === 'deferred' ? 'deferred' : undefined;
        const { include, eligible } = count('matchState', recordId, ms.createdByUserId, ms.createdByUserId === authUserId, ms.synced, stateDependency);
        if (include) {
          progress.matchState++;
          if (eligible) progress.eligible++;
        }
      }

      progress.total =
        progress.seasons +
        progress.teams +
        progress.players +
        progress.playerTeams +
        progress.matches +
        progress.lineups +
        progress.defaultLineups +
        progress.events +
        progress.matchPeriods +
        progress.matchState;

      if (nextRetryAtMs != null && nextRetryAtMs > now) {
        progress.nextRetryAtMs = nextRetryAtMs;
      }
    } catch (err) {
      console.error('[SyncService] Error getting pending counts:', err);
    }

    return progress;
  }

  /**
   * Flush all unsynced data to the server.
   * 
   * Uses table-based sync - queries each entity table for synced === false records.
   * Syncs in dependency order: seasons → teams → players → matches → lineups → default_lineups → events → match_periods → match_state
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
      const authUserId = getAuthUserId();
      if (!authUserId) return combinedResult;
      const session = captureSyncSession(authUserId);
      await reclaimLegacyRecordings(authUserId);
      assertSyncSession(session);

      if (ENABLE_SYNC_QUARANTINE && globalBackoffUntilMs > Date.now()) {
        // Respect global backoff (e.g., Retry-After on 429) to avoid request storms.
        try {
          const progress = await this.getPendingCounts();
          emitSyncProgress(progress);
        } catch { }
        return combinedResult;
      }

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
      const seasonsResult = await syncSeasons(authUserId, session);
      combinedResult.synced += seasonsResult.synced;
      combinedResult.failed += seasonsResult.failed;
      combinedResult.errors.push(...seasonsResult.errors);

      // 2. Sync teams (depends on seasons for some contexts)
      const teamsResult = await syncTeams(authUserId, session);
      combinedResult.synced += teamsResult.synced;
      combinedResult.failed += teamsResult.failed;
      combinedResult.errors.push(...teamsResult.errors);

      // 3. Sync players (depends on teams)
      const playersResult = await syncPlayers(authUserId, session);
      combinedResult.synced += playersResult.synced;
      combinedResult.failed += playersResult.failed;
      combinedResult.errors.push(...playersResult.errors);

      // 3.5. Sync player-teams (depends on players and teams)
      const playerTeamsResult = await syncPlayerTeams(authUserId, session);
      combinedResult.synced += playerTeamsResult.synced;
      combinedResult.failed += playerTeamsResult.failed;
      combinedResult.errors.push(...playerTeamsResult.errors);

      // 4. Sync matches (depends on seasons and teams)
      const matchesResult = await syncMatches(authUserId, session);
      combinedResult.synced += matchesResult.synced;
      combinedResult.failed += matchesResult.failed;
      combinedResult.errors.push(...matchesResult.errors);

      // 5. Sync lineups (depends on matches and players)
      const lineupsResult = await syncLineups(authUserId, session);
      combinedResult.synced += lineupsResult.synced;
      combinedResult.failed += lineupsResult.failed;
      combinedResult.errors.push(...lineupsResult.errors);

      // 6. Sync default lineups (depends on teams and players)
      const defaultLineupsResult = await syncDefaultLineups(authUserId, session);
      combinedResult.synced += defaultLineupsResult.synced;
      combinedResult.failed += defaultLineupsResult.failed;
      combinedResult.errors.push(...defaultLineupsResult.errors);

      // 7. Sync events from events table (depends on matches and players)
      const eventsResult = await syncEvents(authUserId, session);
      combinedResult.synced += eventsResult.synced;
      combinedResult.failed += eventsResult.failed;
      combinedResult.errors.push(...eventsResult.errors);

      // 8. Sync match periods from match_periods table (depends on matches)
      const periodsResult = await syncMatchPeriods(authUserId, session);
      combinedResult.synced += periodsResult.synced;
      combinedResult.failed += periodsResult.failed;
      combinedResult.errors.push(...periodsResult.errors);

      // 9. Sync match state from match_state table (depends on matches)
      const stateResult = await syncMatchState(authUserId, session);
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
    } catch (err) {
      if (isAuthStopError(err)) {
        // apiClient clears the token on 401; stop this flush and wait for re-auth.
        return combinedResult;
      }
      console.error('[SyncService] flushOnce failed:', err);
    } finally {
      this.running = false;
    }

    return combinedResult;
  }
}

export const syncService = new SyncService();

// Minimal exports for unit tests (avoid coupling production code to internals).
export const __syncQuarantineTestUtils = {
  classifySyncError,
  shouldAttemptSync,
  recordSyncFailure,
  resetGlobalBackoff: () => {
    globalBackoffUntilMs = 0;
  },
  getGlobalBackoffUntilMs: () => globalBackoffUntilMs,
};
