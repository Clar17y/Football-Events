/**
 * Local Data Hooks - Reactive queries using Dexie useLiveQuery
 * 
 * These hooks provide reactive access to IndexedDB data. When data changes
 * in IndexedDB (from local writes or background sync), the UI auto-updates.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/indexedDB';
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

const EMPTY_ARRAY: any[] = [];

// ============================================================================
// TEAMS
// ============================================================================

export interface UseLocalTeamsOptions {
    includeOpponents?: boolean;
    search?: string;
}

export function useLocalTeams(options?: UseLocalTeamsOptions) {
    const teams = useLiveQuery(
        async () => {
            let results = await db.teams
                .filter(t => !t.isDeleted)
                .toArray();

            // Filter opponents if needed
            if (!options?.includeOpponents) {
                results = results.filter(t => !t.isOpponent);
            }

            // Search filter
            if (options?.search?.trim()) {
                const term = options.search.toLowerCase();
                results = results.filter(t => t.name.toLowerCase().includes(term));
            }

            // Sort by name
            results.sort((a, b) => a.name.localeCompare(b.name));

            // Transform to API format for UI consumption
            return results.map(t => ({
                id: t.id,
                name: t.name,
                homeKitPrimary: t.homeKitPrimary || t.colorPrimary,
                homeKitSecondary: t.homeKitSecondary || t.colorSecondary,
                awayKitPrimary: t.awayKitPrimary || t.awayColorPrimary,
                awayKitSecondary: t.awayKitSecondary || t.awayColorSecondary,
                logoUrl: t.logoUrl,
                isOpponent: !!t.isOpponent,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                createdByUserId: t.createdByUserId,
                isDeleted: !!t.isDeleted,
                synced: t.synced,
            }));
        },
        [options?.includeOpponents, options?.search]
    );

    return {
        teams: teams ?? [],
        loading: teams === undefined,
    };
}

export function useLocalTeam(teamId: string | undefined) {
    const team = useLiveQuery(
        async () => {
            if (!teamId) return undefined;
            const t = await db.teams.get(teamId);
            if (!t || t.isDeleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: t.id,
                name: t.name,
                homeKitPrimary: t.homeKitPrimary || t.colorPrimary,
                homeKitSecondary: t.homeKitSecondary || t.colorSecondary,
                awayKitPrimary: t.awayKitPrimary || t.awayColorPrimary,
                awayKitSecondary: t.awayKitSecondary || t.awayColorSecondary,
                logoUrl: t.logoUrl,
                isOpponent: !!t.isOpponent,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                createdByUserId: t.createdByUserId,
                isDeleted: !!t.isDeleted,
                synced: t.synced,
            };
        },
        [teamId]
    );

    return {
        team,
        loading: team === undefined && teamId !== undefined,
    };
}

// ============================================================================
// PLAYERS
// ============================================================================

export interface UseLocalPlayersOptions {
    teamId?: string;
    teamIds?: string[];
    noTeam?: boolean;
    search?: string;
    position?: string;
}

export function useLocalPlayers(options?: UseLocalPlayersOptions) {
    const players = useLiveQuery(
        async () => {
            let results = await db.players
                .filter(p => !p.isDeleted)
                .toArray();

            // Team filter using playerTeams junction table
            if (options?.teamIds && options.teamIds.length > 0) {
                // Get player IDs that belong to any of the specified teams
                const playerTeamRelations = await db.playerTeams
                    .filter((pt: any) => !pt.isDeleted && pt.isActive !== false && options.teamIds!.includes(pt.teamId))
                    .toArray();
                const playerIdsInTeams = new Set(playerTeamRelations.map((pt: any) => pt.playerId));
                results = results.filter(p => playerIdsInTeams.has(p.id));
            } else if (options?.teamId) {
                // Get player IDs that belong to the specified team
                const playerTeamRelations = await db.playerTeams
                    .where('teamId')
                    .equals(options.teamId)
                    .filter((pt: any) => !pt.isDeleted && pt.isActive !== false)
                    .toArray();
                const playerIdsInTeam = new Set(playerTeamRelations.map((pt: any) => pt.playerId));
                results = results.filter(p => playerIdsInTeam.has(p.id));
            } else if (options?.noTeam) {
                // Get all player IDs that have any active team relationship
                const allPlayerTeamRelations = await db.playerTeams
                    .filter((pt: any) => !pt.isDeleted && pt.isActive !== false)
                    .toArray();
                const playerIdsWithTeams = new Set(allPlayerTeamRelations.map((pt: any) => pt.playerId));
                results = results.filter(p => !playerIdsWithTeams.has(p.id));
            }

            // Search filter
            if (options?.search?.trim()) {
                const term = options.search.toLowerCase();
                results = results.filter(p => (p.name || p.fullName || '').toLowerCase().includes(term));
            }

            // Position filter
            if (options?.position) {
                results = results.filter(p => (p.preferredPosition || p.preferredPos) === options.position);
            }

            // Sort by name
            results.sort((a, b) => (a.name || a.fullName || '').localeCompare(b.name || b.fullName || ''));

            // Transform to API format for UI consumption
            return results.map(p => ({
                id: p.id,
                name: p.name || p.fullName || '',
                squadNumber: p.squadNumber,
                preferredPosition: p.preferredPosition || p.preferredPos,
                dateOfBirth: p.dateOfBirth || p.dob,
                notes: p.notes,
                currentTeam: p.currentTeam,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                createdByUserId: p.createdByUserId,
                isDeleted: !!p.isDeleted,
                synced: p.synced,
            }));
        },
        [options?.teamId, options?.teamIds?.join(','), options?.noTeam, options?.search, options?.position]
    );

    return {
        players: players ?? [],
        loading: players === undefined,
    };
}

export function useLocalPlayer(playerId: string | undefined) {
    const player = useLiveQuery(
        async () => {
            if (!playerId) return undefined;
            const p = await db.players.get(playerId);
            if (!p || p.isDeleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: p.id,
                name: p.name || p.fullName || '',
                squadNumber: p.squadNumber,
                preferredPosition: p.preferredPosition || p.preferredPos,
                dateOfBirth: p.dateOfBirth || p.dob,
                notes: p.notes,
                currentTeam: p.currentTeam,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                createdByUserId: p.createdByUserId,
                isDeleted: !!p.isDeleted,
                synced: p.synced,
            };
        },
        [playerId]
    );

    return {
        player,
        loading: player === undefined && playerId !== undefined,
    };
}

// ============================================================================
// SEASONS
// ============================================================================

export interface UseLocalSeasonsOptions {
    search?: string;
}

export function useLocalSeasons(options?: UseLocalSeasonsOptions) {
    const seasons = useLiveQuery(
        async () => {
            let results = await db.seasons
                .filter(s => !s.isDeleted)
                .toArray();

            // Search filter
            if (options?.search?.trim()) {
                const term = options.search.toLowerCase();
                results = results.filter(s => s.label.toLowerCase().includes(term));
            }

            // Sort by label
            results.sort((a, b) => a.label.localeCompare(b.label));

            // Transform to API format for UI consumption
            return results.map(s => ({
                id: s.seasonId,
                seasonId: s.seasonId,
                label: s.label,
                startDate: s.startDate,
                endDate: s.endDate,
                isCurrent: s.isCurrent,
                description: s.description,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
                createdByUserId: s.createdByUserId,
                isDeleted: !!s.isDeleted,
                synced: s.synced,
            }));
        },
        [options?.search]
    );

    return {
        seasons: seasons ?? [],
        loading: seasons === undefined,
    };
}

export function useLocalSeason(seasonId: string | undefined) {
    const season = useLiveQuery(
        async () => {
            if (!seasonId) return undefined;
            const s = await db.seasons.get(seasonId);
            if (!s || s.isDeleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: s.seasonId,
                seasonId: s.seasonId,
                label: s.label,
                startDate: s.startDate,
                endDate: s.endDate,
                isCurrent: s.isCurrent,
                description: s.description,
                createdAt: s.createdAt,
                updatedAt: s.updatedAt,
                createdByUserId: s.createdByUserId,
                isDeleted: !!s.isDeleted,
                synced: s.synced,
            };
        },
        [seasonId]
    );

    return {
        season,
        loading: season === undefined && seasonId !== undefined,
    };
}

// ============================================================================
// MATCHES
// ============================================================================

export interface UseLocalMatchesOptions {
    seasonId?: string;
    search?: string;
    fromDate?: number;
    toDate?: number;
}

export function useLocalMatches(options?: UseLocalMatchesOptions) {
    const matches = useLiveQuery(
        async () => {
            let results = await db.matches
                .filter(m => !m.isDeleted)
                .toArray();

            // Season filter
            if (options?.seasonId) {
                results = results.filter(m => m.seasonId === options.seasonId);
            }

            // Date range filter (kickoffTime is ISO string, convert to timestamp for comparison)
            if (options?.fromDate) {
                results = results.filter(m => m.kickoffTime && new Date(m.kickoffTime).getTime() >= options.fromDate!);
            }
            if (options?.toDate) {
                results = results.filter(m => m.kickoffTime && new Date(m.kickoffTime).getTime() <= options.toDate!);
            }

            // Sort by kickoff time (newest first)
            results.sort((a, b) => {
                const aTime = a.kickoffTime ? new Date(a.kickoffTime).getTime() : 0;
                const bTime = b.kickoffTime ? new Date(b.kickoffTime).getTime() : 0;
                return bTime - aTime;
            });

            // Transform to API format for UI consumption
            return results.map(m => ({
                id: m.id,
                matchId: m.id,
                seasonId: m.seasonId,
                kickoffTime: m.kickoffTime,
                competition: m.competition,
                homeTeamId: m.homeTeamId,
                awayTeamId: m.awayTeamId,
                venue: m.venue,
                durationMinutes: m.durationMinutes,
                periodFormat: m.periodFormat,
                homeScore: m.homeScore,
                awayScore: m.awayScore,
                notes: m.notes,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
                createdByUserId: m.createdByUserId,
                isDeleted: !!m.isDeleted,
                synced: m.synced,
            }));
        },
        [options?.seasonId, options?.fromDate, options?.toDate]
    );

    return {
        matches: matches ?? [],
        loading: matches === undefined,
    };
}

export function useLocalMatch(matchId: string | undefined) {
    const match = useLiveQuery(
        async () => {
            if (!matchId) return undefined;
            const m = await db.matches.get(matchId);
            if (!m || m.isDeleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: m.id,
                matchId: m.id,
                seasonId: m.seasonId,
                kickoffTime: m.kickoffTime,
                competition: m.competition,
                homeTeamId: m.homeTeamId,
                awayTeamId: m.awayTeamId,
                venue: m.venue,
                durationMinutes: m.durationMinutes,
                periodFormat: m.periodFormat,
                homeScore: m.homeScore,
                awayScore: m.awayScore,
                notes: m.notes,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt,
                createdByUserId: m.createdByUserId,
                isDeleted: !!m.isDeleted,
                synced: m.synced,
            };
        },
        [matchId]
    );

    return {
        match,
        loading: match === undefined && matchId !== undefined,
    };
}

// ============================================================================
// EVENTS
// ============================================================================

export function useLocalEvents(matchId: string | undefined) {
    const events = useLiveQuery(
        async () => {
            if (!matchId) return [];
            return db.events
                .where('matchId')
                .equals(matchId)
                .filter(e => !e.isDeleted)
                .sortBy('clockMs');
        },
        [matchId]
    );

    return {
        // Keep a stable reference when undefined to avoid dependency churn loops
        events: (events ?? EMPTY_ARRAY) as EnhancedEvent[],
        loading: events === undefined,
    };
}

// ============================================================================
// LINEUPS
// ============================================================================

export function useLocalLineups(matchId: string | undefined) {
    const lineups = useLiveQuery(
        async () => {
            if (!matchId) return [];
            return db.lineup
                .where('matchId')
                .equals(matchId)
                .filter(l => !l.isDeleted)
                .sortBy('startMinute');
        },
        [matchId]
    );

    return {
        lineups: (lineups ?? EMPTY_ARRAY) as EnhancedLineup[],
        loading: lineups === undefined,
    };
}

// ============================================================================
// MATCH STATE
// ============================================================================

export function useLocalMatchState(matchId: string | undefined) {
    const matchState = useLiveQuery(
        async () => {
            if (!matchId) return undefined;
            return db.matchState.get(matchId);
        },
        [matchId]
    );

    return {
        matchState,
        loading: matchState === undefined && matchId !== undefined,
    };
}

// ============================================================================
// MATCH PERIODS
// ============================================================================

export function useLocalMatchPeriods(matchId: string | undefined) {
    const periods = useLiveQuery(
        async () => {
            if (!matchId) return [];
            return db.matchPeriods
                .where('matchId')
                .equals(matchId)
                .filter(p => !p.isDeleted)
                .sortBy('periodNumber');
        },
        [matchId]
    );

    return {
        periods: (periods ?? EMPTY_ARRAY) as LocalMatchPeriod[],
        loading: periods === undefined,
    };
}

// ============================================================================
// DEFAULT LINEUPS
// ============================================================================

export function useLocalDefaultLineup(teamId: string | undefined) {
    const defaultLineup = useLiveQuery(
        async () => {
            if (!teamId) return null; // Return null (not undefined) when no teamId
            const result = await db.defaultLineups
                .where('teamId')
                .equals(teamId)
                .filter(dl => !dl.isDeleted)
                .first();
            return result ?? null; // Return null (not undefined) when no record found
        },
        [teamId]
    );

    return {
        defaultLineup,
        // undefined = query still running, null = query completed with no result
        loading: defaultLineup === undefined,
    };
}

// ============================================================================
// SYNC STATUS
// ============================================================================

export function useLocalSyncStatus() {
    const status = useLiveQuery(
        async () => {
            // Count unsynced records across all tables
            const [teams, players, seasons, matches, events, lineups, periods, states, defaultLineups] = await Promise.all([
                db.teams.filter(t => !t.synced).count(),
                db.players.filter(p => !p.synced).count(),
                db.seasons.filter(s => !s.synced).count(),
                db.matches.filter(m => !m.synced).count(),
                db.events.filter(e => !e.synced).count(),
                db.lineup.filter(l => !l.synced).count(),
                db.matchPeriods.filter(p => !p.synced).count(),
                db.matchState.filter(s => !s.synced).count(),
                db.defaultLineups.filter(dl => !dl.synced).count(),
            ]);

            const total = teams + players + seasons + matches + events + lineups + periods + states + defaultLineups;

            return {
                pending: total,
                breakdown: { teams, players, seasons, matches, events, lineups, periods, states, defaultLineups },
                isSynced: total === 0,
            };
        },
        [] // Re-run when any data changes
    );

    return {
        syncStatus: status ?? { pending: 0, breakdown: {}, isSynced: true },
        loading: status === undefined,
    };
}
