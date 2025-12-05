/**
 * Teams API Service
 * Handles all team-related API operations with proper error handling and type safety
 * 
 * Requirements: 3.1 - Create teams while offline with synced equals false
 * Requirements: 5.1 - Use authenticated user ID for offline-created records
 */

import apiClient from './baseApi';
import { authApi } from './authApi';
import { canCreateTeam } from '../../utils/guestQuota';
import { getGuestId } from '../../utils/guest';
import { isOnline, shouldUseOfflineFallback, getCurrentUserId } from '../../utils/network';
import type { 
  Team, 
  TeamCreateRequest, 
  TeamUpdateRequest, 
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
    console.log('[teamsApi] Offline:', message);
  }
}

// API request/response interfaces
export interface TeamsListParams {
  page?: number;
  limit?: number;
  search?: string;
  includeOpponents?: boolean;
}

export interface TeamsListResponse extends PaginatedResponse<Team> {}

export interface TeamResponse {
  data: Team;
  success: boolean;
  message?: string;
}

export interface TeamPlayersResponse {
  data: Array<{
    id: string;
    name: string;
    squadNumber?: number;
    preferredPosition?: string;
    isActive: boolean;
  }>;
  success: boolean;
}

export interface TeamSquadResponse {
  data: {
    team: Team;
    players: Array<{
      id: string;
      name: string;
      squadNumber?: number;
      position?: string;
      isActive: boolean;
    }>;
    season?: {
      id: string;
      label: string;
    };
  };
  success: boolean;
}

/**
 * Teams API service with full CRUD operations
 */
export const teamsApi = {
  /**
   * Get paginated list of user's teams with optional search
   */
  async getTeams(params: TeamsListParams = {}): Promise<TeamsListResponse> {
    const { page = 1, limit = 25, search, includeOpponents } = params;
    if (!authApi.isAuthenticated()) {
      // Guest fallback: list local teams from IndexedDB
      const { db } = await import('../../db/indexedDB');
      let teams = await db.teams.toArray();
      // Exclude soft-deleted; include opponents only if requested
      teams = teams.filter((t: any) => t && !t.is_deleted && (includeOpponents ? true : (t as any).is_opponent !== true));
      if (search && search.trim()) {
        const term = search.trim().toLowerCase();
        teams = teams.filter(t => (t.name || '').toLowerCase().includes(term));
      }
      const total = teams.length;
      const start = (page - 1) * limit;
      const paged = teams.slice(start, start + limit);
      // Map to shared Team shape including colors
      const data = paged.map((t: any) => ({
        id: t.id,
        name: t.name,
        homeKitPrimary: t.color_primary || t.homeKitPrimary,
        homeKitSecondary: t.color_secondary || t.homeKitSecondary,
        awayKitPrimary: t.away_color_primary || t.awayKitPrimary,
        awayKitSecondary: t.away_color_secondary || t.awayKitSecondary,
        logoUrl: t.logo_url || t.logoUrl,
        is_opponent: !!t.is_opponent,
        createdAt: t.created_at ? new Date(t.created_at) : undefined,
        updatedAt: t.updated_at ? new Date(t.updated_at) : undefined,
        created_by_user_id: t.created_by_user_id,
        is_deleted: !!t.is_deleted
      })) as any;
      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
          hasNext: start + limit < total,
          hasPrev: start > 0
        },
        success: true
      } as TeamsListResponse;
    }
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (search && search.trim()) queryParams.append('search', search.trim());
    if (includeOpponents) queryParams.append('includeOpponents', 'true');
    const response = await apiClient.get(`/teams?${queryParams.toString()}`);
    return response.data as TeamsListResponse;
  },

  /**
   * Get a specific team by ID
   */
  async getTeamById(id: string): Promise<TeamResponse> {
    if (!authApi.isAuthenticated()) {
      // Guest fallback: query local team by ID
      const { db } = await import('../../db/indexedDB');
      const team = await db.teams.get(id);
      if (!team || (team as any).is_deleted) {
        throw new Error('Team not found');
      }
      const t = team as any;
      return {
        data: {
          id: t.id,
          name: t.name,
          homeKitPrimary: t.color_primary || t.homeKitPrimary,
          homeKitSecondary: t.color_secondary || t.homeKitSecondary,
          awayKitPrimary: t.away_color_primary || t.awayKitPrimary,
          awayKitSecondary: t.away_color_secondary || t.awayKitSecondary,
          logoUrl: t.logo_url || t.logoUrl,
          is_opponent: !!t.is_opponent,
          createdAt: t.created_at ? new Date(t.created_at) : undefined,
          updatedAt: t.updated_at ? new Date(t.updated_at) : undefined,
          created_by_user_id: t.created_by_user_id,
          is_deleted: !!t.is_deleted
        } as Team,
        success: true
      };
    }
    const response = await apiClient.get(`/teams/${id}`);
    return {
      data: response.data as Team,
      success: true
    };
  },

  /**
   * Create a new team with offline fallback
   * 
   * Requirements: 3.1 - Write to local teams table with synced equals false when offline
   * Requirements: 5.1 - Use authenticated user ID for created_by_user_id
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async createTeam(teamData: TeamCreateRequest): Promise<TeamResponse> {
    // Guest mode: always create locally
    if (!authApi.isAuthenticated()) {
      const q = await canCreateTeam();
      if (!q.ok) throw new Error(q.reason);
      const { db } = await import('../../db/indexedDB');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `team-${now}-${Math.random().toString(36).slice(2)}`;
      const data = teamData as any;
      await db.teams.add({
        id,
        team_id: id,
        name: teamData.name,
        color_primary: data.homeKitPrimary,
        color_secondary: data.homeKitSecondary,
        away_color_primary: data.awayKitPrimary,
        away_color_secondary: data.awayKitSecondary,
        logo_url: data.logoUrl,
        is_opponent: !!data.isOpponent,
        created_at: now,
        updated_at: now,
        created_by_user_id: getGuestId(),
        is_deleted: false,
        synced: false,
      } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return {
        data: {
          id,
          name: teamData.name,
          homeKitPrimary: data.homeKitPrimary,
          homeKitSecondary: data.homeKitSecondary,
          awayKitPrimary: data.awayKitPrimary,
          awayKitSecondary: data.awayKitSecondary,
          logoUrl: data.logoUrl,
          is_opponent: !!data.isOpponent
        } as any,
        success: true,
        message: 'Team created locally'
      };
    }

    // Authenticated mode: try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post('/teams', teamData);
        return {
          data: response.data as Team,
          success: true,
          message: 'Team created successfully'
        };
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: write to local teams table with authenticated user ID
    const { db } = await import('../../db/indexedDB');
    const now = Date.now();
    const id = crypto?.randomUUID ? crypto.randomUUID() : `team-${now}-${Math.random().toString(36).slice(2)}`;
    const data = teamData as any;
    const userId = getCurrentUserId();

    await db.teams.add({
      id,
      team_id: id,
      name: teamData.name,
      color_primary: data.homeKitPrimary,
      color_secondary: data.homeKitSecondary,
      away_color_primary: data.awayKitPrimary,
      away_color_secondary: data.awayKitSecondary,
      logo_url: data.logoUrl,
      is_opponent: !!data.isOpponent,
      created_at: now,
      updated_at: now,
      created_by_user_id: userId,
      is_deleted: false,
      synced: false,
    } as any);

    showOfflineToast('Team saved locally - will sync when online');

    return {
      data: {
        id,
        name: teamData.name,
        homeKitPrimary: data.homeKitPrimary,
        homeKitSecondary: data.homeKitSecondary,
        awayKitPrimary: data.awayKitPrimary,
        awayKitSecondary: data.awayKitSecondary,
        logoUrl: data.logoUrl,
        is_opponent: !!data.isOpponent
      } as any,
      success: true,
      message: 'Team created locally - will sync when online'
    };
  },

  /**
   * Update an existing team with offline fallback
   * 
   * Requirements: 3.1 - Update local record when offline
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async updateTeam(id: string, teamData: TeamUpdateRequest): Promise<TeamResponse> {
    // Guest mode: always update locally
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const dbUpdate: any = { updated_at: Date.now() };
      if (teamData.name !== undefined) dbUpdate.name = teamData.name;
      if ((teamData as any).homeKitPrimary !== undefined) dbUpdate.color_primary = (teamData as any).homeKitPrimary;
      if ((teamData as any).homeKitSecondary !== undefined) dbUpdate.color_secondary = (teamData as any).homeKitSecondary;
      if ((teamData as any).awayKitPrimary !== undefined) dbUpdate.away_color_primary = (teamData as any).awayKitPrimary;
      if ((teamData as any).awayKitSecondary !== undefined) dbUpdate.away_color_secondary = (teamData as any).awayKitSecondary;
      if ((teamData as any).logoUrl !== undefined) dbUpdate.logo_url = (teamData as any).logoUrl;
      await db.teams.update(id, dbUpdate);
      const updated = await db.teams.get(id);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return {
        data: {
          id,
          name: (updated as any)?.name || teamData.name,
          homeKitPrimary: (updated as any)?.color_primary,
          homeKitSecondary: (updated as any)?.color_secondary,
          awayKitPrimary: (updated as any)?.away_color_primary,
          awayKitSecondary: (updated as any)?.away_color_secondary,
          logoUrl: (updated as any)?.logo_url
        } as any,
        success: true,
        message: 'Team updated locally'
      };
    }

    // Authenticated mode: try server first if online
    if (isOnline()) {
      try {
        // Remove undefined values while preserving shared type keys
        const cleanData = Object.fromEntries(
          Object.entries(teamData).filter(([_, value]) => value !== undefined)
        );
        const response = await apiClient.put(`/teams/${id}`, cleanData);
        return {
          data: response.data as Team,
          success: true,
          message: 'Team updated successfully'
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
    const existingTeam = await db.teams.get(id);
    if (!existingTeam) {
      throw new Error(`Team ${id} not found in local storage`);
    }

    const now = Date.now();
    const dbUpdate: any = { 
      updated_at: now,
      synced: false  // Mark as unsynced for later sync
    };
    if (teamData.name !== undefined) dbUpdate.name = teamData.name;
    if ((teamData as any).homeKitPrimary !== undefined) dbUpdate.color_primary = (teamData as any).homeKitPrimary;
    if ((teamData as any).homeKitSecondary !== undefined) dbUpdate.color_secondary = (teamData as any).homeKitSecondary;
    if ((teamData as any).awayKitPrimary !== undefined) dbUpdate.away_color_primary = (teamData as any).awayKitPrimary;
    if ((teamData as any).awayKitSecondary !== undefined) dbUpdate.away_color_secondary = (teamData as any).awayKitSecondary;
    if ((teamData as any).logoUrl !== undefined) dbUpdate.logo_url = (teamData as any).logoUrl;

    await db.teams.update(id, dbUpdate);
    const updated = await db.teams.get(id);

    showOfflineToast('Team updated locally - will sync when online');

    return {
      data: {
        id,
        name: (updated as any)?.name || teamData.name,
        homeKitPrimary: (updated as any)?.color_primary,
        homeKitSecondary: (updated as any)?.color_secondary,
        awayKitPrimary: (updated as any)?.away_color_primary,
        awayKitSecondary: (updated as any)?.away_color_secondary,
        logoUrl: (updated as any)?.logo_url
      } as any,
      success: true,
      message: 'Team updated locally - will sync when online'
    };
  },

  /**
   * Delete a team (soft delete)
   */
  async deleteTeam(id: string): Promise<{ success: boolean; message: string }> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      await db.teams.update(id, { is_deleted: true, deleted_at: Date.now() } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return { success: true, message: 'Team deleted locally' };
    }
    await apiClient.delete(`/teams/${id}`);
    return {
      success: true,
      message: 'Team deleted successfully'
    };
  },

  /**
   * Get team roster/players
   */
  async getTeamPlayers(id: string): Promise<TeamPlayersResponse> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const players = await db.getPlayersByTeam(id);
      const list = players.success && players.data ? players.data : [];
      return {
        data: list.map(p => ({ id: p.id, name: (p as any).name || (p as any).full_name, squadNumber: (p as any).squadNumber, preferredPosition: (p as any).preferredPosition, isActive: true })),
        success: true
      };
    }
    const response = await apiClient.get(`/teams/${id}/players`);
    return {
      data: response.data as Array<{
        id: string;
        name: string;
        squadNumber?: number;
        preferredPosition?: string;
        isActive: boolean;
      }>,
      success: true
    };
  },

  /**
   * Get active players for a team
   */
  async getActiveTeamPlayers(id: string): Promise<TeamPlayersResponse> {
    if (!authApi.isAuthenticated()) {
      // Guest fallback: query local players by team
      const { db } = await import('../../db/indexedDB');
      const players = await db.players
        .where('current_team')
        .equals(id)
        .and((p: any) => !p.is_deleted)
        .toArray();
      return {
        data: players.map((p: any) => ({
          id: p.id,
          name: p.full_name || p.name || '',
          squadNumber: p.squad_number,
          preferredPosition: p.preferred_pos,
          isActive: true
        })),
        success: true
      };
    }
    const response = await apiClient.get(`/teams/${id}/active-players`);
    return {
      data: response.data as Array<{
        id: string;
        name: string;
        squadNumber?: number;
        preferredPosition?: string;
        isActive: boolean;
      }>,
      success: true
    };
  },

  /**
   * Get team squad with season context
   */
  async getTeamSquad(id: string, seasonId?: string): Promise<TeamSquadResponse> {
    const queryParams = seasonId ? `?seasonId=${seasonId}` : '';
    const response = await apiClient.get(`/teams/${id}/squad${queryParams}`);
    return {
      data: response.data as {
        team: Team;
        players: Array<{
          id: string;
          name: string;
          squadNumber?: number;
          position?: string;
          isActive: boolean;
        }>;
        season?: {
          id: string;
          label: string;
        };
      },
      success: true
    };
  },

  /**
   * List opponent teams (is_opponent=true) for current user
   */
  async getOpponentTeams(search?: string): Promise<Team[]> {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!authApi.isAuthenticated()) {
      // Guests: return local teams filtered
      const { db } = await import('../../db/indexedDB');
      let teams = await db.teams.toArray();
      if (search && search.trim()) {
        const term = normalize(search);
        teams = teams.filter(t => normalize(t.name || '').includes(term));
      }
      return teams.map(t => ({ id: t.id, name: t.name } as any));
    }
    // Authenticated: merge server opponents with local offline teams, dedup by normalized name
    const params = new URLSearchParams();
    if (search && search.trim()) params.append('search', search.trim());
    const [serverOpponents, localTeams] = await Promise.all([
      apiClient.get(`/teams/opponents${params.toString() ? `?${params.toString()}` : ''}`).then(r => (r.data as any as Team[]) || []),
      (async () => {
        const { db } = await import('../../db/indexedDB');
        let rows = await db.teams.toArray();
        if (search && search.trim()) {
          const term = normalize(search);
          rows = rows.filter(t => normalize(t.name || '').includes(term));
        }
        return rows.map(t => ({ id: t.id, name: t.name } as any));
      })()
    ]);
    const out: Map<string, Team> = new Map();
    for (const t of serverOpponents) {
      out.set(normalize(t.name), t);
    }
    for (const t of localTeams) {
      const key = normalize(t.name);
      if (!out.has(key)) out.set(key, t);
    }
    return Array.from(out.values());
  }
};

export default teamsApi;
