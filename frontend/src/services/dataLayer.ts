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
        createdAt: now,
        updatedAt: now,
        createdByUserId: getUserId(),
        isDeleted: false,
        synced: false,
    };
}

/**
 * Create update fields for existing records
 */
function updateFields() {
    return {
        updatedAt: Date.now(),
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
            teamId: id,
            name: data.name,
            colorPrimary: data.homeKitPrimary,
            colorSecondary: data.homeKitSecondary,
            awayColorPrimary: data.awayKitPrimary,
            awayColorSecondary: data.awayKitSecondary,
            logoUrl: data.logoUrl,
            isOpponent: data.isOpponent ?? false,
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
        if (data.homeKitPrimary !== undefined) updateData.colorPrimary = data.homeKitPrimary;
        if (data.homeKitSecondary !== undefined) updateData.colorSecondary = data.homeKitSecondary;
        if (data.awayKitPrimary !== undefined) updateData.awayColorPrimary = data.awayKitPrimary;
        if (data.awayKitSecondary !== undefined) updateData.awayColorSecondary = data.awayKitSecondary;
        if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
        if (data.isOpponent !== undefined) updateData.isOpponent = data.isOpponent;

        await db.teams.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.teams.update(id, {
            isDeleted: true,
            deletedAt: Date.now(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedTeam | undefined> {
        return db.teams.get(id);
    },

    async getAll(options?: { includeOpponents?: boolean }): Promise<EnhancedTeam[]> {
        let query = db.teams.filter(t => !t.isDeleted);
        if (!options?.includeOpponents) {
            query = query.filter(t => !(t as any).isOpponent);
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
            fullName: data.name,
            squadNumber: data.squadNumber,
            preferredPos: data.preferredPosition,
            dob: data.dateOfBirth,
            notes: data.notes,
            currentTeam: data.teamId,
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
        if (data.name !== undefined) updateData.fullName = data.name;
        if (data.squadNumber !== undefined) updateData.squadNumber = data.squadNumber;
        if (data.preferredPosition !== undefined) updateData.preferredPos = data.preferredPosition;
        if (data.dateOfBirth !== undefined) updateData.dob = data.dateOfBirth;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.teamId !== undefined) updateData.currentTeam = data.teamId;

        await db.players.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.players.update(id, {
            isDeleted: true,
            deletedAt: Date.now(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedPlayer | undefined> {
        return db.players.get(id);
    },

    async getAll(options?: { teamId?: string }): Promise<EnhancedPlayer[]> {
        let query = db.players.filter(p => !p.isDeleted);
        if (options?.teamId) {
            query = query.filter(p => p.currentTeam === options.teamId);
        }
        return query.sortBy('fullName');
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
            seasonId: id,
            label: data.label,
            startDate: data.startDate,
            endDate: data.endDate,
            isCurrent: data.isCurrent ?? false,
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
        if (data.startDate !== undefined) updateData.startDate = data.startDate;
        if (data.endDate !== undefined) updateData.endDate = data.endDate;
        if (data.isCurrent !== undefined) updateData.isCurrent = data.isCurrent;
        if (data.description !== undefined) updateData.description = data.description;

        await db.seasons.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.seasons.update(id, {
            isDeleted: true,
            deletedAt: Date.now(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedSeason | undefined> {
        return db.seasons.get(id);
    },

    async getAll(): Promise<EnhancedSeason[]> {
        return db.seasons.filter(s => !s.isDeleted).sortBy('label');
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
            matchId: id,
            seasonId: data.seasonId,
            kickoffTs: kickoffTs,
            homeTeamId: data.homeTeamId,
            awayTeamId: data.awayTeamId,
            competition: data.competition,
            venue: data.venue,
            durationMins: data.durationMinutes ?? 60,
            periodFormat: data.periodFormat ?? 'quarter',
            homeScore: 0,
            awayScore: 0,
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
        if (data.seasonId !== undefined) updateData.seasonId = data.seasonId;
        if (data.kickoffTime !== undefined) {
            updateData.kickoffTs = typeof data.kickoffTime === 'string'
                ? new Date(data.kickoffTime).getTime()
                : data.kickoffTime;
        }
        if (data.homeTeamId !== undefined) updateData.homeTeamId = data.homeTeamId;
        if (data.awayTeamId !== undefined) updateData.awayTeamId = data.awayTeamId;
        if (data.competition !== undefined) updateData.competition = data.competition;
        if (data.venue !== undefined) updateData.venue = data.venue;
        if (data.durationMinutes !== undefined) updateData.durationMins = data.durationMinutes;
        if (data.periodFormat !== undefined) updateData.periodFormat = data.periodFormat;
        if (data.homeScore !== undefined) updateData.homeScore = data.homeScore;
        if (data.awayScore !== undefined) updateData.awayScore = data.awayScore;
        if (data.notes !== undefined) updateData.notes = data.notes;

        await db.matches.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.matches.update(id, {
            isDeleted: true,
            deletedAt: Date.now(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<EnhancedMatch | undefined> {
        return db.matches.get(id);
    },

    async getAll(options?: { seasonId?: string }): Promise<EnhancedMatch[]> {
        let query = db.matches.filter(m => !m.isDeleted);
        if (options?.seasonId) {
            query = query.filter(m => m.seasonId === options.seasonId);
        }
        return query.sortBy('kickoffTs');
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
            matchId: data.matchId,
            kind: data.kind as any,
            periodNumber: data.periodNumber ?? 1,
            clockMs: data.clockMs ?? 0,
            teamId: data.teamId ?? '',
            playerId: data.playerId ?? '',
            notes: data.notes,
            sentiment: data.sentiment ?? 0,
            tsServer: now,
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
        if (data.periodNumber !== undefined) updateData.periodNumber = data.periodNumber;
        if (data.clockMs !== undefined) updateData.clockMs = data.clockMs;
        if (data.teamId !== undefined) updateData.teamId = data.teamId;
        if (data.playerId !== undefined) updateData.playerId = data.playerId;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.sentiment !== undefined) updateData.sentiment = data.sentiment;

        await db.events.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.events.update(id, {
            isDeleted: true,
            deletedAt: Date.now(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getByMatch(matchId: string): Promise<EnhancedEvent[]> {
        return db.events
            .where('matchId')
            .equals(matchId)
            .filter(e => !e.isDeleted)
            .sortBy('clockMs');
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
            matchId: data.matchId,
            playerId: data.playerId,
            startMin: data.startMin,
            endMin: data.endMin,
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
        if (data.startMin !== undefined) updateData.startMin = data.startMin;
        if (data.endMin !== undefined) updateData.endMin = data.endMin;
        if (data.position !== undefined) updateData.position = data.position;

        await db.lineup.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.lineup.update(id, {
            isDeleted: true,
            deletedAt: Date.now(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getByMatch(matchId: string): Promise<EnhancedLineup[]> {
        return db.lineup
            .where('matchId')
            .equals(matchId)
            .filter(l => !l.isDeleted)
            .sortBy('startMin');
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
                currentPeriodId: data.currentPeriodId,
                timerMs: data.timerMs ?? existing.timerMs,
                lastUpdatedAt: now,
                ...updateFields(),
            });
        } else {
            await db.match_state.add({
                matchId: matchId,
                status: data.status,
                currentPeriodId: data.currentPeriodId,
                timerMs: data.timerMs ?? 0,
                lastUpdatedAt: now,
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
            matchId: data.matchId,
            periodNumber: data.periodNumber,
            periodType: data.periodType ?? 'REGULAR',
            startedAt: data.startedAt ?? now,
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
            const durationSeconds = Math.floor((endTime - period.startedAt) / 1000);

            await db.match_periods.update(id, {
                endedAt: endTime,
                durationSeconds: durationSeconds,
                ...updateFields(),
            });
            triggerSync();
        }
    },

    async getByMatch(matchId: string): Promise<LocalMatchPeriod[]> {
        return db.match_periods
            .where('matchId')
            .equals(matchId)
            .filter(p => !p.isDeleted)
            .sortBy('periodNumber');
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
            .where('teamId')
            .equals(data.teamId)
            .filter(dl => !dl.isDeleted)
            .first();

        const now = Date.now();

        if (existing) {
            await db.default_lineups.update(existing.id, {
                formation: data.formation,
                ...updateFields(),
            });
            triggerSync();
            return { ...existing, formation: data.formation, updatedAt: now } as LocalDefaultLineup;
        } else {
            const id = generateId();
            const defaultLineup: LocalDefaultLineup = {
                id,
                teamId: data.teamId,
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
            .where('teamId')
            .equals(teamId)
            .filter(dl => !dl.isDeleted)
            .first();
    },

    async delete(teamId: string): Promise<void> {
        const existing = await db.default_lineups
            .where('teamId')
            .equals(teamId)
            .first();

        if (existing) {
            await db.default_lineups.update(existing.id, {
                isDeleted: true,
                deletedAt: Date.now(),
                deletedByUserId: getUserId(),
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
