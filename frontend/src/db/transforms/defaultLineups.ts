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
    team_id: dl.teamId,
    formation: dl.formation || [],
    created_at: dl.createdAt ? new Date(dl.createdAt).getTime() : now,
    updated_at: dl.updatedAt ? new Date(dl.updatedAt).getTime() : now,
    created_by_user_id: dl.created_by_user_id || 'server',
    is_deleted: dl.is_deleted ?? false,
    synced: true,
    synced_at: now,
  } as LocalDefaultLineup;
}
