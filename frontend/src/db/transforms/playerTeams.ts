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
 * IndexedDB player-team record structure
 */
export interface DbPlayerTeam {
  id: string;
  player_id: string;
  team_id: string;
  start_date: string;
  end_date?: string;
  jersey_number?: number;
  position?: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
  created_by_user_id: string;
  is_deleted: boolean;
  synced: boolean;
  synced_at: number;
}

/**
 * Transform Server API player-team to IndexedDB format for caching
 */
export function serverPlayerTeamToDb(pt: ServerPlayerTeamResponse): DbPlayerTeam {
  const now = Date.now();
  return {
    id: pt.id,
    player_id: pt.playerId,
    team_id: pt.teamId,
    start_date: pt.startDate || new Date().toISOString().split('T')[0],
    end_date: pt.endDate,
    jersey_number: pt.jerseyNumber,
    position: pt.position,
    is_active: pt.isActive ?? true,
    created_at: pt.createdAt ? new Date(pt.createdAt).getTime() : now,
    updated_at: pt.updatedAt ? new Date(pt.updatedAt).getTime() : now,
    created_by_user_id: pt.created_by_user_id || 'server',
    is_deleted: pt.is_deleted ?? false,
    synced: true,
    synced_at: now,
  };
}
