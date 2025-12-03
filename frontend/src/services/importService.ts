import { getGuestId } from '../utils/guest';
import apiClient from './api/baseApi';

export async function hasGuestData(): Promise<boolean> {
  const s = await getGuestDataSummary();
  return (s.seasons + s.teams + s.players + s.matches + s.events) > 0;
}

export async function getGuestDataSummary(): Promise<{ seasons: number; teams: number; players: number; matches: number; events: number }> {
  try {
    const { db } = await import('../db/indexedDB');

    // Helper to check if a user ID is a guest ID (format: "guest-...")
    const isGuestId = (id: string) => id && id.startsWith('guest-');

    // Check both main tables and outbox for ANY guest-formatted data
    const [allSeasons, allTeams, allPlayers, allMatches, allEvents] = await Promise.all([
      db.seasons.toArray(),
      db.teams.toArray(),
      db.players.toArray(),
      db.matches.toArray(),
      db.events.toArray(),
    ]);

    const seasons = allSeasons.filter(s => isGuestId(s.created_by_user_id)).length;
    const teams = allTeams.filter(t => isGuestId(t.created_by_user_id)).length;
    const players = allPlayers.filter(p => isGuestId(p.created_by_user_id)).length;
    const matches = allMatches.filter(m => isGuestId(m.created_by_user_id)).length;
    const events = allEvents.filter(e => isGuestId(e.created_by_user_id)).length;

    // Also check outbox for unsynced guest data
    const outboxItems = await db.outbox.toArray();
    const guestOutboxItems = outboxItems.filter(item => isGuestId(item.created_by_user_id));
    const outboxCounts = guestOutboxItems.reduce((acc, item) => {
      if (item.table_name === 'seasons') acc.seasons++;
      else if (item.table_name === 'teams') acc.teams++;
      else if (item.table_name === 'players') acc.players++;
      else if (item.table_name === 'matches') acc.matches++;
      else if (item.table_name === 'events') acc.events++;
      return acc;
    }, { seasons: 0, teams: 0, players: 0, matches: 0, events: 0 });

    return {
      seasons: seasons + outboxCounts.seasons,
      teams: teams + outboxCounts.teams,
      players: players + outboxCounts.players,
      matches: matches + outboxCounts.matches,
      events: events + outboxCounts.events,
    };
  } catch {
    return { seasons: 0, teams: 0, players: 0, matches: 0, events: 0 };
  }
}

// Full import orchestrator: imports seasons, teams, players, matches, events, lineups, and match state
export async function runImport(progress?: (p: { step: string; done: number; total: number }) => void): Promise<void> {
  const { db } = await import('../db/indexedDB');
  const { seasonsApi } = await import('./api/seasonsApi');
  const teamsApiModule = await import('./api/teamsApi');
  const playersApiModule = await import('./api/playersApi');
  const lineupsApiModule = await import('./api/lineupsApi');
  const matchesApiModule = await import('./api/matchesApi');
  const eventsApiModule = await import('./api/eventsApi');
  const teamsApi = teamsApiModule.default || teamsApiModule.teamsApi;
  const playersApi = playersApiModule.default || playersApiModule.playersApi;
  const matchesApi = matchesApiModule.default || matchesApiModule.matchesApi;
  const eventsApi = eventsApiModule.default;
  const lineupsApi = lineupsApiModule.default || lineupsApiModule.lineupsApi;

  // Helper to check if a user ID is a guest ID (format: "guest-...")
  const isGuestId = (id: string) => id && id.startsWith('guest-');

  // Get ALL guest data (any created_by_user_id starting with "guest-")
  const [allSeasons, allTeams, allPlayers, allMatches, allEvents, allLineups] = await Promise.all([
    db.seasons.toArray(),
    db.teams.toArray(),
    db.players.toArray(),
    db.matches.toArray(),
    db.events.toArray(),
    db.lineup.toArray(),
  ]);

  const seasons = allSeasons.filter(s => isGuestId(s.created_by_user_id));
  const teams = allTeams.filter(t => isGuestId(t.created_by_user_id));
  const players = allPlayers.filter(p => isGuestId(p.created_by_user_id));
  const matches = allMatches.filter(m => isGuestId(m.created_by_user_id));
  const events = allEvents.filter(e => isGuestId(e.created_by_user_id));

  console.log(`[Import] Found guest data - Seasons: ${seasons.length}, Teams: ${teams.length}, Players: ${players.length}, Matches: ${matches.length}, Events: ${events.length}`);

  // Get all guest IDs for later cleanup
  const guestIds = new Set<string>();
  [...seasons, ...teams, ...players, ...matches, ...events].forEach(item => {
    if (isGuestId(item.created_by_user_id)) {
      guestIds.add(item.created_by_user_id);
    }
  });

  const lineups = allLineups;

  const total = seasons.length + teams.length + players.length + matches.length + events.length;
  let done = 0;

  const bump = (step: string) => progress?.({ step, done, total: Math.max(1, total) });

  // Determine primary team (most frequent home team, excluding is_opponent)
  const primaryTeams = teams.filter((t: any) => !t.is_opponent);
  const primaryLocalTeam = primaryTeams.length > 0 ? primaryTeams[0].id : null;

  // Import seasons with proper year-based naming
  for (const s of seasons) {
    bump(`Importing season ${s.label}`);
    try {
      // Transform "Demo Season" to proper year-based name
      let label = s.label;
      if (label === 'Demo Season') {
        const year = new Date().getFullYear();
        label = `${year}-${year + 1} Season`;
      }
      await seasonsApi.createSeason({
        label,
        startDate: s.start_date || new Date().toISOString().slice(0, 10),
        endDate: s.end_date || new Date().toISOString().slice(0, 10),
        isCurrent: !!s.is_current,
        description: s.description
      });
    } catch {}
    done++;
  }

  // Import teams with colors and is_opponent flag
  const teamMap = new Map<string, string>(); // local -> server
  for (const t of teams) {
    bump(`Importing team ${t.name}`);
    try {
      const teamData: any = {
        name: t.name,
        homeKitPrimary: (t as any).color_primary,
        homeKitSecondary: (t as any).color_secondary,
        awayKitPrimary: (t as any).away_color_primary,
        awayKitSecondary: (t as any).away_color_secondary,
        logoUrl: (t as any).logo_url,
        isOpponent: !!(t as any).is_opponent,
      };
      const res = await teamsApi.createTeam(teamData);
      teamMap.set(t.id as any, res.data.id);
    } catch {}
    done++;
  }

  // Import players with team assignment mapping
  const playerMap = new Map<string, string>(); // local -> server
  for (const p of players) {
    bump(`Importing player ${p.full_name}`);
    try {
      const serverTeamId = p.current_team ? teamMap.get(p.current_team as any) : undefined;
      let res;
      if (serverTeamId) {
        res = await playersApi.createPlayerWithTeam({
          name: p.full_name,
          squadNumber: p.squad_number,
          preferredPosition: p.preferred_pos,
          teamId: serverTeamId
        } as any);
      } else {
        res = await playersApi.createPlayer({
          name: p.full_name,
          squadNumber: p.squad_number,
          preferredPosition: p.preferred_pos
        } as any);
      }
      playerMap.set(p.id as any, res.data.id);
    } catch {}
    done++;
  }

  // Import matches using regular creation (not quickStart) to avoid duplicate opponents
  const matchMap = new Map<string, string>(); // local match -> server match id
  for (const m of matches) {
    const home = await db.teams.get(m.home_team_id);
    const away = await db.teams.get(m.away_team_id);
    const homeName = home?.name || 'Home';
    const awayName = away?.name || 'Away';

    // Map local team IDs to server team IDs
    const serverHomeTeamId = teamMap.get(m.home_team_id);
    const serverAwayTeamId = teamMap.get(m.away_team_id);

    if (!serverHomeTeamId || !serverAwayTeamId) {
      console.warn(`[Import] Skipping match ${homeName} vs ${awayName} - missing team mappings`);
      done++;
      continue;
    }

    bump(`Importing match ${homeName} vs ${awayName}`);
    try {
      // Use the regular matches API endpoint instead of quickStart to avoid duplicate opponents
      const response = await apiClient.post<any>('/matches', {
        seasonId: m.season_id,
        kickoffTime: m.kickoff_ts,
        homeTeamId: serverHomeTeamId,
        awayTeamId: serverAwayTeamId,
        competition: m.competition,
        venue: m.venue,
        durationMinutes: m.duration_mins,
        periodFormat: m.period_format || 'quarter',
        notes: m.notes,
      });
      const serverId = response.data.id || response.data.match_id;
      matchMap.set(m.id as any, serverId);
      console.log(`[Import] Created match ${serverId} (local: ${m.id}, home: ${homeName}, away: ${awayName})`);

      // Get local live state to determine match status
      const liveStateRec = await db.settings.get(`local_live_state:${m.id}`);
      if (liveStateRec?.value) {
        try {
          const liveState = JSON.parse(liveStateRec.value);
          const periods = liveState.periods || [];
          const status = liveState.status;

          // If match was started, start it on server
          if (status === 'LIVE' || status === 'COMPLETED' || periods.length > 0) {
            try {
              await matchesApi.startMatch(serverId);
              console.log(`[Import] Started match ${serverId}`);
            } catch (err) {
              console.error(`[Import] Failed to start match ${serverId}:`, err);
            }

            // Start/end periods
            for (let i = 0; i < periods.length; i++) {
              const p = periods[i];
              try {
                const serverPeriod = await matchesApi.startPeriod(serverId, p.periodType || 'regular');
                console.log(`[Import] Started period ${i + 1} for match ${serverId}`);
                // If period has ended, end it
                if (p.endedAt) {
                  try {
                    await matchesApi.endPeriod(serverId, serverPeriod.id);
                    console.log(`[Import] Ended period ${i + 1} for match ${serverId}`);
                  } catch (err) {
                    console.error(`[Import] Failed to end period ${i + 1}:`, err);
                  }
                }
              } catch (err) {
                console.error(`[Import] Failed to start period ${i + 1}:`, err);
              }
            }

            // If match was completed, complete it
            if (status === 'COMPLETED') {
              try {
                await matchesApi.completeMatch(serverId, {
                  home: m.home_score || 0,
                  away: m.away_score || 0
                });
                console.log(`[Import] Completed match ${serverId} with score ${m.home_score}-${m.away_score}`);
              } catch (err) {
                console.error(`[Import] Failed to complete match ${serverId}:`, err);
              }
            }
          }
        } catch (err) {
          console.error(`[Import] Failed to process live state for match ${serverId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[Import] Failed to create match ${homeName} vs ${awayName}:`, err);
    }
    done++;
  }

  // Import events from events table with ID mapping
  for (const e of events) {
    const serverMatchId = matchMap.get(e.match_id);
    if (!serverMatchId) {
      console.warn(`[Import] Skipping event - no server match ID for local match ${e.match_id}`);
      done++;
      continue;
    }
    bump(`Importing event ${e.kind}`);
    try {
      const serverTeamId = e.team_id ? teamMap.get(e.team_id) : undefined;
      const serverPlayerId = e.player_id ? playerMap.get(e.player_id) : undefined;
      await eventsApi.create({
        matchId: serverMatchId,
        kind: e.kind,
        periodNumber: e.period_number,
        clockMs: e.clock_ms,
        teamId: serverTeamId,
        playerId: serverPlayerId,
        notes: e.notes,
        sentiment: e.sentiment || 0,
      } as any);
      console.log(`[Import] Successfully imported event: ${e.kind} for match ${serverMatchId}`);
    } catch (err) {
      console.error(`[Import] Failed to import event ${e.kind}:`, err);
    }
    done++;
  }

  console.log(`[Import] Imported ${events.length} events from local database`);

  // Import lineups
  for (const lineup of lineups) {
    const serverMatchId = matchMap.get(lineup.match_id);
    const serverPlayerId = playerMap.get(lineup.player_id);
    if (!serverMatchId || !serverPlayerId) continue;
    bump(`Importing lineup entry`);
    try {
      await lineupsApi.create({
        matchId: serverMatchId,
        playerId: serverPlayerId,
        startMinute: lineup.start_min,
        endMinute: lineup.end_min,
        position: lineup.position,
      });
    } catch (err) {
      console.warn('Failed to import lineup entry:', err);
    }
  }

  progress?.({ step: 'Cleaning up local guest data', done, total });
  // Clean up ALL guest data to avoid duplicates
  try {
    // Delete all records with guest-formatted IDs
    for (const guestId of guestIds) {
      await db.teams.where('created_by_user_id').equals(guestId).delete();
      await db.players.where('created_by_user_id').equals(guestId).delete();
      await db.seasons.where('created_by_user_id').equals(guestId).delete();
      await db.events.where('created_by_user_id').equals(guestId).delete();
      await db.outbox.where('created_by_user_id').equals(guestId).delete();
    }

    // CRITICAL: Delete ALL local matches to prevent ID conflicts
    // After import, the frontend should only use server data
    const allLocalMatches = matches.map(m => m.id);
    for (const matchId of allLocalMatches) {
      try {
        await db.matches.delete(matchId);
        console.log(`[Import] Deleted local match ${matchId}`);
      } catch (err) {
        console.warn(`[Import] Failed to delete local match ${matchId}:`, err);
      }
    }

    // Clean up live state settings
    const settings = await db.settings.toArray();
    for (const s of settings) {
      if (s.key.startsWith('local_live_state:')) {
        await db.settings.delete(s.key);
      }
    }

    // Clear temp outbox items (created by guest mode without user ID)
    try {
      const tempUserDeleted = await db.outbox.where('created_by_user_id').equals('temp-user-id').delete();
      console.log(`[Import] Deleted ${tempUserDeleted} outbox items with temp-user-id`);
    } catch (err) {
      console.error('[Import] Failed to delete temp-user-id outbox items:', err);
    }

    // Also clean up any match_commands that might be lingering
    try {
      const allOutbox = await db.outbox.toArray();
      const matchCommandIds = allOutbox
        .filter(item => item.table_name === 'match_commands')
        .map(item => item.id)
        .filter((id): id is number => id !== undefined);

      if (matchCommandIds.length > 0) {
        await db.outbox.bulkDelete(matchCommandIds);
        console.log(`[Import] Deleted ${matchCommandIds.length} match_commands from outbox`);
      }
    } catch (err) {
      console.error('[Import] Failed to delete match_commands from outbox:', err);
    }
  } catch (err) {
    console.error('[Import] Error during cleanup:', err);
  }

  progress?.({ step: 'Import complete!', done: total, total });
  console.log('[Import] Import completed successfully. All local data cleaned up.');
  console.log('[Import] Reloading page in 2 seconds to refresh data from server...');

  // Force a full page reload after a short delay to ensure frontend uses server data
  setTimeout(() => {
    window.location.reload();
  }, 2000);
}
