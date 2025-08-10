/**
 * Players API Service
 * Handles all player-related API operations with proper error handling and type safety
 */

import apiClient from './baseApi';
import type { 
  Player, 
  PlayerCreateRequest, 
  PlayerUpdateRequest, 
  PaginatedResponse 
} from '@shared/types';

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
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search && search.trim()) {
      queryParams.append('search', search.trim());
    }
    if (teamId) {
      queryParams.append('teamId', teamId);
    }
    if (teamIds && teamIds.length > 0) {
      queryParams.append('teamIds', teamIds.join(','));
    }
    if (noTeam !== undefined) {
      queryParams.append('noTeam', String(noTeam));
    }
    if (position) {
      queryParams.append('position', position);
    }
    
    const response = await apiClient.get(`/players?${queryParams.toString()}`);
    return response.data as PlayersListResponse;
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
   * Create a new player
   */
  async createPlayer(playerData: PlayerCreateRequest): Promise<PlayerResponse> {
    const response = await apiClient.post('/players', playerData);
    return {
      data: response.data as Player,
      success: true,
      message: 'Player created successfully'
    };
  },

  /**
   * Update an existing player
   */
  async updatePlayer(id: string, playerData: PlayerUpdateRequest): Promise<PlayerResponse> {
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
  },

  /**
   * Update an existing player with team changes
   */
  async updatePlayerWithTeams(id: string, playerData: PlayerUpdateRequest & { teamIds: string[] }): Promise<PlayerResponse> {
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
    const { teamId, startDate = '2024-01-01', ...playerFields } = playerData;
    
    const requestData = {
      ...playerFields,
      teamId,
      startDate,
      isActive: true
    };
    
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
    const { teamIds, startDate = '2024-01-01', ...playerFields } = playerData;
    
    const requestData = {
      ...playerFields,
      teamIds,
      startDate,
      isActive: true
    };
    
    const response = await apiClient.post('/players-with-teams', requestData);
    return {
      data: response.data.player as Player,
      success: true,
      message: `Player created and assigned to ${teamIds.length} team${teamIds.length !== 1 ? 's' : ''} successfully`
    };
  }
};

export default playersApi;