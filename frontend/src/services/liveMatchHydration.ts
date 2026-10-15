import type { Event, MatchPeriod, MatchState } from '@shared/types';
import { db } from '../db/indexedDB';
import type { DbMatch, DbMatchPeriod } from '../db/schema';
import { getAuthUserId } from '../utils/network';
import { isCurrentOwnedMatch, isReplayableMatchStatus, reclaimLegacyRecordings } from './dataLayer';

export interface LiveMatchHydrationToken {
  matchId: string;
  ownerId: string;
  recordingRevision: number;
  pendingAtStart: boolean;
}
export interface LiveMatchHydrationSnapshot {
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
  await reclaimLegacyRecordings(ownerId);
  return db.transaction('r', db.matches, db.matchState, db.matchPeriods, db.events, async () => {
    const match = await db.matches.get(matchId);
    if (!isCurrentOwnedMatch(match, ownerId) || !match || getAuthUserId() !== ownerId) return null;
    const rows = await recordingRows(matchId);
    return { matchId, ownerId, recordingRevision: match.recordingRevision ?? 0, pendingAtStart: pending(rows) };
  });
}

/** Import only a clean current request, atomically, retaining local logical identities. */
export async function applyLiveMatchHydration(
  token: LiveMatchHydrationToken,
  snapshot: LiveMatchHydrationSnapshot,
  buildClock: HydrationClockBuilder
): Promise<boolean> {
  if (token.pendingAtStart || getAuthUserId() !== token.ownerId || (!isReplayableMatchStatus(snapshot.state.status) &&
      snapshot.state.status !== 'CANCELLED' && snapshot.state.status !== 'POSTPONED')) return false;
  return db.transaction('rw', db.matches, db.matchState, db.matchPeriods, db.events, async () => {
    const match = await db.matches.get(token.matchId);
    if (!isCurrentOwnedMatch(match, token.ownerId) || !match || match.synced === false ||
        getAuthUserId() !== token.ownerId || (match.recordingRevision ?? 0) !== token.recordingRevision) return false;
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
      if (period.matchId !== token.matchId || (period.createdByUserId && period.createdByUserId !== token.ownerId)) return false;
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
    for (const event of snapshot.events) {
      if (event.matchId !== token.matchId || (event.createdByUserId && event.createdByUserId !== token.ownerId)) return false;
    }
    const clock = buildClock(snapshot.state, periods, match, now);
    if (!Number.isFinite(clock.timerMs) || !Number.isFinite(clock.totalElapsedSeconds)) throw new Error('Invalid hydration clock');
    if (getAuthUserId() !== token.ownerId) return false;
    await db.matchPeriods.bulkPut(periods);
    const canonicalIds = new Set(periods.map(period => period.id));
    await db.matchPeriods.bulkDelete(rows.periods.filter(period => !canonicalIds.has(period.id)).map(period => period.id));
    const localEvents = new Map(rows.events.map(event => [event.id, event]));
    await db.events.bulkPut(snapshot.events.filter(event => !localEvents.get(event.id)?.isDeleted).map(event => ({
      ...event, matchId: token.matchId, createdByUserId: token.ownerId, synced: true, syncedAt: new Date(now).toISOString(),
      scoreProjectionPending: false,
    })));
    await db.matchState.put({
      matchId: token.matchId, status: snapshot.state.status, currentPeriodId: open[0]?.id,
      timerMs: clock.timerMs, totalElapsedSeconds: clock.totalElapsedSeconds, lastUpdatedAt: now,
      createdAt: snapshot.state.createdAt, updatedAt: snapshot.state.updatedAt, createdByUserId: token.ownerId,
      isDeleted: !!snapshot.state.isDeleted, synced: true, syncedAt: new Date(now).toISOString(),
    });
    return true;
  });
}
