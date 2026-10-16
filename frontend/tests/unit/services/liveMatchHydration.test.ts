import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
const session = vi.hoisted(() => ({ owner: 'user-123', generation: 0 }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => session.owner, getCurrentUserId: () => session.owner }));
vi.mock('../../../src/utils/guest', () => ({ isGuest: () => false, getGuestId: () => 'guest-test' }));
vi.mock('../../../src/db/eventLinking', () => ({ autoLinkEvents: async () => {} }));
vi.mock('../../../src/services/importService', () => ({ isGuestId: (id?: string) => id?.startsWith('guest-'), hasGuestData: async () => false }));
vi.mock('../../../src/services/api/baseApi', () => {
  const client = { getSessionGeneration: () => session.generation, isAuthenticated: vi.fn(() => true), get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() };
  return { apiClient: client, default: client };
});
import { db } from '../../../src/db/indexedDB';
import { apiClient } from '../../../src/services/api/baseApi';
import { eventsDataLayer, isReplayableMatchStatus, matchPeriodsDataLayer, matchStateDataLayer, reclaimLegacyRecordings } from '../../../src/services/dataLayer';
import { captureLiveMatchHydration, applyLiveMatchHydration, type HydrationClockBuilder, type LiveMatchHydrationSnapshot } from '../../../src/services/liveMatchHydration';
import { syncService, __syncQuarantineTestUtils } from '../../../src/services/syncService';

const now = '2026-10-14T12:00:00.000Z', nowMs = new Date(now).getTime();
const event = { matchId: 'match-1', kind: 'goal', teamId: 'home' };
const period = () => ({ id: 'local-period', matchId: 'match-1', periodNumber: 1, periodType: 'REGULAR' as const,
  startedAt: nowMs, createdAt: now, createdByUserId: session.owner, synced: true, isDeleted: false });
const snapshot = (events: any[] = [], status: 'LIVE' | 'PAUSED' = 'PAUSED'): LiveMatchHydrationSnapshot => ({
  match: { id: 'match-1', homeTeamId: 'home', awayTeamId: 'away', homeScore: 5, awayScore: 2,
    createdByUserId: session.owner, isDeleted: false } as LiveMatchHydrationSnapshot['match'],
  state: { id: 'state-1', matchId: 'match-1', status, totalElapsedSeconds: 12, createdAt: now, updatedAt: now,
    createdByUserId: session.owner, isDeleted: false },
  periods: [{ ...period(), id: 'server-period', startedAt: now }],
  events: events.map(row => ({ ...row, createdAt: now, createdByUserId: session.owner, isDeleted: false })),
});
const clock = () => ({ timerMs: 12000, totalElapsedSeconds: 12 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  session.owner = 'user-123';
  session.generation = 0;
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  await db.open();
  await Promise.all(db.tables.map(table => table.clear()));
  await db.matches.add({ id: 'match-1', matchId: 'match-1', seasonId: 'season-1', homeTeamId: 'home', awayTeamId: 'away',
    homeScore: 5, awayScore: 2, kickoffTime: now, durationMinutes: 60, periodFormat: 'quarter', createdAt: now,
    createdByUserId: session.owner, synced: true, isDeleted: false });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  vi.mocked(apiClient.isAuthenticated).mockReturnValue(true);
  vi.mocked(apiClient.put).mockResolvedValue({ success: true, data: {} });
  vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: {} });
  vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: {} });
  __syncQuarantineTestUtils.resetGlobalBackoff();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('durable request-start hydration guard', () => {
  it.each(['CANCELLED', 'POSTPONED'] as const)('preserves clean %s responses and prevents canonical lifecycle recording', async status => {
    const token = (await captureLiveMatchHydration('match-1'))!;
    const response = snapshot();
    response.state.status = status;
    expect(await applyLiveMatchHydration(token, response, clock)).toBe(true);
    expect(await db.matchState.get('match-1')).toMatchObject({ status, synced: true });
    expect(isReplayableMatchStatus(status)).toBe(false);
    const before = await db.matches.get('match-1');
    await expect(matchStateDataLayer.upsert('match-1', { status: 'LIVE' })).rejects.toThrow('read-only');
    await expect(matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 2 })).rejects.toThrow('read-only');
    await expect(matchPeriodsDataLayer.endPeriod('server-period', nowMs + 1000, 1)).rejects.toThrow('read-only');
    expect(await db.matches.get('match-1')).toEqual(before);
    expect(await db.matchPeriods.get('server-period')).not.toHaveProperty('endedAt', expect.anything());
    expect(await db.matchState.get('match-1')).toMatchObject({ status, synced: true });
    // A post-match event correction does not represent a lifecycle transition.
    await db.events.add({ ...event, id: 'correction', createdByUserId: session.owner, synced: true, isDeleted: false } as any);
    await eventsDataLayer.update('correction', { sentiment: 2 });
    expect(await db.events.get('correction')).toMatchObject({ sentiment: 2 });
    expect(await db.matchState.get('match-1')).toMatchObject({ status });
  });

  it('rejects malformed status before any local write or clock calculation', async () => {
    const token = (await captureLiveMatchHydration('match-1'))!;
    const response = snapshot([{ ...event, id: 'malformed-event' }]);
    response.state.status = 'UNKNOWN' as any;
    const build = vi.fn<HydrationClockBuilder>(clock);
    expect(await applyLiveMatchHydration(token, response, build)).toBe(false);
    expect(build).not.toHaveBeenCalled();
    expect(await db.matchState.count()).toBe(0);
    expect(await db.matchPeriods.count()).toBe(0);
    expect(await db.events.count()).toBe(0);
    await expect(matchStateDataLayer.upsert('match-1', { status: 'UNKNOWN' as any })).rejects.toThrow('Unsupported');
    expect((await db.matches.get('match-1'))?.recordingRevision).toBeUndefined();
  });

  it.each(['SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED'] as const)('retains the supported %s read model', async status => {
    const token = (await captureLiveMatchHydration('match-1'))!;
    const response = snapshot();
    response.state.status = status;
    if (status === 'COMPLETED') response.periods[0] = { ...response.periods[0], endedAt: now, durationSeconds: 0 };
    expect(await applyLiveMatchHydration(token, response, clock)).toBe(true);
    expect(await db.matchState.get('match-1')).toMatchObject({ status });
    expect(isReplayableMatchStatus(status)).toBe(true);
  });

  it('rejects a goal pending at request start even after its real sync acknowledgement', async () => {
    const created = await eventsDataLayer.create(event);
    const token = (await captureLiveMatchHydration('match-1'))!;
    expect(token.pendingAtStart).toBe(true);
    const response = deferred<LiveMatchHydrationSnapshot>();
    const importResult = response.promise.then(data => applyLiveMatchHydration(token, data, clock));
    await syncService.flushOnce();
    expect(await db.events.get(created.id)).toMatchObject({ synced: true });
    response.resolve(snapshot([{ ...created, kind: 'own_goal' }]));
    expect(await importResult).toBe(false);
    expect(await db.events.get(created.id)).toMatchObject({ kind: 'goal' });
    expect(await db.matchState.get('match-1')).toBeUndefined();
  });

  it.each(['create', 'edit', 'undo'] as const)('rejects %s during a deferred load after ACK/removal at the same timestamp', async change => {
    const token = (await captureLiveMatchHydration('match-1'))!;
    const response = deferred<LiveMatchHydrationSnapshot>();
    const importResult = response.promise.then(data => applyLiveMatchHydration(token, data, clock));
    const created = await eventsDataLayer.create(event);
    if (change === 'edit') await eventsDataLayer.update(created.id, { sentiment: 3 });
    if (change === 'undo') await eventsDataLayer.delete(created.id);
    await syncService.flushOnce();
    if (change === 'undo') expect(await db.events.get(created.id)).toBeUndefined();
    else expect(await db.events.get(created.id)).toMatchObject({ synced: true });
    response.resolve(snapshot([{ ...created, sentiment: 0 }]));
    expect(await importResult).toBe(false);
    if (change === 'undo') expect(await db.events.get(created.id)).toBeUndefined();
    else expect(await db.events.get(created.id)).toMatchObject({ sentiment: change === 'edit' ? 3 : 0 });
    expect((await db.matches.get('match-1'))!.recordingRevision).toBeGreaterThan(token.recordingRevision);
  });

  it('cannot reopen an ended and acknowledged period or overwrite an acknowledged state change', async () => {
    await db.matchPeriods.add(period());
    const token = (await captureLiveMatchHydration('match-1'))!;
    await matchPeriodsDataLayer.endPeriod('local-period', nowMs + 1000, 1);
    await syncService.flushOnce();
    expect(await db.matchPeriods.get('local-period')).toMatchObject({ synced: true, endedAt: nowMs + 1000 });
    expect(await applyLiveMatchHydration(token, snapshot([], 'LIVE'), clock)).toBe(false);
    expect(await db.matchPeriods.get('local-period')).toMatchObject({ endedAt: nowMs + 1000 });
    await db.matchPeriods.update('local-period', { endedAt: undefined, synced: true });
    await db.matchState.add({ matchId: 'match-1', status: 'LIVE', currentPeriodId: 'local-period', timerMs: 12000,
      lastUpdatedAt: nowMs, createdAt: now, createdByUserId: session.owner, synced: true, isDeleted: false });
    const stateToken = (await captureLiveMatchHydration('match-1'))!;
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', totalElapsedSeconds: 12 });
    await syncService.flushOnce();
    expect(await db.matchState.get('match-1')).toMatchObject({ synced: true, status: 'PAUSED' });
    expect(await applyLiveMatchHydration(stateToken, snapshot([], 'LIVE'), clock)).toBe(false);
    expect(await db.matchState.get('match-1')).toMatchObject({ status: 'PAUSED' });
  });

  it('imports clean refreshes with stable logical IDs, but never reopens an ended clean period', async () => {
    await db.matchPeriods.add(period());
    const token = (await captureLiveMatchHydration('match-1'))!;
    const build = vi.fn<HydrationClockBuilder>(clock);
    expect(await applyLiveMatchHydration(token, snapshot([], 'LIVE'), build)).toBe(true);
    expect(await db.matchPeriods.count()).toBe(1);
    expect(await db.matchState.get('match-1')).toMatchObject({ currentPeriodId: 'local-period', timerMs: 12000 });
    expect(build.mock.calls[0]?.[1]?.[0]).toMatchObject({ id: 'local-period' });
    await db.matchPeriods.update('local-period', { endedAt: nowMs + 2000, durationSeconds: 2, synced: true });
    await db.matchState.update('match-1', { status: 'PAUSED', currentPeriodId: undefined, synced: true });
    const endedToken = (await captureLiveMatchHydration('match-1'))!;
    expect(await applyLiveMatchHydration(endedToken, snapshot([], 'PAUSED'), clock)).toBe(true);
    expect(await db.matchPeriods.get('local-period')).toMatchObject({ endedAt: nowMs + 2000, durationSeconds: 2 });
    expect(await applyLiveMatchHydration(endedToken, snapshot([], 'LIVE'), clock)).toBe(false);
  });

  it('rejects account changes and current pending writes without any import', async () => {
    const token = (await captureLiveMatchHydration('match-1'))!;
    const server = snapshot();
    session.owner = 'other-user';
    expect(await applyLiveMatchHydration(token, server, clock)).toBe(false);
    session.owner = 'user-123';
    await eventsDataLayer.create(event);
    expect(await applyLiveMatchHydration(token, server, clock)).toBe(false);
    expect(await db.matchPeriods.count()).toBe(0);
  });
});

describe('authoritative event membership and saved score', () => {
  const cleanEvent = (id: string, extra = {}) => ({ ...event, id, createdAt: now,
    createdByUserId: session.owner, synced: true, isDeleted: false, ...extra } as any);
  const savedData = async () => ({ matches: await db.matches.toArray(), states: await db.matchState.toArray(),
    periods: await db.matchPeriods.toArray(), events: await db.events.toArray() });

  it.each([0, 2])('removes a server-deleted goal and atomically replaces the baseline with %s–1', async homeScore => {
    await db.events.bulkPut([cleanEvent('deleted-goal'), cleanEvent('retained', { kind: 'save' }),
      cleanEvent('other-match', { matchId: 'other', createdByUserId: 'other-user' })]);
    const token = (await captureLiveMatchHydration('match-1'))!;
    const response = snapshot([cleanEvent('retained', { kind: 'save', sentiment: 3 })]);
    response.match.homeScore = homeScore; response.match.awayScore = 1;
    expect(await applyLiveMatchHydration(token, response, clock)).toBe(true);
    expect(await db.events.get('deleted-goal')).toBeUndefined();
    expect(await db.events.get('retained')).toMatchObject({ kind: 'save', sentiment: 3, synced: true });
    expect(await db.events.get('other-match')).toMatchObject({ matchId: 'other', createdByUserId: 'other-user' });
    const importedMatch = await db.matches.get('match-1');
    expect(importedMatch).toMatchObject({ homeScore, awayScore: 1, synced: true,
      scoreRevision: expect.any(String) });
    expect(importedMatch?.recordingRevision ?? 0).toBe(token.recordingRevision);
    // A partial timeline containing no goals must still preserve the full saved 2–1 baseline.
    const settled = await savedData();
    expect(await applyLiveMatchHydration((await captureLiveMatchHydration('match-1'))!, response, clock)).toBe(true);
    const replayed = await savedData();
    expect(replayed.matches).toEqual(settled.matches);
    // Table hooks issue a new syncRevision on each write, including clean imports.
    // Replaying must preserve every data field and clean status, not that write token.
    const withoutWriteRevision = (rows: Array<{ syncRevision?: string }>) =>
      rows.map(({ syncRevision, ...data }) => data);
    for (const table of ['states', 'periods', 'events'] as const) {
      expect(withoutWriteRevision(replayed[table])).toEqual(withoutWriteRevision(settled[table]));
    }
  });

  it('clears only this match’s clean events for a complete empty snapshot and does not subtract twice', async () => {
    await db.matches.update('match-1', { homeScore: 2, awayScore: 1 }); // Already refreshed by the parent cache.
    await db.events.bulkPut([cleanEvent('old-goal'), cleanEvent('other-match', { matchId: 'other' })]);
    const response = snapshot(); response.match.homeScore = 2; response.match.awayScore = 1;
    expect(await applyLiveMatchHydration((await captureLiveMatchHydration('match-1'))!, response, clock)).toBe(true);
    expect((await db.events.toArray()).map(row => row.id)).toEqual(['other-match']);
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 2, awayScore: 1 });
  });

  it('retains acknowledged tombstones even when an older snapshot contains the same event', async () => {
    await db.events.put(cleanEvent('tombstone', { isDeleted: true }));
    expect(await applyLiveMatchHydration((await captureLiveMatchHydration('match-1'))!,
      snapshot([cleanEvent('tombstone')]), clock)).toBe(true);
    expect(await db.events.get('tombstone')).toMatchObject({ isDeleted: true });
  });

  it.each(['parent', 'state', 'period', 'create', 'edit', 'delete'])('blocks reconciliation when %s is pending at capture, even after ACK', async kind => {
    await db.events.put(cleanEvent('old-goal'));
    if (kind === 'parent') await db.matches.update('match-1', { synced: false });
    else if (kind === 'state') await db.matchState.put({ ...snapshot().state, synced: false } as any);
    else if (kind === 'period') await db.matchPeriods.put({ ...period(), synced: false });
    else await db.events.put(cleanEvent('dirty', { synced: false, isDeleted: kind === 'delete', kind: kind === 'edit' ? 'save' : 'goal' }));
    const token = (await captureLiveMatchHydration('match-1'))!;
    expect(token.pendingAtStart).toBe(true);
    await db.matches.update('match-1', { synced: true });
    await db.matchState.toCollection().modify({ synced: true });
    await db.matchPeriods.toCollection().modify({ synced: true });
    await db.events.toCollection().modify({ synced: true });
    const before = await savedData();
    expect(await applyLiveMatchHydration(token, snapshot(), clock)).toBe(false);
    expect(await savedData()).toEqual(before);
  });

  it.each(['score-revision', 'owner-conflict', 'account-return', 'new-pending'])('rejects %s during the request without deleting or updating the baseline', async change => {
    await db.events.put(cleanEvent('old-goal'));
    const token = (await captureLiveMatchHydration('match-1'))!;
    if (change === 'score-revision') await db.matches.update('match-1', { scoreRevision: 'newer', homeScore: 6 });
    if (change === 'owner-conflict') await db.matches.update('match-1', { created_by_user_id: 'other-user' } as any);
    if (change === 'account-return') {
      session.owner = 'other-user'; session.generation++; session.owner = 'user-123'; session.generation++;
    }
    if (change === 'new-pending') await db.events.put(cleanEvent('new', { synced: false }));
    const before = await savedData();
    expect(await applyLiveMatchHydration(token, snapshot(), clock)).toBe(false);
    expect(await savedData()).toEqual(before);
  });

  it.each(['missing-parent', 'wrong-parent', 'foreign-parent', 'parent-owner-conflict', 'deleted-parent',
    'wrong-teams', 'missing-score', 'negative-score', 'invalid-score', 'partial-events', 'partial-periods',
    'foreign-event', 'wrong-event-match', 'null-event', 'duplicate-event', 'missing-event-id', 'foreign-period',
    'foreign-event-id', 'foreign-period-id'])('rejects invalid/incomplete %s responses before writes', async change => {
    await db.events.put(cleanEvent('old-goal'));
    const token = (await captureLiveMatchHydration('match-1'))!;
    const response = snapshot([cleanEvent('remote')]) as any;
    if (change === 'missing-parent') response.match = null;
    if (change === 'wrong-parent') response.match.id = 'other';
    if (change === 'foreign-parent') response.match.createdByUserId = 'other-user';
    if (change === 'parent-owner-conflict') response.match.created_by_user_id = 'other-user';
    if (change === 'deleted-parent') response.match.isDeleted = true;
    if (change === 'wrong-teams') response.match.homeTeamId = 'other-team';
    if (change === 'missing-score') delete response.match.homeScore;
    if (change === 'negative-score') response.match.homeScore = -1;
    if (change === 'invalid-score') response.match.awayScore = NaN;
    if (change === 'partial-events') response.events = { events: [], pagination: { hasNext: true } };
    if (change === 'partial-periods') response.periods = undefined;
    if (change === 'foreign-event') response.events[0].createdByUserId = 'other-user';
    if (change === 'wrong-event-match') response.events[0].matchId = 'other';
    if (change === 'null-event') response.events = [null];
    if (change === 'duplicate-event') response.events.push(response.events[0]);
    if (change === 'missing-event-id') delete response.events[0].id;
    if (change === 'foreign-period') response.periods[0].createdByUserId = 'other-user';
    if (change === 'foreign-event-id') await db.events.put(cleanEvent('remote', { matchId: 'other' }));
    if (change === 'foreign-period-id') await db.matchPeriods.put({ ...period(), id: 'server-period', matchId: 'other' });
    const before = await savedData();
    expect(await applyLiveMatchHydration(token, response, clock)).toBe(false);
    expect(await savedData()).toEqual(before);
  });

  it.each(['deletion', 'upsert', 'score', 'state', 'final-context'])('rolls back all changes after %s has executed', async stage => {
    await db.events.put(cleanEvent('old-goal'));
    const token = (await captureLiveMatchHydration('match-1'))!;
    const before = await savedData();
    const response = snapshot([cleanEvent('new')]); response.match.homeScore = 0;
    let current = true;
    const failAfter = (target: any, method: string) => {
      const original = target[method].bind(target);
      vi.spyOn(target, method).mockImplementation(async (...args: any[]) => {
        const result = await original(...args);
        if (stage === 'final-context') { current = false; return result; }
        throw new Error('Injected storage failure');
      });
    };
    if (stage === 'deletion') failAfter(db.events, 'bulkDelete');
    if (stage === 'upsert') failAfter(db.events, 'bulkPut');
    if (stage === 'score') failAfter(db.matches, 'update');
    if (stage === 'state' || stage === 'final-context') failAfter(db.matchState, 'put');
    await expect(applyLiveMatchHydration(token, response, clock, () => current)).rejects.toThrow(
      stage === 'final-context' ? 'context changed' : 'Injected storage failure');
    expect(await savedData()).toEqual(before);
  });
});

describe('proven legacy ownership and shared recording revision', () => {
  it('repairs equal-timestamp clean legacy hydration beneath a snake-case proven current parent', async () => {
    await db.matches.update('match-1', { createdByUserId: undefined, created_by_user_id: session.owner } as any);
    await db.matchState.add({ matchId: 'match-1', status: 'PAUSED', timerMs: 0, lastUpdatedAt: nowMs,
      createdAt: now, updatedAt: now, createdByUserId: 'server', synced: true, isDeleted: false });
    await db.matchPeriods.add({ ...period(), createdByUserId: 'local-user' });
    const token = (await captureLiveMatchHydration('match-1'))!;
    expect(token.pendingAtStart).toBe(false);
    expect(await applyLiveMatchHydration(token, snapshot(), clock)).toBe(true);
    expect(await db.matchState.get('match-1')).toMatchObject({ createdByUserId: session.owner, updatedAt: now });
    expect(await db.matchPeriods.get('local-period')).toMatchObject({ createdByUserId: session.owner });
  });

  it('increments the persisted parent revision through legacy database wrapper transactions', async () => {
    const added = await db.addEnhancedEvent({ ...event, periodNumber: 1, clockMs: 0, playerId: 'player-1', sentiment: 0,
      createdByUserId: session.owner });
    expect(added.success).toBe(true);
    expect((await db.matches.get('match-1'))?.recordingRevision).toBe(1);
    expect((await db.deleteEnhancedEvent(added.data!)).success).toBe(true);
    const created = await db.createMatchPeriod({ matchId: 'match-1', periodNumber: 1, startedAt: nowMs });
    expect(created.success).toBe(true);
    expect((await db.endMatchPeriod('match-1', created.data!, nowMs + 3000)).success).toBe(true);
    expect((await db.updateMatchState('match-1', { status: 'PAUSED' })).success).toBe(true);
    expect((await db.matches.get('match-1'))?.recordingRevision).toBe(5);
    // Invalid parent revision aborts the event and its revision together.
    await db.matches.update('match-1', { recordingRevision: Number.MAX_SAFE_INTEGER });
    const failed = await db.addEnhancedEvent({ ...event, periodNumber: 1, clockMs: 0, playerId: 'player-1', sentiment: 0 });
    expect(failed.success).toBe(false);
    expect(await db.events.count()).toBe(0);
    expect((await db.matches.get('match-1'))?.recordingRevision).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('repairs old equal-timestamp attribution for state, period and event mutations under the current-owned parent', async () => {
    await db.matchState.add({ matchId: 'match-1', status: 'LIVE', timerMs: 0, lastUpdatedAt: nowMs,
      createdAt: now, updatedAt: now, createdByUserId: 'server', synced: true, isDeleted: false });
    await db.matchPeriods.add({ ...period(), createdByUserId: 'server' });
    await db.events.add({ ...event, id: 'old-event', createdByUserId: 'authenticated-user', synced: true, isDeleted: false } as any);
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', totalElapsedSeconds: 3 });
    await matchPeriodsDataLayer.endPeriod('local-period', nowMs + 5000, 3);
    await eventsDataLayer.update('old-event', { sentiment: 2 });
    await eventsDataLayer.delete('old-event');
    expect(await db.matchState.get('match-1')).toMatchObject({ createdByUserId: session.owner });
    expect(await db.matchPeriods.get('local-period')).toMatchObject({ createdByUserId: session.owner });
    expect(await db.events.get('old-event')).toMatchObject({ createdByUserId: session.owner, sentiment: 2, isDeleted: true });
    expect((await db.matches.get('match-1'))?.recordingRevision).toBe(4);
  });

  it.each(['other-user', 'guest-other', 'authenticated-user', 'conflict', 'deleted', 'missing'] as const)('never adopts child aliases under a %s parent', async parent => {
    await db.matches.update('match-1', parent === 'conflict' ? { created_by_user_id: 'other-user' } as any
      : parent === 'deleted' ? { isDeleted: true } : { createdByUserId: parent === 'missing' ? undefined : parent });
    await db.matchState.add({ matchId: 'match-1', status: 'LIVE', timerMs: 0, lastUpdatedAt: nowMs,
      createdAt: now, createdByUserId: 'server', synced: false, isDeleted: false });
    await db.matchPeriods.add({ ...period(), createdByUserId: 'local-user', synced: false });
    await db.events.add({ ...event, id: 'old-event', createdByUserId: 'authenticated-user', synced: false, isDeleted: false } as any);
    await expect(matchStateDataLayer.upsert('match-1', { status: 'PAUSED' })).rejects.toThrow('another user');
    await expect(matchPeriodsDataLayer.endPeriod('local-period', nowMs + 1000)).rejects.toThrow('another user');
    await expect(eventsDataLayer.update('old-event', { sentiment: 2 })).rejects.toThrow('another user');
    await expect(eventsDataLayer.delete('old-event')).rejects.toThrow('another user');
    await reclaimLegacyRecordings(session.owner);
    await syncService.flushOnce();
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(apiClient.delete).not.toHaveBeenCalled();
    expect(await captureLiveMatchHydration('match-1')).toBeNull();
    expect(await db.events.get('old-event')).toMatchObject({ createdByUserId: 'authenticated-user' });
  });

  it('normalizes aliases for sync selection only under proven parents and increments revision for every canonical local operation', async () => {
    await db.events.add({ ...event, id: 'old-event', createdByUserId: 'local-user', synced: false, isDeleted: false } as any);
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenCalledWith('/events', expect.anything());
    expect(await db.events.get('old-event')).toMatchObject({ createdByUserId: session.owner, synced: true });
    const before = (await db.matches.get('match-1'))?.recordingRevision ?? 0;
    const created = await eventsDataLayer.create(event);
    await eventsDataLayer.update(created.id, { sentiment: 1 });
    await eventsDataLayer.delete(created.id);
    const madePeriod = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await matchPeriodsDataLayer.endPeriod(madePeriod.id, madePeriod.startedAt + 1000, 1);
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED' });
    expect((await db.matches.get('match-1'))?.recordingRevision).toBe(before + 6);
  });
});
