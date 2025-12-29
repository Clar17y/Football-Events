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
import { getCachedMeLimits, type MeLimits } from './limitsCache';
import { CORE_EVENT_KINDS } from '@shared/types/limits';
import type {
    DbTeam,
    DbPlayer,
    DbSeason,
    DbMatch,
    DbEvent,
    DbLineup,
    DbMatchPeriod,
    DbMatchState,
    DbDefaultLineup
} from '../db/schema';

const DEFAULT_FREE_LIMITS: MeLimits = {
    ownedTeams: 1,
    playersPerOwnedTeam: 20,
    seasons: 5,
    matchesPerSeason: 30,
    eventsPerMatch: 40,
    formationChangesPerMatch: 5,
    activeShareLinks: 1,
};

const DEFAULT_FREE_ALLOWED_EVENT_KINDS = new Set<string>(CORE_EVENT_KINDS);

async function getAuthLimitsForOfflineWrite(): Promise<{ limits: MeLimits; allowedEventKinds: Set<string> } | null> {
    try {
        if (typeof navigator === 'undefined' || navigator.onLine) return null;
        if (isGuest()) return null;

        const cached = await getCachedMeLimits();
        const limits = cached?.limits || DEFAULT_FREE_LIMITS;
        const allowedEventKinds = cached?.allowedEventKinds?.length
            ? new Set(cached.allowedEventKinds)
            : DEFAULT_FREE_ALLOWED_EVENT_KINDS;
        return { limits, allowedEventKinds };
    } catch {
        return { limits: DEFAULT_FREE_LIMITS, allowedEventKinds: DEFAULT_FREE_ALLOWED_EVENT_KINDS };
    }
}

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
 * Uses ISO strings for timestamps (aligned with shared types)
 */
function createCommonFields() {
    const now = new Date().toISOString();
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
 * Uses ISO strings for timestamps (aligned with shared types)
 */
function updateFields() {
    return {
        updatedAt: new Date().toISOString(),
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
    }): Promise<DbTeam> {
        const authLimits = await getAuthLimitsForOfflineWrite();
        if (authLimits && !(data.isOpponent ?? false)) {
            const ownedTeams = await db.teams.filter(t => !t.isDeleted && !t.isOpponent).count();
            if (ownedTeams >= authLimits.limits.ownedTeams) {
                throw new Error(`Team limit reached (${authLimits.limits.ownedTeams}).`);
            }
        }

        const id = generateId();
        const team: DbTeam = {
            id,
            name: data.name,
            homeKitPrimary: data.homeKitPrimary,
            homeKitSecondary: data.homeKitSecondary,
            awayKitPrimary: data.awayKitPrimary,
            awayKitSecondary: data.awayKitSecondary,
            logoUrl: data.logoUrl,
            isOpponent: data.isOpponent ?? false,
            ...createCommonFields(),
        } as DbTeam;

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
        if (data.homeKitPrimary !== undefined) updateData.homeKitPrimary = data.homeKitPrimary;
        if (data.homeKitSecondary !== undefined) updateData.homeKitSecondary = data.homeKitSecondary;
        if (data.awayKitPrimary !== undefined) updateData.awayKitPrimary = data.awayKitPrimary;
        if (data.awayKitSecondary !== undefined) updateData.awayKitSecondary = data.awayKitSecondary;
        if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
        if (data.isOpponent !== undefined) updateData.isOpponent = data.isOpponent;

        await db.teams.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.teams.update(id, {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<DbTeam | undefined> {
        return db.teams.get(id);
    },

    async getAll(options?: { includeOpponents?: boolean }): Promise<DbTeam[]> {
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
    }): Promise<DbPlayer> {
        const id = generateId();
        const player: DbPlayer = {
            id,
            name: data.name,
            squadNumber: data.squadNumber,
            preferredPosition: data.preferredPosition,
            dateOfBirth: data.dateOfBirth,
            notes: data.notes,
            currentTeam: data.teamId,
            ...createCommonFields(),
        } as DbPlayer;

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
        if (data.name !== undefined) updateData.name = data.name;
        if (data.squadNumber !== undefined) updateData.squadNumber = data.squadNumber;
        if (data.preferredPosition !== undefined) updateData.preferredPosition = data.preferredPosition;
        if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth;
        if (data.notes !== undefined) updateData.notes = data.notes;
        if (data.teamId !== undefined) updateData.currentTeam = data.teamId;

        await db.players.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.players.update(id, {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<DbPlayer | undefined> {
        return db.players.get(id);
    },

    async getAll(options?: { teamId?: string }): Promise<DbPlayer[]> {
        let query = db.players.filter(p => !p.isDeleted);
        if (options?.teamId) {
            query = query.filter(p => p.currentTeam === options.teamId);
        }
        return query.sortBy('name');
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
    }): Promise<DbSeason> {
        const authLimits = await getAuthLimitsForOfflineWrite();
        if (authLimits && authLimits.limits.seasons != null) {
            const seasons = await db.seasons.filter(s => !s.isDeleted).count();
            if (seasons >= authLimits.limits.seasons) {
                throw new Error(`Season limit reached (${authLimits.limits.seasons}).`);
            }
        }

        const id = generateId();
        const season: DbSeason = {
            id,
            seasonId: id,
            label: data.label,
            startDate: data.startDate,
            endDate: data.endDate,
            isCurrent: data.isCurrent ?? false,
            description: data.description,
            ...createCommonFields(),
        } as DbSeason;

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
            deletedAt: new Date().toISOString(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<DbSeason | undefined> {
        return db.seasons.get(id);
    },

    async getAll(): Promise<DbSeason[]> {
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
    }): Promise<DbMatch> {
        const authLimits = await getAuthLimitsForOfflineWrite();
        if (authLimits && authLimits.limits.matchesPerSeason != null) {
            const matchesInSeason = await db.matches
                .where('seasonId')
                .equals(data.seasonId)
                .filter(m => !m.isDeleted)
                .count();
            if (matchesInSeason >= authLimits.limits.matchesPerSeason) {
                throw new Error(`Match limit reached (${authLimits.limits.matchesPerSeason}).`);
            }
        }

        const id = generateId();
        const kickoffTimeIso = typeof data.kickoffTime === 'string'
            ? data.kickoffTime
            : new Date(data.kickoffTime).toISOString();

        const match: DbMatch = {
            id,
            matchId: id,
            seasonId: data.seasonId,
            kickoffTime: kickoffTimeIso,
            homeTeamId: data.homeTeamId,
            awayTeamId: data.awayTeamId,
            competition: data.competition,
            venue: data.venue,
            durationMinutes: data.durationMinutes ?? 60,
            periodFormat: data.periodFormat ?? 'quarter',
            homeScore: 0,
            awayScore: 0,
            notes: data.notes,
            ...createCommonFields(),
        } as DbMatch;

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
            updateData.kickoffTime = typeof data.kickoffTime === 'string'
                ? data.kickoffTime
                : new Date(data.kickoffTime).toISOString();
        }
        if (data.homeTeamId !== undefined) updateData.homeTeamId = data.homeTeamId;
        if (data.awayTeamId !== undefined) updateData.awayTeamId = data.awayTeamId;
        if (data.competition !== undefined) updateData.competition = data.competition;
        if (data.venue !== undefined) updateData.venue = data.venue;
        if (data.durationMinutes !== undefined) updateData.durationMinutes = data.durationMinutes;
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
            deletedAt: new Date().toISOString(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getById(id: string): Promise<DbMatch | undefined> {
        return db.matches.get(id);
    },

    async getAll(options?: { seasonId?: string }): Promise<DbMatch[]> {
        let query = db.matches.filter(m => !m.isDeleted);
        if (options?.seasonId) {
            query = query.filter(m => m.seasonId === options.seasonId);
        }
        return query.sortBy('kickoffTime');
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
        teamId: string;
        playerId?: string;
        notes?: string;
        sentiment?: number;
    }): Promise<DbEvent> {
        const authLimits = await getAuthLimitsForOfflineWrite();
        if (authLimits) {
            const kind = String(data.kind);
            const isScoring = kind === 'goal' || kind === 'own_goal';

            if (kind === 'formation_change') {
                const formationChanges = await db.events
                    .where('matchId')
                    .equals(data.matchId)
                    .filter(e => !e.isDeleted && String(e.kind) === 'formation_change')
                    .count();
                if (formationChanges >= authLimits.limits.formationChangesPerMatch) {
                    throw new Error(`Formation change limit reached (${authLimits.limits.formationChangesPerMatch}).`);
                }
            } else if (!isScoring) {
                if (!authLimits.allowedEventKinds.has(kind)) {
                    throw new Error('This event type requires Premium.');
                }
                const nonScoringEvents = await db.events
                    .where('matchId')
                    .equals(data.matchId)
                    .filter(e => !e.isDeleted && !['goal', 'own_goal', 'formation_change'].includes(String(e.kind)))
                    .count();
                if (nonScoringEvents >= authLimits.limits.eventsPerMatch) {
                    throw new Error(`Event limit reached (${authLimits.limits.eventsPerMatch}).`);
                }
            }
        }

        const id = generateId();
        const now = new Date().toISOString();

        const event: DbEvent = {
            id,
            matchId: data.matchId,
            kind: data.kind as any,
            periodNumber: data.periodNumber ?? 1,
            clockMs: data.clockMs ?? 0,
            teamId: data.teamId,
            playerId: data.playerId ?? '',
            notes: data.notes,
            sentiment: data.sentiment ?? 0,
            syncedAt: now,
            ...createCommonFields(),
        } as DbEvent;

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
            deletedAt: new Date().toISOString(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getByMatch(matchId: string): Promise<DbEvent[]> {
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
        startMinute: number;
        endMinute?: number;
        position: string;
    }): Promise<DbLineup> {
        const id = `${data.matchId}-${data.playerId}-${data.startMinute}`;

        const lineup: DbLineup = {
            id,
            matchId: data.matchId,
            playerId: data.playerId,
            startMinute: data.startMinute,
            endMinute: data.endMinute,
            position: data.position,
            ...createCommonFields(),
        } as DbLineup;

        await db.lineup.put(lineup); // Use put to allow updates
        triggerSync();
        return lineup;
    },

    async update(id: string, data: Partial<{
        startMinute: number;
        endMinute: number;
        position: string;
    }>): Promise<void> {
        const updateData: any = updateFields();
        if (data.startMinute !== undefined) updateData.startMinute = data.startMinute;
        if (data.endMinute !== undefined) updateData.endMinute = data.endMinute;
        if (data.position !== undefined) updateData.position = data.position;

        await db.lineup.update(id, updateData);
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.lineup.update(id, {
            isDeleted: true,
            deletedAt: new Date().toISOString(),
            deletedByUserId: getUserId(),
            ...updateFields(),
        });
        triggerSync();
    },

    async getByMatch(matchId: string): Promise<DbLineup[]> {
        return db.lineup
            .where('matchId')
            .equals(matchId)
            .filter(l => !l.isDeleted)
            .sortBy('startMinute');
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
        const existing = await db.matchState.get(matchId);
        const now = Date.now();

        if (existing) {
            await db.matchState.update(matchId, {
                status: data.status,
                currentPeriodId: data.currentPeriodId,
                timerMs: data.timerMs ?? existing.timerMs,
                lastUpdatedAt: now,
                ...updateFields(),
            });
        } else {
            await db.matchState.add({
                matchId: matchId,
                status: data.status,
                currentPeriodId: data.currentPeriodId,
                timerMs: data.timerMs ?? 0,
                lastUpdatedAt: now,
                ...createCommonFields(),
            } as DbMatchState);
        }
        triggerSync();
    },

    async get(matchId: string): Promise<DbMatchState | undefined> {
        return db.matchState.get(matchId);
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
    }): Promise<DbMatchPeriod> {
        const id = generateId();
        const now = Date.now();

        const period: DbMatchPeriod = {
            id,
            matchId: data.matchId,
            periodNumber: data.periodNumber,
            periodType: data.periodType ?? 'REGULAR',
            startedAt: data.startedAt ?? now,
            ...createCommonFields(),
        } as DbMatchPeriod;

        await db.matchPeriods.add(period);
        triggerSync();
        return period;
    },

    async endPeriod(id: string, endedAt?: number): Promise<void> {
        const period = await db.matchPeriods.get(id);
        if (period) {
            const endTime = endedAt ?? Date.now();
            const durationSeconds = Math.floor((endTime - period.startedAt) / 1000);

            await db.matchPeriods.update(id, {
                endedAt: endTime,
                durationSeconds: durationSeconds,
                ...updateFields(),
            });
            triggerSync();
        }
    },

    async getByMatch(matchId: string): Promise<DbMatchPeriod[]> {
        return db.matchPeriods
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
    }): Promise<DbDefaultLineup> {
        const existing = await db.defaultLineups
            .where('teamId')
            .equals(data.teamId)
            .filter(dl => !dl.isDeleted)
            .first();

        const now = new Date().toISOString();

        if (existing) {
            await db.defaultLineups.update(existing.id, {
                formation: data.formation,
                ...updateFields(),
            });
            triggerSync();
            return { ...existing, formation: data.formation, updatedAt: now } as DbDefaultLineup;
        } else {
            const id = generateId();
            const defaultLineup: DbDefaultLineup = {
                id,
                teamId: data.teamId,
                formation: data.formation,
                ...createCommonFields(),
            } as DbDefaultLineup;

            await db.defaultLineups.add(defaultLineup);
            triggerSync();
            return defaultLineup;
        }
    },

    async getByTeam(teamId: string): Promise<DbDefaultLineup | undefined> {
        return db.defaultLineups
            .where('teamId')
            .equals(teamId)
            .filter(dl => !dl.isDeleted)
            .first();
    },

    async delete(teamId: string): Promise<void> {
        const existing = await db.defaultLineups
            .where('teamId')
            .equals(teamId)
            .first();

        if (existing) {
            await db.defaultLineups.update(existing.id, {
                isDeleted: true,
                deletedAt: new Date().toISOString(),
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
