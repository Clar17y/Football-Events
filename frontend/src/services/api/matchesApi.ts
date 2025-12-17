/**
 * Matches API Service
 * Handles all match-related API operations
 * 
 * Requirements: 2.1, 2.2, 2.3 - Offline fallback for match state operations
 */

import apiClient from './baseApi';
import { createLocalQuickMatch } from '../guestQuickMatch';
import { addToOutbox } from '../../db/utils';
import { isOnline, shouldUseOfflineFallback, getCurrentUserId } from '../../utils/network';
import { db } from '../../db/indexedDB';
import { dbToMatch, dbToMatches, dbToMatchState, dbToMatchPeriod } from '../../db/transforms';
import type { Match, MatchUpdateRequest } from '@shared/types';
import type { MatchState, MatchPeriod } from '@shared/types';
import type { EnhancedMatch, LocalMatchState, LocalMatchPeriod } from '../../db/schema';

/**
 * Show offline toast notification
 * Requirements: 4.2 - Show toast when data is saved locally
 */
function showOfflineToast(message: string): void {
  try {
    (window as any).__toastApi?.current?.showInfo?.(message);
  } catch {
    console.log('[matchesApi] Offline:', message);
  }
}


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
   * Local-first: always reads from IndexedDB
   */
  async getMatch(id: string): Promise<Match> {
    // Local-first: always read from IndexedDB
    const match = await db.matches.get(id);
    if (!match || (match as any).is_deleted) {
      throw new Error('Match not found');
    }

    // Get team info for the match
    const [homeTeam, awayTeam] = await Promise.all([
      db.teams.get((match as any).home_team_id),
      db.teams.get((match as any).away_team_id)
    ]);

    // Use centralized transform and add team data
    const baseMatch = dbToMatch(match as EnhancedMatch);
    return {
      ...baseMatch,
      homeTeam: homeTeam ? { id: homeTeam.id, name: homeTeam.name, is_opponent: !!(homeTeam as any).is_opponent } as any : undefined,
      awayTeam: awayTeam ? { id: awayTeam.id, name: awayTeam.name, is_opponent: !!(awayTeam as any).is_opponent } as any : undefined,
    };
  },
  /**
   * Quick-start a match
   */
  async quickStart(payload: QuickStartPayload): Promise<Match> {
    try {
      const response = await apiClient.post<Match>('/matches/quick-start', payload);
      const createdMatch = response.data as unknown as Match;

      // Persist server-created match (and any newly created opponent team) into IndexedDB
      // so useLiveQuery-driven screens update immediately without a manual refresh.
      try {
        const now = Date.now();
        const kickoffTs = createdMatch.kickoffTime ? new Date(createdMatch.kickoffTime as any).getTime() : now;
        const createdAtTs = (createdMatch as any).createdAt ? new Date((createdMatch as any).createdAt).getTime() : now;
        const updatedAtTs = (createdMatch as any).updatedAt ? new Date((createdMatch as any).updatedAt).getTime() : createdAtTs;
        const userId = createdMatch.created_by_user_id || getCurrentUserId();

        await db.matches.put({
          id: createdMatch.id,
          match_id: createdMatch.id,
          season_id: createdMatch.seasonId,
          kickoff_ts: kickoffTs,
          competition: createdMatch.competition,
          home_team_id: createdMatch.homeTeamId,
          away_team_id: createdMatch.awayTeamId,
          venue: createdMatch.venue,
          duration_mins: createdMatch.durationMinutes ?? 60,
          period_format: (createdMatch.periodFormat as any) || 'quarter',
          home_score: createdMatch.homeScore ?? 0,
          away_score: createdMatch.awayScore ?? 0,
          notes: createdMatch.notes,
          created_at: createdAtTs,
          updated_at: updatedAtTs,
          created_by_user_id: userId,
          is_deleted: createdMatch.is_deleted ?? false,
          synced: true,
          synced_at: now,
        } as any);

        const upsertTeam = async (team: { id: string; name?: string; is_opponent?: boolean } | undefined) => {
          if (!team?.id) return;
          const existing = await db.teams.get(team.id);

          // Avoid clobbering unsynced local edits; just ensure the name exists for display.
          if (existing && existing.synced === false) {
            if (!existing.name && team.name) {
              await db.teams.update(team.id, { name: team.name, updated_at: now } as any);
            }
            return;
          }

          await db.teams.put({
            ...existing,
            id: team.id,
            team_id: team.id,
            name: team.name ?? existing?.name ?? 'Team',
            is_opponent: team.is_opponent ?? (existing as any)?.is_opponent ?? false,
            created_at: existing?.created_at ?? now,
            updated_at: now,
            created_by_user_id: existing?.created_by_user_id ?? userId,
            is_deleted: existing?.is_deleted ?? false,
            synced: true,
            synced_at: now,
          } as any);
        };

        // Prefer any team objects if the API included them (most endpoints do, quick-start may not)
        await upsertTeam(createdMatch.homeTeam as any);
        await upsertTeam(createdMatch.awayTeam as any);

        // Ensure opponent team exists locally even if the API response omitted nested team info
        const opponentName = payload.opponentName?.trim();
        if (opponentName && createdMatch.homeTeamId && createdMatch.awayTeamId) {
          let opponentTeamId: string | undefined;
          const myTeamId = payload.myTeamId;

          if (myTeamId) {
            if (createdMatch.homeTeamId === myTeamId) opponentTeamId = createdMatch.awayTeamId;
            else if (createdMatch.awayTeamId === myTeamId) opponentTeamId = createdMatch.homeTeamId;
          }

          // Fallback to the user's explicit home/away selection if myTeamId isn't usable.
          if (!opponentTeamId) {
            opponentTeamId = payload.isHome ? createdMatch.awayTeamId : createdMatch.homeTeamId;
          }

          await upsertTeam({ id: opponentTeamId, name: opponentName, is_opponent: true });
        }

        try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }
      } catch (persistErr) {
        console.warn('[matchesApi] Failed to persist quick-start result to IndexedDB:', persistErr);
      }

      return createdMatch;
    } catch (e) {
      // Authenticated but offline: create locally and enqueue quick-start outbox
      const local = await createLocalQuickMatch(payload as any);
      await addToOutbox('matches', local.id, 'INSERT', { ...payload, quickStart: true } as any, 'offline');
      return (await import('../../services/guestQuickMatch')).getLocalMatch(local.id) as unknown as Match;
    }
  },
  /**
   * Get matches by season ID
   * Local-first: always reads from IndexedDB
   */
  async getMatchesBySeason(seasonId: string): Promise<Match[]> {
    // Local-first: always read from IndexedDB
    const matches = await db.matches
      .where('season_id')
      .equals(seasonId)
      .filter((m: any) => !m.is_deleted)
      .toArray();
    return dbToMatches(matches as EnhancedMatch[]);
  },

  /**
   * Get matches by team ID
   * Local-first: always reads from IndexedDB
   */
  async getMatchesByTeam(teamId: string): Promise<Match[]> {
    // Local-first: always read from IndexedDB
    const matches = await db.matches
      .filter((m: any) => !m.is_deleted && (m.home_team_id === teamId || m.away_team_id === teamId))
      .toArray();
    return dbToMatches(matches as EnhancedMatch[]);
  },

  /**
   * Get paginated list of matches with optional filtering
   * Local-first: always reads from IndexedDB
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
    
    // Local-first: always read from IndexedDB
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
      const baseMatch = dbToMatch(m as EnhancedMatch);
      return {
        ...baseMatch,
        homeTeam: home ? { id: home.id, name: home.name, is_opponent: !!home.is_opponent, createdAt: new Date(home.created_at), created_by_user_id: home.created_by_user_id, is_deleted: !!home.is_deleted } as any : undefined,
        awayTeam: away ? { id: away.id, name: away.name, is_opponent: !!away.is_opponent, createdAt: new Date(away.created_at), created_by_user_id: away.created_by_user_id, is_deleted: !!away.is_deleted } as any : undefined,
      };
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
  },

  /**
   * Upcoming matches
   * Local-first: always reads from IndexedDB
   */
  async getUpcoming(limit: number = 10, teamId?: string): Promise<Match[]> {
    // Local-first: always read from IndexedDB
    const teams = await db.teams.toArray();
    const teamMap = new Map<string, any>(teams.map((t: any) => [t.id, t]));
    let rows = await db.matches.toArray();
    const now = Date.now();
    rows = rows.filter((m: any) => !m.is_deleted && new Date(m.kickoff_ts).getTime() >= now);
    if (teamId) rows = rows.filter((m: any) => m.home_team_id === teamId || m.away_team_id === teamId);
    rows.sort((a: any, b: any) => new Date(a.kickoff_ts).getTime() - new Date(b.kickoff_ts).getTime());
    return rows.slice(0, limit).map((m: any) => {
      const baseMatch = dbToMatch(m as EnhancedMatch);
      return {
        ...baseMatch,
        homeTeam: teamMap.get(m.home_team_id) ? { id: m.home_team_id, name: teamMap.get(m.home_team_id).name, is_opponent: !!teamMap.get(m.home_team_id).is_opponent } as any : undefined,
        awayTeam: teamMap.get(m.away_team_id) ? { id: m.away_team_id, name: teamMap.get(m.away_team_id).name, is_opponent: !!teamMap.get(m.away_team_id).is_opponent } as any : undefined,
      };
    });
  },

  /**
   * Recent matches
   * Local-first: always reads from IndexedDB
   */
  async getRecent(limit: number = 10, teamId?: string): Promise<Match[]> {
    // Local-first: always read from IndexedDB
    const teams = await db.teams.toArray();
    const teamMap = new Map<string, any>(teams.map((t: any) => [t.id, t]));
    let rows = await db.matches.toArray();
    const now = Date.now();
    rows = rows.filter((m: any) => !m.is_deleted && new Date(m.kickoff_ts).getTime() < now);
    if (teamId) rows = rows.filter((m: any) => m.home_team_id === teamId || m.away_team_id === teamId);
    rows.sort((a: any, b: any) => new Date(b.kickoff_ts).getTime() - new Date(a.kickoff_ts).getTime());
    return rows.slice(0, limit).map((m: any) => {
      const baseMatch = dbToMatch(m as EnhancedMatch);
      return {
        ...baseMatch,
        homeTeam: teamMap.get(m.home_team_id) ? { id: m.home_team_id, name: teamMap.get(m.home_team_id).name, is_opponent: !!teamMap.get(m.home_team_id).is_opponent } as any : undefined,
        awayTeam: teamMap.get(m.away_team_id) ? { id: m.away_team_id, name: teamMap.get(m.away_team_id).name, is_opponent: !!teamMap.get(m.away_team_id).is_opponent } as any : undefined,
      };
    });
  },

  /**
   * Update an existing match - LOCAL-FIRST
   */
  async updateMatch(id: string, matchData: MatchUpdateRequest): Promise<Match> {
    const { matchesDataLayer } = await import('../dataLayer');

    const cleanData = Object.fromEntries(
      Object.entries(matchData).filter(([_, value]) => value !== undefined)
    );

    await matchesDataLayer.update(id, {
      seasonId: cleanData.seasonId,
      kickoffTime: cleanData.kickoffTime,
      homeTeamId: cleanData.homeTeamId,
      awayTeamId: cleanData.awayTeamId,
      competition: cleanData.competition,
      venue: cleanData.venue,
      durationMinutes: cleanData.durationMinutes,
      periodFormat: cleanData.periodFormat,
      notes: cleanData.notes,
    });

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    // Return the updated local match
    return (await import('../../services/guestQuickMatch')).getLocalMatch(id) as unknown as Match;
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
  /**
   * Start a match with offline fallback
   * 
   * Requirements: 2.1 - Create local match_state with status LIVE and first match_period record
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async startMatch(id: string): Promise<MatchState> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<MatchState>(`/matches/${id}/start`);
        return response.data as unknown as MatchState;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: create local match_state with status LIVE
    const now = Date.now();
    const userId = getCurrentUserId();
    const periodId = `period-${now}-${Math.random().toString(36).slice(2, 11)}`;

    // Check if match_state already exists
    const existingState = await db.match_state.get(id);

    if (existingState) {
      // Update existing state to LIVE
      await db.match_state.update(id, {
        status: 'LIVE',
        current_period_id: periodId,
        timer_ms: 0,
        last_updated_at: now,
        updated_at: now,
        synced: false,
      });
    } else {
      // Create new match_state
      const localState: LocalMatchState = {
        match_id: id,
        status: 'LIVE',
        current_period_id: periodId,
        timer_ms: 0,
        last_updated_at: now,
        created_at: now,
        updated_at: now,
        created_by_user_id: userId,
        is_deleted: false,
        synced: false,
      };
      await db.match_state.add(localState);
    }

    // Create first match_period record
    const localPeriod: LocalMatchPeriod = {
      id: periodId,
      match_id: id,
      period_number: 1,
      period_type: 'REGULAR',
      started_at: now,
      created_at: now,
      updated_at: now,
      created_by_user_id: userId,
      is_deleted: false,
      synced: false,
    };
    await db.match_periods.add(localPeriod);

    showOfflineToast('Match started locally - will sync when online');

    // Return the updated state
    const updatedState = await db.match_state.get(id);
    if (!updatedState) {
      throw new Error(`Failed to retrieve match state for ${id}`);
    }
    return dbToMatchState(updatedState);
  },
  /**
   * Pause a match with offline fallback
   * 
   * Requirements: 2.2 - Update local match_state to PAUSED
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async pauseMatch(id: string): Promise<MatchState> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<MatchState>(`/matches/${id}/pause`);
        return response.data as unknown as MatchState;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local match_state to PAUSED
    const now = Date.now();
    const existingState = await db.match_state.get(id);

    if (!existingState) {
      throw new Error(`Match state not found for match ${id}`);
    }

    await db.match_state.update(id, {
      status: 'PAUSED',
      last_updated_at: now,
      updated_at: now,
      synced: false,
    });

    showOfflineToast('Match paused locally - will sync when online');

    const updatedState = await db.match_state.get(id);
    if (!updatedState) {
      throw new Error(`Failed to retrieve match state for ${id}`);
    }
    return dbToMatchState(updatedState);
  },
  /**
   * Resume a match with offline fallback
   * 
   * Requirements: 2.2 - Update local match_state to LIVE
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async resumeMatch(id: string): Promise<MatchState> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<MatchState>(`/matches/${id}/resume`);
        return response.data as unknown as MatchState;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local match_state to LIVE
    const now = Date.now();
    const existingState = await db.match_state.get(id);

    if (!existingState) {
      throw new Error(`Match state not found for match ${id}`);
    }

    await db.match_state.update(id, {
      status: 'LIVE',
      last_updated_at: now,
      updated_at: now,
      synced: false,
    });

    showOfflineToast('Match resumed locally - will sync when online');

    const updatedState = await db.match_state.get(id);
    if (!updatedState) {
      throw new Error(`Failed to retrieve match state for ${id}`);
    }
    return dbToMatchState(updatedState);
  },
  /**
   * Complete a match with offline fallback
   * 
   * Requirements: 2.3 - Update local match_state to COMPLETED and end any open periods
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async completeMatch(id: string, finalScore?: { home: number; away: number }, notes?: string): Promise<MatchState> {
    const body: any = {};
    if (finalScore) body.finalScore = finalScore;
    if (notes) body.notes = notes;

    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<MatchState>(`/matches/${id}/complete`, body);
        return response.data as unknown as MatchState;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local match_state to COMPLETED
    const now = Date.now();
    const existingState = await db.match_state.get(id);

    if (!existingState) {
      throw new Error(`Match state not found for match ${id}`);
    }

    // End any open periods (periods without ended_at)
    const openPeriods = await db.match_periods
      .where('match_id')
      .equals(id)
      .filter(p => !p.ended_at && !p.is_deleted)
      .toArray();

    for (const period of openPeriods) {
      const durationSeconds = period.started_at
        ? Math.floor((now - period.started_at) / 1000)
        : 0;
      await db.match_periods.update(period.id, {
        ended_at: now,
        duration_seconds: durationSeconds,
        updated_at: now,
        synced: false,
      });
    }

    // Update match_state to COMPLETED
    await db.match_state.update(id, {
      status: 'COMPLETED',
      current_period_id: undefined,
      last_updated_at: now,
      updated_at: now,
      synced: false,
    });

    // Update match scores if provided
    if (finalScore) {
      try {
        await db.matches.update(id, {
          home_score: finalScore.home,
          away_score: finalScore.away,
          updated_at: now,
          synced: false,
        } as any);
      } catch {
        // Match might not exist locally, ignore
      }
    }

    showOfflineToast('Match completed locally - will sync when online');

    const updatedState = await db.match_state.get(id);
    if (!updatedState) {
      throw new Error(`Failed to retrieve match state for ${id}`);
    }
    return dbToMatchState(updatedState);
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
   * Local-first: always reads from IndexedDB
   */
  async getMatchStates(page = 1, limit = 500, matchIds?: string[]): Promise<{ data: Array<MatchState & { matchId: string }>; pagination?: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } }> {
    // Local-first: always read from IndexedDB
    let states = await db.match_state.toArray();
    
    // Filter by matchIds if provided
    if (matchIds && matchIds.length) {
      const matchIdSet = new Set(matchIds);
      states = states.filter((s: any) => matchIdSet.has(s.match_id));
    }
    
    // Filter out deleted
    states = states.filter((s: any) => !s.is_deleted);
    
    const total = states.length;
    const start = (page - 1) * limit;
    const paged = states.slice(start, start + limit);
    
    const data = paged.map((s: any) => dbToMatchState(s));
    
    return {
      data: data as any,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
        hasNext: start + limit < total,
        hasPrev: start > 0
      }
    };
  },
  /**
   * Start a new period with offline fallback
   * 
   * Requirements: 2.1 - Create local match_periods record
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async startPeriod(id: string, periodType?: 'regular' | 'extra_time' | 'penalty_shootout'): Promise<MatchPeriod> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<MatchPeriod>(`/matches/${id}/periods/start`, periodType ? { periodType } : undefined);
        return response.data as unknown as MatchPeriod;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: create local match_periods record
    const now = Date.now();
    const userId = getCurrentUserId();
    const periodId = `period-${now}-${Math.random().toString(36).slice(2, 11)}`;

    // Get the next period number
    const existingPeriods = await db.match_periods
      .where('match_id')
      .equals(id)
      .filter(p => !p.is_deleted)
      .toArray();
    const nextPeriodNumber = existingPeriods.length + 1;

    // Map period type to uppercase format
    const mappedPeriodType: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' =
      periodType === 'extra_time' ? 'EXTRA_TIME' :
        periodType === 'penalty_shootout' ? 'PENALTY_SHOOTOUT' :
          'REGULAR';

    const localPeriod: LocalMatchPeriod = {
      id: periodId,
      match_id: id,
      period_number: nextPeriodNumber,
      period_type: mappedPeriodType,
      started_at: now,
      created_at: now,
      updated_at: now,
      created_by_user_id: userId,
      is_deleted: false,
      synced: false,
    };
    await db.match_periods.add(localPeriod);

    // Update match_state with current period
    const existingState = await db.match_state.get(id);
    if (existingState) {
      await db.match_state.update(id, {
        current_period_id: periodId,
        status: 'LIVE',
        last_updated_at: now,
        updated_at: now,
        synced: false,
      });
    }

    showOfflineToast('Period started locally - will sync when online');

    return dbToMatchPeriod(localPeriod);
  },
  /**
   * End a period with offline fallback
   * 
   * Requirements: 2.1 - Update local match_periods with ended_at
   * Requirements: 6.1 - Fall back to local storage on network error
   */
  async endPeriod(id: string, periodId: string, payload?: { reason?: string; actualDurationSeconds?: number }): Promise<MatchPeriod> {
    // Try server first if online
    if (isOnline()) {
      try {
        const response = await apiClient.post<MatchPeriod>(`/matches/${id}/periods/${periodId}/end`, payload || {});
        return response.data as unknown as MatchPeriod;
      } catch (error) {
        // If not a network error, re-throw (e.g., 400, 401, 403)
        if (!shouldUseOfflineFallback(error)) {
          throw error;
        }
        // Fall through to offline handling for network errors
      }
    }

    // Offline fallback: update local match_periods with ended_at
    const now = Date.now();
    const existingPeriod = await db.match_periods.get(periodId);

    if (!existingPeriod) {
      throw new Error(`Period ${periodId} not found`);
    }

    // Calculate duration
    const durationSeconds = payload?.actualDurationSeconds ??
      (existingPeriod.started_at ? Math.floor((now - existingPeriod.started_at) / 1000) : 0);

    await db.match_periods.update(periodId, {
      ended_at: now,
      duration_seconds: durationSeconds,
      updated_at: now,
      synced: false,
    });

    // Update match_state to clear current period
    const existingState = await db.match_state.get(id);
    if (existingState && existingState.current_period_id === periodId) {
      await db.match_state.update(id, {
        current_period_id: undefined,
        last_updated_at: now,
        updated_at: now,
        synced: false,
      });
    }

    showOfflineToast('Period ended locally - will sync when online');

    const updatedPeriod = await db.match_periods.get(periodId);
    if (!updatedPeriod) {
      throw new Error(`Failed to retrieve period ${periodId}`);
    }
    return dbToMatchPeriod(updatedPeriod);
  },
  /**
   * Delete a match (soft delete) - LOCAL-FIRST
   */
  async deleteMatch(id: string): Promise<void> {
    const { matchesDataLayer } = await import('../dataLayer');
    await matchesDataLayer.delete(id);

    // Clean up orphaned live state
    try {
      await db.settings.delete(`local_live_state:${id}`);
    } catch { }

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }
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
