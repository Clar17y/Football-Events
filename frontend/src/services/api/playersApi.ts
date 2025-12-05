/**
 * Players API Service
 * Handles all player-related API operations with proper error handling and type safety
 * 
 * Requirements: 3.2 - Create players while offline with synced equals false
 * Requirements: 5.1 - Use authenticated user ID for offline-created records
 */

import apiClient from './baseApi';
import { authApi } from './authApi';
import { canAddPlayer } from '../../utils/guestQuota';
import { getGuestId } from '../../utils/guest';
import { isOnline, shouldUseOfflineFallback, getCurrentUserId } from '../../utils/network';
import type { 
  Player, 
  PlayerCreateRequest, 
  PlayerUpdateRequest, 
  PaginatedResponse 
} from '@shared/types';

/**
 * Show offline toast notification
 * Requirements: 4.2 - Show toast when data is saved locally
 */
function showOfflineToast(message: string): void {
  try {
    (window as any).__toastApi?.current?.showInfo?.(message);
  } catch {
    console.log('[playersApi] Offline:', message);
  }
}

// API request/response interfaces
export interface PlayersListParams {
  page?: number;
  limit?: number;
  search?: string;
  teamId?: string; // backward-compatible single team filter
  teamIds?: string[]; // new multi-team filter
  noTeam?: boolean; // filter players without active team
  position?: string;
}

export interface PlayersListResponse extends PaginatedResponse<Player> {}

export interface PlayerResponse {
  data: Player;
  success: boolean;
  message?: string;
}

/**
 * Players API service with full CRUD operations
 */
export const playersApi = {
  /**
   * Get paginated list of user's players with optional search and filtering
   */
  async getPlayers(params: PlayersListParams = {}): Promise<PlayersListResponse> {
    const { page = 1, limit = 25, search, teamId, teamIds, noTeam, position } = params;

    // Guest fallback: read from IndexedDB
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const { getGuestId } = await import('../../utils/guest');
      const guestId = getGuestId();
      let rows = await db.players.toArray();
      // Scope to this guest and non-deleted
      rows = rows.filter((p: any) => p && p.created_by_user_id === guestId && !p.is_deleted);
      // Filter by team assignment
      if (teamIds && teamIds.length > 0) {
        const set = new Set(teamIds);
        rows = rows.filter((p: any) => p.current_team && set.has(p.current_team));
      } else if (teamId) {
        rows = rows.filter((p: any) => p.current_team === teamId);
      } else if (noTeam) {
        rows = rows.filter((p: any) => !p.current_team);
      }
      // Filter by search text
      if (search && search.trim()) {
        const term = search.trim().toLowerCase();
        rows = rows.filter((p: any) => (p.full_name || '').toLowerCase().includes(term));
      }
      // Filter by position
      if (position) {
        rows = rows.filter((p: any) => (p.preferred_pos || '') === position);
      }
      // Sort by name
      rows.sort((a: any, b: any) => (a.full_name || '').localeCompare(b.full_name || ''));
      // Paginate
      const total = rows.length;
      const start = (page - 1) * limit;
      const paged = rows.slice(start, start + limit);
      // Map to shared Player shape
      const data = paged.map((p: any) => ({
        id: p.id,
        name: p.full_name,
        squadNumber: p.squad_number,
        preferredPosition: p.preferred_pos,
        dateOfBirth: p.dob ? new Date(p.dob) : undefined,
        notes: p.notes,
        currentTeam: p.current_team,
        createdAt: new Date(p.created_at),
        updatedAt: p.updated_at ? new Date(p.updated_at) : undefined,
        created_by_user_id: p.created_by_user_id,
        deleted_at: p.deleted_at ? new Date(p.deleted_at) : undefined,
        deleted_by_user_id: p.deleted_by_user_id,
        is_deleted: !!p.is_deleted,
      })) as Player[];
      return {
        data,
        total,
        page,
        limit,
        hasMore: start + limit < total
      } as PlayersListResponse;
    }

    // Authenticated path, with offline fallback to IndexedDB on network error
    try {
      const queryParams = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search && search.trim()) queryParams.append('search', search.trim());
      if (teamId) queryParams.append('teamId', teamId);
      if (teamIds && teamIds.length > 0) queryParams.append('teamIds', teamIds.join(','));
      if (noTeam !== undefined) queryParams.append('noTeam', String(noTeam));
      if (position) queryParams.append('position', position);
      const response = await apiClient.get(`/players?${queryParams.toString()}`);
      return response.data as PlayersListResponse;
    } catch (e) {
      // Offline fallback: return any locally stored players
      const { db } = await import('../../db/indexedDB');
      let rows = await db.players.toArray();
      rows = rows.filter((p: any) => !p.is_deleted);
      const total = rows.length;
      const start = (page - 1) * limit;
      const paged = rows.slice(start, start + limit);
      const data = paged.map((p: any) => ({
        id: p.id,
        name: p.full_name,
        squadNumber: p.squad_number,
        preferredPosition: p.preferred_pos,
        dateOfBirth: p.dob ? new Date(p.dob) : undefined,
        notes: p.notes,
        currentTeam: p.current_team,
        createdAt: new Date(p.created_at),
        updatedAt: p.updated_at ? new Date(p.updated_at) : undefined,
        created_by_user_id: p.created_by_user_id,
        deleted_at: p.deleted_at ? new Date(p.deleted_at) : undefined,
        deleted_by_user_id: p.deleted_by_user_id,
        is_deleted: !!p.is_deleted,
      })) as Player[];
      return {
        data,
        total,
        page,
        limit,
        hasMore: start + limit < total
      } as PlayersListResponse;
    }
  },

  /**
   * Get a specific player by ID
   */
  async getPlayerById(id: string): Promise<PlayerResponse> {
    const response = await apiClient.get(`/players/${id}`);
    console.log('[playersApi] getPlayerById response:', response.data);
    return {
      data: response.data as Player,
      success: true
    };
  },

  /**
   * Create a new player with offline fallback
   * 
   * Requirements: 3.2 - Write to local players table with synced equals false when offline
   * Requirements: 5.1 - Use authenticated user ID for created_by_user_id
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async createPlayer(playerData: PlayerCreateRequest): Promise<PlayerResponse> {
    // Guest mode: always create locally
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `player-${now}-${Math.random().toString(36).slice(2)}`;
      await db.players.add({
        id,
        full_name: playerData.name,
        squad_number: playerData.squadNumber,
        preferred_pos: playerData.preferredPosition,
        dob: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
        notes: playerData.notes,
        current_team: (playerData as any).teamId,
        created_at: now,
        updated_at: now,
        created_by_user_id: getGuestId(),
        is_deleted: false,
        synced: false,
      } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return { data: { id, name: playerData.name } as any, success: true, message: 'Player created locally' };
    }

    // Authenticated mode: try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post('/players', playerData);
        return {
          data: response.data as Player,
          success: true,
          message: 'Player created successfully'
        };
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: write to local players table with authenticated user ID
    const { db } = await import('../../db/indexedDB');
    const now = Date.now();
    const id = crypto?.randomUUID ? crypto.randomUUID() : `player-${now}-${Math.random().toString(36).slice(2)}`;
    const userId = getCurrentUserId();

    await db.players.add({
      id,
      full_name: playerData.name,
      squad_number: playerData.squadNumber,
      preferred_pos: playerData.preferredPosition,
      dob: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
      notes: playerData.notes,
      current_team: (playerData as any).teamId,
      created_at: now,
      updated_at: now,
      created_by_user_id: userId,
      is_deleted: false,
      synced: false,
    } as any);

    showOfflineToast('Player saved locally - will sync when online');

    return {
      data: { id, name: playerData.name } as any,
      success: true,
      message: 'Player created locally - will sync when online'
    };
  },

  /**
   * Update an existing player with offline fallback
   * 
   * Requirements: 3.2 - Update local record when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async updatePlayer(id: string, playerData: PlayerUpdateRequest): Promise<PlayerResponse> {
    // Guest mode: always update locally
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      await db.players.update(id, { ...playerData, updated_at: Date.now() } as any);
      const updated = await db.players.get(id);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return {
        data: { id, name: (updated as any)?.full_name || playerData.name } as any,
        success: true,
        message: 'Player updated locally'
      };
    }

    // Authenticated mode: try server first if online
    if (isOnline()) {
      try {
        // Remove undefined values
        const cleanData = Object.fromEntries(
          Object.entries(playerData).filter(([_, value]) => value !== undefined)
        );
        const response = await apiClient.put(`/players/${id}`, cleanData);
        return {
          data: response.data as Player,
          success: true,
          message: 'Player updated successfully'
        };
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local record
    const { db } = await import('../../db/indexedDB');
    const existingPlayer = await db.players.get(id);
    if (!existingPlayer) {
      throw new Error(`Player ${id} not found in local storage`);
    }

    const now = Date.now();
    const dbUpdate: any = {
      updated_at: now,
      synced: false,  // Mark as unsynced for later sync
    };

    // Map API fields to local schema fields
    if (playerData.name !== undefined) dbUpdate.full_name = playerData.name;
    if (playerData.squadNumber !== undefined) dbUpdate.squad_number = playerData.squadNumber;
    if (playerData.preferredPosition !== undefined) dbUpdate.preferred_pos = playerData.preferredPosition;
    if (playerData.dateOfBirth !== undefined) {
      dbUpdate.dob = playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined;
    }
    if (playerData.notes !== undefined) dbUpdate.notes = playerData.notes;

    await db.players.update(id, dbUpdate);
    const updated = await db.players.get(id);

    showOfflineToast('Player updated locally - will sync when online');

    return {
      data: { id, name: (updated as any)?.full_name || playerData.name } as any,
      success: true,
      message: 'Player updated locally - will sync when online'
    };
  },

  /**
   * Update an existing player with team changes
   */
  async updatePlayerWithTeams(id: string, playerData: PlayerUpdateRequest & { teamIds: string[] }): Promise<PlayerResponse> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      await db.players.update(id, { ...playerData, current_team: playerData.teamIds?.[0], updated_at: Date.now() } as any);
      const updated = await db.players.get(id);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return {
        data: { id, name: (updated as any)?.full_name || playerData.name } as any,
        success: true,
        message: 'Player updated locally'
      };
    }
    const { teamIds, ...playerFields } = playerData;
    
    // Remove undefined values from player fields
    const cleanPlayerData = Object.fromEntries(
      Object.entries(playerFields).filter(([_, value]) => value !== undefined)
    );

    const requestData = {
      ...cleanPlayerData,
      teamIds
    };

    const response = await apiClient.put(`/players-with-teams/${id}`, requestData);
    return {
      data: response.data.player as Player,
      success: true,
      message: `Player updated and team assignments changed successfully`
    };
  },

  /**
   * Delete a player (soft delete)
   */
  async deletePlayer(id: string): Promise<{ success: boolean; message: string }> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      await db.players.update(id, { is_deleted: true, deleted_at: Date.now() } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return { success: true, message: 'Player deleted locally' };
    }
    await apiClient.delete(`/players/${id}`);
    return {
      success: true,
      message: 'Player deleted successfully'
    };
  },

  /**
   * Get players by team ID
   */
  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    const response = await apiClient.get(`/players/team/${teamId}`);
    return response.data as Player[];
  },

  /**
   * Get player statistics
   */
  async getPlayerStats(playerId: string, seasonId?: string): Promise<any> {
    if (!authApi.isAuthenticated()) {
      // Guest fallback: return empty stats
      return {
        matches: 0,
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        minutesPlayed: 0,
        appearances: 0
      };
    }
    const queryParams = new URLSearchParams();
    if (seasonId) {
      queryParams.append('seasonId', seasonId);
    }

    const url = `/players/${playerId}/stats${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiClient.get(url);
    return response.data;
  },

  /**
   * Create a new player with team assignment in one operation
   */
  async createPlayerWithTeam(playerData: PlayerCreateRequest & { teamId: string; startDate?: string }): Promise<PlayerResponse> {
    if (!authApi.isAuthenticated()) {
      const q = await canAddPlayer(playerData.teamId);
      if (!q.ok) throw new Error(q.reason);
      // Local create
      const { db } = await import('../../db/indexedDB');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `player-${now}-${Math.random().toString(36).slice(2)}`;
      await db.players.add({
        id,
        full_name: playerData.name,
        squad_number: playerData.squadNumber,
        preferred_pos: playerData.preferredPosition,
        dob: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
        notes: playerData.notes,
        current_team: playerData.teamId,
        created_at: now,
        updated_at: now,
        created_by_user_id: getGuestId(),
        is_deleted: false,
        synced: false,
      } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return { data: { id, name: playerData.name } as any, success: true, message: 'Player created locally' };
    }
    const { teamId, startDate = '2024-01-01', ...playerFields } = playerData;
    const requestData = { ...playerFields, teamId, startDate, isActive: true };
    const response = await apiClient.post('/players-with-team', requestData);
    return {
      data: response.data.player as Player,
      success: true,
      message: 'Player created and assigned to team successfully'
    };
  },

  /**
   * Create a new player with multiple team assignments in one operation
   */
  async createPlayerWithTeams(playerData: PlayerCreateRequest & { teamIds: string[]; startDate?: string }): Promise<PlayerResponse> {
    if (!authApi.isAuthenticated()) {
      const firstTeam = playerData.teamIds?.[0];
      if (firstTeam) {
        const q = await canAddPlayer(firstTeam);
        if (!q.ok) throw new Error(q.reason);
      }
      const { db } = await import('../../db/indexedDB');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `player-${now}-${Math.random().toString(36).slice(2)}`;
      await db.players.add({
        id,
        full_name: playerData.name,
        squad_number: playerData.squadNumber,
        preferred_pos: playerData.preferredPosition,
        dob: playerData.dateOfBirth ? new Date(playerData.dateOfBirth).toISOString() : undefined,
        notes: playerData.notes,
        current_team: firstTeam,
        created_at: now,
        updated_at: now,
        created_by_user_id: getGuestId(),
        is_deleted: false,
      } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return { data: { id, name: playerData.name } as any, success: true, message: 'Player created locally' };
    }
    const { teamIds, startDate = '2024-01-01', ...playerFields } = playerData;
    const requestData = { ...playerFields, teamIds, startDate, isActive: true };
    const response = await apiClient.post('/players-with-teams', requestData);
    return {
      data: response.data.player as Player,
      success: true,
      message: `Player created and assigned to ${teamIds.length} team${teamIds.length !== 1 ? 's' : ''} successfully`
    };
  }
};

export default playersApi;
