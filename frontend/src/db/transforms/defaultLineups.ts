/**
 * Default Lineup transforms: Server API → IndexedDB
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 */

import type { DbDefaultLineup, FormationPlayerPosition } from '../schema';
import { toBool, nowIso } from './common';

/**
 * Server API default lineup response (camelCase - server now returns camelCase)
 */
export interface ServerDefaultLineupResponse {
  id: string;
  teamId: string;
  formation?: FormationPlayerPosition[];
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API default lineup to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverDefaultLineupToDb(dl: ServerDefaultLineupResponse): DbDefaultLineup {
  const now = nowIso();
  return {
    id: dl.id,
    teamId: dl.teamId,
    formation: dl.formation ?? [],
    createdAt: dl.createdAt ?? now,
    updatedAt: dl.updatedAt ?? now,
    createdByUserId: dl.createdByUserId ?? 'server',
    deletedAt: dl.deletedAt,
    deletedByUserId: dl.deletedByUserId,
    isDeleted: dl.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}

/**
 * Transform IndexedDB default lineup to frontend format
 * This is essentially a pass-through that strips sync metadata
 */
export function dbToDefaultLineup(dl: DbDefaultLineup): Omit<DbDefaultLineup, 'synced' | 'syncedAt'> {
  return {
    id: dl.id,
    teamId: dl.teamId,
    formation: dl.formation,
    createdAt: dl.createdAt,
    updatedAt: dl.updatedAt,
    createdByUserId: dl.createdByUserId,
    deletedAt: dl.deletedAt,
    deletedByUserId: dl.deletedByUserId,
    isDeleted: toBool(dl.isDeleted),
  };
}
