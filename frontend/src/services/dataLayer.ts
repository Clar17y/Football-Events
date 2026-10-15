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
import { GUEST_LIMITS } from '../utils/quotas';
import { ALL_EVENT_KINDS, CORE_EVENT_KINDS } from '@shared/types/limits';
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

const LEGACY_RECORDING_OWNERS = new Set(['server', 'authenticated-user', 'local-user']);

/** The replay endpoint accepts these transitions; other server statuses are read-only. */
export function isReplayableMatchStatus(status: unknown): status is 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' {
    return status === 'SCHEDULED' || status === 'LIVE' || status === 'PAUSED' || status === 'COMPLETED';
}

async function assertRecordingLifecycleMutable(matchId: string): Promise<void> {
    const state = await db.matchState.get(matchId);
    if (state && !isReplayableMatchStatus(state.status)) {
        throw new Error('This match is read-only for recording lifecycle changes');
    }
}

export function isCurrentOwnedMatch(match: {
    createdByUserId?: string;
    created_by_user_id?: string;
    isDeleted?: boolean;
    is_deleted?: boolean;
} | undefined, ownerId: string): boolean {
    if (!match) return false;
    const camel = match.createdByUserId, snake = match.created_by_user_id;
    return !match.isDeleted && !match.is_deleted && !(camel && snake && camel !== snake) && (camel || snake) === ownerId;
}

/** Resolve known old attribution only beneath a proven current-owned parent match. */
export async function recordingOwner<T extends { matchId: string; createdByUserId?: string }>(row: T, ownerId: string): Promise<T> {
    if (row.createdByUserId === ownerId) return row;
    const parent = await db.matches.get(row.matchId);
    if (!ownerId.startsWith('guest-') && LEGACY_RECORDING_OWNERS.has(row.createdByUserId || '') &&
        isCurrentOwnedMatch(parent, ownerId)) {
        return { ...row, createdByUserId: ownerId };
    }
    throw new Error('Recording belongs to another user');
}

export async function bumpRecordingRevision(matchId: string): Promise<void> {
    const match = await db.matches.get(matchId);
    if (!match) return;
    const revision = match.recordingRevision ?? 0;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) throw new Error('Invalid recording revision');
    await db.matches.update(matchId, { recordingRevision: revision + 1 });
}

export async function reclaimLegacyRecordings(ownerId: string): Promise<void> {
    if (!ownerId || ownerId.startsWith('guest-')) return;
    await db.transaction('rw', [db.matches, db.events, db.matchPeriods, db.matchState, db.syncFailures], async () => {
        const ownedParents = (await db.matches.toArray()).filter(match => isCurrentOwnedMatch(match, ownerId));
        const parents = new Set(ownedParents.map(match => match.id));
        for (const parent of ownedParents) {
            if (parent.createdByUserId !== ownerId) await db.matches.update(parent.id, { createdByUserId: ownerId });
        }
        for (const table of [db.events, db.matchPeriods, db.matchState]) {
            const rows = await table.toArray();
            for (const row of rows) {
                if (parents.has(row.matchId) && LEGACY_RECORDING_OWNERS.has(row.createdByUserId)) {
                    const key = 'id' in row && typeof row.id === 'string' ? row.id : row.matchId;
                    await table.update(key, { createdByUserId: ownerId });
                    await db.syncFailures.delete([table.name, key]);
                }
            }
        }
    });
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
        const ownerId = getUserId();
        const authLimits = await getAuthLimitsForOfflineWrite();
        if (getUserId() !== ownerId) throw new Error('Account changed. Please retry creation.');
        if (authLimits && !(data.isOpponent ?? false)) {
            const ownedTeams = await db.teams.filter(t => isCurrentOwnedMatch(t, ownerId) && !t.isOpponent).count();
            if (ownedTeams >= authLimits.limits.ownedTeams) {
                throw new Error(`Team limit reached (${authLimits.limits.ownedTeams}).`);
            }
        }

        if (getUserId() !== ownerId) throw new Error('Account changed. Please retry creation.');
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
        const ownerId = getUserId();
        const authLimits = await getAuthLimitsForOfflineWrite();
        if (getUserId() !== ownerId) throw new Error('Account changed. Please retry creation.');
        if (authLimits && authLimits.limits.seasons != null) {
            const seasons = await db.seasons.filter(s => isCurrentOwnedMatch(s, ownerId)).count();
            if (seasons >= authLimits.limits.seasons) {
                throw new Error(`Season limit reached (${authLimits.limits.seasons}).`);
            }
        }

        if (getUserId() !== ownerId) throw new Error('Account changed. Please retry creation.');
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
        periodFormat?: 'half' | 'quarter' | 'third' | 'whole';
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

        await db.transaction('rw', db.matches, db.matchState, async () => {
            await db.matches.add(match);
            await db.matchState.add({
                matchId: id, status: 'SCHEDULED', timerMs: 0, totalElapsedSeconds: 0,
                lastUpdatedAt: Date.now(), createdAt: match.createdAt, updatedAt: match.updatedAt,
                createdByUserId: match.createdByUserId, isDeleted: false, synced: false,
            });
        });
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
        periodFormat: 'half' | 'quarter' | 'third' | 'whole';
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

async function eventLimits() {
    if (isGuest()) return {
        limits: { ...DEFAULT_FREE_LIMITS, eventsPerMatch: GUEST_LIMITS.maxNonScoringEventsPerMatch,
            formationChangesPerMatch: GUEST_LIMITS.maxFormationChangesPerMatch },
        allowedEventKinds: DEFAULT_FREE_ALLOWED_EVENT_KINDS,
    };
    const cached = await getCachedMeLimits();
    return {
        limits: cached?.limits ?? DEFAULT_FREE_LIMITS,
        allowedEventKinds: new Set(cached?.allowedEventKinds ?? CORE_EVENT_KINDS),
    };
}

function validateEvent(event: { kind: string; matchId: string; teamId?: string }) {
    if (!(ALL_EVENT_KINDS as readonly string[]).includes(event.kind)) throw new Error('Invalid event kind');
    if (!event.matchId || !event.teamId) throw new Error('Match ID and Team ID are required for events');
}

async function checkEventQuota(event: DbEvent, config: Awaited<ReturnType<typeof eventLimits>>, excludeId?: string) {
    const kind = String(event.kind);
    if (['goal', 'own_goal'].includes(kind)) return;
    if (kind !== 'formation_change' && !config.allowedEventKinds.has(kind)) throw new Error('This event type requires Premium.');
    const formation = kind === 'formation_change';
    const count = await db.events.where('matchId').equals(event.matchId)
        .filter(e => e.id !== excludeId && !e.isDeleted && e.createdByUserId === event.createdByUserId &&
            (formation ? e.kind === 'formation_change' : !['goal', 'own_goal', 'formation_change'].includes(e.kind)))
        .count();
    const limit = formation ? config.limits.formationChangesPerMatch : config.limits.eventsPerMatch;
    if (count >= limit) throw new Error(`${formation ? 'Formation change' : 'Event'} limit reached (${limit}).`);
}

function eventScoreContribution(event: DbEvent | undefined, match: DbMatch) {
    if (!event || event.isDeleted || !['goal', 'own_goal'].includes(event.kind)) return { home: 0, away: 0 };
    const home = event.teamId === match.homeTeamId;
    const away = event.teamId === match.awayTeamId;
    if (!home && !away) return { home: 0, away: 0 };
    return event.kind === 'own_goal' ? { home: Number(away), away: Number(home) } : { home: Number(home), away: Number(away) };
}

async function projectEventScore(matchId: string, before?: DbEvent, after?: DbEvent) {
    const match = await db.matches.get(matchId);
    if (!match) return false;
    const oldScore = eventScoreContribution(before, match);
    const newScore = eventScoreContribution(after, match);
    const homeDelta = newScore.home - oldScore.home;
    const awayDelta = newScore.away - oldScore.away;
    if (!homeDelta && !awayDelta) return false;
    // Cached event history may be partial; preserve the match's known score baseline.
    // Derived scores do not make an otherwise clean match dirty.
    await db.matches.update(matchId, {
        homeScore: Math.max(0, (match.homeScore ?? 0) + homeDelta),
        awayScore: Math.max(0, (match.awayScore ?? 0) + awayDelta),
        scoreRevision: generateId(),
    });
    return true;
}

export const eventsDataLayer = {
    async create(data: {
        matchId: string; kind: string; periodNumber?: number; clockMs?: number;
        teamId: string; playerId?: string | null; notes?: string; sentiment?: number;
        createdAt?: string; createdByUserId?: string; isDeleted?: boolean;
    }, formationGuard?: { ownerId: string; isCurrent: () => boolean }): Promise<DbEvent> {
        validateEvent(data);
        const config = await eventLimits();
        const event: DbEvent = {
            ...createCommonFields(), id: generateId(), matchId: data.matchId, kind: data.kind as DbEvent['kind'],
            periodNumber: data.periodNumber ?? 1, clockMs: data.clockMs ?? 0,
            teamId: data.teamId, playerId: data.playerId || undefined,
            notes: data.notes, sentiment: data.sentiment ?? 0,
            createdAt: data.createdAt ?? new Date().toISOString(),
            createdByUserId: data.createdByUserId ?? getUserId(), isDeleted: data.isDeleted ?? false,
        };
        await db.transaction('rw', db.events, db.matches, db.matchState, async () => {
            if (formationGuard) {
                const parent = await db.matches.get(data.matchId);
                const state = await db.matchState.get(data.matchId);
                if (!formationGuard.isCurrent() || getUserId() !== formationGuard.ownerId ||
                    !isCurrentOwnedMatch(parent, formationGuard.ownerId) ||
                    (state ? !isCurrentOwnedMatch(state, formationGuard.ownerId) ||
                        !['SCHEDULED', 'LIVE', 'PAUSED'].includes(state.status) : parent?.synced !== false || !!parent.syncedAt || ('syncAttempted' in parent && !!parent.syncAttempted))) {
                    throw new Error('Match recording context changed. Reopen Team Changes.');
                }
            }
            if (!event.isDeleted) await checkEventQuota(event, config);
            if (formationGuard && (!formationGuard.isCurrent() || getUserId() !== formationGuard.ownerId)) {
                throw new Error('Match recording context changed. Reopen Team Changes.');
            }
            await db.events.add(event);
            event.scoreProjectionPending = await projectEventScore(event.matchId, undefined, event);
            await db.events.update(event.id, { scoreProjectionPending: event.scoreProjectionPending });
            await bumpRecordingRevision(event.matchId);
        });
        triggerSync();
        return event;
    },

    async update(id: string, data: Partial<{
        kind: string; periodNumber: number; clockMs: number; teamId: string;
        playerId: string | null; notes: string; sentiment: number;
    }>): Promise<void> {
        const config = await eventLimits();
        await db.transaction('rw', db.events, db.matches, db.syncFailures, async () => {
            let existing = await db.events.get(id);
            if (!existing || existing.isDeleted) throw new Error(`Event ${id} not found`);
            existing = await recordingOwner(existing, getUserId());
            const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
            const updated = { ...existing, ...defined, ...updateFields() } as DbEvent;
            if (data.playerId === null) updated.playerId = undefined;
            validateEvent(updated);
            if (updated.kind !== existing.kind || updated.teamId !== existing.teamId) await checkEventQuota(updated, config, id);
            await db.events.put(updated);
            await db.syncFailures.delete(['events', id]);
            const scoreChanged = await projectEventScore(existing.matchId, existing, updated);
            await db.events.update(id, {
                scoreProjectionPending: scoreChanged || (existing.synced === false && existing.scoreProjectionPending !== false),
            });
            await bumpRecordingRevision(existing.matchId);
        });
        triggerSync();
    },

    async delete(id: string): Promise<void> {
        await db.transaction('rw', db.events, db.matches, db.syncFailures, async () => {
            let existing = await db.events.get(id);
            if (!existing) return;
            existing = await recordingOwner(existing, getUserId());
            await db.events.update(id, {
                createdByUserId: existing.createdByUserId, isDeleted: true, deletedAt: new Date().toISOString(), deletedByUserId: getUserId(), ...updateFields(),
            });
            await db.syncFailures.delete(['events', id]);
            const scoreChanged = await projectEventScore(existing.matchId, existing);
            await db.events.update(id, {
                scoreProjectionPending: scoreChanged || (existing.synced === false && existing.scoreProjectionPending !== false),
            });
            await bumpRecordingRevision(existing.matchId);
        });
        triggerSync();
    },

    async getByMatch(matchId: string): Promise<DbEvent[]> {
        return db.events.where('matchId').equals(matchId).filter(e => !e.isDeleted).sortBy('clockMs');
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
        status: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
        currentPeriodId?: string | null;
        timerMs?: number;
        totalElapsedSeconds?: number;
    }): Promise<void> {
        if (!isReplayableMatchStatus(data.status)) throw new Error('Unsupported recording lifecycle status');
        if (data.totalElapsedSeconds !== undefined && (!Number.isFinite(data.totalElapsedSeconds) || data.totalElapsedSeconds < 0)) {
            throw new Error('Invalid playing duration');
        }
        await db.transaction('rw', db.matches, db.matchState, db.syncFailures, async () => {
            await assertRecordingLifecycleMutable(matchId);
            let existing = await db.matchState.get(matchId);
            if (existing) existing = await recordingOwner(existing, getUserId());
            await db.matchState.put({
                ...(existing ?? createCommonFields()), matchId, status: data.status,
                currentPeriodId: Object.prototype.hasOwnProperty.call(data, 'currentPeriodId') ? data.currentPeriodId ?? undefined : existing?.currentPeriodId,
                timerMs: data.timerMs ?? existing?.timerMs ?? 0,
                ...('totalElapsedSeconds' in data ? { totalElapsedSeconds: data.totalElapsedSeconds } : {}),
                lastUpdatedAt: Date.now(), ...updateFields(),
            } as DbMatchState);
            await db.syncFailures.delete(['matchState', matchId]);
            await bumpRecordingRevision(matchId);
        });
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

        const persisted = await db.transaction('rw', db.matches, db.matchPeriods, db.matchState, async () => {
            await assertRecordingLifecycleMutable(data.matchId);
            let active = await db.matchPeriods.where('matchId').equals(data.matchId)
                .filter(p => !p.isDeleted && p.endedAt == null).first();
            if (active) {
                active = await recordingOwner(active, getUserId());
                if (active.periodNumber === period.periodNumber && String(active.periodType || 'REGULAR').toUpperCase() === period.periodType) {
                    await db.matchPeriods.update(active.id, { createdByUserId: active.createdByUserId });
                    return active;
                }
                throw new Error('Cannot start new period: another period is already active');
            }
            await db.matchPeriods.add(period);
            await bumpRecordingRevision(data.matchId);
            return period;
        });
        triggerSync();
        return persisted;
    },

    async endPeriod(id: string, endedAt?: number, durationSeconds?: number): Promise<void> {
        if (durationSeconds !== undefined && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) throw new Error('Invalid playing duration');
        await db.transaction('rw', db.matches, db.matchPeriods, db.matchState, db.syncFailures, async () => {
            let period = await db.matchPeriods.get(id);
            if (!period) throw new Error(`Period ${id} not found`);
            await assertRecordingLifecycleMutable(period.matchId);
            period = await recordingOwner(period, getUserId());
            const endTime = endedAt ?? Date.now();
            if (endTime < period.startedAt) throw new Error('Period cannot end before it starts');
            await db.matchPeriods.update(id, {
                createdByUserId: period.createdByUserId,
                endedAt: endTime,
                durationSeconds: Math.floor(durationSeconds ?? Math.max(0, (endTime - period.startedAt) / 1000)),
                ...updateFields(),
            });
            await db.syncFailures.delete(['matchPeriods', id]);
            await bumpRecordingRevision(period.matchId);
        });
        triggerSync();
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
