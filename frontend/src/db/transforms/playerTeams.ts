/**
 * Player-Team relationship transforms: Server API → IndexedDB
 * Used by cacheService to store server data locally
 */

/**
 * Server API player-team response (camelCase)
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
  created_by_user_id?: string;
  is_deleted?: boolean;
}

/**
 * IndexedDB player-team record structure (camelCase)
 */
export interface DbPlayerTeam {
  id: string;
  playerId: string;
  teamId: string;
  startDate: string;
  endDate?: string;
  jerseyNumber?: number;
  position?: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  createdByUserId: string;
  isDeleted: boolean;
  synced: boolean;
  syncedAt: number;
}

/**
 * Transform Server API player-team to IndexedDB format for caching
 */
export function serverPlayerTeamToDb(pt: ServerPlayerTeamResponse): DbPlayerTeam {
  const now = Date.now();
  return {
    id: pt.id,
    playerId: pt.playerId,
    teamId: pt.teamId,
    startDate: pt.startDate || new Date().toISOString().split('T')[0],
    endDate: pt.endDate,
    jerseyNumber: pt.jerseyNumber,
    position: pt.position,
    isActive: pt.isActive ?? true,
    createdAt: pt.createdAt ? new Date(pt.createdAt).getTime() : now,
    updatedAt: pt.updatedAt ? new Date(pt.updatedAt).getTime() : now,
    createdByUserId: pt.created_by_user_id || 'server',
    isDeleted: pt.is_deleted ?? false,
    synced: true,
    syncedAt: now,
  };
}
