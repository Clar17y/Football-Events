import type { Event, Match, MatchPeriod, MatchState } from '@shared/types';
import { db } from '../db/indexedDB';
import type { DbMatch, DbMatchPeriod } from '../db/schema';
import { getAuthUserId } from '../utils/network';
import { isCurrentOwnedMatch, isReplayableMatchStatus, reclaimLegacyRecordings } from './dataLayer';
import { captureSyncSession, isSyncSessionCurrent, type SyncSession } from './seasonIdentity';

export interface LiveMatchHydrationToken {
  matchId: string;
  ownerId: string;
  recordingRevision: number;
  pendingAtStart: boolean;
  session: SyncSession;
  scoreRevision?: string;
}
export interface LiveMatchHydrationSnapshot {
  match: Match;
  state: MatchState;
  periods: MatchPeriod[];
  events: Event[];
}
export type HydrationClockBuilder = (state: MatchState, periods: DbMatchPeriod[], match: DbMatch, nowMs: number) => {
  timerMs: number;
  totalElapsedSeconds: number;
};

function periodKey(period: { periodNumber: number; periodType?: string }) {
  return `${(period.periodType || 'REGULAR').toUpperCase()}:${period.periodNumber}`;
}
function timestamp(value: unknown, fallback?: number): number | undefined {
  if (value == null) return fallback;
  const number = new Date(value as string | number | Date).getTime();
  return Number.isFinite(number) ? number : fallback;
}
async function recordingRows(matchId: string) {
  return {
    state: await db.matchState.get(matchId),
    periods: await db.matchPeriods.where('matchId').equals(matchId).toArray(),
    events: await db.events.where('matchId').equals(matchId).toArray(),
  };
}
function pending(rows: Awaited<ReturnType<typeof recordingRows>>) {
  return [rows.state, ...rows.periods, ...rows.events].some(row => row?.synced === false);
}

/** Capture before issuing any server request; settlement cannot erase this evidence. */
export async function captureLiveMatchHydration(matchId: string): Promise<LiveMatchHydrationToken | null> {
  const ownerId = getAuthUserId();
  if (!ownerId) return null;
  const session = captureSyncSession(ownerId);
  await reclaimLegacyRecordings(ownerId);
  return db.transaction('r', db.matches, db.matchState, db.matchPeriods, db.events, async () => {
    const match = await db.matches.get(matchId);
    if (!isCurrentOwnedMatch(match, ownerId) || !match || !isSyncSessionCurrent(session)) return null;
    const rows = await recordingRows(matchId);
    return { matchId, ownerId, session, scoreRevision: match.scoreRevision,
      recordingRevision: match.recordingRevision ?? 0, pendingAtStart: match.synced === false || pending(rows) };
  });
}

/** Import only a clean current request, atomically, retaining local logical identities. */
export async function applyLiveMatchHydration(
  token: LiveMatchHydrationToken,
  snapshot: LiveMatchHydrationSnapshot,
  buildClock: HydrationClockBuilder,
  isCurrent: () => boolean = () => true
): Promise<boolean> {
  const current = () => isCurrent() && isSyncSessionCurrent(token.session);
  if (token.pendingAtStart || !current() || !snapshot?.state || !snapshot.match ||
      !Array.isArray(snapshot.periods) || !Array.isArray(snapshot.events) ||
      snapshot.match.id !== token.matchId || !isCurrentOwnedMatch(snapshot.match, token.ownerId) ||
      ![snapshot.match.homeScore, snapshot.match.awayScore].every(score => Number.isSafeInteger(score) && score >= 0) ||
      (!isReplayableMatchStatus(snapshot.state.status) &&
      snapshot.state.status !== 'CANCELLED' && snapshot.state.status !== 'POSTPONED')) return false;
  return db.transaction('rw', db.matches, db.matchState, db.matchPeriods, db.events, async () => {
    const match = await db.matches.get(token.matchId);
    if (!isCurrentOwnedMatch(match, token.ownerId) || !match || match.synced === false ||
        !current() || match.scoreRevision !== token.scoreRevision ||
        match.homeTeamId !== snapshot.match.homeTeamId || match.awayTeamId !== snapshot.match.awayTeamId ||
        (match.recordingRevision ?? 0) !== token.recordingRevision) return false;
    const rows = await recordingRows(token.matchId);
    if (pending(rows) || [rows.state, ...rows.periods, ...rows.events].some(row => row && row.createdByUserId !== token.ownerId)) return false;
    if (snapshot.state.matchId !== token.matchId || snapshot.state.createdByUserId !== token.ownerId) return false;
    if (rows.state?.status === 'COMPLETED' && snapshot.state.status !== 'COMPLETED') return false;
    const now = Date.now();
    const canonical = new Map<string, DbMatchPeriod>();
    for (const period of rows.periods) {
      const key = periodKey(period), old = canonical.get(key);
      if (!old || period.id === rows.state?.currentPeriodId || (period.endedAt != null && old.endedAt == null)) canonical.set(key, period);
    }
    // Even a duplicate with a different ID cannot make an ended logical period open.
    for (const period of rows.periods.filter(period => period.endedAt != null || period.isDeleted)) {
      const current = canonical.get(periodKey(period))!;
      if (current.endedAt == null || period.isDeleted) canonical.set(periodKey(period), { ...period, id: current.id });
    }
    for (const period of snapshot.periods) {
      if (!period || !period.id || period.matchId !== token.matchId || (period.createdByUserId && period.createdByUserId !== token.ownerId)) return false;
      const existing = await db.matchPeriods.get(period.id);
      if (existing && (existing.matchId !== token.matchId || existing.createdByUserId !== token.ownerId)) return false;
      const key = periodKey(period), old = canonical.get(key);
      if (old?.isDeleted || (old?.endedAt != null && period.endedAt == null)) continue;
      canonical.set(key, {
        id: old?.id || period.id, matchId: token.matchId, periodNumber: period.periodNumber,
        periodType: period.periodType, startedAt: timestamp(period.startedAt, now)!, endedAt: timestamp(period.endedAt),
        durationSeconds: period.durationSeconds, createdAt: period.createdAt, updatedAt: period.updatedAt,
        createdByUserId: token.ownerId, isDeleted: !!period.isDeleted, synced: true, syncedAt: new Date(now).toISOString(),
      });
    }
    const periods = [...canonical.values()];
    const open = periods.filter(period => !period.isDeleted && period.endedAt == null);
    if (snapshot.state.status === 'LIVE' && open.length !== 1) return false;
    if (snapshot.state.status === 'COMPLETED' && open.length) return false;
    const remoteEventIds = new Set<string>();
    for (const event of snapshot.events) {
      if (!event || !event.id || !event.kind || event.isDeleted || remoteEventIds.has(event.id) ||
          event.matchId !== token.matchId || (event.createdByUserId && event.createdByUserId !== token.ownerId)) return false;
      remoteEventIds.add(event.id);
      const existing = await db.events.get(event.id);
      if (existing && (existing.matchId !== token.matchId || existing.createdByUserId !== token.ownerId)) return false;
    }
    const clock = buildClock(snapshot.state, periods, match, now);
    if (!Number.isFinite(clock.timerMs) || !Number.isFinite(clock.totalElapsedSeconds)) throw new Error('Invalid hydration clock');
    if (!current()) return false;
    await db.matchPeriods.bulkPut(periods);
    const canonicalIds = new Set(periods.map(period => period.id));
    await db.matchPeriods.bulkDelete(rows.periods.filter(period => !canonicalIds.has(period.id)).map(period => period.id));
    const localEvents = new Map(rows.events.map(event => [event.id, event]));
    await db.events.bulkDelete(rows.events.filter(event => event.synced === true && !event.isDeleted &&
      !remoteEventIds.has(event.id)).map(event => event.id));
    await db.events.bulkPut(snapshot.events.filter(event => !localEvents.get(event.id)?.isDeleted).map(event => ({
      ...event, matchId: token.matchId, createdByUserId: token.ownerId, synced: true, syncedAt: new Date(now).toISOString(),
      scoreProjectionPending: false,
    })));
    // Cached history can be partial. Replace the saved baseline with the owned server score.
    // Advance its revision so an older cache request cannot restore the previous baseline.
    if (match.homeScore !== snapshot.match.homeScore || match.awayScore !== snapshot.match.awayScore) {
      await db.matches.update(token.matchId, {
        homeScore: snapshot.match.homeScore, awayScore: snapshot.match.awayScore, scoreRevision: crypto.randomUUID(),
      });
    }
    await db.matchState.put({
      matchId: token.matchId, status: snapshot.state.status, currentPeriodId: open[0]?.id,
      timerMs: clock.timerMs, totalElapsedSeconds: clock.totalElapsedSeconds, lastUpdatedAt: now,
      createdAt: snapshot.state.createdAt, updatedAt: snapshot.state.updatedAt, createdByUserId: token.ownerId,
      isDeleted: !!snapshot.state.isDeleted, synced: true, syncedAt: new Date(now).toISOString(),
    });
    if (!current()) throw new Error('Match hydration context changed');
    return true;
  });
}
