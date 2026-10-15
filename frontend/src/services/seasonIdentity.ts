import { apiClient, ApiRequestError } from './api/baseApi';
import { getAuthUserId } from '../utils/network';
import type { DbSeason } from '../db/schema';

export type SyncSession = { ownerId: string; generation: number };
export function captureSyncSession(ownerId: string): SyncSession {
  return { ownerId, generation: apiClient.getSessionGeneration?.() ?? 0 };
}
export function isSyncSessionCurrent(session: SyncSession): boolean {
  return getAuthUserId() === session.ownerId &&
    (apiClient.getSessionGeneration?.() ?? 0) === session.generation;
}
export function assertSyncSession(session: SyncSession): void {
  if (!isSyncSessionCurrent(session)) throw new SyncSessionChangedError();
}
export class SyncSessionChangedError extends Error {
  constructor() { super('Account changed during sync'); }
}

export function seasonRemoteId(season: DbSeason): string {
  return season.remoteSeasonId ?? season.seasonId;
}

export function provenOwnedSeason(row: any, ownerId: string): boolean {
  return !!row && (row.createdByUserId ?? row.created_by_user_id) === ownerId &&
    !(row.createdByUserId && row.created_by_user_id && row.createdByUserId !== row.created_by_user_id) &&
    !row.isDeleted && !row.is_deleted && !row.deletedAt && !row.deleted_at;
}

function dateOnly(value?: string): string | undefined { return value?.split('T')[0]; }
export function isAutomaticSeason(season: DbSeason): boolean {
  const year = /^(\d{4})-(\d{4}) Season$/.exec(season.label);
  return !!year && Number(year[2]) === Number(year[1]) + 1 &&
    season.description === 'Auto-created season' && season.isCurrent === true &&
    dateOnly(season.startDate) === `${year[1]}-08-01` && dateOnly(season.endDate) === `${year[2]}-07-31`;
}

/** Labels are unique per owner; mutable configuration must not be silently overwritten. */
export function compatibleSeason(local: DbSeason, remote: any): boolean {
  return isAutomaticSeason(local) || (dateOnly(local.startDate) === dateOnly(remote.startDate) &&
    dateOnly(local.endDate) === dateOnly(remote.endDate) && !!local.isCurrent === !!remote.isCurrent &&
    (local.description ?? '') === (remote.description ?? ''));
}

export type SeasonIdentity = { remote: any; provenance: 'exact-id' | 'natural-key' };
function validSeasonId(row: any): boolean {
  return !(row.id && row.seasonId && row.id !== row.seasonId) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id ?? row.seasonId ?? '');
}

export async function lookupOwnedSeason(local: DbSeason, session: SyncSession): Promise<SeasonIdentity | undefined> {
  if (local.syncAttempted) {
    assertSyncSession(session);
    try {
      const response = await apiClient.get<any>(`/seasons/${seasonRemoteId(local)}`);
      assertSyncSession(session);
      const remote = response?.data;
      if (provenOwnedSeason(remote, session.ownerId) && validSeasonId(remote) &&
          (remote.id ?? remote.seasonId) === seasonRemoteId(local)) return { remote, provenance: 'exact-id' };
    } catch (error) {
      assertSyncSession(session);
      if (!(error instanceof ApiRequestError) || error.status !== 404) throw error;
    }
  }
  const rows: any[] = [];
  for (let page = 1; ; page++) {
    assertSyncSession(session);
    const response = await apiClient.get<any>('/seasons', new URLSearchParams({
      search: local.label, page: String(page), limit: '100',
    }));
    assertSyncSession(session);
    const data = response?.data;
    const records = Array.isArray(data) ? data : data?.data ?? data?.seasons;
    if (!Array.isArray(records)) throw new Error('Invalid season identity response');
    rows.push(...records);
    const hasNext = data?.pagination?.hasNext ?? data?.hasMore ?? records.length === 100;
    if (!hasNext) break;
    if (page >= 100) throw new Error('Season identity lookup incomplete');
  }
  const matches = rows.filter(row => row.label === local.label && provenOwnedSeason(row, session.ownerId));
  if (matches.length !== 1) return undefined;
  const remote = matches[0];
  if (!validSeasonId(remote)) return undefined;
  return compatibleSeason(local, remote) ? { remote, provenance: 'natural-key' } : undefined;
}
