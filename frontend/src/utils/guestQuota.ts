// Centralized guest quota checks
// Enforces limits for unauthenticated usage using IndexedDB counts

import { isGuest, getGuestId } from './guest';

export const GUEST_LIMITS = {
  maxTeams: 1,
  maxMatches: 1,
  maxPlayersPerTeam: 15,
  maxNonScoringEventsPerMatch: 50,
  maxFormationChangesPerMatch: 10,
};

export type QuotaResult = { ok: true; remaining: number } | { ok: false; remaining: 0; reason: string };

export async function canCreateTeam(): Promise<QuotaResult> {
  if (!isGuest()) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  const guestId = getGuestId();
  const { db } = await import('../db/indexedDB');
  const count = await db.teams
    .where('createdByUserId')
    .equals(guestId)
    .and(t => !t.isDeleted && !t.isOpponent)
    .count();
  const remaining = Math.max(0, GUEST_LIMITS.maxTeams - count);
  return remaining > 0 ? { ok: true, remaining } : { ok: false, remaining: 0, reason: 'Guest limit reached: 1 team' };
}

export async function canCreateMatch(): Promise<QuotaResult> {
  if (!isGuest()) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  const guestId = getGuestId();
  const { db } = await import('../db/indexedDB');
  const count = await db.matches.where('createdByUserId').equals(guestId).and(m => !m.isDeleted).count();
  const remaining = Math.max(0, GUEST_LIMITS.maxMatches - count);
  return remaining > 0 ? { ok: true, remaining } : { ok: false, remaining: 0, reason: 'Guest limit reached: 1 match' };
}

export async function canAddPlayer(teamId: string): Promise<QuotaResult> {
  if (!isGuest()) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  const guestId = getGuestId();
  const { db } = await import('../db/indexedDB');
  // Count players belonging to the team (by currentTeam) created by the guest
  const count = await db.players.where('currentTeam').equals(teamId).and(p => p.createdByUserId === guestId && !p.isDeleted).count();
  const remaining = Math.max(0, GUEST_LIMITS.maxPlayersPerTeam - count);
  return remaining > 0 ? { ok: true, remaining } : { ok: false, remaining: 0, reason: 'Guest limit reached: 15 players per team' };
}

const isScoring = (kind?: string) => kind === 'goal' || kind === 'own_goal';

export async function canAddEvent(matchId: string, kind?: string): Promise<QuotaResult> {
  if (!isGuest()) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  // Always allow goals/own goals
  if (isScoring(kind)) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  const guestId = getGuestId();
  const { db } = await import('../db/indexedDB');

  // Count non-scoring events in events table
  const eventsTableCount = await db.events
    .where('matchId')
    .equals(matchId)
    .and(e => e.createdByUserId === guestId && !e.isDeleted && !isScoring(String(e.kind)))
    .count();

  // Count non-scoring events queued in outbox for this match
  const outbox = await db.outbox
    .filter(ev => {
      const payload = (ev as any).data || (ev as any).payload || ev;
      if (!payload) return false;
      const mk = String(payload.kind || '');
      return payload.matchId === matchId && !isScoring(mk);
    })
    .toArray();

  const total = eventsTableCount + outbox.length;
  const remaining = Math.max(0, GUEST_LIMITS.maxNonScoringEventsPerMatch - total);
  return remaining > 0 ? { ok: true, remaining } : { ok: false, remaining: 0, reason: 'Guest limit reached: 50 non-scoring events per match' };
}

export async function canChangeFormation(matchId: string): Promise<QuotaResult> {
  if (!isGuest()) return { ok: true, remaining: Number.MAX_SAFE_INTEGER };
  const guestId = getGuestId();
  const { db } = await import('../db/indexedDB');

  // Count formation_change events in events table
  const tableCount = await db.events
    .where('matchId')
    .equals(matchId)
    .and(e => e.createdByUserId === guestId && !e.isDeleted && String(e.kind) === 'formation_change')
    .count();

  // Count in outbox as well
  const outboxCount = (await db.outbox
    .filter(ev => {
      const payload = (ev as any).data || (ev as any).payload || ev;
      if (!payload) return false;
      return payload.matchId === matchId && String(payload.kind || '') === 'formation_change';
    })
    .toArray()).length;

  const total = tableCount + outboxCount;
  const remaining = Math.max(0, GUEST_LIMITS.maxFormationChangesPerMatch - total);
  return remaining > 0 ? { ok: true, remaining } : { ok: false, remaining: 0, reason: 'Guest limit reached: 10 formation changes per match' };
}
