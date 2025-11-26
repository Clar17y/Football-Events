/**
 * Teams API Service
 * Handles all team-related API operations with proper error handling and type safety
 */

import apiClient from './baseApi';
import { authApi } from './authApi';
import { canCreateTeam } from '../../utils/guestQuota';
import { getGuestId } from '../../utils/guest';
import type { 
  Team, 
  TeamCreateRequest, 
  TeamUpdateRequest, 
  PaginatedResponse 
} from '@shared/types';

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
      // Map to shared Team shape minimally
      const data = paged.map(t => ({ id: t.id, name: t.name })) as any;
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
    const response = await apiClient.get(`/teams/${id}`);
    return {
      data: response.data as Team,
      success: true
    };
  },

  /**
   * Create a new team
   */
  async createTeam(teamData: TeamCreateRequest): Promise<TeamResponse> {
    if (!authApi.isAuthenticated()) {
      // Enforce guest team limit and create locally
      const q = await canCreateTeam();
      if (!q.ok) throw new Error(q.reason);
      const { db } = await import('../../db/indexedDB');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `team-${now}-${Math.random().toString(36).slice(2)}`;
      await db.teams.add({
        id,
        team_id: id,
        name: teamData.name,
        color_primary: (teamData as any).homeKitPrimary,
        color_secondary: (teamData as any).homeKitSecondary,
        created_at: now,
        updated_at: now,
        created_by_user_id: getGuestId(),
        is_deleted: false,
      } as any);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return {
        data: { id, name: teamData.name } as any,
        success: true,
        message: 'Team created locally'
      };
    }
    try {
      const response = await apiClient.post('/teams', teamData);
      return {
        data: response.data as Team,
        success: true,
        message: 'Team created successfully'
      };
    } catch (e: any) {
      // Authenticated but offline: create locally and add to outbox
      const { db } = await import('../../db/indexedDB');
      const { addToOutbox } = await import('../../db/utils');
      const now = Date.now();
      const id = crypto?.randomUUID ? crypto.randomUUID() : `team-${now}-${Math.random().toString(36).slice(2)}`;
      await db.teams.add({
        id,
        team_id: id,
        name: teamData.name,
        color_primary: (teamData as any).homeKitPrimary,
        color_secondary: (teamData as any).homeKitSecondary,
        created_at: now,
        updated_at: now,
        created_by_user_id: 'offline',
        is_deleted: false,
      } as any);
      await addToOutbox('teams', id, 'INSERT', teamData as any, 'offline');
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return {
        data: { id, name: teamData.name } as any,
        success: true,
        message: 'Team created (offline, pending sync)'
      };
    }
  },

  /**
   * Update an existing team
   */
  async updateTeam(id: string, teamData: TeamUpdateRequest): Promise<TeamResponse> {
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      await db.teams.update(id, { ...teamData, updated_at: Date.now() } as any);
      const updated = await db.teams.get(id);
      try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
      return {
        data: { id, name: (updated as any)?.name || teamData.name } as any,
        success: true,
        message: 'Team updated locally'
      };
    }
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
