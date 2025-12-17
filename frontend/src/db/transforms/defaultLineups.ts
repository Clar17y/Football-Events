/**
 * Default Lineup transforms: Server API → IndexedDB
 * Used by cacheService to store server data locally
 */

import type { LocalDefaultLineup, FormationPlayerPosition } from '../schema';

/**
 * Server API default lineup response (camelCase)
 */
export interface ServerDefaultLineupResponse {
  id: string;
  teamId: string;
  formation?: FormationPlayerPosition[];
  createdAt?: string;
  updatedAt?: string;
  created_by_user_id?: string;
  is_deleted?: boolean;
}

/**
 * Transform Server API default lineup to IndexedDB format for caching
 */
export function serverDefaultLineupToDb(dl: ServerDefaultLineupResponse): LocalDefaultLineup {
  const now = Date.now();
  return {
    id: dl.id,
    teamId: dl.teamId,
    formation: dl.formation || [],
    createdAt: dl.createdAt ? new Date(dl.createdAt).getTime() : now,
    updatedAt: dl.updatedAt ? new Date(dl.updatedAt).getTime() : now,
    createdByUserId: dl.created_by_user_id || 'server',
    isDeleted: dl.is_deleted ?? false,
    synced: true,
    syncedAt: now,
  } as LocalDefaultLineup;
}
