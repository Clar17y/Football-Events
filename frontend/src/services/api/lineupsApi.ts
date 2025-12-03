/**
 * Lineups API Service
 * Handles match lineup operations (who played when, substitutions, etc.)
 */

import apiClient from './baseApi';
import type { Lineup, LineupCreateRequest, LineupUpdateRequest } from '@shared/types';

export interface LineupBatchRequest {
  create?: LineupCreateRequest[];
  update?: Array<{ id: string; data: LineupUpdateRequest }>;
  delete?: string[];
}

export interface LineupBatchResult {
  created: {
    success: number;
    failed: number;
    items: Lineup[];
  };
  updated: {
    success: number;
    failed: number;
    items: Lineup[];
  };
  deleted: {
    success: number;
    failed: number;
    ids: string[];
  };
}

export interface SubstitutionRequest {
  playerOffId: string;
  playerOnId: string;
  position: string;
  currentTime: number;
  substitutionReason?: string;
}

export const lineupsApi = {
  /**
   * Get lineups for a specific match
   */
  async getByMatch(matchId: string): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/match/${matchId}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get lineups for a specific player
   */
  async getByPlayer(playerId: string): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/player/${playerId}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get lineups for a specific position
   */
  async getByPosition(position: string): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/position/${position}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get lineup by ID
   */
  async getById(id: string): Promise<Lineup> {
    const response = await apiClient.get<Lineup>(`/lineups/${id}`);
    return response.data as unknown as Lineup;
  },

  /**
   * Get lineup by composite key (matchId, playerId, startMinute)
   */
  async getByKey(matchId: string, playerId: string, startMinute: number): Promise<Lineup> {
    const response = await apiClient.get<Lineup>(`/lineups/by-key/${matchId}/${playerId}/${startMinute}`);
    return response.data as unknown as Lineup;
  },

  /**
   * Get current lineup for a match at a specific time
   */
  async getCurrentLineup(matchId: string, currentTime?: number): Promise<Lineup[]> {
    const params = new URLSearchParams();
    if (currentTime !== undefined) {
      params.append('currentTime', currentTime.toString());
    }
    const url = `/lineups/match/${matchId}/current${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await apiClient.get<Lineup[]>(url);
    return response.data as unknown as Lineup[];
  },

  /**
   * Get active players at a specific time in a match
   */
  async getActivePlayersAtTime(matchId: string, timeMinutes: number): Promise<Lineup[]> {
    const response = await apiClient.get<Lineup[]>(`/lineups/match/${matchId}/active-at/${timeMinutes}`);
    return response.data as unknown as Lineup[];
  },

  /**
   * Create a new lineup entry
   */
  async create(lineup: LineupCreateRequest): Promise<Lineup> {
    const response = await apiClient.post<Lineup>('/lineups', lineup);
    return response.data as unknown as Lineup;
  },

  /**
   * Update a lineup by ID
   */
  async update(id: string, data: LineupUpdateRequest): Promise<Lineup> {
    const response = await apiClient.put<Lineup>(`/lineups/${id}`, data);
    return response.data as unknown as Lineup;
  },

  /**
   * Update lineup by composite key (with upsert capability)
   */
  async updateByKey(matchId: string, playerId: string, startMinute: number, data: LineupUpdateRequest): Promise<Lineup> {
    const response = await apiClient.put<Lineup>(`/lineups/by-key/${matchId}/${playerId}/${startMinute}`, data);
    return response.data as unknown as Lineup;
  },

  /**
   * Delete a lineup by ID
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/lineups/${id}`);
  },

  /**
   * Delete lineup by composite key
   */
  async deleteByKey(matchId: string, playerId: string, startMinute: number): Promise<void> {
    await apiClient.delete(`/lineups/by-key/${matchId}/${playerId}/${startMinute}`);
  },

  /**
   * Batch operations for lineups
   */
  async batch(operations: LineupBatchRequest): Promise<LineupBatchResult> {
    const response = await apiClient.post<LineupBatchResult>('/lineups/batch', operations);
    return response.data as unknown as LineupBatchResult;
  },

  /**
   * Batch operations scoped to a specific match
   */
  async batchByMatch(matchId: string, operations: Omit<LineupBatchRequest, 'matchId'>): Promise<LineupBatchResult> {
    const response = await apiClient.post<LineupBatchResult>('/lineups/batch-by-match', {
      matchId,
      ...operations
    });
    return response.data as unknown as LineupBatchResult;
  },

  /**
   * Make a substitution during a match
   */
  async makeSubstitution(matchId: string, substitution: SubstitutionRequest): Promise<{
    playerOff: Lineup;
    playerOn: Lineup;
  }> {
    const response = await apiClient.post<{
      playerOff: Lineup;
      playerOn: Lineup;
    }>(`/lineups/match/${matchId}/substitute`, substitution);
    return response.data as unknown as {
      playerOff: Lineup;
      playerOn: Lineup;
    };
  }
};

export default lineupsApi;
