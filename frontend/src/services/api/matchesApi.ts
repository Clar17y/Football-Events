/**
 * Matches API Service
 * Handles all match-related API operations
 */

import apiClient from './baseApi';
import { createLocalQuickMatch } from '../guestQuickMatch';
import { addToOutbox } from '../../db/utils';
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
    try {
      const response = await apiClient.post<Match>('/matches/quick-start', payload);
      return response.data as unknown as Match;
    } catch (e) {
      // Authenticated but offline: create locally and enqueue quick-start outbox
      const local = await createLocalQuickMatch(payload as any);
      await addToOutbox('matches', local.id, 'INSERT', { ...payload, quickStart: true } as any, 'offline');
      return (await import('../../services/guestQuickMatch')).getLocalMatch(local.id) as unknown as Match;
    }
  },
  /**
   * Get matches by season ID
   */
  async getMatchesBySeason(seasonId: string): Promise<Match[]> {
    const { authApi } = await import('./authApi');
    if (!authApi.isAuthenticated()) {
      // Guest fallback: query local matches by season
      const { db } = await import('../../db/indexedDB');
      const matches = await db.matches
        .where('season_id')
        .equals(seasonId)
        .and((m: any) => !m.is_deleted)
        .toArray();
      return matches.map((m: any) => ({
        id: m.id,
        matchId: m.match_id || m.id,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        kickoffTime: m.kickoff_ts,
        seasonId: m.season_id,
        competition: m.competition,
        venue: m.venue,
        notes: m.notes
      })) as Match[];
    }
    const response = await apiClient.get(`/matches/season/${seasonId}`);
    return response.data as Match[];
  },

  /**
   * Get matches by team ID
   */
  async getMatchesByTeam(teamId: string): Promise<Match[]> {
    const { authApi } = await import('./authApi');
    if (!authApi.isAuthenticated()) {
      // Guest fallback: query local matches where team is home or away
      const { db } = await import('../../db/indexedDB');
      const matches = await db.matches
        .filter((m: any) => !m.is_deleted && (m.home_team_id === teamId || m.away_team_id === teamId))
        .toArray();
      return matches.map((m: any) => ({
        id: m.id,
        matchId: m.match_id || m.id,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        kickoffTime: m.kickoff_ts,
        seasonId: m.season_id,
        competition: m.competition,
        venue: m.venue,
        durationMinutes: m.duration_mins,
        periodFormat: m.period_format,
        homeScore: m.home_score || 0,
        awayScore: m.away_score || 0,
        notes: m.notes
      })) as Match[];
    }
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
    const { authApi } = await import('./authApi');
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const teams = await db.teams.toArray();
      const teamMap = new Map<string, any>(teams.map((t: any) => [t.id, t]));
      let rows = await db.matches.toArray();
      rows = rows.filter((m: any) => m && !m.is_deleted);
      if (seasonId) rows = rows.filter((m: any) => m.season_id === seasonId);
      if (teamId) rows = rows.filter((m: any) => m.home_team_id === teamId || m.away_team_id === teamId);
      if (competition) rows = rows.filter((m: any) => (m.competition || '').toLowerCase().includes(competition.toLowerCase()));
      if (search && search.trim()) {
        const term = search.trim().toLowerCase();
        rows = rows.filter((m: any) => {
          const home = teamMap.get(m.home_team_id);
          const away = teamMap.get(m.away_team_id);
          return (
            (m.competition || '').toLowerCase().includes(term) ||
            (home?.name || '').toLowerCase().includes(term) ||
            (away?.name || '').toLowerCase().includes(term)
          );
        });
      }
      rows.sort((a: any, b: any) => new Date(a.kickoff_ts).getTime() - new Date(b.kickoff_ts).getTime());
      const total = rows.length;
      const start = (page - 1) * limit;
      const paged = rows.slice(start, start + limit);
      const data: Match[] = paged.map((m: any) => {
        const home = teamMap.get(m.home_team_id);
        const away = teamMap.get(m.away_team_id);
        return {
          id: m.id,
          seasonId: m.season_id,
          kickoffTime: new Date(m.kickoff_ts),
          competition: m.competition,
          homeTeamId: m.home_team_id,
          awayTeamId: m.away_team_id,
          homeTeam: home ? { id: home.id, name: home.name, is_opponent: !!home.is_opponent, createdAt: new Date(home.created_at), created_by_user_id: home.created_by_user_id, is_deleted: !!home.is_deleted } as any : undefined,
          awayTeam: away ? { id: away.id, name: away.name, is_opponent: !!away.is_opponent, createdAt: new Date(away.created_at), created_by_user_id: away.created_by_user_id, is_deleted: !!away.is_deleted } as any : undefined,
          venue: m.venue,
          durationMinutes: m.duration_mins,
          periodFormat: m.period_format,
          homeScore: m.home_score || 0,
          awayScore: m.away_score || 0,
          notes: m.notes,
          createdAt: new Date(m.created_at),
          updatedAt: m.updated_at ? new Date(m.updated_at) : undefined,
          created_by_user_id: m.created_by_user_id,
          deleted_at: m.deleted_at ? new Date(m.deleted_at) : undefined,
          deleted_by_user_id: m.deleted_by_user_id,
          is_deleted: !!m.is_deleted,
        } as Match;
      });
      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
          hasNext: start + limit < total,
          hasPrev: start > 0
        }
      };
    }
    const queryParams = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search && search.trim()) queryParams.append('search', search.trim());
    if (seasonId) queryParams.append('seasonId', seasonId);
    if (teamId) queryParams.append('teamId', teamId);
    if (competition) queryParams.append('competition', competition);
    const response = await apiClient.get(`/matches?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Upcoming matches
   */
  async getUpcoming(limit: number = 10, teamId?: string): Promise<Match[]> {
    const { authApi } = await import('./authApi');
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const teams = await db.teams.toArray();
      const teamMap = new Map<string, any>(teams.map((t: any) => [t.id, t]));
      let rows = await db.matches.toArray();
      const now = Date.now();
      rows = rows.filter((m: any) => !m.is_deleted && new Date(m.kickoff_ts).getTime() >= now);
      if (teamId) rows = rows.filter((m: any) => m.home_team_id === teamId || m.away_team_id === teamId);
      rows.sort((a: any, b: any) => new Date(a.kickoff_ts).getTime() - new Date(b.kickoff_ts).getTime());
      return rows.slice(0, limit).map((m: any) => ({
        id: m.id,
        seasonId: m.season_id,
        kickoffTime: new Date(m.kickoff_ts),
        competition: m.competition,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeTeam: teamMap.get(m.home_team_id) ? { id: m.home_team_id, name: teamMap.get(m.home_team_id).name, is_opponent: !!teamMap.get(m.home_team_id).is_opponent } as any : undefined,
        awayTeam: teamMap.get(m.away_team_id) ? { id: m.away_team_id, name: teamMap.get(m.away_team_id).name, is_opponent: !!teamMap.get(m.away_team_id).is_opponent } as any : undefined,
        venue: m.venue,
        durationMinutes: m.duration_mins,
        periodFormat: m.period_format,
        homeScore: m.home_score || 0,
        awayScore: m.away_score || 0,
        createdAt: new Date(m.created_at),
        is_deleted: !!m.is_deleted,
        created_by_user_id: m.created_by_user_id,
      } as Match));
    }
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
    const { authApi } = await import('./authApi');
    if (!authApi.isAuthenticated()) {
      const { db } = await import('../../db/indexedDB');
      const teams = await db.teams.toArray();
      const teamMap = new Map<string, any>(teams.map((t: any) => [t.id, t]));
      let rows = await db.matches.toArray();
      const now = Date.now();
      rows = rows.filter((m: any) => !m.is_deleted && new Date(m.kickoff_ts).getTime() < now);
      if (teamId) rows = rows.filter((m: any) => m.home_team_id === teamId || m.away_team_id === teamId);
      rows.sort((a: any, b: any) => new Date(b.kickoff_ts).getTime() - new Date(a.kickoff_ts).getTime());
      return rows.slice(0, limit).map((m: any) => ({
        id: m.id,
        seasonId: m.season_id,
        kickoffTime: new Date(m.kickoff_ts),
        competition: m.competition,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id,
        homeTeam: teamMap.get(m.home_team_id) ? { id: m.home_team_id, name: teamMap.get(m.home_team_id).name, is_opponent: !!teamMap.get(m.home_team_id).is_opponent } as any : undefined,
        awayTeam: teamMap.get(m.away_team_id) ? { id: m.away_team_id, name: teamMap.get(m.away_team_id).name, is_opponent: !!teamMap.get(m.away_team_id).is_opponent } as any : undefined,
        venue: m.venue,
        durationMinutes: m.duration_mins,
        periodFormat: m.period_format,
        homeScore: m.home_score || 0,
        awayScore: m.away_score || 0,
        createdAt: new Date(m.created_at),
        is_deleted: !!m.is_deleted,
        created_by_user_id: m.created_by_user_id,
      } as Match));
    }
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

    try {
      const response = await apiClient.put<Match>(`/matches/${id}`, cleanData);
      return response.data as unknown as Match;
    } catch (e) {
      // Offline fallback: update locally and enqueue outbox
      try {
        const { db } = await import('../../db/indexedDB');
        await db.matches.update(id, {
          season_id: cleanData.seasonId,
          kickoff_ts: cleanData.kickoffTime ? (cleanData.kickoffTime as Date).toISOString() : undefined,
          competition: cleanData.competition,
          home_team_id: cleanData.homeTeamId,
          away_team_id: cleanData.awayTeamId,
          venue: cleanData.venue,
          duration_mins: cleanData.durationMinutes,
          period_format: cleanData.periodFormat,
          notes: cleanData.notes,
          updated_at: Date.now()
        } as any);
      } catch {}
      await addToOutbox('matches', id, 'UPDATE', cleanData as any, 'offline');
      return (await import('../../services/guestQuickMatch')).getLocalMatch(id) as unknown as Match;
    }
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
  async completeMatch(id: string, finalScore?: { home: number; away: number }, notes?: string): Promise<MatchState> {
    const body: any = {};
    if (finalScore) body.finalScore = finalScore;
    if (notes) body.notes = notes;
    const response = await apiClient.post<MatchState>(`/matches/${id}/complete`, body);
    return response.data as unknown as MatchState;
  },

  /**
   * Live matches (match_state status = LIVE)
   */
  async getLiveMatches(): Promise<MatchState[]> {
    const response = await apiClient.get(`/matches/live`);
    const body = response.data as any;
    return (body?.data ?? body) as MatchState[];
  },

  /**
   * Match states with pagination
   */
  async getMatchStates(page = 1, limit = 500, matchIds?: string[]): Promise<{ data: Array<MatchState & { matchId: string }>; pagination?: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } }> {
    const { authApi } = await import('./authApi');
    if (!authApi.isAuthenticated()) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 1, hasNext: false, hasPrev: false } } as any;
    }
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (matchIds && matchIds.length) params.append('matchIds', matchIds.join(','));
    const response = await apiClient.get(`/matches/states?${params.toString()}`);
    const body: any = response.data;
    const data = body?.data ?? body;
    const pagination = body?.pagination;
    return { data, pagination } as any;
  },
  async startPeriod(id: string, periodType?: 'regular' | 'extra_time' | 'penalty_shootout'): Promise<MatchPeriod> {
    const response = await apiClient.post<MatchPeriod>(`/matches/${id}/periods/start`, periodType ? { periodType } : undefined);
    return response.data as unknown as MatchPeriod;
  },
  async endPeriod(id: string, periodId: string, payload?: { reason?: string; actualDurationSeconds?: number }): Promise<MatchPeriod> {
    const response = await apiClient.post<MatchPeriod>(`/matches/${id}/periods/${periodId}/end`, payload || {});
    return response.data as unknown as MatchPeriod;
  },
  /**
   * Delete a match (soft delete)
   */
  async deleteMatch(id: string): Promise<void> {
    try {
      await apiClient.delete(`/matches/${id}`);
    } catch (e) {
      try {
        const { db } = await import('../../db/indexedDB');
        await db.matches.update(id, { is_deleted: true, deleted_at: Date.now() } as any);
        // Clean up orphaned live state for guests
        await db.settings.delete(`local_live_state:${id}`);
      } catch {}
      await addToOutbox('matches', id, 'DELETE', undefined, 'offline');
    }
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
