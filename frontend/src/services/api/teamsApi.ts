/**
 * Teams API Service
 * Handles all team-related API operations with proper error handling and type safety
 */

import apiClient from './baseApi';
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
    const { page = 1, limit = 25, search } = params;
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search && search.trim()) {
      queryParams.append('search', search.trim());
    }
    
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
    // Transform frontend camelCase to backend snake_case
    const backendData = {
      name: teamData.name,
      homePrimary: teamData.homeKitPrimary,
      homeSecondary: teamData.homeKitSecondary,
      awayPrimary: teamData.awayKitPrimary,
      awaySecondary: teamData.awayKitSecondary,
      logoUrl: teamData.logoUrl
    };

    const response = await apiClient.post('/teams', backendData);
    return {
      data: response.data as Team,
      success: true,
      message: 'Team created successfully'
    };
  },

  /**
   * Update an existing team
   */
  async updateTeam(id: string, teamData: TeamUpdateRequest): Promise<TeamResponse> {
    // Transform frontend camelCase to backend snake_case
    const backendData = {
      name: teamData.name,
      homePrimary: teamData.homeKitPrimary,
      homeSecondary: teamData.homeKitSecondary,
      awayPrimary: teamData.awayKitPrimary,
      awaySecondary: teamData.awayKitSecondary,
      logoUrl: teamData.logoUrl
    };

    // Remove undefined values
    const cleanData = Object.fromEntries(
      Object.entries(backendData).filter(([_, value]) => value !== undefined)
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
    const params = new URLSearchParams();
    if (search && search.trim()) params.append('search', search.trim());
    const response = await apiClient.get(`/teams/opponents${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data as Team[];
  }
};

export default teamsApi;