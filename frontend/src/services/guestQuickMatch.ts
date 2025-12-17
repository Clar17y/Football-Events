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

  // 1) Ensure season exists (year-based naming)
  const year = new Date().getFullYear();
  const seasonLabel = `${year}-${year + 1} Season`;
  const now = Date.now();
  // try to find existing (check both new and legacy names)
  let season = await db.seasons.where('createdByUserId').equals(guestId).and(s => s.label === seasonLabel || s.label === 'Demo Season').first();
  if (!season) {
    const start = new Date(now - 30 * 24 * 3600_000).toISOString();
    const end = new Date(now + 365 * 24 * 3600_000).toISOString();
    const seasonId = uuid();
    await db.seasons.add({
      id: seasonId,
      seasonId: seasonId,
      label: seasonLabel,
      startDate: start,
      endDate: end,
      isCurrent: true,
      description: 'Auto-created season',
      createdAt: now,
      updatedAt: now,
      createdByUserId: guestId,
      isDeleted: false,
      synced: false,
    } as any);
    season = await db.seasons.get(seasonId);
  }
  const seasonId = season?.seasonId || season?.id as string;

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
        teamId: id,
        name: payload.myTeamName,
        createdAt: now,
        updatedAt: now,
        createdByUserId: guestId,
        isDeleted: false,
        isOpponent: false,
        synced: false,
      } as any);
      ourTeamId = id;
    }
  }
  if (!ourTeamId) {
    // fallback: create a default team
    const id = uuid();
    await db.teams.add({
      id,
      teamId: id,
      name: 'My Team',
      createdAt: now,
      updatedAt: now,
      createdByUserId: guestId,
      isDeleted: false,
      isOpponent: false,
      synced: false,
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
      teamId: id,
      name: oppName,
      createdAt: now,
      updatedAt: now,
      createdByUserId: guestId,
      isDeleted: false,
      isOpponent: true,
      synced: false,
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
    matchId: matchId,
    seasonId: seasonId,
    kickoffTs: kickoffTs,
    competition: payload.competition,
    homeTeamId: homeTeamId,
    awayTeamId: awayTeamId,
    venue: payload.venue,
    durationMins: duration,
    periodFormat: periodFormat,
    homeScore: 0,
    awayScore: 0,
    notes: payload.notes,
    createdAt: now,
    updatedAt: now,
    createdByUserId: guestId,
    isDeleted: false,
    synced: false,
  } as any);

  return { id: matchId };
}

export async function getLocalMatch(id: string): Promise<any | null> {
  const { db } = await import('../db/indexedDB');
  const m = await db.matches.get(id);
  if (!m) return null;
  const home = m.homeTeamId ? await db.teams.get(m.homeTeamId) : null;
  const away = m.awayTeamId ? await db.teams.get(m.awayTeamId) : null;
  return {
    id: m.id,
    seasonId: m.seasonId,
    kickoffTime: new Date(m.kickoffTs),
    competition: m.competition,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeam: home ? { id: home.id, name: home.name } : undefined,
    awayTeam: away ? { id: away.id, name: away.name } : undefined,
    venue: m.venue,
    durationMinutes: m.durationMins,
    periodFormat: m.periodFormat,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    createdAt: new Date(m.createdAt),
    updatedAt: m.updatedAt ? new Date(m.updatedAt) : undefined,
    createdByUserId: m.createdByUserId,
    isDeleted: !!m.isDeleted,
  };
}
