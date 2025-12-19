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
import type { DbMatch, DbMatchState, DbMatchPeriod } from '../../db/schema';

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
    if (!match || (match as any).isDeleted) {
      throw new Error('Match not found');
    }

    // Get team info for the match
    const [homeTeam, awayTeam] = await Promise.all([
      db.teams.get((match as any).homeTeamId),
      db.teams.get((match as any).awayTeamId)
    ]);

    // Use centralized transform and add team data
    const baseMatch = dbToMatch(match as DbMatch);
    return {
      ...baseMatch,
      homeTeam: homeTeam ? { id: homeTeam.id, name: homeTeam.name, isOpponent: !!(homeTeam as any).isOpponent } as any : undefined,
      awayTeam: awayTeam ? { id: awayTeam.id, name: awayTeam.name, isOpponent: !!(awayTeam as any).isOpponent } as any : undefined,
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
        const userId = (createdMatch as any).createdByUserId || getCurrentUserId();

        await db.matches.put({
          id: createdMatch.id,
          matchId: createdMatch.id,
          seasonId: createdMatch.seasonId,
          kickoffTime: createdMatch.kickoffTime,
          competition: createdMatch.competition,
          homeTeamId: createdMatch.homeTeamId,
          awayTeamId: createdMatch.awayTeamId,
          venue: createdMatch.venue,
          durationMins: createdMatch.durationMinutes ?? 60,
          periodFormat: (createdMatch.periodFormat as any) || 'quarter',
          homeScore: createdMatch.homeScore ?? 0,
          awayScore: createdMatch.awayScore ?? 0,
          notes: createdMatch.notes,
          createdAt: createdAtTs,
          updatedAt: updatedAtTs,
          createdByUserId: userId,
          isDeleted: (createdMatch as any).isDeleted ?? false,
          synced: true,
          syncedAt: now,
        } as any);

        const upsertTeam = async (team: { id: string; name?: string; isOpponent?: boolean } | undefined) => {
          if (!team?.id) return;
          const existing = await db.teams.get(team.id);

          // Avoid clobbering unsynced local edits; just ensure the name exists for display.
          if (existing && existing.synced === false) {
            if (!existing.name && team.name) {
              await db.teams.update(team.id, { name: team.name, updatedAt: now } as any);
            }
            return;
          }

          await db.teams.put({
            ...existing,
            id: team.id,
            teamId: team.id,
            name: team.name ?? existing?.name ?? 'Team',
            isOpponent: team.isOpponent ?? (existing as any)?.isOpponent ?? false,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            createdByUserId: existing?.createdByUserId ?? userId,
            isDeleted: existing?.isDeleted ?? false,
            synced: true,
            syncedAt: now,
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

          await upsertTeam({ id: opponentTeamId, name: opponentName, isOpponent: true });
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
      .where('seasonId')
      .equals(seasonId)
      .filter((m: any) => !m.isDeleted)
      .toArray();
    return dbToMatches(matches as DbMatch[]);
  },

  /**
   * Get matches by team ID
   * Local-first: always reads from IndexedDB
   */
  async getMatchesByTeam(teamId: string): Promise<Match[]> {
    // Local-first: always read from IndexedDB
    const matches = await db.matches
      .filter((m: any) => !m.isDeleted && (m.homeTeamId === teamId || m.awayTeamId === teamId))
      .toArray();
    return dbToMatches(matches as DbMatch[]);
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
    rows = rows.filter((m: any) => m && !m.isDeleted);
    if (seasonId) rows = rows.filter((m: any) => m.seasonId === seasonId);
    if (teamId) rows = rows.filter((m: any) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    if (competition) rows = rows.filter((m: any) => (m.competition || '').toLowerCase().includes(competition.toLowerCase()));
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((m: any) => {
        const home = teamMap.get(m.homeTeamId);
        const away = teamMap.get(m.awayTeamId);
        return (
          (m.competition || '').toLowerCase().includes(term) ||
          (home?.name || '').toLowerCase().includes(term) ||
          (away?.name || '').toLowerCase().includes(term)
        );
      });
    }
    rows.sort((a: any, b: any) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());
    const total = rows.length;
    const start = (page - 1) * limit;
    const paged = rows.slice(start, start + limit);
    const data: Match[] = paged.map((m: any) => {
      const home = teamMap.get(m.homeTeamId);
      const away = teamMap.get(m.awayTeamId);
      const baseMatch = dbToMatch(m as DbMatch);
      return {
        ...baseMatch,
        homeTeam: home ? { id: home.id, name: home.name, isOpponent: !!home.isOpponent, createdAt: new Date(home.createdAt), createdByUserId: home.createdByUserId, isDeleted: !!home.isDeleted } as any : undefined,
        awayTeam: away ? { id: away.id, name: away.name, isOpponent: !!away.isOpponent, createdAt: new Date(away.createdAt), createdByUserId: away.createdByUserId, isDeleted: !!away.isDeleted } as any : undefined,
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
    rows = rows.filter((m: any) => !m.isDeleted && new Date(m.kickoffTime).getTime() >= now);
    if (teamId) rows = rows.filter((m: any) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    rows.sort((a: any, b: any) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime());
    return rows.slice(0, limit).map((m: any) => {
      const baseMatch = dbToMatch(m as DbMatch);
      return {
        ...baseMatch,
        homeTeam: teamMap.get(m.homeTeamId) ? { id: m.homeTeamId, name: teamMap.get(m.homeTeamId).name, isOpponent: !!teamMap.get(m.homeTeamId).isOpponent } as any : undefined,
        awayTeam: teamMap.get(m.awayTeamId) ? { id: m.awayTeamId, name: teamMap.get(m.awayTeamId).name, isOpponent: !!teamMap.get(m.awayTeamId).isOpponent } as any : undefined,
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
    rows = rows.filter((m: any) => !m.isDeleted && new Date(m.kickoffTime).getTime() < now);
    if (teamId) rows = rows.filter((m: any) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    rows.sort((a: any, b: any) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime());
    return rows.slice(0, limit).map((m: any) => {
      const baseMatch = dbToMatch(m as DbMatch);
      return {
        ...baseMatch,
        homeTeam: teamMap.get(m.homeTeamId) ? { id: m.homeTeamId, name: teamMap.get(m.homeTeamId).name, isOpponent: !!teamMap.get(m.homeTeamId).isOpponent } as any : undefined,
        awayTeam: teamMap.get(m.awayTeamId) ? { id: m.awayTeamId, name: teamMap.get(m.awayTeamId).name, isOpponent: !!teamMap.get(m.awayTeamId).isOpponent } as any : undefined,
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
    const existingState = await db.matchState.get(id);

    if (existingState) {
      // Update existing state to LIVE
      await db.matchState.update(id, {
        status: 'LIVE',
        currentPeriodId: periodId,
        timerMs: 0,
        lastUpdatedAt: now,
        updatedAt: new Date(now).toISOString(),
        synced: false,
      });
    } else {
      // Create new match_state
      const localState: DbMatchState = {
        matchId: id,
        status: 'LIVE',
        currentPeriodId: periodId,
        timerMs: 0,
        lastUpdatedAt: now,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
      };
      await db.matchState.add(localState);
    }

    // Create first match_period record
    const localPeriod: DbMatchPeriod = {
      id: periodId,
      matchId: id,
      periodNumber: 1,
      periodType: 'REGULAR',
      startedAt: now,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      createdByUserId: userId,
      isDeleted: false,
      synced: false,
    };
    await db.matchPeriods.add(localPeriod);

    showOfflineToast('Match started locally - will sync when online');

    // Return the updated state
    const updatedState = await db.matchState.get(id);
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
    const existingState = await db.matchState.get(id);

    if (!existingState) {
      throw new Error(`Match state not found for match ${id}`);
    }

    await db.matchState.update(id, {
      status: 'PAUSED',
      lastUpdatedAt: now,
      updatedAt: new Date(now).toISOString(),
      synced: false,
    });

    showOfflineToast('Match paused locally - will sync when online');

    const updatedState = await db.matchState.get(id);
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
    const existingState = await db.matchState.get(id);

    if (!existingState) {
      throw new Error(`Match state not found for match ${id}`);
    }

    await db.matchState.update(id, {
      status: 'LIVE',
      lastUpdatedAt: now,
      updatedAt: new Date(now).toISOString(),
      synced: false,
    });

    showOfflineToast('Match resumed locally - will sync when online');

    const updatedState = await db.matchState.get(id);
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
    const existingState = await db.matchState.get(id);

    if (!existingState) {
      throw new Error(`Match state not found for match ${id}`);
    }

    // End any open periods (periods without endedAt)
    const openPeriods = await db.matchPeriods
      .where('matchId')
      .equals(id)
      .filter(p => !p.endedAt && !p.isDeleted)
      .toArray();

    for (const period of openPeriods) {
      const durationSeconds = period.startedAt
        ? Math.floor((now - period.startedAt) / 1000)
        : 0;
      await db.matchPeriods.update(period.id, {
        endedAt: now,
        durationSeconds: durationSeconds,
        updatedAt: new Date(now).toISOString(),
        synced: false,
      });
    }

    // Update match_state to COMPLETED
    await db.matchState.update(id, {
      status: 'COMPLETED',
      currentPeriodId: undefined,
      lastUpdatedAt: now,
      updatedAt: new Date(now).toISOString(),
      synced: false,
    });

    // Update match scores if provided
    if (finalScore) {
      try {
        await db.matches.update(id, {
          homeScore: finalScore.home,
          awayScore: finalScore.away,
          updatedAt: new Date(now).toISOString(),
          synced: false,
        } as any);
      } catch {
        // Match might not exist locally, ignore
      }
    }

    showOfflineToast('Match completed locally - will sync when online');

    const updatedState = await db.matchState.get(id);
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
    let states = await db.matchState.toArray();

    // Filter by matchIds if provided
    if (matchIds && matchIds.length) {
      const matchIdSet = new Set(matchIds);
      states = states.filter((s: any) => matchIdSet.has(s.matchId));
    }

    // Filter out deleted
    states = states.filter((s: any) => !s.isDeleted);

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
    const existingPeriods = await db.matchPeriods
      .where('matchId')
      .equals(id)
      .filter(p => !p.isDeleted)
      .toArray();
    const nextPeriodNumber = existingPeriods.length + 1;

    // Map period type to uppercase format
    const mappedPeriodType: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' =
      periodType === 'extra_time' ? 'EXTRA_TIME' :
        periodType === 'penalty_shootout' ? 'PENALTY_SHOOTOUT' :
          'REGULAR';

    const localPeriod: DbMatchPeriod = {
      id: periodId,
      matchId: id,
      periodNumber: nextPeriodNumber,
      periodType: mappedPeriodType,
      startedAt: now,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      createdByUserId: userId,
      isDeleted: false,
      synced: false,
    };
    await db.matchPeriods.add(localPeriod);

    // Update match_state with current period
    const existingState = await db.matchState.get(id);
    if (existingState) {
      await db.matchState.update(id, {
        currentPeriodId: periodId,
        status: 'LIVE',
        lastUpdatedAt: now,
        updatedAt: new Date(now).toISOString(),
        synced: false,
      });
    }

    showOfflineToast('Period started locally - will sync when online');

    return dbToMatchPeriod(localPeriod);
  },
  /**
   * End a period with offline fallback
   * 
   * Requirements: 2.1 - Update local matchPeriods with endedAt
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

    // Offline fallback: update local match_periods with endedAt
    const now = Date.now();
    const existingPeriod = await db.matchPeriods.get(periodId);

    if (!existingPeriod) {
      throw new Error(`Period ${periodId} not found`);
    }

    // Calculate duration
    const durationSeconds = payload?.actualDurationSeconds ??
      (existingPeriod.startedAt ? Math.floor((now - existingPeriod.startedAt) / 1000) : 0);

    await db.matchPeriods.update(periodId, {
      endedAt: now,
      durationSeconds: durationSeconds,
      updatedAt: new Date(now).toISOString(),
      synced: false,
    });

    // Update match_state to clear current period
    const existingState = await db.matchState.get(id);
    if (existingState && existingState.currentPeriodId === periodId) {
      await db.matchState.update(id, {
        currentPeriodId: undefined,
        lastUpdatedAt: now,
        updatedAt: new Date(now).toISOString(),
        synced: false,
      });
    }

    showOfflineToast('Period ended locally - will sync when online');

    const updatedPeriod = await db.matchPeriods.get(periodId);
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
