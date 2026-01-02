/**
 * Development Seed Service
 * 
 * Seeds PostgreSQL with Premier League test data for authenticated user testing.
 * Creates real users that can log in and have their data sync.
 * 
 * ONLY available in development environment.
 */

import { PrismaClient, event_kind, position_code } from '@prisma/client';
import { hashPassword } from '../utils/auth.js';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// ============================================================================
// Types
// ============================================================================

interface ApiPlayer {
    id: number;
    name: string;
    position: string | null;
    dateOfBirth: string | null;
    nationality: string;
}

interface ApiTeam {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
    clubColors?: string;
    squad: ApiPlayer[];
}

interface ApiMatch {
    id: number;
    utcDate: string;
    status: string;
    matchday: number;
    homeTeam: { id: number; name: string; shortName: string; tla: string };
    awayTeam: { id: number; name: string; shortName: string; tla: string };
    score: {
        winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null;
        fullTime: { home: number | null; away: number | null };
    };
}

interface SeedingResult {
    success: boolean;
    users: Array<{ email: string; password: string; teamName: string }>;
    stats: {
        users: number;
        seasons: number;
        teams: number;
        players: number;
        playerTeams: number;
        matches: number;
        events: number;
    };
}

// ============================================================================
// Helper Functions
// ============================================================================

function loadJsonData<T>(filename: string): T {
    const filePath = path.join(__dirname, '..', 'seed', filename);
    let data = fs.readFileSync(filePath, 'utf-8');
    // Strip BOM (Byte Order Mark) if present
    data = data.replace(/^\uFEFF/, '');
    return JSON.parse(data) as T;
}

function parseClubColors(clubColors: string | undefined): { primary: string; secondary: string } {
    const colorMap: Record<string, string> = {
        'red': '#DC0714',
        'white': '#FFFFFF',
        'claret': '#7A263A',
        'sky blue': '#95BFE5',
        'royal blue': '#034694',
        'blue': '#0057B8',
        'navy blue': '#132257',
        'gold': '#FFD700',
        'yellow': '#FFCD00',
        'black': '#000000',
        'orange': '#F58220',
        'green': '#00A650',
        'light blue': '#6CABDD',
        'maroon': '#800000',
        'purple': '#6C1D45',
        'amber': '#FFC659',
    };

    if (!clubColors) {
        return { primary: '#1976D2', secondary: '#FFFFFF' };
    }

    const parts = clubColors.toLowerCase().split('/').map(s => s.trim());
    const primary = colorMap[parts[0] ?? ''] ?? '#1976D2';
    const secondary = colorMap[parts[1] ?? ''] ?? '#FFFFFF';

    return { primary, secondary };
}

function mapPosition(apiPosition: string | null): position_code {
    if (!apiPosition) return position_code.CM;

    const positionMap: Record<string, position_code> = {
        'goalkeeper': position_code.GK,
        'centre-back': position_code.CB,
        'right-back': position_code.RB,
        'left-back': position_code.LB,
        'defensive midfield': position_code.CDM,
        'central midfield': position_code.CM,
        'attacking midfield': position_code.CAM,
        'left midfield': position_code.LM,
        'right midfield': position_code.RM,
        'left winger': position_code.LW,
        'right winger': position_code.RW,
        'centre-forward': position_code.ST,
        'second striker': position_code.SS,
        'defence': position_code.CB,
        'midfield': position_code.CM,
        'offence': position_code.ST,
    };

    return positionMap[apiPosition.toLowerCase()] ?? position_code.CM;
}

function generateEmail(teamTla: string): string {
    return `${teamTla.toLowerCase()}@test.com`;
}

function getSeasonIdForDate(utcDate: string): '2023-24' | '2024-25' {
    const year = new Date(utcDate).getFullYear();
    const month = new Date(utcDate).getMonth();
    if (month >= 7) {
        return year === 2024 ? '2024-25' : '2023-24';
    }
    return year === 2025 ? '2024-25' : '2023-24';
}

function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// Main Seeding Functions
// ============================================================================

export async function seedPremierLeagueData(): Promise<SeedingResult> {
    const stats = {
        users: 0,
        seasons: 0,
        teams: 0,
        players: 0,
        playerTeams: 0,
        matches: 0,
        events: 0,
    };

    const userCredentials: Array<{ email: string; password: string; teamName: string }> = [];
    const passwordHash = await hashPassword('password');

    // Load data
    const teamsData = loadJsonData<{ teams: ApiTeam[] }>('pl-2024-teams.json');
    const matches2023 = loadJsonData<{ matches: ApiMatch[] }>('pl-2023-matches.json');
    const matches2024 = loadJsonData<{ matches: ApiMatch[] }>('pl-2024-matches.json');

    const apiTeams = teamsData.teams;
    const allMatches = [
        ...matches2023.matches.filter(m => m.status === 'FINISHED'),
        ...matches2024.matches.filter(m => m.status === 'FINISHED'),
    ];

    console.log(`[DevSeed] Found ${apiTeams.length} teams, ${allMatches.length} matches`);

    // Process each team as a user
    for (const apiTeam of apiTeams) {
        const email = generateEmail(apiTeam.tla);
        const teamName = apiTeam.name.replace(' FC', '').replace(' AFC', '');

        console.log(`[DevSeed] Creating user: ${email} (${teamName})`);

        await prisma.$transaction(async (tx) => {
            // Create user
            const user = await tx.user.create({
                data: {
                    email,
                    password_hash: passwordHash,
                    first_name: teamName,
                    last_name: 'Coach',
                },
            });
            stats.users++;

            userCredentials.push({ email, password: 'password', teamName });

            // Create seasons
            const seasons = await Promise.all([
                tx.seasons.create({
                    data: {
                        label: '2023/24 Season',
                        start_date: new Date('2023-08-11'),
                        end_date: new Date('2024-05-19'),
                        is_current: false,
                        created_by_user_id: user.id,
                    },
                }),
                tx.seasons.create({
                    data: {
                        label: '2024/25 Season',
                        start_date: new Date('2024-08-16'),
                        end_date: new Date('2025-05-25'),
                        is_current: true,
                        created_by_user_id: user.id,
                    },
                }),
            ]);
            stats.seasons += 2;

            const seasonMap = {
                '2023-24': seasons[0]!.season_id,
                '2024-25': seasons[1]!.season_id,
            };

            // Create managed team
            const colors = parseClubColors(apiTeam.clubColors);
            const managedTeam = await tx.team.create({
                data: {
                    name: teamName,
                    home_kit_primary: colors.primary,
                    home_kit_secondary: colors.secondary,
                    away_kit_primary: colors.secondary,
                    away_kit_secondary: colors.primary,
                    logo_url: apiTeam.crest,
                    is_opponent: false,
                    created_by_user_id: user.id,
                },
            });
            stats.teams++;

            // Create players for managed team (first 18)
            const managedPlayers = await Promise.all(
                apiTeam.squad.slice(0, 18).map((p, idx) =>
                    tx.player.create({
                        data: {
                            name: p.name,
                            squad_number: idx + 1,
                            preferred_pos: mapPosition(p.position),
                            dob: p.dateOfBirth ? new Date(p.dateOfBirth) : null,
                            created_by_user_id: user.id,
                        },
                    })
                )
            );
            stats.players += managedPlayers.length;

            // Create player-team relationships
            await tx.player_teams.createMany({
                data: managedPlayers.map(p => ({
                    player_id: p.id,
                    team_id: managedTeam.id,
                    start_date: new Date(),
                    is_active: true,
                    created_by_user_id: user.id,
                })),
            });
            stats.playerTeams += managedPlayers.length;

            // Create opponent teams with minimal players
            const opponentTeamsMap = new Map<number, string>(); // API team ID -> DB team ID
            const opponentPlayersMap = new Map<string, string[]>(); // DB team ID -> player IDs

            for (const otherTeam of apiTeams) {
                if (otherTeam.id === apiTeam.id) continue;

                const oppColors = parseClubColors(otherTeam.clubColors);
                const oppTeam = await tx.team.create({
                    data: {
                        name: otherTeam.name.replace(' FC', '').replace(' AFC', ''),
                        home_kit_primary: oppColors.primary,
                        home_kit_secondary: oppColors.secondary,
                        away_kit_primary: oppColors.secondary,
                        away_kit_secondary: oppColors.primary,
                        logo_url: otherTeam.crest,
                        is_opponent: true,
                        created_by_user_id: user.id,
                    },
                });
                stats.teams++;
                opponentTeamsMap.set(otherTeam.id, oppTeam.id);
                opponentPlayersMap.set(oppTeam.id, []);
            }

            // Create matches where this team played
            const teamMatches = allMatches.filter(
                m => m.homeTeam.id === apiTeam.id || m.awayTeam.id === apiTeam.id
            );

            for (const apiMatch of teamMatches) {
                const isHome = apiMatch.homeTeam.id === apiTeam.id;
                const opponentApiId = isHome ? apiMatch.awayTeam.id : apiMatch.homeTeam.id;
                const oppTeamId = opponentTeamsMap.get(opponentApiId);

                if (!oppTeamId) continue;

                const homeTeamId = isHome ? managedTeam.id : oppTeamId;
                const awayTeamId = isHome ? oppTeamId : managedTeam.id;
                const seasonKey = getSeasonIdForDate(apiMatch.utcDate);

                const match = await tx.match.create({
                    data: {
                        season_id: seasonMap[seasonKey],
                        kickoff_ts: new Date(apiMatch.utcDate),
                        home_team_id: homeTeamId,
                        away_team_id: awayTeamId,
                        home_score: apiMatch.score.fullTime.home ?? 0,
                        away_score: apiMatch.score.fullTime.away ?? 0,
                        duration_mins: 90,
                        period_format: 'HALVES',
                        created_by_user_id: user.id,
                    },
                });
                stats.matches++;

                // Create match_state for completed match
                const matchStartTime = new Date(apiMatch.utcDate);
                const matchEndTime = new Date(matchStartTime.getTime() + (90 * 60 * 1000)); // 90 mins later

                await tx.match_state.create({
                    data: {
                        match_id: match.match_id,
                        status: 'COMPLETED',
                        current_period: 2,
                        current_period_type: 'REGULAR',
                        match_started_at: matchStartTime,
                        match_ended_at: matchEndTime,
                        total_elapsed_seconds: 90 * 60, // 90 minutes
                        created_by_user_id: user.id,
                    },
                });

                // Create match_periods (2 halves)
                const halfTime = new Date(matchStartTime.getTime() + (45 * 60 * 1000));
                const secondHalfStart = new Date(halfTime.getTime() + (15 * 60 * 1000)); // 15 min break

                await tx.match_periods.createMany({
                    data: [
                        {
                            match_id: match.match_id,
                            period_number: 1,
                            period_type: 'REGULAR',
                            started_at: matchStartTime,
                            ended_at: halfTime,
                            duration_seconds: 45 * 60,
                            created_by_user_id: user.id,
                        },
                        {
                            match_id: match.match_id,
                            period_number: 2,
                            period_type: 'REGULAR',
                            started_at: secondHalfStart,
                            ended_at: matchEndTime,
                            duration_seconds: 45 * 60,
                            created_by_user_id: user.id,
                        },
                    ],
                });

                // Generate events based on score
                const homeScore = apiMatch.score.fullTime.home ?? 0;
                const awayScore = apiMatch.score.fullTime.away ?? 0;
                const homePlayerIds = isHome ? managedPlayers.map(p => p.id) : (opponentPlayersMap.get(homeTeamId) ?? []);
                const awayPlayerIds = isHome ? (opponentPlayersMap.get(awayTeamId) ?? []) : managedPlayers.map(p => p.id);

                const events: Array<{
                    match_id: string;
                    period_number: number;
                    clock_ms: number;
                    kind: event_kind;
                    team_id: string;
                    player_id: string;
                    sentiment: number;
                    created_by_user_id: string;
                }> = [];

                // Goals for home team
                for (let i = 0; i < homeScore; i++) {
                    const period = i < Math.ceil(homeScore / 2) ? 1 : 2;
                    const minute = randomInt(1, 45);
                    const playerId = randomChoice(homePlayerIds);
                    events.push({
                        match_id: match.match_id,
                        period_number: period,
                        clock_ms: minute * 60000,
                        kind: event_kind.goal,
                        team_id: homeTeamId,
                        player_id: (playerId || null) as any,
                        sentiment: 4,
                        created_by_user_id: user.id,
                    });
                }

                // Goals for away team
                for (let i = 0; i < awayScore; i++) {
                    const period = i < Math.ceil(awayScore / 2) ? 1 : 2;
                    const minute = randomInt(1, 45);
                    const playerId = randomChoice(awayPlayerIds);
                    events.push({
                        match_id: match.match_id,
                        period_number: period,
                        clock_ms: minute * 60000,
                        kind: event_kind.goal,
                        team_id: awayTeamId,
                        player_id: (playerId || null) as any,
                        sentiment: 4,
                        created_by_user_id: user.id,
                    });
                }

                // Add some random events
                const eventKinds = [
                    event_kind.shot_on_target,
                    event_kind.shot_off_target,
                    event_kind.tackle,
                    event_kind.corner,
                    event_kind.foul,
                ];
                const additionalCount = randomInt(8, 15);
                for (let i = 0; i < additionalCount; i++) {
                    const isHomeEvent = Math.random() > 0.5;
                    const teamId = isHomeEvent ? homeTeamId : awayTeamId;
                    const playerIds = isHomeEvent ? homePlayerIds : awayPlayerIds;
                    const playerId = randomChoice(playerIds);
                    const kind = randomChoice(eventKinds) ?? event_kind.tackle;
                    const period = Math.random() > 0.5 ? 1 : 2;
                    const minute = randomInt(1, 45);
                    const sentiment = kind === event_kind.foul ? -1 :
                        (kind === event_kind.shot_on_target || kind === event_kind.shot_off_target ? 2 : 1);

                    events.push({
                        match_id: match.match_id,
                        period_number: period,
                        clock_ms: minute * 60000,
                        kind,
                        team_id: teamId,
                        player_id: (playerId || null) as any,
                        sentiment,
                        created_by_user_id: user.id,
                    });
                }

                if (events.length > 0) {
                    await tx.event.createMany({ data: events });
                    stats.events += events.length;
                }
            }
        });
    }

    console.log(`[DevSeed] Completed! Stats:`, stats);

    return {
        success: true,
        users: userCredentials,
        stats,
    };
}

export async function clearAllTestData(): Promise<{ success: boolean; deleted: Record<string, number> }> {
    const deleted: Record<string, number> = {};

    // Find all test users
    const testUsers = await prisma.user.findMany({
        where: {
            email: { endsWith: '@test.com' },
        },
    });

    console.log(`[DevSeed] Found ${testUsers.length} test users to delete`);

    for (const user of testUsers) {
        // Delete in order respecting foreign keys
        const events = await prisma.event.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['events'] = (deleted['events'] ?? 0) + events.count;

        const lineups = await prisma.lineup.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['lineups'] = (deleted['lineups'] ?? 0) + lineups.count;

        const matchStates = await prisma.match_state.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['matchStates'] = (deleted['matchStates'] ?? 0) + matchStates.count;

        const matchPeriods = await prisma.match_periods.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['matchPeriods'] = (deleted['matchPeriods'] ?? 0) + matchPeriods.count;

        const matches = await prisma.match.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['matches'] = (deleted['matches'] ?? 0) + matches.count;

        const playerTeams = await prisma.player_teams.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['playerTeams'] = (deleted['playerTeams'] ?? 0) + playerTeams.count;

        const players = await prisma.player.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['players'] = (deleted['players'] ?? 0) + players.count;

        const teams = await prisma.team.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['teams'] = (deleted['teams'] ?? 0) + teams.count;

        const seasons = await prisma.seasons.deleteMany({ where: { created_by_user_id: user.id } });
        deleted['seasons'] = (deleted['seasons'] ?? 0) + seasons.count;

        await prisma.user.delete({ where: { id: user.id } });
        deleted['users'] = (deleted['users'] ?? 0) + 1;
    }

    console.log(`[DevSeed] Deleted:`, deleted);

    return { success: true, deleted };
}

export async function getTestUsers(): Promise<Array<{ email: string; teamName: string }>> {
    const users = await prisma.user.findMany({
        where: {
            email: { endsWith: '@test.com' },
        },
        select: {
            email: true,
            first_name: true,
        },
    });

    return users.map(u => ({
        email: u.email,
        teamName: u.first_name ?? 'Unknown',
    }));
}
