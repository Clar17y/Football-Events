import { getGuestId } from '../utils/guest';

export async function hasGuestData(): Promise<boolean> {
  const s = await getGuestDataSummary();
  return (s.seasons + s.teams + s.players + s.matches + s.events) > 0;
}

export async function getGuestDataSummary(): Promise<{ seasons: number; teams: number; players: number; matches: number; events: number }> {
  try {
    const { db } = await import('../db/indexedDB');
    const guest = getGuestId();
    const [seasons, teams, players, matches, events] = await Promise.all([
      db.seasons.where('created_by_user_id').equals(guest).count(),
      db.teams.where('created_by_user_id').equals(guest).count(),
      db.players.where('created_by_user_id').equals(guest).count(),
      db.matches.where('created_by_user_id').equals(guest).count(),
      db.events.where('created_by_user_id').equals(guest).count(),
    ]);
    return { seasons, teams, players, matches, events };
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
  const matchesApiModule = await import('./api/matchesApi');
  const eventsApiModule = await import('./api/eventsApi');
  const teamsApi = teamsApiModule.default || teamsApiModule.teamsApi;
  const playersApi = playersApiModule.default || playersApiModule.playersApi;
  const matchesApi = matchesApiModule.default || matchesApiModule.matchesApi;
  const eventsApi = eventsApiModule.default;

  const guest = getGuestId();
  const seasons = await db.seasons.where('created_by_user_id').equals(guest).toArray();
  const teams = await db.teams.where('created_by_user_id').equals(guest).toArray();
  const players = await db.players.where('created_by_user_id').equals(guest).toArray();
  const matches = await db.matches.where('created_by_user_id').equals(guest).toArray();
  const events = await db.events.where('created_by_user_id').equals(guest).toArray();
  const lineups = await db.lineup.toArray();

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

  // Import matches via quickStart, then update match state
  const matchMap = new Map<string, string>(); // local match -> server match id
  for (const m of matches) {
    const home = await db.teams.get(m.home_team_id);
    const away = await db.teams.get(m.away_team_id);
    const homeName = home?.name || 'Home';
    const awayName = away?.name || 'Away';
    // Decide myTeamId and isHome based on primaryLocalTeam
    const localMyTeam = primaryLocalTeam || m.home_team_id;
    const isHome = localMyTeam === m.home_team_id;
    const opponentName = isHome ? awayName : homeName;
    const myTeamServerId = teamMap.get(localMyTeam as string) || teamMap.get(m.home_team_id) || teamMap.get(m.away_team_id);
    bump(`Importing match vs ${opponentName}`);
    try {
      const created = await matchesApi.quickStart({
        myTeamId: myTeamServerId!,
        opponentName,
        isHome,
        kickoffTime: m.kickoff_ts,
        durationMinutes: m.duration_mins,
        periodFormat: (m.period_format as any) || 'quarter',
        competition: m.competition,
        venue: m.venue,
        notes: m.notes,
      } as any);
      const serverId = (created as any).id || (created as any).match_id;
      matchMap.set(m.id as any, serverId);

      // Get local live state to determine match status
      const liveStateRec = await db.settings.get(`local_live_state:${m.id}`);
      if (liveStateRec?.value) {
        try {
          const liveState = JSON.parse(liveStateRec.value);
          const periods = liveState.periods || [];
          const status = liveState.status;

          // If match was started, start it on server
          if (status === 'LIVE' || status === 'COMPLETED' || periods.length > 0) {
            try { await matchesApi.startMatch(serverId); } catch {}

            // Start/end periods
            for (let i = 0; i < periods.length; i++) {
              const p = periods[i];
              try {
                const serverPeriod = await matchesApi.startPeriod(serverId, p.periodType || 'regular');
                // If period has ended, end it
                if (p.endedAt) {
                  try { await matchesApi.endPeriod(serverId, serverPeriod.id); } catch {}
                }
              } catch {}
            }

            // If match was completed, complete it
            if (status === 'COMPLETED') {
              try {
                await matchesApi.completeMatch(serverId, {
                  home: m.home_score || 0,
                  away: m.away_score || 0
                });
              } catch {}
            }
          }
        } catch {}
      }
    } catch {}
    done++;
  }

  // Import events from events table with ID mapping
  for (const e of events) {
    const serverMatchId = matchMap.get(e.match_id);
    if (!serverMatchId) { done++; continue; }
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
    } catch {}
    done++;
  }

  // Import lineups
  for (const lineup of lineups) {
    const serverMatchId = matchMap.get(lineup.match_id);
    const serverPlayerId = playerMap.get(lineup.player_id);
    if (!serverMatchId || !serverPlayerId) continue;
    bump(`Importing lineup entry`);
    try {
      // Use lineups API if available, otherwise skip
      const lineupsApiModule = await import('./api/lineupsApi').catch(() => null);
      if (lineupsApiModule) {
        const lineupsApi = lineupsApiModule.default || lineupsApiModule.lineupsApi;
        await lineupsApi.create({
          matchId: serverMatchId,
          playerId: serverPlayerId,
          startMinute: lineup.start_min,
          endMinute: lineup.end_min,
          position: lineup.position,
        } as any);
      }
    } catch {}
  }

  progress?.({ step: 'Cleaning up local guest data', done, total });
  // Clean up guest data to avoid duplicates
  try {
    await db.teams.where('created_by_user_id').equals(guest).delete();
    await db.players.where('created_by_user_id').equals(guest).delete();
    await db.seasons.where('created_by_user_id').equals(guest).delete();
    await db.matches.where('created_by_user_id').equals(guest).delete();
    await db.events.where('created_by_user_id').equals(guest).delete();
    // Clean up live state settings
    const settings = await db.settings.toArray();
    for (const s of settings) {
      if (s.key.startsWith('local_live_state:')) {
        await db.settings.delete(s.key);
      }
    }
    // Clear outbox items
    try { await db.outbox.where('created_by_user_id').equals(guest).delete(); } catch {}
    try { await db.outbox.where('created_by_user_id').equals('temp-user-id').delete(); } catch {}
  } catch {}
}
