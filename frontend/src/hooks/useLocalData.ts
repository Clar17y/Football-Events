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
                .filter(t => !t.is_deleted)
                .toArray();

            // Filter opponents if needed
            if (!options?.includeOpponents) {
                results = results.filter(t => !(t as any).is_opponent);
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
                homeKitPrimary: t.color_primary,
                homeKitSecondary: t.color_secondary,
                awayKitPrimary: t.away_color_primary,
                awayKitSecondary: t.away_color_secondary,
                logoUrl: t.logo_url,
                is_opponent: !!(t as any).is_opponent,
                createdAt: t.created_at ? new Date(t.created_at) : undefined,
                updatedAt: t.updated_at ? new Date(t.updated_at) : undefined,
                created_by_user_id: t.created_by_user_id,
                is_deleted: !!t.is_deleted,
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
            if (!t || t.is_deleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: t.id,
                name: t.name,
                homeKitPrimary: t.color_primary,
                homeKitSecondary: t.color_secondary,
                awayKitPrimary: t.away_color_primary,
                awayKitSecondary: t.away_color_secondary,
                logoUrl: t.logo_url,
                is_opponent: !!(t as any).is_opponent,
                createdAt: t.created_at ? new Date(t.created_at) : undefined,
                updatedAt: t.updated_at ? new Date(t.updated_at) : undefined,
                created_by_user_id: t.created_by_user_id,
                is_deleted: !!t.is_deleted,
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
                .filter(p => !p.is_deleted)
                .toArray();

            // Team filter using player_teams junction table
            if (options?.teamIds && options.teamIds.length > 0) {
                // Get player IDs that belong to any of the specified teams
                const playerTeamRelations = await db.player_teams
                    .filter((pt: any) => !pt.is_deleted && pt.is_active !== false && options.teamIds!.includes(pt.team_id))
                    .toArray();
                const playerIdsInTeams = new Set(playerTeamRelations.map((pt: any) => pt.player_id));
                results = results.filter(p => playerIdsInTeams.has(p.id));
            } else if (options?.teamId) {
                // Get player IDs that belong to the specified team
                const playerTeamRelations = await db.player_teams
                    .where('team_id')
                    .equals(options.teamId)
                    .filter((pt: any) => !pt.is_deleted && pt.is_active !== false)
                    .toArray();
                const playerIdsInTeam = new Set(playerTeamRelations.map((pt: any) => pt.player_id));
                results = results.filter(p => playerIdsInTeam.has(p.id));
            } else if (options?.noTeam) {
                // Get all player IDs that have any active team relationship
                const allPlayerTeamRelations = await db.player_teams
                    .filter((pt: any) => !pt.is_deleted && pt.is_active !== false)
                    .toArray();
                const playerIdsWithTeams = new Set(allPlayerTeamRelations.map((pt: any) => pt.player_id));
                results = results.filter(p => !playerIdsWithTeams.has(p.id));
            }

            // Search filter
            if (options?.search?.trim()) {
                const term = options.search.toLowerCase();
                results = results.filter(p => p.full_name.toLowerCase().includes(term));
            }

            // Position filter
            if (options?.position) {
                results = results.filter(p => p.preferred_pos === options.position);
            }

            // Sort by name
            results.sort((a, b) => a.full_name.localeCompare(b.full_name));

            // Transform to API format for UI consumption
            return results.map(p => ({
                id: p.id,
                name: p.full_name,
                squadNumber: p.squad_number,
                preferredPosition: p.preferred_pos,
                dateOfBirth: p.dob ? new Date(p.dob) : undefined,
                notes: p.notes,
                currentTeam: p.current_team,
                createdAt: new Date(p.created_at),
                updatedAt: p.updated_at ? new Date(p.updated_at) : undefined,
                created_by_user_id: p.created_by_user_id,
                is_deleted: !!p.is_deleted,
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
            if (!p || p.is_deleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: p.id,
                name: p.full_name,
                squadNumber: p.squad_number,
                preferredPosition: p.preferred_pos,
                dateOfBirth: p.dob ? new Date(p.dob) : undefined,
                notes: p.notes,
                currentTeam: p.current_team,
                createdAt: new Date(p.created_at),
                updatedAt: p.updated_at ? new Date(p.updated_at) : undefined,
                created_by_user_id: p.created_by_user_id,
                is_deleted: !!p.is_deleted,
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
                .filter(s => !s.is_deleted)
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
                id: s.season_id,
                seasonId: s.season_id,
                label: s.label,
                startDate: s.start_date,
                endDate: s.end_date,
                isCurrent: s.is_current,
                description: s.description,
                createdAt: s.created_at ? new Date(s.created_at) : undefined,
                updatedAt: s.updated_at ? new Date(s.updated_at) : undefined,
                created_by_user_id: s.created_by_user_id,
                is_deleted: !!s.is_deleted,
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
            if (!s || s.is_deleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: s.season_id,
                seasonId: s.season_id,
                label: s.label,
                startDate: s.start_date,
                endDate: s.end_date,
                isCurrent: s.is_current,
                description: s.description,
                createdAt: s.created_at ? new Date(s.created_at) : undefined,
                updatedAt: s.updated_at ? new Date(s.updated_at) : undefined,
                created_by_user_id: s.created_by_user_id,
                is_deleted: !!s.is_deleted,
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
                .filter(m => !m.is_deleted)
                .toArray();

            // Season filter
            if (options?.seasonId) {
                results = results.filter(m => m.season_id === options.seasonId);
            }

            // Date range filter
            if (options?.fromDate) {
                results = results.filter(m => m.kickoff_ts >= options.fromDate!);
            }
            if (options?.toDate) {
                results = results.filter(m => m.kickoff_ts <= options.toDate!);
            }

            // Sort by kickoff time (newest first)
            results.sort((a, b) => b.kickoff_ts - a.kickoff_ts);

            // Transform to API format for UI consumption
            return results.map(m => ({
                id: m.id,
                matchId: m.id,
                seasonId: m.season_id,
                kickoffTime: m.kickoff_ts ? new Date(m.kickoff_ts) : undefined,
                competition: m.competition,
                homeTeamId: m.home_team_id,
                awayTeamId: m.away_team_id,
                venue: m.venue,
                durationMinutes: m.duration_mins,
                periodFormat: m.period_format,
                homeScore: m.home_score,
                awayScore: m.away_score,
                notes: m.notes,
                createdAt: m.created_at ? new Date(m.created_at) : undefined,
                updatedAt: m.updated_at ? new Date(m.updated_at) : undefined,
                created_by_user_id: m.created_by_user_id,
                is_deleted: !!m.is_deleted,
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
            if (!m || m.is_deleted) return undefined;
            // Transform to API format for UI consumption
            return {
                id: m.id,
                matchId: m.id,
                seasonId: m.season_id,
                kickoffTime: m.kickoff_ts ? new Date(m.kickoff_ts) : undefined,
                competition: m.competition,
                homeTeamId: m.home_team_id,
                awayTeamId: m.away_team_id,
                venue: m.venue,
                durationMinutes: m.duration_mins,
                periodFormat: m.period_format,
                homeScore: m.home_score,
                awayScore: m.away_score,
                notes: m.notes,
                createdAt: m.created_at ? new Date(m.created_at) : undefined,
                updatedAt: m.updated_at ? new Date(m.updated_at) : undefined,
                created_by_user_id: m.created_by_user_id,
                is_deleted: !!m.is_deleted,
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
                .where('match_id')
                .equals(matchId)
                .filter(e => !e.is_deleted)
                .sortBy('clock_ms');
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
                .where('match_id')
                .equals(matchId)
                .filter(l => !l.is_deleted)
                .sortBy('start_min');
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
            return db.match_state.get(matchId);
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
            return db.match_periods
                .where('match_id')
                .equals(matchId)
                .filter(p => !p.is_deleted)
                .sortBy('period_number');
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
            const result = await db.default_lineups
                .where('team_id')
                .equals(teamId)
                .filter(dl => !dl.is_deleted)
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
                db.match_periods.filter(p => !p.synced).count(),
                db.match_state.filter(s => !s.synced).count(),
                db.default_lineups.filter(dl => !dl.synced).count(),
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
