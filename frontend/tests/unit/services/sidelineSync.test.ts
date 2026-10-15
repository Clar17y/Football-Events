import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

const session = vi.hoisted(() => ({ userId: 'user-123' }));
vi.mock('../../../src/utils/guest', () => ({ isGuest: () => false, getGuestId: () => 'guest-test' }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => session.userId, getCurrentUserId: () => session.userId }));
vi.mock('../../../src/db/eventLinking', () => ({ autoLinkEvents: async () => {} }));
vi.mock('../../../src/services/importService', () => ({ isGuestId: (id?: string) => id?.startsWith('guest-'), hasGuestData: async () => false }));
vi.mock('../../../src/services/api/baseApi', () => {
  const client = { isAuthenticated: vi.fn(() => true), get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { apiClient: client, default: client, ApiRequestError: class extends Error { status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  } };
});
import { db } from '../../../src/db/indexedDB';
import { apiClient, ApiRequestError } from '../../../src/services/api/baseApi';
import { eventsDataLayer, matchesDataLayer, matchPeriodsDataLayer, matchStateDataLayer } from '../../../src/services/dataLayer';
import { matchWriteToDb, dbMatchToServerPayload } from '../../../src/db/transforms/matches';
import { syncService, __syncQuarantineTestUtils } from '../../../src/services/syncService';

const event = { matchId: 'match-1', teamId: 'home', kind: 'goal' };
function deferred() {
  let resolve!: (value?: any) => void;
  let reject!: (reason: any) => void;
  const promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function delayNext(method: 'put' | 'post') {
  const entered = deferred(), response = deferred();
  vi.mocked(apiClient[method]).mockImplementationOnce(() => { entered.resolve(); return response.promise; });
  return { entered: entered.promise, response };
}
async function clearFailure(table: string, id: string) { await db.syncFailures.delete([table, id]); }

beforeEach(async () => {
  vi.resetAllMocks();
  session.userId = 'user-123';
  await db.open();
  await Promise.all(db.tables.map(t => t.clear()));
  vi.mocked(apiClient.isAuthenticated).mockReturnValue(true);
  vi.mocked(apiClient.post).mockResolvedValue({ data: {} } as any);
  vi.mocked(apiClient.put).mockResolvedValue({ data: {} } as any);
  vi.mocked(apiClient.delete).mockResolvedValue({} as any);
  __syncQuarantineTestUtils.resetGlobalBackoff();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  await db.matches.add({ id: 'match-1', matchId: 'match-1', homeTeamId: 'home', awayTeamId: 'away', durationMinutes: 60,
    periodFormat: 'quarter', homeScore: 0, awayScore: 0, synced: true, createdByUserId: session.userId } as any);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('match format sync compatibility', () => {
  it.each(['whole', 'third'] as const)('preserves %s through local creation, transforms and normal match sync', async periodFormat => {
    const input = { seasonId: crypto.randomUUID(), homeTeamId: crypto.randomUUID(), awayTeamId: crypto.randomUUID(),
      kickoffTime: new Date().toISOString(), periodFormat };
    await db.seasons.add({ id: input.seasonId, seasonId: input.seasonId, label: 'Confirmed format test season',
      createdByUserId: session.userId, synced: true, isDeleted: false } as any);
    expect(matchWriteToDb(input).periodFormat).toBe(periodFormat);
    const match = await matchesDataLayer.create(input);
    expect(dbMatchToServerPayload(match).periodFormat).toBe(periodFormat);
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenCalledWith('/matches', expect.objectContaining({ id: match.id, periodFormat }));
    expect(await db.matches.get(match.id)).toMatchObject({ synced: true, periodFormat });
  });

  it('continues to delete synced season tombstones while repairing sideline lifecycle sync', async () => {
    const seasonId = crypto.randomUUID();
    await db.seasons.add({ id: seasonId, seasonId, label: 'Old season', createdByUserId: session.userId,
      isDeleted: true, synced: false, syncedAt: new Date().toISOString() } as any);
    await syncService.flushOnce();
    expect(apiClient.delete).toHaveBeenCalledWith(`/seasons/${seasonId}`);
    expect(await db.seasons.get(seasonId)).toBeUndefined();
  });
});

describe('snapshot acknowledgement and deletion', () => {
  it.each(['sentiment', 'kind', 'delete'])('retains a %s mutation made during a deferred PUT, even at the same timestamp', async change => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    const created = await eventsDataLayer.create(event);
    const before = await db.events.get(created.id);
    const delayed = delayNext('put');
    const flush = syncService.flushOnce();
    await delayed.entered;
    if (change === 'delete') await eventsDataLayer.delete(created.id);
    else await eventsDataLayer.update(created.id, change === 'kind' ? { kind: 'own_goal' } : { sentiment: 3 });
    expect((await db.events.get(created.id))?.updatedAt).toBe(before?.updatedAt);
    delayed.response.resolve({ data: { id: created.id } });
    await flush;
    expect(await db.events.get(created.id)).toMatchObject({ synced: false });
    expect((await db.events.get(created.id))?.syncedAt).toBeDefined();
    await syncService.flushOnce();
    if (change === 'delete') {
      expect(apiClient.delete).toHaveBeenCalledWith(`/events/${created.id}`);
      expect(await db.events.get(created.id)).toBeUndefined();
    } else {
      expect(vi.mocked(apiClient.put).mock.calls.slice(-1)[0]?.[1]).toMatchObject(change === 'kind' ? { kind: 'own_goal' } : { sentiment: 3 });
      expect((await db.events.get(created.id))?.synced).toBe(true);
    }
  });

  it('does not quarantine Undo when an older in-flight PUT fails permanently', async () => {
    const created = await eventsDataLayer.create(event);
    const delayed = delayNext('put');
    const flush = syncService.flushOnce();
    await delayed.entered;
    await eventsDataLayer.delete(created.id);
    delayed.response.reject(new ApiRequestError('invalid old payload', 400));
    await flush;
    expect(await db.syncFailures.get(['events', created.id])).toBeUndefined();
    await syncService.flushOnce();
    expect(apiClient.delete).toHaveBeenCalledWith(`/events/${created.id}`);
    expect(await db.events.get(created.id)).toBeUndefined();
  });

  it('handles Undo before the first upload with an idempotent DELETE/404', async () => {
    const created = await eventsDataLayer.create(event);
    await eventsDataLayer.delete(created.id);
    vi.mocked(apiClient.delete).mockRejectedValueOnce(new ApiRequestError('not found', 404));
    await syncService.flushOnce();
    expect(apiClient.put).not.toHaveBeenCalled();
    expect(apiClient.delete).toHaveBeenCalledWith(`/events/${created.id}`);
    expect(await db.events.get(created.id)).toBeUndefined();
  });

  it('deletes after the create was accepted but its PUT response was lost', async () => {
    const created = await eventsDataLayer.create(event);
    vi.mocked(apiClient.put).mockRejectedValueOnce(new Error('response lost'));
    await syncService.flushOnce();
    expect(await db.events.get(created.id)).toMatchObject({ synced: false, syncAttempted: true });
    await eventsDataLayer.delete(created.id);
    await syncService.flushOnce();
    expect(apiClient.delete).toHaveBeenCalledWith(`/events/${created.id}`);
    expect(await db.events.get(created.id)).toBeUndefined();
  });

  it.each([403, 0])('retains a tombstone after DELETE failure %s, and completes a retry returning 404', async status => {
    const created = await eventsDataLayer.create(event);
    await eventsDataLayer.delete(created.id);
    vi.mocked(apiClient.delete).mockRejectedValueOnce(status ? new ApiRequestError('denied', status) : new Error('response lost'));
    await syncService.flushOnce();
    expect(await db.events.get(created.id)).toMatchObject({ isDeleted: true, synced: false });
    await clearFailure('events', created.id);
    vi.mocked(apiClient.delete).mockRejectedValueOnce(new ApiRequestError('already deleted', 404));
    await syncService.flushOnce();
    expect(await db.events.get(created.id)).toBeUndefined();
  });

  it('retains legacy deletion after a failed lookup, and deletes only an unambiguous identity', async () => {
    const remoteId = crypto.randomUUID();
    await db.events.add({ ...event, id: 'old-id', isDeleted: true, synced: false, syncedAt: 'prior-sync', createdByUserId: session.userId } as any);
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('lookup failed'));
    await syncService.flushOnce();
    expect(await db.events.get('old-id')).toBeDefined();
    expect(apiClient.delete).not.toHaveBeenCalled();
    await clearFailure('events', 'old-id');
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [{ ...event, id: remoteId }] } as any);
    await syncService.flushOnce();
    expect(apiClient.delete).toHaveBeenCalledWith(`/events/${remoteId}`);
    expect(await db.events.get('old-id')).toBeUndefined();
  });

  it('retains ambiguous legacy tombstones and caches a resolved identity before a lost DELETE response', async () => {
    const remoteId = crypto.randomUUID();
    await db.events.add({ ...event, id: 'old-id', isDeleted: true, synced: false, syncedAt: 'prior-sync', createdByUserId: session.userId } as any);
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [{ ...event, id: remoteId }, { ...event, id: crypto.randomUUID() }] } as any);
    await syncService.flushOnce();
    expect(await db.events.get('old-id')).toBeDefined();
    expect(apiClient.delete).not.toHaveBeenCalled();
    await clearFailure('events', 'old-id');
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: [{ ...event, id: remoteId }] } as any);
    vi.mocked(apiClient.delete).mockRejectedValueOnce(new Error('DELETE response lost'));
    await syncService.flushOnce();
    expect(await db.events.get('old-id')).toMatchObject({ remoteId, isDeleted: true });
    await clearFailure('events', 'old-id');
    vi.mocked(apiClient.delete).mockRejectedValueOnce(new ApiRequestError('not found', 404));
    await syncService.flushOnce();
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(await db.events.get('old-id')).toBeUndefined();
  });

  it('preserves a newer event update during DELETE and an account switch during PUT', async () => {
    const created = await eventsDataLayer.create(event);
    const delayed = delayNext('put');
    const flush = syncService.flushOnce();
    await delayed.entered;
    session.userId = 'another-user';
    delayed.response.resolve({ data: { id: created.id } });
    await flush;
    expect((await db.events.get(created.id))?.synced).toBe(false);
    session.userId = 'user-123';
    await eventsDataLayer.delete(created.id);
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.delete).mockImplementationOnce(() => { entered.resolve(); return response.promise; });
    const deleting = syncService.flushOnce();
    await entered.promise;
    await db.events.update(created.id, { isDeleted: false, sentiment: 2, synced: false });
    response.resolve({});
    await deleting;
    expect(await db.events.get(created.id)).toMatchObject({ isDeleted: false, sentiment: 2, synced: false });
  });
});

describe('eligible event batch', () => {
  it.each([true, false])('uploads behind 50 blocked/backoff rows (permanent=%s) and retains account isolation', async permanent => {
    for (let i = 0; i < 50; i++) {
      const id = `blocked-${i.toString().padStart(2, '0')}`;
      await db.events.add({ ...event, id, synced: false, createdByUserId: session.userId } as any);
      await db.syncFailures.put({ table: 'events', recordId: id, permanent, nextRetryAt: Date.now() + 60000, attemptCount: 1, lastAttemptAt: Date.now() } as any);
    }
    await db.events.bulkAdd(['guest-test', 'another-user'].map((owner, i) => ({ ...event, id: `foreign-${i}`, synced: false, createdByUserId: owner } as any)));
    const created = await eventsDataLayer.create(event);
    await syncService.flushOnce();
    expect(apiClient.put).toHaveBeenCalledTimes(1);
    expect(apiClient.put).toHaveBeenCalledWith(`/events/${created.id}`, expect.anything());
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('keeps the eligible upload batch bounded at 50', async () => {
    await db.events.bulkAdd(Array.from({ length: 51 }, () => ({ ...event, id: crypto.randomUUID(), synced: false, createdByUserId: session.userId } as any)));
    await syncService.flushOnce();
    expect(apiClient.put).toHaveBeenCalledTimes(50);
    expect(await db.events.filter(e => e.synced === false).count()).toBe(1);
  });
});

describe('eligible state batch and dependencies', () => {
  it.each(['CANCELLED', 'POSTPONED', 'UNKNOWN'])('never uploads a dirty %s state through four-state reconciliation', async status => {
    await db.matchState.add({ matchId: 'match-1', status, timerMs: 0, lastUpdatedAt: Date.now(),
      createdByUserId: session.userId, synced: false, isDeleted: false } as any);
    await syncService.flushOnce();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(await db.matchState.get('match-1')).toMatchObject({ status, synced: false });
    expect(await syncService.getPendingCounts()).toMatchObject({ matchState: 0, total: 0, eligible: 0, blocked: 1 });
  });

  it.each(['backoff', 'quarantined-period', 'deferred-period'] as const)('replays an eligible state behind 50 %s states', async blockedBy => {
    for (let i = 0; i < 50; i++) {
      const matchId = `blocked-${i.toString().padStart(2, '0')}`;
      await db.matches.add({ id: matchId, matchId, homeTeamId: 'home', awayTeamId: 'away', durationMinutes: 60,
        periodFormat: 'quarter', synced: true, createdByUserId: session.userId } as any);
      await db.matchState.add({ matchId, status: 'PAUSED', timerMs: 0, lastUpdatedAt: Date.now(),
        createdByUserId: session.userId, synced: false, isDeleted: false } as any);
      const table = blockedBy === 'backoff' ? 'matchState' : 'matchPeriods';
      const recordId = blockedBy === 'backoff' ? matchId : `period-${matchId}`;
      if (blockedBy !== 'backoff') await db.matchPeriods.add({ id: recordId, matchId, periodNumber: 1,
        periodType: 'REGULAR', startedAt: Date.now(), createdByUserId: session.userId, synced: false, isDeleted: false } as any);
      await db.syncFailures.put({ table, recordId, permanent: blockedBy === 'quarantined-period',
        nextRetryAt: Date.now() + 60000, attemptCount: 1, lastAttemptAt: Date.now() } as any);
    }
    await db.matchPeriods.add({ id: 'clean-period', matchId: 'match-1', periodNumber: 1, periodType: 'REGULAR',
      startedAt: Date.now(), createdByUserId: session.userId, synced: true, isDeleted: false } as any);
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', currentPeriodId: 'clean-period', totalElapsedSeconds: 9 });
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith('/matches/match-1/state/reconcile', expect.objectContaining({ totalElapsedSeconds: 9 }));
    expect(await db.matchState.get('match-1')).toMatchObject({ synced: true });
    expect(await db.matchState.get('blocked-00')).toMatchObject({ synced: false });
    const progress = await syncService.getPendingCounts();
    expect(progress.eligible).toBe(0);
    if (blockedBy === 'quarantined-period') expect(progress).toMatchObject({ blocked: 100, total: 0, matchState: 0, matchPeriods: 0 });
    else expect(progress).toMatchObject({ blocked: 0, total: blockedBy === 'backoff' ? 50 : 100 });
  });

  it('acknowledges a pre-revision persisted state without altering its submitted content', async () => {
    await db.matchPeriods.add({ id: 'clean-period', matchId: 'match-1', periodNumber: 1, periodType: 'REGULAR',
      startedAt: Date.now(), createdByUserId: session.userId, synced: true, isDeleted: false } as any);
    const oldState = { matchId: 'match-1', status: 'PAUSED', timerMs: 0, lastUpdatedAt: Date.now(), totalElapsedSeconds: 8,
      createdByUserId: session.userId, synced: false, isDeleted: false };
    await new Promise<void>((resolve, reject) => {
      const tx = db.backendDB().transaction(db.matchState.name, 'readwrite');
      tx.objectStore(db.matchState.name).put(oldState);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    expect(await db.matchState.get('match-1')).not.toHaveProperty('syncRevision');
    await syncService.flushOnce();
    expect(await db.matchState.get('match-1')).toMatchObject({ synced: true });
    expect((await db.matchState.get('match-1')) as any).not.toHaveProperty('id');
  });

  it('uses thirds for an old caller whose timer contains a planned offset', async () => {
    await db.matches.update('match-1', { durationMinutes: 60, periodFormat: 'third' });
    const first = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await matchPeriodsDataLayer.endPeriod(first.id, first.startedAt + 3600000, 30);
    const second = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 2 });
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', currentPeriodId: second.id, timerMs: 1205000 });
    await syncService.flushOnce();
    expect(vi.mocked(apiClient.post).mock.calls.slice(-1)[0]?.[1]).toMatchObject({ totalElapsedSeconds: 35 });
  });
});

describe('offline lifecycle replay', () => {
  it('imports the open kickoff once, preserves local identity, and uses reconciliation instead of period start', async () => {
    const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await matchStateDataLayer.upsert('match-1', { status: 'LIVE', currentPeriodId: period.id, timerMs: 5000, totalElapsedSeconds: 5 });
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/matches/match-1/periods/import', expect.objectContaining({ periodNumber: 1, periodType: 'REGULAR' }));
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/matches/match-1/state/reconcile', expect.objectContaining({ status: 'LIVE', totalElapsedSeconds: 5, currentPeriod: 1 }));
    expect((await db.matchState.get('match-1'))?.currentPeriodId).toBe(period.id);
    expect(await db.matchPeriods.count()).toBe(1);
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenCalledTimes(2);
  });

  it('retries a lost period response by the same logical key and defers state until periods succeed', async () => {
    const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', currentPeriodId: period.id, totalElapsedSeconds: 10 });
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('period response lost'));
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect((await db.matchState.get('match-1'))?.synced).toBe(false);
    await clearFailure('matchPeriods', period.id);
    await syncService.flushOnce();
    expect(vi.mocked(apiClient.post).mock.calls[1]).toEqual(vi.mocked(apiClient.post).mock.calls[0]);
    expect((await db.matchState.get('match-1'))?.synced).toBe(true);
  });

  it('does not acknowledge endPeriod during a deferred open import', async () => {
    const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await matchStateDataLayer.upsert('match-1', { status: 'LIVE', currentPeriodId: period.id, totalElapsedSeconds: 0 });
    const delayed = delayNext('post');
    const flush = syncService.flushOnce();
    await delayed.entered;
    await matchPeriodsDataLayer.endPeriod(period.id, period.startedAt + 3600000, 21);
    await matchStateDataLayer.upsert('match-1', { status: 'COMPLETED', currentPeriodId: undefined, totalElapsedSeconds: 21 });
    delayed.response.resolve({});
    await flush;
    expect((await db.matchPeriods.get(period.id))?.synced).toBe(false);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/matches/match-1/periods/import', expect.objectContaining({ durationSeconds: 21 }));
    expect(apiClient.post).toHaveBeenNthCalledWith(3, '/matches/match-1/state/reconcile', expect.objectContaining({ status: 'COMPLETED', totalElapsedSeconds: 21 }));
  });

  it.each(['PAUSED', 'COMPLETED'] as const)('retains %s made during deferred LIVE state reconciliation', async status => {
    const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await syncService.flushOnce();
    await matchStateDataLayer.upsert('match-1', { status: 'LIVE', currentPeriodId: period.id, totalElapsedSeconds: 1 });
    const delayed = delayNext('post');
    const flush = syncService.flushOnce();
    await delayed.entered;
    if (status === 'COMPLETED') await matchPeriodsDataLayer.endPeriod(period.id, period.startedAt + 10000, 8);
    await matchStateDataLayer.upsert('match-1', { status, totalElapsedSeconds: 8 });
    delayed.response.resolve({});
    await flush;
    expect((await db.matchState.get('match-1'))?.synced).toBe(false);
    await syncService.flushOnce();
    expect(vi.mocked(apiClient.post).mock.calls.slice(-1)[0]).toEqual(['/matches/match-1/state/reconcile', expect.objectContaining({ status, totalElapsedSeconds: 8 })]);
  });

  it('does not quarantine newer period/state snapshots when their old in-flight requests fail', async () => {
    const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    const delayedPeriod = delayNext('post');
    const periodFlush = syncService.flushOnce();
    await delayedPeriod.entered;
    await matchPeriodsDataLayer.endPeriod(period.id, period.startedAt + 10000, 5);
    delayedPeriod.response.reject(new ApiRequestError('old import failed', 400));
    await periodFlush;
    expect(await db.syncFailures.get(['matchPeriods', period.id])).toBeUndefined();
    await syncService.flushOnce();
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', totalElapsedSeconds: 5 });
    const delayedState = delayNext('post');
    const stateFlush = syncService.flushOnce();
    await delayedState.entered;
    await matchStateDataLayer.upsert('match-1', { status: 'COMPLETED', totalElapsedSeconds: 5 });
    delayedState.response.reject(new ApiRequestError('old state failed', 400));
    await stateFlush;
    expect(await db.syncFailures.get(['matchState', 'match-1'])).toBeUndefined();
    await syncService.flushOnce();
    expect((await db.matchState.get('match-1'))?.synced).toBe(true);
  });

  it.each(['period', 'state'])('preserves a %s tombstone written during its in-flight request', async entity => {
    const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    if (entity === 'state') {
      await syncService.flushOnce();
      await matchStateDataLayer.upsert('match-1', { status: 'LIVE', currentPeriodId: period.id, totalElapsedSeconds: 0 });
    }
    const delayed = delayNext('post');
    const flush = syncService.flushOnce();
    await delayed.entered;
    const table = entity === 'period' ? db.matchPeriods : db.matchState;
    const key = entity === 'period' ? period.id : 'match-1';
    await table.update(key, { isDeleted: true, synced: false });
    delayed.response.resolve({});
    await flush;
    expect(await table.get(key)).toMatchObject({ isDeleted: true, synced: false });
    const before = vi.mocked(apiClient.post).mock.calls.length;
    await syncService.flushOnce();
    expect(apiClient.post).toHaveBeenCalledTimes(before);
    expect(await table.get(key)).toMatchObject({ isDeleted: true, synced: false });
  });

  it('subtracts planned clock offsets for an older caller without an explicit elapsed override', async () => {
    const first = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await matchPeriodsDataLayer.endPeriod(first.id, first.startedAt + 3600000, 30);
    const second = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 2 });
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', currentPeriodId: second.id, timerMs: 905000 });
    await syncService.flushOnce();
    expect(vi.mocked(apiClient.post).mock.calls.slice(-1)[0]?.[1]).toMatchObject({ status: 'PAUSED', totalElapsedSeconds: 35 });
  });

  it('replays an entire completed match with next periods, extra time and shootout before its first network sync', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    let total = 0;
    for (const [periodNumber, periodType, duration] of [[1, 'REGULAR', 12], [2, 'REGULAR', 7], [1, 'EXTRA_TIME', 5], [1, 'PENALTY_SHOOTOUT', 0]] as const) {
      const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber, periodType });
      await matchPeriodsDataLayer.endPeriod(period.id, period.startedAt + 3600000, duration);
      total += duration;
    }
    await eventsDataLayer.create(event);
    await matchStateDataLayer.upsert('match-1', { status: 'COMPLETED', currentPeriodId: undefined, timerMs: 5400000, totalElapsedSeconds: total });
    await syncService.flushOnce();
    expect(apiClient.post).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    await syncService.flushOnce();
    const calls = vi.mocked(apiClient.post).mock.calls;
    expect(Object.fromEntries(calls.slice(0, 4).map(([, data]: any) => [`${data.periodType}-${data.periodNumber}`, data.durationSeconds])))
      .toEqual({ 'REGULAR-1': 12, 'REGULAR-2': 7, 'EXTRA_TIME-1': 5, 'PENALTY_SHOOTOUT-1': 0 });
    expect(calls[4]).toEqual(['/matches/match-1/state/reconcile', expect.objectContaining({ status: 'COMPLETED', totalElapsedSeconds: 24 })]);
    expect(await db.matchPeriods.count()).toBe(4);
    expect((await db.matchState.get('match-1'))?.synced).toBe(true);
    expect(apiClient.post).not.toHaveBeenCalledWith(expect.stringMatching(/\/start$/), expect.anything());
  });

  it('replays paused actual time independently of wall time and planned clock offsets, then resumes', async () => {
    const first = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1, startedAt: Date.now() - 7200000 });
    await matchPeriodsDataLayer.endPeriod(first.id, Date.now() - 3600000, 30);
    const second = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 2, startedAt: Date.now() - 3600000 });
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', currentPeriodId: second.id, timerMs: 905000, totalElapsedSeconds: 35 });
    await syncService.flushOnce();
    expect(vi.mocked(apiClient.post).mock.calls.slice(-1)[0]?.[1]).toMatchObject({ status: 'PAUSED', totalElapsedSeconds: 35 });
    await matchStateDataLayer.upsert('match-1', { status: 'LIVE', totalElapsedSeconds: 35 });
    await syncService.flushOnce();
    expect(vi.mocked(apiClient.post).mock.calls.slice(-1)[0]?.[1]).toMatchObject({ status: 'LIVE', totalElapsedSeconds: 35, currentPeriod: 2 });
  });

  it('retains state after reconciliation failure instead of swallowing it as an already-started match', async () => {
    const first = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 });
    await syncService.flushOnce();
    await matchStateDataLayer.upsert('match-1', { status: 'LIVE', currentPeriodId: first.id, totalElapsedSeconds: 0 });
    vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('network failure'));
    const result = await syncService.flushOnce();
    expect(result.failed).toBe(1);
    expect((await db.matchState.get('match-1'))?.synced).toBe(false);
  });
});
