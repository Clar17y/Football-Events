import { apiClient } from './api/baseApi';
import { authApi } from './api/authApi';
import { getAuthUserId } from '../utils/network';
import { db } from '../db/indexedDB';
import { serverTeamToDb } from '../db/transforms';
import { isCurrentOwnedMatch } from './dataLayer';

type ServerTeam = Parameters<typeof serverTeamToDb>[0];
interface TeamPage {
  data: unknown[];
  pagination: { page: number; hasNext: boolean };
}

function ownedManagedTeam(value: unknown, ownerId: string): value is ServerTeam {
  if (!value || typeof value !== 'object') return false;
  const row = value as ServerTeam & { created_by_user_id?: string; is_deleted?: boolean; is_opponent?: boolean; deleted_at?: string };
  return typeof row.id === 'string' && !!row.id.trim() && typeof row.name === 'string' && !!row.name.trim() &&
    isCurrentOwnedMatch(row, ownerId) && !row.deletedAt && !row.deleted_at &&
    (row.isOpponent === undefined || row.isOpponent === false) &&
    (row.is_opponent === undefined || row.is_opponent === false);
}

/** Populate Home's managed-team projection without replacing local work or another account's cache. */
export async function bootstrapOwnedTeams(ownerId: string, isCallerCurrent: () => boolean = () => true): Promise<void> {
  const generation = authApi.getSessionGeneration();
  const isCurrent = () => isCallerCurrent() && getAuthUserId() === ownerId &&
    authApi.getSessionGeneration() === generation && authApi.getCachedProfile()?.id === ownerId;
  if (!ownerId || !isCurrent() || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

  const before = new Map((await db.teams.toArray()).map(row => [row.id, JSON.stringify(row)]));
  if (!isCurrent()) return;
  const teams = new Map<string, ServerTeam>();
  // /teams returns pagination.hasNext, not the local teamsApi hasMore shape.
  for (let page = 1; page <= 100; page++) {
    if (!isCurrent()) return;
    const response = await apiClient.get<TeamPage>('/teams', new URLSearchParams({ page: String(page), limit: '100', includeOpponents: 'false' }));
    if (!isCurrent()) return;
    const payload = response.data;
    if (!response.success || !Array.isArray(payload?.data) || payload.pagination?.page !== page || typeof payload.pagination.hasNext !== 'boolean') {
      throw new Error('Invalid team bootstrap response');
    }
    for (const row of payload.data) {
      if (ownedManagedTeam(row, ownerId)) teams.set(row.id, row);
    }
    if (!payload.pagination.hasNext) break;
    if (page === 100) throw new Error('Team bootstrap pagination limit exceeded');
  }
  if (!isCurrent()) return;
  await db.transaction('rw', db.teams, async () => {
    const assertCurrent = () => { if (!isCurrent()) throw new Error('Team bootstrap session changed'); };
    assertCurrent();
    for (const row of teams.values()) {
      const local = await db.teams.get(row.id);
      assertCurrent();
      // Never adopt a colliding foreign/deleted row, or replace work made during the request.
      if (local && (!isCurrentOwnedMatch(local, ownerId) || local.synced !== true || before.get(row.id) !== JSON.stringify(local))) continue;
      await db.teams.put(serverTeamToDb({ ...row, createdByUserId: ownerId }));
      assertCurrent();
    }
    assertCurrent();
  });
}
