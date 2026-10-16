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
  if (payload.myTeamId) {
    const selectedTeam = await db.teams.get(payload.myTeamId);
    if (!selectedTeam || selectedTeam.isDeleted || selectedTeam.isOpponent || selectedTeam.createdByUserId !== guestId) {
      throw new Error('The selected team is unavailable. Please choose your team again.');
    }
  }

  // 1) Ensure season exists (year-based naming)
  const year = new Date().getFullYear();
  const seasonLabel = `${year}-${year + 1} Season`;
  const now = Date.now();
  // try to find existing (check both new and legacy names)
  let season = await db.seasons.where('createdByUserId').equals(guestId)
    .and(s => !s.isDeleted && (s.label === seasonLabel || s.label === 'Demo Season')).first();
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
  const teamName = payload.myTeamName?.trim();
  if (!ourTeamId && teamName) {
    // search by name
    const existing = await db.teams.where('name').equals(teamName)
      .and(t => !t.isDeleted && !t.isOpponent && t.createdByUserId === guestId).first();
    if (existing) {
      ourTeamId = existing.id as string;
    } else {
      const id = uuid();
      await db.teams.add({
        id,
        teamId: id,
        name: teamName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUserId: guestId,
      isDeleted: false,
      isOpponent: false,
      synced: false,
    } as any);
    ourTeamId = id;
  }

  // 3) Ensure opponent team exists (by name)
  const oppName = payload.opponentName?.trim() || 'Unknown Opponent';
  let oppTeam = await db.teams.where('name').equals(oppName)
    .and(t => !t.isDeleted && t.isOpponent === true && t.createdByUserId === guestId).first();
  if (!oppTeam) {
    const id = uuid();
    await db.teams.add({
      id,
      teamId: id,
      name: oppName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
  await db.transaction('rw', db.matches, db.matchState, async () => {
    await db.matches.add({
      id: matchId,
      matchId: matchId,
      seasonId: seasonId,
      kickoffTime: kickoffTs,
      competition: payload.competition,
      homeTeamId: homeTeamId,
      awayTeamId: awayTeamId,
      venue: payload.venue,
      durationMinutes: duration,
      periodFormat: periodFormat,
      homeScore: 0,
      awayScore: 0,
      notes: payload.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUserId: guestId,
      isDeleted: false,
      synced: false,
    } as any);

    await db.matchState.add({
      matchId, status: 'SCHEDULED', timerMs: 0, totalElapsedSeconds: 0,
      lastUpdatedAt: now, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
      createdByUserId: guestId, isDeleted: false, synced: false,
    });
  });

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
    kickoffTime: m.kickoffTime,
    competition: m.competition,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeam: home ? { id: home.id, name: home.name, isOpponent: home.isOpponent, createdByUserId: home.createdByUserId } : undefined,
    awayTeam: away ? { id: away.id, name: away.name, isOpponent: away.isOpponent, createdByUserId: away.createdByUserId } : undefined,
    venue: m.venue,
    durationMinutes: m.durationMinutes,
    periodFormat: m.periodFormat,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    createdByUserId: m.createdByUserId,
    created_by_user_id: (m as any).created_by_user_id,
    isDeleted: m.isDeleted,
    is_deleted: (m as any).is_deleted,
    synced: m.synced,
    syncedAt: m.syncedAt,
    syncAttempted: 'syncAttempted' in m ? m.syncAttempted : undefined,
  };
}
