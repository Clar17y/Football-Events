/**
 * Teams API Service
 * Handles all team-related API operations with proper error handling and type safety
 * 
 * Local-first architecture: READ operations always read from IndexedDB.
 * WRITE operations go through dataLayer which writes to IndexedDB first.
 * Background sync handles server communication.
 * 
 * Requirements: 3.1 - Create teams while offline with synced equals false
 * Requirements: 5.1 - Use authenticated user ID for offline-created records
 */

import apiClient from './baseApi';
import { authApi } from './authApi';
import { canCreateTeam } from '../../utils/guestQuota';
import { dbToTeam, dbToTeams } from '../../db/transforms';
import type { EnhancedTeam } from '../../db/schema';
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

export interface TeamsListResponse extends PaginatedResponse<Team> { }

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
   * Local-first: always reads from IndexedDB
   */
  async getTeams(params: TeamsListParams = {}): Promise<TeamsListResponse> {
    const { page = 1, limit = 25, search, includeOpponents } = params;
    
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    let teams = await db.teams.toArray();
    // Exclude soft-deleted; include opponents only if requested
    teams = teams.filter((t: any) => t && !t.is_deleted && (includeOpponents ? true : (t as any).is_opponent !== true));
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      teams = teams.filter(t => (t.name || '').toLowerCase().includes(term));
    }
    teams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const total = teams.length;
    const start = (page - 1) * limit;
    const paged = teams.slice(start, start + limit);
    const data = dbToTeams(paged as EnhancedTeam[]);
    return {
      data,
      total,
      page,
      limit,
      hasMore: start + limit < total
    } as TeamsListResponse;
  },

  /**
   * Get a specific team by ID
   * Local-first: always reads from IndexedDB
   */
  async getTeamById(id: string): Promise<TeamResponse> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    const team = await db.teams.get(id);
    if (!team || team.is_deleted) {
      throw new Error('Team not found');
    }
    return {
      data: dbToTeam(team as EnhancedTeam),
      success: true
    };
  },

  /**
   * Create a new team - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first via dataLayer. Background sync handles server communication.
   * This is the same code path for both guest and authenticated users.
   */
  async createTeam(teamData: TeamCreateRequest): Promise<TeamResponse> {
    // For guests, check quota limit
    if (!authApi.isAuthenticated()) {
      const q = await canCreateTeam();
      if (!q.ok) throw new Error(q.reason);
    }

    // Import dataLayer and create team locally
    const { teamsDataLayer } = await import('../dataLayer');
    const data = teamData as any;

    const team = await teamsDataLayer.create({
      name: teamData.name,
      homeKitPrimary: data.homeKitPrimary,
      homeKitSecondary: data.homeKitSecondary,
      awayKitPrimary: data.awayKitPrimary,
      awayKitSecondary: data.awayKitSecondary,
      logoUrl: data.logoUrl,
      isOpponent: data.isOpponent,
    });

    // Dispatch event for any listeners (guest mode UI, etc)
    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return {
      data: dbToTeam(team as EnhancedTeam),
      success: true,
      message: 'Team created'
    };
  },

  /**
   * Update an existing team - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first via dataLayer. Background sync handles server communication.
   */
  async updateTeam(id: string, teamData: TeamUpdateRequest): Promise<TeamResponse> {
    const { teamsDataLayer } = await import('../dataLayer');
    const { db: database } = await import('../../db/indexedDB');

    const data = teamData as any;

    await teamsDataLayer.update(id, {
      name: teamData.name,
      homeKitPrimary: data.homeKitPrimary,
      homeKitSecondary: data.homeKitSecondary,
      awayKitPrimary: data.awayKitPrimary,
      awayKitSecondary: data.awayKitSecondary,
      logoUrl: data.logoUrl,
      isOpponent: data.isOpponent,
    });

    // Get updated team from local DB
    const updated = await database.teams.get(id);

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    if (!updated) {
      throw new Error('Team not found after update');
    }

    return {
      data: dbToTeam(updated as EnhancedTeam),
      success: true,
      message: 'Team updated'
    };
  },

  /**
   * Delete a team (soft delete) - LOCAL-FIRST
   */
  async deleteTeam(id: string): Promise<{ success: boolean; message: string }> {
    const { teamsDataLayer } = await import('../dataLayer');
    await teamsDataLayer.delete(id);

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return { success: true, message: 'Team deleted' };
  },

  /**
   * Get team roster/players
   * Local-first: always reads from IndexedDB via player_teams junction table
   */
  async getTeamPlayers(id: string): Promise<TeamPlayersResponse> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    
    // Get player-team relationships for this team
    const playerTeamRelations = await db.player_teams
      .where('team_id')
      .equals(id)
      .filter((pt: any) => !pt.is_deleted)
      .toArray();
    
    // Get the player IDs from the relationships
    const playerIds = playerTeamRelations.map((pt: any) => pt.player_id);
    
    // Fetch the actual player records
    const players = await db.players
      .where('id')
      .anyOf(playerIds)
      .filter((p: any) => !p.is_deleted)
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
  },

  /**
   * Get active players for a team
   * Local-first: always reads from IndexedDB via player_teams junction table
   */
  async getActiveTeamPlayers(id: string): Promise<TeamPlayersResponse> {
    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    
    // Get active player-team relationships for this team
    const playerTeamRelations = await db.player_teams
      .where('team_id')
      .equals(id)
      .filter((pt: any) => !pt.is_deleted && pt.is_active !== false)
      .toArray();
    
    // Get the player IDs from the relationships
    const playerIds = playerTeamRelations.map((pt: any) => pt.player_id);
    
    // Fetch the actual player records
    const players = await db.players
      .where('id')
      .anyOf(playerIds)
      .filter((p: any) => !p.is_deleted)
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
   * Local-first: always reads from IndexedDB
   */
  async getOpponentTeams(search?: string): Promise<Team[]> {
    const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

    // Local-first: always read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    let teams = await db.teams.filter((t: any) => !t.is_deleted).toArray();
    if (search && search.trim()) {
      const term = normalize(search);
      teams = teams.filter(t => normalize(t.name || '').includes(term));
    }
    teams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return dbToTeams(teams as EnhancedTeam[]);
  }
};

export default teamsApi;
