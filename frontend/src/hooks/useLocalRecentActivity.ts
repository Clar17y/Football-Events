/**
 * Offline-first Recent Activity Hook
 *
 * Queries IndexedDB directly using Dexie useLiveQuery for reactive updates.
 */

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/indexedDB';
import type { ActivityItem, ActivityFilters } from '../types/activity';
import {
    getPeriodLabel,
    formatEventTime,
    buildEventTitle,
    ALLOWED_EVENT_KINDS,
    shouldSuppressPenalty
} from '../utils/activityHelpers';

/**
 * Normalize createdAt to timestamp for comparison.
 * Handles both ISO strings and number timestamps.
 */
function getTimestamp(value: string | number | undefined): number {
    if (value === undefined) return 0;
    if (typeof value === 'number') return value;
    return new Date(value).getTime();
}

/**
 * Check if a date value is after the cutoff.
 */
function isAfterCutoff(value: string | number | undefined, cutoffTimestamp: number): boolean {
    return getTimestamp(value) >= cutoffTimestamp;
}

/**
 * Normalize a date value to ISO string for ActivityItem.createdAt
 */
function toIsoString(value: string | number | undefined): string {
    if (value === undefined) return new Date().toISOString();
    if (typeof value === 'number') return new Date(value).toISOString();
    return value;
}

export interface UseLocalRecentActivityOptions {
    limit?: number;
    days?: number;
    filters?: ActivityFilters;
}

export function useLocalRecentActivity(options: UseLocalRecentActivityOptions = {}) {
    const { limit = 20, days = 30, filters } = options;

    const activities = useLiveQuery(
        async () => {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            const cutoffTimestamp = cutoffDate.getTime();

            const results: ActivityItem[] = [];

            // ----------------------------------------------------------------
            // TEAMS
            // ----------------------------------------------------------------
            if (filters?.teams !== false) {
                const teams = await db.teams
                    .filter(t => !t.isDeleted && !t.isOpponent && isAfterCutoff(t.createdAt, cutoffTimestamp))
                    .toArray();

                for (const team of teams) {
                    results.push({
                        id: `team-${team.id}`,
                        type: 'team',
                        action: 'created',
                        title: `New club: ${team.name}.`,
                        description: `New club: ${team.name}.`,
                        entityId: team.id,
                        entityName: team.name,
                        createdAt: toIsoString(team.createdAt),
                        metadata: { teamId: team.id, teamName: team.name }
                    });
                }
            }

            // ----------------------------------------------------------------
            // PLAYERS
            // ----------------------------------------------------------------
            if (filters?.players !== false) {
                const players = await db.players
                    .filter(p => !p.isDeleted && isAfterCutoff(p.createdAt, cutoffTimestamp))
                    .toArray();

                // Get active team relationships
                const playerTeams = await db.playerTeams
                    .filter(pt => !pt.isDeleted && pt.isActive === true)
                    .toArray();
                const playerToTeam = new Map<string, string>();
                for (const pt of playerTeams) {
                    playerToTeam.set(pt.playerId, pt.teamId);
                }

                // Get team names
                const teamIds = [...new Set(playerTeams.map(pt => pt.teamId))];
                const teamsMap = new Map<string, string>();
                for (const teamId of teamIds) {
                    const team = await db.teams.get(teamId);
                    if (team && !team.isDeleted) {
                        teamsMap.set(teamId, team.name);
                    }
                }

                for (const player of players) {
                    const teamId = playerToTeam.get(player.id);
                    const teamName = teamId ? teamsMap.get(teamId) : undefined;
                    const title = teamName
                        ? `${teamName} signs ${player.name}.`
                        : `New player ${player.name} looking for a team.`;

                    results.push({
                        id: `player-${player.id}`,
                        type: 'player',
                        action: 'created',
                        title,
                        description: title,
                        entityId: player.id,
                        entityName: player.name,
                        createdAt: toIsoString(player.createdAt),
                        metadata: {
                            playerId: player.id,
                            playerName: player.name,
                            teamId,
                            teamName
                        }
                    });
                }
            }

            // ----------------------------------------------------------------
            // SEASONS
            // ----------------------------------------------------------------
            if (filters?.seasons !== false) {
                const seasons = await db.seasons
                    .filter(s => !s.isDeleted && isAfterCutoff(s.createdAt, cutoffTimestamp))
                    .toArray();

                for (const season of seasons) {
                    const title = `Season ${season.label} kicks off.`;
                    results.push({
                        id: `season-${season.seasonId}`,
                        type: 'season',
                        action: 'created',
                        title,
                        description: title,
                        entityId: season.seasonId,
                        entityName: season.label,
                        createdAt: toIsoString(season.createdAt),
                        metadata: {
                            seasonId: season.seasonId,
                            seasonLabel: season.label,
                            startDate: season.startDate,
                            endDate: season.endDate,
                            isCurrent: season.isCurrent
                        }
                    });
                }
            }

            // ----------------------------------------------------------------
            // MATCHES
            // ----------------------------------------------------------------
            if (filters?.matches !== false) {
                const matches = await db.matches
                    .filter(m => !m.isDeleted && isAfterCutoff(m.createdAt, cutoffTimestamp))
                    .toArray();

                // Get team names for all matches
                const matchTeamIds = new Set<string>();
                for (const m of matches) {
                    matchTeamIds.add(m.homeTeamId);
                    matchTeamIds.add(m.awayTeamId);
                }
                const matchTeamsMap = new Map<string, string>();
                for (const teamId of matchTeamIds) {
                    const team = await db.teams.get(teamId);
                    if (team) matchTeamsMap.set(teamId, team.name);
                }

                for (const match of matches) {
                    const homeName = matchTeamsMap.get(match.homeTeamId) || 'Home';
                    const awayName = matchTeamsMap.get(match.awayTeamId) || 'Away';
                    const title = `Fixture set: ${homeName} vs ${awayName}.`;

                    results.push({
                        id: `match-${match.matchId}`,
                        type: 'match',
                        action: 'created',
                        title,
                        description: title,
                        entityId: match.matchId,
                        entityName: `${homeName} vs ${awayName}`,
                        createdAt: toIsoString(match.createdAt),
                        metadata: {
                            matchId: match.matchId,
                            homeTeam: homeName,
                            awayTeam: awayName,
                            kickoffTime: match.kickoffTime
                        }
                    });
                }
            }

            // ----------------------------------------------------------------
            // EVENTS (Period Summaries)
            // ----------------------------------------------------------------
            if (filters?.events !== false) {
                // Get finished periods
                const finishedPeriods = await db.matchPeriods
                    .filter(p => !p.isDeleted && p.endedAt != null && p.endedAt >= cutoffTimestamp)
                    .toArray();

                for (const period of finishedPeriods) {
                    // Get match info
                    const match = await db.matches.get(period.matchId);
                    if (!match || match.isDeleted) continue;

                    const homeTeam = await db.teams.get(match.homeTeamId);
                    const awayTeam = await db.teams.get(match.awayTeamId);
                    if (!homeTeam || !awayTeam) continue;

                    const homeName = homeTeam.name;
                    const awayName = awayTeam.name;
                    const matchName = `${homeName} vs ${awayName}`;

                    // Get events for this period
                    const periodEvents = await db.events
                        .where('[matchId+periodNumber]')
                        .equals([period.matchId, period.periodNumber])
                        .filter(e => !e.isDeleted)
                        .toArray();

                    if (periodEvents.length === 0) continue;

                    // Filter to allowed kinds
                    let filtered = periodEvents.filter(e => ALLOWED_EVENT_KINDS.has(e.kind));

                    // Suppress penalties followed by goals
                    const suppressIds = new Set<string>();
                    for (const ev of filtered) {
                        if (shouldSuppressPenalty(ev, filtered)) {
                            suppressIds.add(ev.id);
                        }
                    }
                    filtered = filtered.filter(e => !suppressIds.has(e.id));

                    if (filtered.length === 0) continue;

                    // Count regular periods for label logic
                    const allRegular = await db.matchPeriods
                        .filter(p => p.matchId === period.matchId && p.periodType === 'REGULAR' && !p.isDeleted)
                        .toArray();
                    const maxReg = allRegular.length;

                    const periodLabel = getPeriodLabel(period.periodNumber, period.periodType, maxReg);
                    const title = `${periodLabel} highlights: ${matchName} — ${filtered.length} moments`;

                    // Build player lookup
                    const playerIds = [...new Set(filtered.map(e => e.playerId).filter(Boolean))] as string[];
                    const playersMap = new Map<string, string>();
                    for (const pId of playerIds) {
                        const player = await db.players.get(pId);
                        if (player) playersMap.set(pId, player.name);
                    }

                    // Build children
                    const children = filtered.map(ev => {
                        const teamId = ev.teamId;
                        const eventTeamName = teamId === match.homeTeamId ? homeName :
                            teamId === match.awayTeamId ? awayName : undefined;
                        const opponentName = eventTeamName === homeName ? awayName :
                            eventTeamName === awayName ? homeName : undefined;
                        const playerName = ev.playerId ? playersMap.get(ev.playerId) : undefined;

                        return {
                            id: ev.id,
                            kind: ev.kind,
                            title: buildEventTitle({
                                kind: ev.kind,
                                playerName,
                                teamName: eventTeamName,
                                opponentName,
                                sentiment: ev.sentiment
                            }),
                            createdAt: toIsoString(ev.createdAt),
                            teamId: ev.teamId,
                            playerId: ev.playerId,
                            timeLabel: formatEventTime(ev.clockMs || 0, period.periodType, maxReg)
                        };
                    });

                    // Use endedAt timestamp converted to ISO for createdAt
                    const createdAtIso = period.endedAt
                        ? new Date(period.endedAt).toISOString()
                        : toIsoString(period.createdAt);

                    results.push({
                        id: `period-${period.id}`,
                        type: 'event',
                        action: 'period_summary',
                        title,
                        description: title,
                        entityId: period.matchId,
                        entityName: matchName,
                        createdAt: createdAtIso,
                        metadata: {
                            matchId: period.matchId,
                            matchName,
                            homeTeam: homeName,
                            awayTeam: awayName,
                            periodNumber: period.periodNumber,
                            periodType: period.periodType,
                            count: filtered.length,
                            children
                        }
                    });
                }
            }

            // ----------------------------------------------------------------
            // LINEUPS (Default Lineups)
            // ----------------------------------------------------------------
            if (filters?.lineups !== false) {
                const defaultLineups = await db.defaultLineups
                    .filter(dl => {
                        if (dl.isDeleted) return false;
                        if (isAfterCutoff(dl.createdAt, cutoffTimestamp)) return true;
                        if (dl.updatedAt && isAfterCutoff(dl.updatedAt, cutoffTimestamp)) return true;
                        return false;
                    })
                    .toArray();

                for (const dl of defaultLineups) {
                    const team = await db.teams.get(dl.teamId);
                    const teamName = team?.name || 'Unknown Team';
                    const action = dl.updatedAt ? 'updated' : 'created';
                    const ts = dl.updatedAt || dl.createdAt;
                    const title = `Default lineup ${action} for ${teamName}.`;

                    results.push({
                        id: `lineup-${dl.id}`,
                        type: 'lineup',
                        action,
                        title,
                        description: title,
                        entityId: dl.teamId,
                        entityName: teamName,
                        createdAt: toIsoString(ts),
                        metadata: {
                            teamId: dl.teamId,
                            teamName
                        }
                    });
                }
            }

            // Sort by createdAt descending
            const sorted = results
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            // Return limited results plus total count for "hasMore" calculation
            return {
                items: sorted.slice(0, limit),
                totalCount: sorted.length
            };
        },
        [limit, days, filters?.teams, filters?.players, filters?.seasons, filters?.matches, filters?.events, filters?.lineups]
    );

    return {
        activities: activities?.items ?? [],
        loading: activities === undefined,
        error: null,
        hasMore: (activities?.totalCount ?? 0) > (activities?.items.length ?? 0)
    };
}
