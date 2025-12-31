/**
 * Test Data Seeding Utility
 * 
 * Seeds the IndexedDB with real Premier League data for testing purposes.
 * Uses 20 test users (1 per team), each with 1 managed team + 19 opponent copies.
 */

import { db } from '../indexedDB';
import type {
    DbTeam,
    DbPlayer,
    DbPlayerTeam,
    DbSeason,
    DbMatch,
    DbEvent,
    DbMatchState,
    DbMatchPeriod
} from '../schema';
import {
    getTeams,
    getMatches,
    getTeamById,
    parseClubColors,
    mapPosition,
    getTestUserId,
    type ApiTeam,
    type ApiMatch,
} from './premierLeagueData';

// ============================================================================
// Types
// ============================================================================

export interface SeedingProgress {
    stage: 'idle' | 'seasons' | 'teams' | 'players' | 'matches' | 'events' | 'complete' | 'error';
    current: number;
    total: number;
    message: string;
}

export interface SeedingStats {
    seasons: number;
    teams: number;
    players: number;
    playerTeams: number;
    matches: number;
    events: number;
    matchStates: number;
    matchPeriods: number;
}

type ProgressCallback = (progress: SeedingProgress) => void;

// ============================================================================
// Constants
// ============================================================================

const SEASONS = [
    { id: 'season-2023-24', label: '2023/24 Season', startDate: '2023-08-11', endDate: '2024-05-19', apiYear: 2023 },
    { id: 'season-2024-25', label: '2024/25 Season', startDate: '2024-08-16', endDate: '2025-05-25', apiYear: 2024 },
] as const;

const EVENT_KINDS = ['goal', 'assist', 'shot_on_target', 'shot_off_target', 'save', 'tackle', 'foul', 'corner'] as const;

// ============================================================================
// Helper Functions
// ============================================================================

function generateUUID(): string {
    return globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get season ID based on match date
 */
function getSeasonIdForDate(utcDate: string): string {
    const year = new Date(utcDate).getFullYear();
    const month = new Date(utcDate).getMonth();
    // Season starts in August, so Aug-Dec is start of season year
    if (month >= 7) { // August onwards
        return `season-${year}-${(year + 1).toString().slice(-2)}`;
    } else {
        return `season-${year - 1}-${year.toString().slice(-2)}`;
    }
}

// ============================================================================
// Data Transformation
// ============================================================================

/**
 * Create a DbTeam from API data
 */
function createTeam(apiTeam: ApiTeam, userId: string, isOpponent: boolean): DbTeam {
    const now = new Date().toISOString();
    const colors = parseClubColors(apiTeam.clubColors);

    return {
        id: isOpponent ? `team-${apiTeam.tla.toLowerCase()}-opp-${userId}` : `team-${apiTeam.tla.toLowerCase()}`,
        name: apiTeam.name.replace(' FC', '').replace(' AFC', ''),
        homeKitPrimary: colors.primary,
        homeKitSecondary: colors.secondary,
        awayKitPrimary: colors.secondary,
        awayKitSecondary: colors.primary,
        logoUrl: apiTeam.crest,
        isOpponent,
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
    };
}

/**
 * Create a DbPlayer from API data
 */
function createPlayer(apiPlayer: { id: number; name: string; position: string | null; dateOfBirth: string | null },
    teamId: string,
    userId: string,
    squadNumber: number): DbPlayer {
    const now = new Date().toISOString();

    return {
        id: `player-${apiPlayer.id}-${teamId}`,
        name: apiPlayer.name,
        squadNumber,
        preferredPosition: mapPosition(apiPlayer.position),
        dateOfBirth: apiPlayer.dateOfBirth || undefined,
        currentTeam: teamId,
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
    };
}

/**
 * Create a DbPlayerTeam relationship
 */
function createPlayerTeam(playerId: string, teamId: string, userId: string): DbPlayerTeam {
    const now = new Date().toISOString();

    return {
        id: `pt-${playerId}-${teamId}`,
        playerId,
        teamId,
        startDate: now,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
    };
}

/**
 * Create a DbSeason
 */
function createSeason(seasonDef: typeof SEASONS[number], userId: string): DbSeason {
    const now = new Date().toISOString();
    const seasonId = `${seasonDef.id}-${userId}`;

    return {
        id: seasonId,
        seasonId: seasonId,
        label: seasonDef.label,
        startDate: seasonDef.startDate,
        endDate: seasonDef.endDate,
        isCurrent: seasonDef.apiYear === 2024, // 2024-25 is current season
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
    };
}

/**
 * Create a DbMatch from API data
 */
function createMatch(
    apiMatch: ApiMatch,
    homeTeamId: string,
    awayTeamId: string,
    seasonId: string,
    userId: string
): DbMatch {
    const now = new Date().toISOString();
    const matchId = `match-${apiMatch.id}-${userId}`;

    return {
        id: matchId,
        matchId,
        seasonId,
        homeTeamId,
        awayTeamId,
        homeScore: apiMatch.score.fullTime.home ?? 0,
        awayScore: apiMatch.score.fullTime.away ?? 0,
        durationMinutes: 90,
        periodFormat: 'HALVES',
        kickoffTime: apiMatch.utcDate,
        venue: undefined,
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
    };
}

/**
 * Generate events for a match based on score
 */
function generateEventsForMatch(
    match: DbMatch,
    homePlayers: DbPlayer[],
    awayPlayers: DbPlayer[],
    userId: string
): DbEvent[] {
    const events: DbEvent[] = [];
    const now = new Date().toISOString();

    // Helper to create an event
    const createEvent = (
        kind: string,
        teamId: string,
        playerId: string,
        periodNumber: number,
        clockMs: number,
        sentiment: number
    ): DbEvent => ({
        id: generateUUID(),
        matchId: match.id,
        periodNumber,
        clockMs,
        kind: kind as any,
        teamId,
        playerId,
        sentiment,
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
    });

    // Generate goal events
    for (let i = 0; i < match.homeScore; i++) {
        const period = i < Math.ceil(match.homeScore / 2) ? 1 : 2;
        const minute = randomInt(1, 45);
        const player = randomChoice(homePlayers.filter(p => p.preferredPosition !== 'GK'));
        if (player) {
            events.push(createEvent('goal', match.homeTeamId, player.id, period, minute * 60000, 4));

            // 70% chance of assist
            if (Math.random() < 0.7) {
                const assister = randomChoice(homePlayers.filter(p => p.id !== player.id && p.preferredPosition !== 'GK'));
                if (assister) {
                    events.push(createEvent('assist', match.homeTeamId, assister.id, period, minute * 60000, 3));
                }
            }
        }
    }

    for (let i = 0; i < match.awayScore; i++) {
        const period = i < Math.ceil(match.awayScore / 2) ? 1 : 2;
        const minute = randomInt(1, 45);
        const player = randomChoice(awayPlayers.filter(p => p.preferredPosition !== 'GK'));
        if (player) {
            events.push(createEvent('goal', match.awayTeamId, player.id, period, minute * 60000, 4));

            if (Math.random() < 0.7) {
                const assister = randomChoice(awayPlayers.filter(p => p.id !== player.id && p.preferredPosition !== 'GK'));
                if (assister) {
                    events.push(createEvent('assist', match.awayTeamId, assister.id, period, minute * 60000, 3));
                }
            }
        }
    }

    // Generate additional events (shots, saves, tackles, etc.)
    const additionalEventCount = randomInt(10, 20);
    for (let i = 0; i < additionalEventCount; i++) {
        const isHome = Math.random() > 0.5;
        const teamId = isHome ? match.homeTeamId : match.awayTeamId;
        const players = isHome ? homePlayers : awayPlayers;
        const kind = randomChoice(['shot_on_target', 'shot_off_target', 'tackle', 'corner', 'foul'] as const);
        const player = randomChoice(players);

        if (player) {
            const period = Math.random() > 0.5 ? 1 : 2;
            const minute = randomInt(1, 45);
            const sentiment = kind === 'foul' ? -1 : (kind.includes('shot') ? 2 : 1);
            events.push(createEvent(kind, teamId, player.id, period, minute * 60000, sentiment));
        }
    }

    // Generate saves for goalkeepers
    for (const players of [homePlayers, awayPlayers]) {
        const gk = players.find(p => p.preferredPosition === 'GK');
        if (gk) {
            const saveCount = randomInt(2, 6);
            for (let i = 0; i < saveCount; i++) {
                const period = Math.random() > 0.5 ? 1 : 2;
                const minute = randomInt(1, 45);
                const teamId = players === homePlayers ? match.homeTeamId : match.awayTeamId;
                events.push(createEvent('save', teamId, gk.id, period, minute * 60000, 3));
            }
        }
    }

    return events;
}

/**
 * Create match state for a completed match
 */
function createMatchState(matchId: string, userId: string): DbMatchState {
    const now = new Date().toISOString();

    return {
        matchId,
        status: 'COMPLETED',
        timerMs: 90 * 60 * 1000, // 90 minutes
        lastUpdatedAt: Date.now(),
        createdAt: now,
        updatedAt: now,
        createdByUserId: userId,
        isDeleted: false,
        synced: false,
    };
}

/**
 * Create match periods for a completed match (2 halves)
 */
function createMatchPeriods(matchId: string, kickoffTime: string, userId: string): DbMatchPeriod[] {
    const now = new Date().toISOString();
    const kickoffTs = new Date(kickoffTime).getTime();

    return [
        {
            id: `${matchId}-period-1`,
            matchId,
            periodNumber: 1,
            periodType: 'REGULAR',
            startedAt: kickoffTs,
            endedAt: kickoffTs + 45 * 60 * 1000,
            durationSeconds: 45 * 60,
            createdAt: now,
            updatedAt: now,
            createdByUserId: userId,
            isDeleted: false,
            synced: false,
        },
        {
            id: `${matchId}-period-2`,
            matchId,
            periodNumber: 2,
            periodType: 'REGULAR',
            startedAt: kickoffTs + 60 * 60 * 1000, // After 15min break
            endedAt: kickoffTs + 105 * 60 * 1000,
            durationSeconds: 45 * 60,
            createdAt: now,
            updatedAt: now,
            createdByUserId: userId,
            isDeleted: false,
            synced: false,
        },
    ];
}

// ============================================================================
// Main Seeding Functions
// ============================================================================

/**
 * Seed all Premier League test data
 */
export async function seedPremierLeagueData(
    onProgress?: ProgressCallback
): Promise<SeedingStats> {
    const stats: SeedingStats = {
        seasons: 0,
        teams: 0,
        players: 0,
        playerTeams: 0,
        matches: 0,
        events: 0,
        matchStates: 0,
        matchPeriods: 0,
    };

    try {
        const apiTeams = getTeams();
        const totalTeams = apiTeams.length;

        onProgress?.({ stage: 'seasons', current: 0, total: totalTeams, message: 'Creating seasons...' });

        // Process each team as a separate user
        for (let teamIdx = 0; teamIdx < apiTeams.length; teamIdx++) {
            const apiTeam = apiTeams[teamIdx];
            const userId = getTestUserId(apiTeam.tla);

            onProgress?.({
                stage: 'teams',
                current: teamIdx + 1,
                total: totalTeams,
                message: `Processing ${apiTeam.shortName}...`
            });

            await db.transaction('rw',
                [db.seasons, db.teams, db.players, db.playerTeams, db.matches, db.events, db.matchState, db.matchPeriods],
                async () => {
                    // Create seasons for this user
                    const userSeasons: DbSeason[] = SEASONS.map(s => createSeason(s, userId));
                    await db.seasons.bulkAdd(userSeasons);
                    stats.seasons += userSeasons.length;

                    // Create the managed team
                    const managedTeam = createTeam(apiTeam, userId, false);
                    await db.teams.add(managedTeam);
                    stats.teams++;

                    // Create players for the managed team (first 18 players)
                    const managedPlayers: DbPlayer[] = apiTeam.squad
                        .slice(0, 18)
                        .map((p, idx) => createPlayer(p, managedTeam.id, userId, idx + 1));
                    await db.players.bulkAdd(managedPlayers);
                    stats.players += managedPlayers.length;

                    // Create player-team relationships
                    const managedPTs = managedPlayers.map(p => createPlayerTeam(p.id, managedTeam.id, userId));
                    await db.playerTeams.bulkAdd(managedPTs);
                    stats.playerTeams += managedPTs.length;

                    // Create opponent teams and their players
                    const opponentTeams: DbTeam[] = [];
                    const opponentPlayersMap: Map<string, DbPlayer[]> = new Map();

                    for (const otherTeam of apiTeams) {
                        if (otherTeam.id === apiTeam.id) continue;

                        const oppTeam = createTeam(otherTeam, userId, true);
                        opponentTeams.push(oppTeam);

                        // Create minimal players for opponent (11 players)
                        const oppPlayers = otherTeam.squad
                            .slice(0, 11)
                            .map((p, idx) => createPlayer(p, oppTeam.id, userId, idx + 1));
                        opponentPlayersMap.set(oppTeam.id, oppPlayers);
                    }

                    await db.teams.bulkAdd(opponentTeams);
                    stats.teams += opponentTeams.length;

                    for (const [_, players] of opponentPlayersMap) {
                        await db.players.bulkAdd(players);
                        stats.players += players.length;

                        const pts = players.map(p => createPlayerTeam(p.id, p.currentTeam!, userId));
                        await db.playerTeams.bulkAdd(pts);
                        stats.playerTeams += pts.length;
                    }

                    // Create matches where this team played (home or away)
                    const allMatches = [...getMatches(2023), ...getMatches(2024)];
                    const teamMatches = allMatches.filter(
                        m => m.homeTeam.id === apiTeam.id || m.awayTeam.id === apiTeam.id
                    );

                    const dbMatches: DbMatch[] = [];
                    const dbEvents: DbEvent[] = [];
                    const dbMatchStates: DbMatchState[] = [];
                    const dbMatchPeriods: DbMatchPeriod[] = [];

                    for (const apiMatch of teamMatches) {
                        const isHome = apiMatch.homeTeam.id === apiTeam.id;
                        const opponentApiTeam = isHome ? apiMatch.awayTeam : apiMatch.homeTeam;

                        // Find the opponent team ID in our created teams
                        const oppTeam = opponentTeams.find(t =>
                            t.name.includes(opponentApiTeam.shortName) ||
                            t.id.includes(opponentApiTeam.tla.toLowerCase())
                        );

                        if (!oppTeam) continue;

                        const homeTeamId = isHome ? managedTeam.id : oppTeam.id;
                        const awayTeamId = isHome ? oppTeam.id : managedTeam.id;
                        const seasonId = `${getSeasonIdForDate(apiMatch.utcDate)}-${userId}`;

                        const match = createMatch(apiMatch, homeTeamId, awayTeamId, seasonId, userId);
                        dbMatches.push(match);

                        // Get players for event generation
                        const homePlayers = isHome ? managedPlayers : (opponentPlayersMap.get(homeTeamId) || []);
                        const awayPlayers = isHome ? (opponentPlayersMap.get(awayTeamId) || []) : managedPlayers;

                        const events = generateEventsForMatch(match, homePlayers, awayPlayers, userId);
                        dbEvents.push(...events);

                        dbMatchStates.push(createMatchState(match.id, userId));
                        dbMatchPeriods.push(...createMatchPeriods(match.id, match.kickoffTime!, userId));
                    }

                    await db.matches.bulkAdd(dbMatches);
                    stats.matches += dbMatches.length;

                    await db.events.bulkAdd(dbEvents);
                    stats.events += dbEvents.length;

                    await db.matchState.bulkAdd(dbMatchStates);
                    stats.matchStates += dbMatchStates.length;

                    await db.matchPeriods.bulkAdd(dbMatchPeriods);
                    stats.matchPeriods += dbMatchPeriods.length;
                }
            );
        }

        onProgress?.({ stage: 'complete', current: totalTeams, total: totalTeams, message: 'Seeding complete!' });

        return stats;
    } catch (error) {
        onProgress?.({ stage: 'error', current: 0, total: 0, message: `Error: ${error}` });
        throw error;
    }
}

/**
 * Clear all data from IndexedDB
 */
export async function clearAllData(): Promise<void> {
    await db.transaction('rw',
        [db.events, db.matches, db.teams, db.players, db.seasons, db.lineup, db.playerTeams,
        db.matchNotes, db.matchPeriods, db.matchState, db.defaultLineups, db.syncMetadata, db.syncFailures],
        async () => {
            await db.events.clear();
            await db.matches.clear();
            await db.teams.clear();
            await db.players.clear();
            await db.seasons.clear();
            await db.lineup.clear();
            await db.playerTeams.clear();
            await db.matchNotes.clear();
            await db.matchPeriods.clear();
            await db.matchState.clear();
            await db.defaultLineups.clear();
            await db.syncMetadata.clear();
            await db.syncFailures.clear();
        }
    );
}

/**
 * Get current data counts
 */
export async function getDataCounts(): Promise<SeedingStats> {
    const [seasons, teams, players, playerTeams, matches, events, matchStates, matchPeriods] = await Promise.all([
        db.seasons.count(),
        db.teams.count(),
        db.players.count(),
        db.playerTeams.count(),
        db.matches.count(),
        db.events.count(),
        db.matchState.count(),
        db.matchPeriods.count(),
    ]);

    return { seasons, teams, players, playerTeams, matches, events, matchStates, matchPeriods };
}
