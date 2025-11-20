import { getGuestId } from '../utils/guest';

export async function hasGuestData(): Promise<boolean> {
  const s = await getGuestDataSummary();
  return (s.seasons + s.teams + s.players + s.matches + s.events) > 0;
}

export async function getGuestDataSummary(): Promise<{ seasons: number; teams: number; players: number; matches: number; events: number }> {
  try {
    const { db } = await import('../db/indexedDB');
    const guest = getGuestId();
    const [seasons, teams, players, matches] = await Promise.all([
      db.seasons.where('created_by_user_id').equals(guest).count(),
      db.teams.where('created_by_user_id').equals(guest).count(),
      db.players.where('created_by_user_id').equals(guest).count(),
      db.matches.where('created_by_user_id').equals(guest).count(),
    ]);
    // For outbox, include items created by guest or temp-user-id (pre-auth guest writes)
    let events = 0;
    try {
      const temp = await db.outbox.where('created_by_user_id').equals('temp-user-id').count();
      const guestCount = await db.outbox.where('created_by_user_id').equals(guest).count();
      events = temp + guestCount;
    } catch {
      // If index not available (pre-upgrade), fall back to any unsynced outbox items
      try {
        events = await db.outbox.where('synced').equals(0).count();
      } catch { events = 0; }
    }
    return { seasons, teams, players, matches, events };
  } catch {
    return { seasons: 0, teams: 0, players: 0, matches: 0, events: 0 };
  }
}

// Minimal orchestrator v1: imports seasons, teams, players.
// Matches/events import requires robust mapping; planned for a later slice.
export async function runImport(progress?: (p: { step: string; done: number; total: number }) => void): Promise<void> {
  const { db } = await import('../db/indexedDB');
  const { seasonsApi } = await import('./api/seasonsApi');
  const teamsApiModule = await import('./api/teamsApi');
  const playersApiModule = await import('./api/playersApi');
  const teamsApi = teamsApiModule.default || teamsApiModule.teamsApi;
  const playersApi = playersApiModule.default || playersApiModule.playersApi;

  const guest = getGuestId();
  const seasons = await db.seasons.where('created_by_user_id').equals(guest).toArray();
  const teams = await db.teams.where('created_by_user_id').equals(guest).toArray();
  const players = await db.players.where('created_by_user_id').equals(guest).toArray();
  // Matches and events for v2
  const matches = await db.matches.where('created_by_user_id').equals(guest).toArray();
  const outboxEvents = await db.outbox.where('table_name').equals('events').toArray();

  const total = seasons.length + teams.length + players.length + matches.length + outboxEvents.length;
  let done = 0;

  const bump = (step: string) => progress?.({ step, done, total: Math.max(1, total) });

  // Import seasons (by label)
  for (const s of seasons) {
    bump(`Importing season ${s.label}`);
    try {
      await seasonsApi.createSeason({ label: s.label, startDate: s.start_date || new Date().toISOString().slice(0,10), endDate: s.end_date || new Date().toISOString().slice(0,10), isCurrent: !!s.is_current, description: s.description });
    } catch {}
    done++;
  }

  // Heuristic: determine primary team (most frequent in matches)
  const freq: Record<string, number> = {};
  for (const m of matches) {
    freq[m.home_team_id] = (freq[m.home_team_id] || 0) + 1;
    freq[m.away_team_id] = (freq[m.away_team_id] || 0) + 1;
  }
  let primaryLocalTeam: string | null = null;
  let maxF = -1;
  for (const [tid, count] of Object.entries(freq)) {
    if (count > maxF) { maxF = count; primaryLocalTeam = tid; }
  }

  // Import teams: import all for now
  const teamMap = new Map<string, string>(); // local -> server
  for (const t of teams) {
    bump(`Importing team ${t.name}`);
    try {
      const res = await teamsApi.createTeam({ name: t.name } as any);
      teamMap.set(t.id as any, res.data.id);
    } catch {}
    done++;
  }

  // Import players (without team assignment mapping for v1)
  for (const p of players) {
    bump(`Importing player ${p.full_name}`);
    try {
      await playersApi.createPlayer({ name: p.full_name, squadNumber: p.squad_number, preferredPosition: p.preferred_pos } as any);
    } catch {}
    done++;
  }

  // Import matches via quickStart and update details
  const matchMap = new Map<string, string>(); // local match -> server match id
  for (const m of matches) {
    const home = await db.teams.get(m.home_team_id);
    const away = await db.teams.get(m.away_team_id);
    const homeName = home?.name || 'Home';
    const awayName = away?.name || 'Away';
    // Decide myTeamId and isHome based on primaryLocalTeam (fallback to home)
    const localMyTeam = primaryLocalTeam || m.home_team_id;
    const isHome = localMyTeam === m.home_team_id;
    const opponentName = isHome ? awayName : homeName;
    const myTeamServerId = teamMap.get(localMyTeam) || teamMap.get(m.home_team_id) || teamMap.get(m.away_team_id);
    bump(`Importing match vs ${opponentName}`);
    try {
      const created = await (await import('./api/matchesApi')).matchesApi.quickStart({
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
    } catch {}
    done++;
  }

  // Import events (from outbox queued guest events)
  for (const e of outboxEvents) {
    const payload: any = (e as any).data || (e as any).payload || e;
    const localMatchId = payload.match_id;
    const serverMatchId = matchMap.get(localMatchId);
    if (!serverMatchId) { done++; continue; }
    bump(`Importing event ${payload.kind}`);
    try {
      const minute = payload.minute ?? Math.floor((payload.clock_ms || 0) / 60000);
      const second = payload.second ?? Math.floor(((payload.clock_ms || 0) % 60000) / 1000);
      await (await import('./api/eventsApi')).default.create({
        matchId: serverMatchId,
        kind: payload.kind,
        periodNumber: payload.period || payload.period_number,
        clockMs: minute * 60000 + second * 1000,
        teamId: undefined, // omit to avoid mismapping; server may infer
        playerId: undefined,
        notes: payload.notes || payload.data?.notes,
        sentiment: payload.sentiment || 0,
      } as any);
    } catch {}
    done++;
  }

  progress?.({ step: 'Cleaning up local guest data', done, total });
  // Optional clean-up: remove guest-created items to avoid duplicates
  try {
    await db.teams.where('created_by_user_id').equals(guest).delete();
    await db.players.where('created_by_user_id').equals(guest).delete();
    await db.seasons.where('created_by_user_id').equals(guest).delete();
    await db.matches.where('created_by_user_id').equals(guest).delete();
    // Clear any outbox items generated while in guest mode
    try { await db.outbox.where('created_by_user_id').equals(guest).delete(); } catch {}
    try { await db.outbox.where('created_by_user_id').equals('temp-user-id').delete(); } catch {}
  } catch {}
}
