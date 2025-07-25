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
  teamId?: string;
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
    const { page = 1, limit = 25, search, teamId, position } = params;
    
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
  }
};

export default playersApi;