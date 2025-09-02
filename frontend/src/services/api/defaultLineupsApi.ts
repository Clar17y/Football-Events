/**
 * Default Lineups API Service
 * Handles all default lineup-related API operations
 */

import apiClient from './baseApi';

// API request/response interfaces
export interface FormationPlayer {
  playerId: string;
  position: string;
  pitchX: number;
  pitchY: number;
}

export interface DefaultLineupData {
  id: string;
  teamId: string;
  formation: FormationPlayer[];
  createdAt: Date;
  updatedAt?: Date;
  created_by_user_id: string;
  deleted_at?: Date;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

export interface DefaultLineupCreateRequest {
  teamId: string;
  formation: FormationPlayer[];
}

export interface DefaultLineupResponse {
  data: DefaultLineupData;
  success: boolean;
  message?: string;
}

export interface TeamsWithDefaultsResponse {
  data: Array<{
    teamId: string;
    teamName: string;
    hasDefaultLineup: boolean;
  }>;
  success: boolean;
}

/**
 * Default Lineups API service
 */
export const defaultLineupsApi = {
  /**
   * Create or update default lineup for a team
   */
  async saveDefaultLineup(data: DefaultLineupCreateRequest): Promise<DefaultLineupResponse> {
    const response = await apiClient.post('/default-lineups', data);
    return response.data as DefaultLineupResponse;
  },

  /**
   * Get default lineup for a specific team
   */
  async getDefaultLineup(teamId: string): Promise<DefaultLineupData | null> {
    try {
      console.log('[defaultLineupsApi] GET default lineup request:', teamId);
      const response = await apiClient.get<DefaultLineupData>(`/default-lineups/${teamId}`);
      console.log('[defaultLineupsApi] GET default lineup response:', response);
      return response.data as DefaultLineupData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null; // No default lineup found
      }
      throw error;
    }
  },

  /**
   * Update default lineup for a specific team
   */
  async updateDefaultLineup(teamId: string, formation: FormationPlayer[]): Promise<DefaultLineupResponse> {
    const response = await apiClient.put(`/default-lineups/${teamId}`, { formation });
    return response.data as DefaultLineupResponse;
  },

  /**
   * Delete default lineup for a specific team
   */
  async deleteDefaultLineup(teamId: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete(`/default-lineups/${teamId}`);
    return response.data;
  },

  /**
   * Get all teams with default lineup status
   */
  async getTeamsWithDefaults(): Promise<TeamsWithDefaultsResponse> {
    const response = await apiClient.get('/default-lineups');
    return response.data as TeamsWithDefaultsResponse;
  },

  /**
   * Apply default lineup to a specific match
   */
  async applyDefaultToMatch(teamId: string, matchId: string): Promise<any> {
    const response = await apiClient.post(`/default-lineups/${teamId}/apply-to-match`, { matchId });
    return response.data;
  },

  /**
   * Validate formation data without saving
   */
  async validateFormation(formation: FormationPlayer[]): Promise<{ isValid: boolean; errors: string[] }> {
    const response = await apiClient.post('/default-lineups/validate', { formation });
    return response.data.data;
  }
};

export default defaultLineupsApi;
