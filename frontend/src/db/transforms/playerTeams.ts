/**
 * Player-Team relationship transforms: Server API → IndexedDB
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * DbPlayerTeam extends PlayerTeam, so transforms are mostly pass-through.
 */

import type { DbPlayerTeam } from '../schema';
import type { PlayerTeam } from '@shared/types';
import { nullToUndefined, toBool, nowIso } from './common';

/**
 * Transform IndexedDB player-team record to frontend PlayerTeam type
 * Since DbPlayerTeam extends PlayerTeam, this is essentially a pass-through
 * that strips sync metadata.
 */
export function dbToPlayerTeam(pt: DbPlayerTeam): PlayerTeam {
  return {
    id: pt.id,
    playerId: pt.playerId,
    teamId: pt.teamId,
    startDate: pt.startDate,
    endDate: nullToUndefined(pt.endDate),
    createdAt: pt.createdAt,
    updatedAt: pt.updatedAt,
    createdByUserId: pt.createdByUserId,
    deletedAt: pt.deletedAt,
    deletedByUserId: nullToUndefined(pt.deletedByUserId),
    isDeleted: toBool(pt.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB player-team records
 */
export function dbToPlayerTeams(playerTeams: DbPlayerTeam[]): PlayerTeam[] {
  return playerTeams.map(dbToPlayerTeam);
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API player-team response (camelCase - server now returns camelCase)
 */
export interface ServerPlayerTeamResponse {
  id: string;
  playerId: string;
  teamId: string;
  startDate?: string;
  endDate?: string;
  jerseyNumber?: number;
  position?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API player-team to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverPlayerTeamToDb(pt: ServerPlayerTeamResponse): DbPlayerTeam {
  const now = nowIso();
  return {
    id: pt.id,
    playerId: pt.playerId,
    teamId: pt.teamId,
    startDate: pt.startDate ?? new Date().toISOString().split('T')[0],
    endDate: pt.endDate,
    createdAt: pt.createdAt ?? now,
    updatedAt: pt.updatedAt ?? now,
    createdByUserId: pt.createdByUserId ?? 'server',
    deletedAt: pt.deletedAt,
    deletedByUserId: pt.deletedByUserId,
    isDeleted: pt.isDeleted ?? false,
    isActive: pt.isActive ?? true,
    synced: true,
    syncedAt: now,
  };
}
