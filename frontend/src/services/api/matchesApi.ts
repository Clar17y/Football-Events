/**
 * Matches API Service
 * Handles all match-related API operations
 */

import apiClient from './baseApi';
import type { Match, MatchUpdateRequest } from '@shared/types';

export interface QuickStartPayload {
  myTeamId?: string;
  myTeamName?: string;
  opponentName?: string;
  isHome: boolean;
  kickoffTime?: string; // ISO
  seasonId?: string;
  competition?: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: 'quarter' | 'half' | 'whole';
  notes?: string;
}

export interface MatchesListParams {
  page?: number;
  limit?: number;
  search?: string;
  seasonId?: string;
  teamId?: string;
  competition?: string;
}

/**
 * Matches API service
 */
export const matchesApi = {
  /**
   * Quick-start a match
   */
  async quickStart(payload: QuickStartPayload): Promise<Match> {
    const response = await apiClient.post<Match>('/matches/quick-start', payload);
    return response.data as unknown as Match;
  },
  /**
   * Get matches by season ID
   */
  async getMatchesBySeason(seasonId: string): Promise<Match[]> {
    const response = await apiClient.get(`/matches/season/${seasonId}`);
    return response.data as Match[];
  },

  /**
   * Get matches by team ID
   */
  async getMatchesByTeam(teamId: string): Promise<Match[]> {
    const response = await apiClient.get(`/matches/team/${teamId}`);
    return response.data as Match[];
  },

  /**
   * Get paginated list of matches with optional filtering
   */
  async getMatches(params: MatchesListParams = {}): Promise<{
    data: Match[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const { page = 1, limit = 25, search, seasonId, teamId, competition } = params;
    
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    
    if (search && search.trim()) {
      queryParams.append('search', search.trim());
    }
    if (seasonId) {
      queryParams.append('seasonId', seasonId);
    }
    if (teamId) {
      queryParams.append('teamId', teamId);
    }
    if (competition) {
      queryParams.append('competition', competition);
    }
    
    const response = await apiClient.get(`/matches?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Upcoming matches
   */
  async getUpcoming(limit: number = 10, teamId?: string): Promise<Match[]> {
    const params = new URLSearchParams();
    params.append('limit', String(limit));
    if (teamId) params.append('teamId', teamId);
    const response = await apiClient.get<Match[]>(`/matches/upcoming?${params.toString()}`);
    return response.data as unknown as Match[];
  },

  /**
   * Recent matches
   */
  async getRecent(limit: number = 10, teamId?: string): Promise<Match[]> {
    const params = new URLSearchParams();
    params.append('limit', String(limit));
    if (teamId) params.append('teamId', teamId);
    const response = await apiClient.get<Match[]>(`/matches/recent?${params.toString()}`);
    return response.data as unknown as Match[];
  },

  /**
   * Update an existing match
   */
  async updateMatch(id: string, matchData: MatchUpdateRequest): Promise<Match> {
    // Remove undefined values to avoid overwriting fields unintentionally
    const cleanData = Object.fromEntries(
      Object.entries(matchData).filter(([_, value]) => value !== undefined)
    );

    const response = await apiClient.put<Match>(`/matches/${id}`, cleanData);
    return response.data as unknown as Match;
  }
};

export default matchesApi;
