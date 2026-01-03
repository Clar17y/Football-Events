// Quota checks using IndexedDB counts
// Enforces limits for both guests and authenticated users (offline-first)

import { isGuest, getGuestId } from './guest';
import { getAuthUserId } from './network';

export const GUEST_LIMITS = {
  maxTeams: 1,
  maxMatches: 1,
  maxSeasons: 1,
  maxPlayers: 15,
  maxPlayersPerTeam: 15,
  maxNonScoringEventsPerMatch: 40,
  maxFormationChangesPerMatch: 5,
};

// Free tier limits (matches backend QuotaService LIMITS_BY_PLAN.free)
export const FREE_LIMITS = {
  maxTeams: 1,
  maxMatchesPerSeason: 30,
  maxSeasons: 5,
  maxPlayers: 30,
  maxPlayersPerTeam: 20,
  maxNonScoringEventsPerMatch: 40,
  maxFormationChangesPerMatch: 5,
};

export type QuotaResult = { ok: true; remaining: number } | { ok: false; remaining: 0; reason: string };

function getUserId(): string | null {
  if (isGuest()) return getGuestId();
  return getAuthUserId();
}

function getLimit(guestLimit: number, freeLimit: number): number {
  return isGuest() ? guestLimit : freeLimit;
}

export async function canCreateTeam(): Promise<QuotaResult> {
  const userId = getUserId();
  if (!userId) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };

  const { db } = await import('../db/indexedDB');
  const count = await db.teams
    .where('createdByUserId')
    .equals(userId)
    .and(t => !t.isDeleted && !t.isOpponent)
    .count();

  const limit = getLimit(GUEST_LIMITS.maxTeams, FREE_LIMITS.maxTeams);
  const remaining = Math.max(0, limit - count);
  return remaining > 0
    ? { ok: true, remaining }
    : { ok: false, remaining: 0, reason: `Team limit reached: ${limit} team${limit > 1 ? 's' : ''}` };
}

export async function canCreateSeason(): Promise<QuotaResult> {
  const userId = getUserId();
  if (!userId) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };

  const { db } = await import('../db/indexedDB');
  const count = await db.seasons
    .where('createdByUserId')
    .equals(userId)
    .and(s => !s.isDeleted)
    .count();

  const limit = getLimit(GUEST_LIMITS.maxSeasons, FREE_LIMITS.maxSeasons);
  const remaining = Math.max(0, limit - count);
  return remaining > 0
    ? { ok: true, remaining }
    : { ok: false, remaining: 0, reason: `Season limit reached: ${limit} season${limit > 1 ? 's' : ''}` };
}

export async function canCreateMatch(seasonId?: string): Promise<QuotaResult> {
  const { db } = await import('../db/indexedDB');

  if (isGuest()) {
    // Guest: 1 match total
    const guestId = getGuestId();
    const count = await db.matches.where('createdByUserId').equals(guestId).and(m => !m.isDeleted).count();
    const remaining = Math.max(0, GUEST_LIMITS.maxMatches - count);
    return remaining > 0 ? { ok: true, remaining } : { ok: false, remaining: 0, reason: 'Guest limit reached: 1 match' };
  }

  // Authenticated user: check matches per season
  const authUserId = getAuthUserId();
  if (!authUserId || !seasonId) {
    // Can't check without user/season - allow and let sync handle it
    return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  }

  const count = await db.matches
    .where('seasonId')
    .equals(seasonId)
    .and(m => m.createdByUserId === authUserId && !m.isDeleted)
    .count();

  const limit = FREE_LIMITS.maxMatchesPerSeason;
  const remaining = Math.max(0, limit - count);
  return remaining > 0
    ? { ok: true, remaining }
    : { ok: false, remaining: 0, reason: `Match limit reached: ${limit} matches per season` };
}

export async function canCreatePlayer(): Promise<QuotaResult> {
  const userId = getUserId();
  if (!userId) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };

  const { db } = await import('../db/indexedDB');
  const count = await db.players
    .where('createdByUserId')
    .equals(userId)
    .and(p => !p.isDeleted)
    .count();

  const limit = getLimit(GUEST_LIMITS.maxPlayers, FREE_LIMITS.maxPlayers);
  const remaining = Math.max(0, limit - count);
  return remaining > 0
    ? { ok: true, remaining }
    : { ok: false, remaining: 0, reason: `Player limit reached: ${limit} player${limit > 1 ? 's' : ''}` };
}

export async function canAddPlayer(teamId: string): Promise<QuotaResult> {
  const userId = getUserId();
  if (!userId || !teamId) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };

  const { db } = await import('../db/indexedDB');
  const count = await db.players
    .where('currentTeam')
    .equals(teamId)
    .and(p => p.createdByUserId === userId && !p.isDeleted)
    .count();

  const limit = getLimit(GUEST_LIMITS.maxPlayersPerTeam, FREE_LIMITS.maxPlayersPerTeam);
  const remaining = Math.max(0, limit - count);
  return remaining > 0
    ? { ok: true, remaining }
    : { ok: false, remaining: 0, reason: `Player limit reached: ${limit} players per team` };
}

const isScoring = (kind?: string) => kind === 'goal' || kind === 'own_goal';

export async function canAddEvent(matchId: string, kind?: string): Promise<QuotaResult> {
  // Always allow goals/own goals
  if (isScoring(kind)) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };

  const userId = getUserId();
  if (!userId) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };

  const { db } = await import('../db/indexedDB');
  const count = await db.events
    .where('matchId')
    .equals(matchId)
    .and(e => e.createdByUserId === userId && !e.isDeleted && !isScoring(String(e.kind)))
    .count();

  const limit = getLimit(GUEST_LIMITS.maxNonScoringEventsPerMatch, FREE_LIMITS.maxNonScoringEventsPerMatch);
  const remaining = Math.max(0, limit - count);
  return remaining > 0
    ? { ok: true, remaining }
    : { ok: false, remaining: 0, reason: `Event limit reached: ${limit} non-scoring events per match` };
}

export async function canChangeFormation(matchId: string): Promise<QuotaResult> {
  const userId = getUserId();
  if (!userId) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };

  const { db } = await import('../db/indexedDB');
  const count = await db.events
    .where('matchId')
    .equals(matchId)
    .and(e => e.createdByUserId === userId && !e.isDeleted && String(e.kind) === 'formation_change')
    .count();

  const limit = getLimit(GUEST_LIMITS.maxFormationChangesPerMatch, FREE_LIMITS.maxFormationChangesPerMatch);
  const remaining = Math.max(0, limit - count);
  return remaining > 0
    ? { ok: true, remaining }
    : { ok: false, remaining: 0, reason: `Formation change limit reached: ${limit} per match` };
}
