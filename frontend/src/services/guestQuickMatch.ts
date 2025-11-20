import { getGuestId } from '../utils/guest';

export interface GuestQuickMatchPayload {
  myTeamId?: string;
  myTeamName?: string;
  opponentName: string;
  isHome: boolean;
  kickoffTime?: string; // ISO
  competition?: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: 'quarter' | 'half' | 'whole';
  notes?: string;
}

function uuid(): string {
  // @ts-ignore crypto may be polyfilled
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createLocalQuickMatch(payload: GuestQuickMatchPayload): Promise<{ id: string } & any> {
  const { db } = await import('../db/indexedDB');
  const guestId = getGuestId();

  // 1) Ensure Demo Season exists
  const seasonLabel = 'Demo Season';
  const now = Date.now();
  // try to find existing
  let season = await db.seasons.where('created_by_user_id').equals(guestId).and(s => s.label === seasonLabel).first();
  if (!season) {
    const start = new Date(now - 30 * 24 * 3600_000).toISOString();
    const end = new Date(now + 365 * 24 * 3600_000).toISOString();
    const seasonId = uuid();
    await db.seasons.add({
      id: seasonId,
      season_id: seasonId,
      label: seasonLabel,
      start_date: start,
      end_date: end,
      is_current: true,
      description: 'Auto-created for Guest Quick Match',
      created_at: now,
      updated_at: now,
      created_by_user_id: guestId,
      is_deleted: false,
    } as any);
    season = await db.seasons.get(seasonId);
  }
  const seasonId = season?.season_id || season?.id as string;

  // 2) Ensure our team exists (use provided id or create one)
  let homeTeamId = '';
  let awayTeamId = '';
  let ourTeamId = payload.myTeamId;
  if (!ourTeamId && payload.myTeamName) {
    // search by name
    const existing = await db.teams.where('name').equals(payload.myTeamName).first();
    if (existing) {
      ourTeamId = existing.id as string;
    } else {
      const id = uuid();
      await db.teams.add({
        id,
        team_id: id,
        name: payload.myTeamName,
        created_at: now,
        updated_at: now,
        created_by_user_id: guestId,
        is_deleted: false,
        is_opponent: false,
      } as any);
      ourTeamId = id;
    }
  }
  if (!ourTeamId) {
    // fallback: create a default team
    const id = uuid();
    await db.teams.add({
      id,
      team_id: id,
      name: 'My Team',
      created_at: now,
      updated_at: now,
      created_by_user_id: guestId,
      is_deleted: false,
      is_opponent: false,
    } as any);
    ourTeamId = id;
  }

  // 3) Ensure opponent team exists (by name)
  const oppName = payload.opponentName || 'Opponent';
  let oppTeam = await db.teams.where('name').equals(oppName).first();
  if (!oppTeam) {
    const id = uuid();
    await db.teams.add({
      id,
      team_id: id,
      name: oppName,
      created_at: now,
      updated_at: now,
      created_by_user_id: guestId,
      is_deleted: false,
      is_opponent: true,
    } as any);
    oppTeam = await db.teams.get(id);
  }

  if (payload.isHome) { homeTeamId = ourTeamId; awayTeamId = oppTeam!.id as string; }
  else { homeTeamId = oppTeam!.id as string; awayTeamId = ourTeamId; }

  // 4) Create local match
  const matchId = uuid();
  const kickoffTs = payload.kickoffTime ? new Date(payload.kickoffTime).toISOString() : new Date(now).toISOString();
  const periodFormat = payload.periodFormat || 'quarter';
  const duration = payload.durationMinutes || 50;
  await db.matches.add({
    id: matchId,
    match_id: matchId,
    season_id: seasonId,
    kickoff_ts: kickoffTs,
    competition: payload.competition,
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    venue: payload.venue,
    duration_mins: duration,
    period_format: periodFormat,
    home_score: 0,
    away_score: 0,
    notes: payload.notes,
    created_at: now,
    updated_at: now,
    created_by_user_id: guestId,
    is_deleted: false,
  } as any);

  return { id: matchId };
}

export async function getLocalMatch(id: string): Promise<any | null> {
  const { db } = await import('../db/indexedDB');
  const m = await db.matches.get(id);
  if (!m) return null;
  const home = m.home_team_id ? await db.teams.get(m.home_team_id) : null;
  const away = m.away_team_id ? await db.teams.get(m.away_team_id) : null;
  return {
    id: m.id,
    seasonId: m.season_id,
    kickoffTime: new Date(m.kickoff_ts),
    competition: m.competition,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    homeTeam: home ? { id: home.id, name: home.name } : undefined,
    awayTeam: away ? { id: away.id, name: away.name } : undefined,
    venue: m.venue,
    durationMinutes: m.duration_mins,
    periodFormat: m.period_format,
    homeScore: m.home_score,
    awayScore: m.away_score,
    createdAt: new Date(m.created_at),
    updatedAt: m.updated_at ? new Date(m.updated_at) : undefined,
    created_by_user_id: m.created_by_user_id,
    is_deleted: !!m.is_deleted,
  };
}
