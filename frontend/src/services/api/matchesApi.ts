/**
 * Matches API Service
 * Handles all match-related API operations
 * 
 * Requirements: 2.1, 2.2, 2.3 - Offline fallback for match state operations
 */

import apiClient from './baseApi';
import { isOnline, shouldUseOfflineFallback, getCurrentUserId } from '../../utils/network';
import { db } from '../../db/indexedDB';
import { dbToMatch, dbToMatches, dbToMatchState, dbToMatchPeriod } from '../../db/transforms';
import type { Match, MatchUpdateRequest } from '@shared/types';
import type { MatchState, MatchPeriod } from '@shared/types';
import type { DbMatch, DbMatchState, DbMatchPeriod } from '../../db/schema';
import { teamsDataLayer, seasonsDataLayer, matchesDataLayer } from '../dataLayer';

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
   * Quick-start a match - LOCAL-FIRST
   * 
   * This method follows the local-first architecture:
   * 1. Creates opponent team (if needed) in IndexedDB with synced: false
   * 2. Creates/finds season in IndexedDB with synced: false
   * 3. Creates match in IndexedDB with synced: false
   * 4. Returns immediately - syncService handles server sync
   * 
   * Requirements: Local-first architecture - all writes go to IndexedDB first
   */
  async quickStart(payload: QuickStartPayload): Promise<Match> {
    const userId = getCurrentUserId();

    // 1) Ensure season exists (use provided or find/create default)
    let seasonId = payload.seasonId;
    if (!seasonId) {
      // Try to find an existing current season
      const allSeasons = await db.seasons.filter(s => !s.isDeleted).toArray();
      const currentSeason = allSeasons.find(s => s.isCurrent);

      if (currentSeason) {
        seasonId = currentSeason.id;
      } else {
        // Create a default season for the current year
        const year = new Date().getFullYear();
        const seasonLabel = `${year}-${year + 1} Season`;

        // Check if a season with this label already exists
        const existingSeason = allSeasons.find(s => s.label === seasonLabel);
        if (existingSeason) {
          seasonId = existingSeason.id;
        } else {
          const newSeason = await seasonsDataLayer.create({
            label: seasonLabel,
            startDate: `${year}-08-01`,
            endDate: `${year + 1}-07-31`,
            isCurrent: true,
            description: 'Auto-created season',
          });
          seasonId = newSeason.id;
        }
      }
    }

    // 2) Ensure our team exists (use provided id or find by name)
    let ourTeamId = payload.myTeamId;
    if (!ourTeamId && payload.myTeamName) {
      // Search by name
      const existingTeam = await db.teams
        .filter(t => !t.isDeleted && t.name === payload.myTeamName)
        .first();

      if (existingTeam) {
        ourTeamId = existingTeam.id;
      } else {
        const newTeam = await teamsDataLayer.create({
          name: payload.myTeamName,
          isOpponent: false,
        });
        ourTeamId = newTeam.id;
      }
    }

    if (!ourTeamId) {
      // Fallback: create a default team
      const newTeam = await teamsDataLayer.create({
        name: 'My Team',
        isOpponent: false,
      });
      ourTeamId = newTeam.id;
    }

    // 3) Ensure opponent team exists (by name)
    const opponentName = payload.opponentName?.trim() || 'Opponent';
    let opponentTeam = await db.teams
      .filter(t => !t.isDeleted && t.name === opponentName && t.isOpponent === true)
      .first();

    if (!opponentTeam) {
      // Also check for any team with this name (might not be marked as opponent yet)
      opponentTeam = await db.teams
        .filter(t => !t.isDeleted && t.name === opponentName)
        .first();
    }

    if (!opponentTeam) {
      opponentTeam = await teamsDataLayer.create({
        name: opponentName,
        isOpponent: true,
      });
    }

    // 4) Determine home/away team IDs
    const homeTeamId = payload.isHome ? ourTeamId : opponentTeam.id;
    const awayTeamId = payload.isHome ? opponentTeam.id : ourTeamId;

    // 5) Create the match locally
    const kickoffTime = payload.kickoffTime || new Date().toISOString();
    const match = await matchesDataLayer.create({
      seasonId,
      kickoffTime,
      homeTeamId,
      awayTeamId,
      competition: payload.competition,
      venue: payload.venue,
      durationMinutes: payload.durationMinutes ?? 60,
      periodFormat: (payload.periodFormat === 'quarter' || payload.periodFormat === 'half')
        ? payload.periodFormat
        : 'quarter',
      notes: payload.notes,
    });

    // 6) Return the match with team info for immediate UI update
    const homeTeam = await db.teams.get(homeTeamId);
    const awayTeam = await db.teams.get(awayTeamId);

    const result: Match = {
      id: match.id,
      seasonId: match.seasonId,
      kickoffTime: match.kickoffTime,
      competition: match.competition,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      venue: match.venue,
      durationMinutes: match.durationMinutes ?? 60,
      periodFormat: match.periodFormat as any,
      homeScore: match.homeScore ?? 0,
      awayScore: match.awayScore ?? 0,
      notes: match.notes,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      createdByUserId: match.createdByUserId,
      isDeleted: match.isDeleted ?? false,
      homeTeam: homeTeam ? {
        id: homeTeam.id,
        name: homeTeam.name,
        isOpponent: homeTeam.isOpponent ?? false,
        createdAt: homeTeam.createdAt,
        createdByUserId: homeTeam.createdByUserId,
        isDeleted: homeTeam.isDeleted ?? false,
      } as any : undefined,
      awayTeam: awayTeam ? {
        id: awayTeam.id,
        name: awayTeam.name,
        isOpponent: awayTeam.isOpponent ?? false,
        createdAt: awayTeam.createdAt,
        createdByUserId: awayTeam.createdByUserId,
        isDeleted: awayTeam.isDeleted ?? false,
      } as any : undefined,
    };

    // Trigger data:changed event for any listeners
    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return result;
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
    return this.getMatch(id);
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
   * Start a match - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first. Background sync handles server communication.
   */
  async startMatch(id: string): Promise<MatchState> {
    // Local-first: write to IndexedDB first
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
    await db.matchPeriods.put(localPeriod);

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    // Return the updated state
    const updatedState = await db.matchState.get(id);
    if (!updatedState) {
      throw new Error(`Failed to retrieve match state for ${id}`);
    }
    return dbToMatchState(updatedState);
  },
  /**
   * Pause a match - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first. Background sync handles server communication.
   */
  async pauseMatch(id: string): Promise<MatchState> {
    // Local-first: update local match_state to PAUSED
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

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    const updatedState = await db.matchState.get(id);
    if (!updatedState) {
      throw new Error(`Failed to retrieve match state for ${id}`);
    }
    return dbToMatchState(updatedState);
  },
  /**
   * Resume a match - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first. Background sync handles server communication.
   */
  async resumeMatch(id: string): Promise<MatchState> {
    // Local-first: update local match_state to LIVE
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

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    const updatedState = await db.matchState.get(id);
    if (!updatedState) {
      throw new Error(`Failed to retrieve match state for ${id}`);
    }
    return dbToMatchState(updatedState);
  },
  /**
   * Complete a match - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first. Background sync handles server communication.
   */
  async completeMatch(id: string, finalScore?: { home: number; away: number }, notes?: string): Promise<MatchState> {
    // Local-first: update local match_state to COMPLETED
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

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

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
   * Start a new period - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first. Background sync handles server communication.
   */
  async startPeriod(id: string, periodType?: 'regular' | 'extra_time' | 'penalty_shootout'): Promise<MatchPeriod> {
    // Local-first: create local match_periods record
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

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

    return dbToMatchPeriod(localPeriod);
  },
  /**
   * End a period - LOCAL-FIRST
   * 
   * All writes go to IndexedDB first. Background sync handles server communication.
   */
  async endPeriod(id: string, periodId: string, payload?: { reason?: string; actualDurationSeconds?: number }): Promise<MatchPeriod> {
    // Local-first: update local match_periods with endedAt
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

    try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }

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
