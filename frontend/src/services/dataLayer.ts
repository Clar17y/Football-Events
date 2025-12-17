/**
 * Data Layer Service - Local-First Architecture
 * 
 * This is the core data layer for local-first operations. All data writes
 * go through this service to ensure consistent handling:
 * - All writes go to IndexedDB first with synced: false
 * - Background sync handles server communication
 * - UI reads reactively from IndexedDB via useLiveQuery hooks
 */

import { db } from '../db/indexedDB';
import { getGuestId, isGuest } from '../utils/guest';
import { getCurrentUserId } from '../utils/network';
import type {
    EnhancedTeam,
    EnhancedPlayer,
    EnhancedSeason,
    EnhancedMatch,
    EnhancedEvent,
    EnhancedLineup,
    LocalMatchPeriod,
    LocalMatchState,
    LocalDefaultLineup
} from '../db/schema';

/**
 * Get the current user ID (authenticated or guest)
 */
function getUserId(): string {
    if (isGuest()) {
        return getGuestId();
    }
    return getCurrentUserId();
}

/**
 * Generate a UUID for new records
 */
function generateId(): string {
    return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Create common fields for new records
 */
function createCommonFields() {
    const now = Date.now();
    return {
        created_at: now,
        updated_at: now,
        created_by_user_id: getUserId(),
        is_deleted: false,
        synced: false,
    };
}

/**
 * Create update fields for existing records
 */
function updateFields() {
    return {
        updated_at: Date.now(),
        synced: false,
    };
}

/**
 * Trigger background sync after writes (non-blocking)
 */
async function triggerSync(): Promise<void> {
    try {
        // Dispatch event for sync service to pick up
        window.dispatchEvent(new CustomEvent('data:changed'));
    } catch {
        // Ignore errors in non-browser environments
    }
}

// ============================================================================
// TEAMS
// ============================================================================

export const teamsDataLayer = {
    async create(data: {
        name: string;
        homeKitPrimary?: string;
        homeKitSecondary?: string;
        awayKitPrimary?: string;
        awayKitSecondary?: string;
        logoUrl?: string;
        isOpponent?: boolean;
    }): Promise<EnhancedTeam> {
        const id = generateId();
        const team: EnhancedTeam = {
            id,
            team_id: id,
            name: data.name,
            color_primary: data.homeKitPrimary,
            color_secondary: data.homeKitSecondary,
            away_color_primary: data.awayKitPrimary,
            away_color_secondary: data.awayKitSecondary,
            logo_url: data.logoUrl,
            is_opponent: data.isOpponent ?? false,
            ...createCommonFields(),
        } as EnhancedTeam;

        await db.teams.add(team);
        triggerSync();
        return team;
    },

    async update(id: string, data: Partial<{
        name: string;
        homeKitPrimary: string;
        homeKitSecondary: string;
        awayKitPrimary: string;
        awayKitSecondary: string;
        logoUrl: string;
        isOpponent: boolean;
    }>): Promise<void> {
        const updateData: any = updateFields();
        if (data.name !== undefined) updateData.name = data.name;
        if (data.homeKitPrimary !== undefined) updateData.color_primary = data.homeKitPrimary;
        if (data.homeKitSecondary !== undefined) updateData.color_secondary = data.homeKitSecondary;
        if (data.awayKitPrimary !== undefined) updateData.away_color_primary = data.awayKitPrimary;
        if (data.awayKitSecondary !== undefined) updateData.away_color_secondary = data.awayKitSecondary;
        if (data.logoUrl !== undefined) updateData.logo_url = data.logoUrl;
        if (data.isOpponent !== undefined) updateData.is_opponent = data.isOpponent;

        await db.teams.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.teams.update(id, {
            is_deleted: true,
            deleted_at: Date.now(),
            deleted_by_user_id: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedTeam | undefined> {
        return db.teams.get(id);
    },

    async getAll(options?: { includeOpponents?: boolean }): Promise<EnhancedTeam[]> {
        let query = db.teams.filter(t => !t.is_deleted);
        if (!options?.includeOpponents) {
            query = query.filter(t => !(t as any).is_opponent);
        }
        return query.sortBy('name');
    },
};

// ============================================================================
// PLAYERS
// ============================================================================

export const playersDataLayer = {
    async create(data: {
        name: string;
        squadNumber?: number;
        preferredPosition?: string;
        dateOfBirth?: string;
        notes?: string;
        teamId?: string;
    }): Promise<EnhancedPlayer> {
        const id = generateId();
        const player: EnhancedPlayer = {
            id,
            full_name: data.name,
            squad_number: data.squadNumber,
            preferred_pos: data.preferredPosition,
            dob: data.dateOfBirth,
            notes: data.notes,
            current_team: data.teamId,
            ...createCommonFields(),
        } as EnhancedPlayer;

        await db.players.add(player);
        triggerSync();
        return player;
    },

    async update(id: string, data: Partial<{
        name: string;
        squadNumber: number;
        preferredPosition: string;
        dateOfBirth: string;
        notes: string;
        teamId: string;
    }>): Promise<void> {
        const updateData: any = updateFields();
        if (data.name !== undefined) updateData.full_name = data.name;
        if (data.squadNumber !== undefined) updateData.squad_number = data.squadNumber;
        if (data.preferredPosition !== undefined) updateData.preferred_pos = data.preferredPosition;
        if (data.dateOfBirth !== undefined) updateData.dob = data.dateOfBirth;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.teamId !== undefined) updateData.current_team = data.teamId;

        await db.players.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.players.update(id, {
            is_deleted: true,
            deleted_at: Date.now(),
            deleted_by_user_id: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedPlayer | undefined> {
        return db.players.get(id);
    },

    async getAll(options?: { teamId?: string }): Promise<EnhancedPlayer[]> {
        let query = db.players.filter(p => !p.is_deleted);
        if (options?.teamId) {
            query = query.filter(p => p.current_team === options.teamId);
        }
        return query.sortBy('full_name');
    },
};

// ============================================================================
// SEASONS
// ============================================================================

export const seasonsDataLayer = {
    async create(data: {
        label: string;
        startDate?: string;
        endDate?: string;
        isCurrent?: boolean;
        description?: string;
    }): Promise<EnhancedSeason> {
        const id = generateId();
        const season: EnhancedSeason = {
            id,
            season_id: id,
            label: data.label,
            start_date: data.startDate,
            end_date: data.endDate,
            is_current: data.isCurrent ?? false,
            description: data.description,
            ...createCommonFields(),
        } as EnhancedSeason;

        await db.seasons.add(season);
        triggerSync();
        return season;
    },

    async update(id: string, data: Partial<{
        label: string;
        startDate: string;
        endDate: string;
        isCurrent: boolean;
        description: string;
    }>): Promise<void> {
        const updateData: any = updateFields();
        if (data.label !== undefined) updateData.label = data.label;
        if (data.startDate !== undefined) updateData.start_date = data.startDate;
        if (data.endDate !== undefined) updateData.end_date = data.endDate;
        if (data.isCurrent !== undefined) updateData.is_current = data.isCurrent;
        if (data.description !== undefined) updateData.description = data.description;

        await db.seasons.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.seasons.update(id, {
            is_deleted: true,
            deleted_at: Date.now(),
            deleted_by_user_id: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedSeason | undefined> {
        return db.seasons.get(id);
    },

    async getAll(): Promise<EnhancedSeason[]> {
        return db.seasons.filter(s => !s.is_deleted).sortBy('label');
    },
};

// ============================================================================
// MATCHES
// ============================================================================

export const matchesDataLayer = {
    async create(data: {
        seasonId: string;
        kickoffTime: number | string;
        homeTeamId: string;
        awayTeamId: string;
        competition?: string;
        venue?: string;
        durationMinutes?: number;
        periodFormat?: 'half' | 'quarter';
        notes?: string;
    }): Promise<EnhancedMatch> {
        const id = generateId();
        const kickoffTs = typeof data.kickoffTime === 'string'
            ? new Date(data.kickoffTime).getTime()
            : data.kickoffTime;

        const match: EnhancedMatch = {
            id,
            match_id: id,
            season_id: data.seasonId,
            kickoff_ts: kickoffTs,
            home_team_id: data.homeTeamId,
            away_team_id: data.awayTeamId,
            competition: data.competition,
            venue: data.venue,
            duration_mins: data.durationMinutes ?? 60,
            period_format: data.periodFormat ?? 'quarter',
            home_score: 0,
            away_score: 0,
            notes: data.notes,
            ...createCommonFields(),
        } as EnhancedMatch;

        await db.matches.add(match);
        triggerSync();
        return match;
    },

    async update(id: string, data: Partial<{
        seasonId: string;
        kickoffTime: number | string;
        homeTeamId: string;
        awayTeamId: string;
        competition: string;
        venue: string;
        durationMinutes: number;
        periodFormat: 'half' | 'quarter';
        homeScore: number;
        awayScore: number;
        notes: string;
    }>): Promise<void> {
        const updateData: any = updateFields();
        if (data.seasonId !== undefined) updateData.season_id = data.seasonId;
        if (data.kickoffTime !== undefined) {
            updateData.kickoff_ts = typeof data.kickoffTime === 'string'
                ? new Date(data.kickoffTime).getTime()
                : data.kickoffTime;
        }
        if (data.homeTeamId !== undefined) updateData.home_team_id = data.homeTeamId;
        if (data.awayTeamId !== undefined) updateData.away_team_id = data.awayTeamId;
        if (data.competition !== undefined) updateData.competition = data.competition;
        if (data.venue !== undefined) updateData.venue = data.venue;
        if (data.durationMinutes !== undefined) updateData.duration_mins = data.durationMinutes;
        if (data.periodFormat !== undefined) updateData.period_format = data.periodFormat;
        if (data.homeScore !== undefined) updateData.home_score = data.homeScore;
        if (data.awayScore !== undefined) updateData.away_score = data.awayScore;
        if (data.notes !== undefined) updateData.notes = data.notes;

        await db.matches.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.matches.update(id, {
            is_deleted: true,
            deleted_at: Date.now(),
            deleted_by_user_id: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedMatch | undefined> {
        return db.matches.get(id);
    },

    async getAll(options?: { seasonId?: string }): Promise<EnhancedMatch[]> {
        let query = db.matches.filter(m => !m.is_deleted);
        if (options?.seasonId) {
            query = query.filter(m => m.season_id === options.seasonId);
        }
        return query.sortBy('kickoff_ts');
    },
};

// ============================================================================
// EVENTS
// ============================================================================

export const eventsDataLayer = {
    async create(data: {
        matchId: string;
        kind: string;
        periodNumber?: number;
        clockMs?: number;
        teamId?: string;
        playerId?: string;
        notes?: string;
        sentiment?: number;
    }): Promise<EnhancedEvent> {
        const id = generateId();
        const now = Date.now();

        const event: EnhancedEvent = {
            id,
            match_id: data.matchId,
            kind: data.kind as any,
            period_number: data.periodNumber ?? 1,
            clock_ms: data.clockMs ?? 0,
            team_id: data.teamId ?? '',
            player_id: data.playerId ?? '',
            notes: data.notes,
            sentiment: data.sentiment ?? 0,
            ts_server: now,
            ...createCommonFields(),
        } as EnhancedEvent;

        await db.events.add(event);
        triggerSync();
        return event;
    },

    async update(id: string, data: Partial<{
        kind: string;
        periodNumber: number;
        clockMs: number;
        teamId: string;
        playerId: string;
        notes: string;
        sentiment: number;
    }>): Promise<void> {
        const updateData: any = updateFields();
        if (data.kind !== undefined) updateData.kind = data.kind;
        if (data.periodNumber !== undefined) updateData.period_number = data.periodNumber;
        if (data.clockMs !== undefined) updateData.clock_ms = data.clockMs;
        if (data.teamId !== undefined) updateData.team_id = data.teamId;
        if (data.playerId !== undefined) updateData.player_id = data.playerId;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.sentiment !== undefined) updateData.sentiment = data.sentiment;

        await db.events.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.events.update(id, {
            is_deleted: true,
            deleted_at: Date.now(),
            deleted_by_user_id: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getByMatch(matchId: string): Promise<EnhancedEvent[]> {
        return db.events
            .where('match_id')
            .equals(matchId)
            .filter(e => !e.is_deleted)
            .sortBy('clock_ms');
    },
};

// ============================================================================
// LINEUPS
// ============================================================================

export const lineupsDataLayer = {
    async create(data: {
        matchId: string;
        playerId: string;
        startMin: number;
        endMin?: number;
        position: string;
    }): Promise<EnhancedLineup> {
        const id = `${data.matchId}-${data.playerId}-${data.startMin}`;

        const lineup: EnhancedLineup = {
            id,
            match_id: data.matchId,
            player_id: data.playerId,
            start_min: data.startMin,
            end_min: data.endMin,
            position: data.position,
            ...createCommonFields(),
        } as EnhancedLineup;

        await db.lineup.put(lineup); // Use put to allow updates
        triggerSync();
        return lineup;
    },

    async update(id: string, data: Partial<{
        startMin: number;
        endMin: number;
        position: string;
    }>): Promise<void> {
        const updateData: any = updateFields();
        if (data.startMin !== undefined) updateData.start_min = data.startMin;
        if (data.endMin !== undefined) updateData.end_min = data.endMin;
        if (data.position !== undefined) updateData.position = data.position;

        await db.lineup.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.lineup.update(id, {
            is_deleted: true,
            deleted_at: Date.now(),
            deleted_by_user_id: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getByMatch(matchId: string): Promise<EnhancedLineup[]> {
        return db.lineup
            .where('match_id')
            .equals(matchId)
            .filter(l => !l.is_deleted)
            .sortBy('start_min');
    },
};

// ============================================================================
// MATCH STATE
// ============================================================================

export const matchStateDataLayer = {
    async upsert(matchId: string, data: {
        status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
        currentPeriodId?: string;
        timerMs?: number;
    }): Promise<void> {
        const existing = await db.match_state.get(matchId);
        const now = Date.now();

        if (existing) {
            await db.match_state.update(matchId, {
                status: data.status,
                current_period_id: data.currentPeriodId,
                timer_ms: data.timerMs ?? existing.timer_ms,
                last_updated_at: now,
                ...updateFields(),
            });
        } else {
            await db.match_state.add({
                match_id: matchId,
                status: data.status,
                current_period_id: data.currentPeriodId,
                timer_ms: data.timerMs ?? 0,
                last_updated_at: now,
                ...createCommonFields(),
            } as LocalMatchState);
        }
        triggerSync();
    },

    async get(matchId: string): Promise<LocalMatchState | undefined> {
        return db.match_state.get(matchId);
    },
};

// ============================================================================
// MATCH PERIODS
// ============================================================================

export const matchPeriodsDataLayer = {
    async create(data: {
        matchId: string;
        periodNumber: number;
        periodType?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
        startedAt?: number;
    }): Promise<LocalMatchPeriod> {
        const id = generateId();
        const now = Date.now();

        const period: LocalMatchPeriod = {
            id,
            match_id: data.matchId,
            period_number: data.periodNumber,
            period_type: data.periodType ?? 'REGULAR',
            started_at: data.startedAt ?? now,
            ...createCommonFields(),
        } as LocalMatchPeriod;

        await db.match_periods.add(period);
        triggerSync();
        return period;
    },

    async endPeriod(id: string, endedAt?: number): Promise<void> {
        const period = await db.match_periods.get(id);
        if (period) {
            const endTime = endedAt ?? Date.now();
            const durationSeconds = Math.floor((endTime - period.started_at) / 1000);

            await db.match_periods.update(id, {
                ended_at: endTime,
                duration_seconds: durationSeconds,
                ...updateFields(),
            });
            triggerSync();
        }
    },

    async getByMatch(matchId: string): Promise<LocalMatchPeriod[]> {
        return db.match_periods
            .where('match_id')
            .equals(matchId)
            .filter(p => !p.is_deleted)
            .sortBy('period_number');
    },
};

// ============================================================================
// DEFAULT LINEUPS
// ============================================================================

export const defaultLineupsDataLayer = {
    async save(data: {
        teamId: string;
        formation: Array<{ playerId: string; position: string; pitchX: number; pitchY: number }>;
    }): Promise<LocalDefaultLineup> {
        const existing = await db.default_lineups
            .where('team_id')
            .equals(data.teamId)
            .filter(dl => !dl.is_deleted)
            .first();

        const now = Date.now();

        if (existing) {
            await db.default_lineups.update(existing.id, {
                formation: data.formation,
                ...updateFields(),
            });
            triggerSync();
            return { ...existing, formation: data.formation, updated_at: now } as LocalDefaultLineup;
        } else {
            const id = generateId();
            const defaultLineup: LocalDefaultLineup = {
                id,
                team_id: data.teamId,
                formation: data.formation,
                ...createCommonFields(),
            } as LocalDefaultLineup;

            await db.default_lineups.add(defaultLineup);
            triggerSync();
            return defaultLineup;
        }
    },

    async getByTeam(teamId: string): Promise<LocalDefaultLineup | undefined> {
        return db.default_lineups
            .where('team_id')
            .equals(teamId)
            .filter(dl => !dl.is_deleted)
            .first();
    },

    async delete(teamId: string): Promise<void> {
        const existing = await db.default_lineups
            .where('team_id')
            .equals(teamId)
            .first();

        if (existing) {
            await db.default_lineups.update(existing.id, {
                is_deleted: true,
                deleted_at: Date.now(),
                deleted_by_user_id: getUserId(),
                ...updateFields(),
            });
            triggerSync();
        }
    },
};

// ============================================================================
// UNIFIED EXPORT
// ============================================================================

export const dataLayer = {
    teams: teamsDataLayer,
    players: playersDataLayer,
    seasons: seasonsDataLayer,
    matches: matchesDataLayer,
    events: eventsDataLayer,
    lineups: lineupsDataLayer,
    matchState: matchStateDataLayer,
    matchPeriods: matchPeriodsDataLayer,
    defaultLineups: defaultLineupsDataLayer,
};

export default dataLayer;
