/**
 * Matches API Service
 * Handles all match-related API operations
 */

import apiClient from './baseApi';
import type { Match, MatchUpdateRequest } from '@shared/types';
import type { MatchState, MatchPeriod } from '@shared/types';

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
   * Get a single match by ID
   */
  async getMatch(id: string): Promise<Match> {
    const response = await apiClient.get<Match>(`/matches/${id}`);
    return response.data as unknown as Match;
  },
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
  },

  // === Live Match – State & Periods ===
  async getMatchState(id: string): Promise<MatchState> {
    const response = await apiClient.get<MatchState>(`/matches/${id}/state`);
    return response.data as unknown as MatchState;
  },
  async getMatchPeriods(id: string): Promise<MatchPeriod[]> {
    const response = await apiClient.get<MatchPeriod[]>(`/matches/${id}/periods`);
    return response.data as unknown as MatchPeriod[];
  },
  async startMatch(id: string): Promise<MatchState> {
    const response = await apiClient.post<MatchState>(`/matches/${id}/start`);
    return response.data as unknown as MatchState;
  },
  async pauseMatch(id: string): Promise<MatchState> {
    const response = await apiClient.post<MatchState>(`/matches/${id}/pause`);
    return response.data as unknown as MatchState;
  },
  async resumeMatch(id: string): Promise<MatchState> {
    const response = await apiClient.post<MatchState>(`/matches/${id}/resume`);
    return response.data as unknown as MatchState;
  },
  async completeMatch(id: string, finalScore?: { ourScore: number; opponentScore: number }, notes?: string): Promise<MatchState> {
    const body: any = {};
    if (finalScore) body.finalScore = finalScore;
    if (notes) body.notes = notes;
    const response = await apiClient.post<MatchState>(`/matches/${id}/complete`, body);
    return response.data as unknown as MatchState;
  },
  async startPeriod(id: string, periodType?: 'regular' | 'extra_time' | 'penalty_shootout'): Promise<MatchPeriod> {
    const response = await apiClient.post<MatchPeriod>(`/matches/${id}/periods/start`, periodType ? { periodType } : undefined);
    return response.data as unknown as MatchPeriod;
  },
  async endPeriod(id: string, periodId: string, payload?: { reason?: string; actualDurationSeconds?: number }): Promise<MatchPeriod> {
    const response = await apiClient.post<MatchPeriod>(`/matches/${id}/periods/${periodId}/end`, payload || {});
    return response.data as unknown as MatchPeriod;
  },
  // === Viewer Sharing ===
  async shareViewerToken(id: string, expiresInMinutes: number = 480): Promise<{ viewer_token: string; expiresAt: string; code?: string; shareUrl?: string }> {
    const response = await apiClient.post<{ viewer_token: string; expiresAt: string; code?: string; shareUrl?: string }>(`/matches/${id}/share`, { expiresInMinutes });
    return response.data as unknown as { viewer_token: string; expiresAt: string; code?: string; shareUrl?: string };
  },
  async revokeViewerToken(id: string, code?: string): Promise<{ success: true; revoked: number }> {
    const params = code ? `?code=${encodeURIComponent(code)}` : '';
    const response = await apiClient.delete<{ success: true; revoked: number }>(`/matches/${id}/share${params}`);
    return response.data as unknown as { success: true; revoked: number };
  },
  async getActiveViewerLinks(id: string): Promise<{ code: string; expiresAt: string }[]> {
    const response = await apiClient.get<{ success: true; data: { code: string; expiresAt: string }[] }>(`/matches/${id}/share`);
    return response.data as any || [];
  },
};

export default matchesApi;
