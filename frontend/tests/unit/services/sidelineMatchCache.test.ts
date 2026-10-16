import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

const session = vi.hoisted(() => ({ userId: 'user-123' }));
vi.mock('../../../src/utils/guest', () => ({ isGuest: () => false, getGuestId: () => 'guest-test' }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => session.userId, getCurrentUserId: () => session.userId }));
vi.mock('../../../src/db/eventLinking', () => ({ autoLinkEvents: async () => {} }));
vi.mock('../../../src/services/importService', () => ({ isGuestId: (id?: string) => id?.startsWith('guest-'), hasGuestData: async () => false }));
vi.mock('../../../src/services/api/baseApi', () => {
  const client = { isAuthenticated: vi.fn(() => true), get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { apiClient: client, default: client };
});
import { db } from '../../../src/db/indexedDB';
import { apiClient } from '../../../src/services/api/baseApi';
import { eventsDataLayer, matchesDataLayer } from '../../../src/services/dataLayer';
import { cacheRecentMatches } from '../../../src/services/cacheService';
import { syncService, __syncQuarantineTestUtils } from '../../../src/services/syncService';

const now = '2026-10-14T12:00:00.000Z';
const serverMatch = () => ({ id: 'match-1', seasonId: 'season-1', homeTeamId: 'home', awayTeamId: 'away',
  kickoffTime: now, homeScore: 5, awayScore: 2, venue: 'Server venue', createdByUserId: session.userId,
  durationMinutes: 60, periodFormat: 'quarter' as const, createdAt: now, updatedAt: now, isDeleted: false });
const goal = { matchId: 'match-1', teamId: 'home', kind: 'goal' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function deferredPage() {
  const entered = deferred<void>(), response = deferred<any>();
  vi.mocked(apiClient.get).mockImplementationOnce(async () => { entered.resolve(); return response.promise; });
  return { entered: entered.promise, response };
}
const page = (matches: any[], hasMore = false) => ({ success: true, data: { data: matches, hasMore } });

beforeEach(async () => {
  session.userId = 'user-123';
  vi.resetAllMocks();
  vi.mocked(apiClient.isAuthenticated).mockReturnValue(true);
  vi.mocked(apiClient.put).mockResolvedValue({ success: true, data: {} });
  vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: {} });
  vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: {} });
  __syncQuarantineTestUtils.resetGlobalBackoff();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
  await db.open();
  await Promise.all(db.tables.map(table => table.clear()));
  await db.matches.add({ ...serverMatch(), matchId: 'match-1', venue: 'Local venue', synced: true });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('atomic match cache score preservation', () => {
  it('does not hide a settled goal with a server deletion captured while it was pending', async () => {
    const created = await eventsDataLayer.create(goal);
    const delayed = deferredPage();
    const refresh = cacheRecentMatches();
    await delayed.entered;
    await syncService.flushOnce();
    expect(await db.events.get(created.id)).toMatchObject({ synced: true });
    delayed.response.resolve(page([{ ...serverMatch(), isDeleted: true }]));
    expect(await refresh).toBe(0);
    expect(await db.matches.get('match-1')).toMatchObject({ isDeleted: false, homeScore: 6 });
  });

  it.each(['goal', 'undo', 'kind', 'team'] as const)('retains a %s pending before request start even if sync settles before the cache write', async mutation => {
    const created = await eventsDataLayer.create(goal);
    if (mutation === 'undo') await eventsDataLayer.delete(created.id);
    if (mutation === 'kind') await eventsDataLayer.update(created.id, { kind: 'foul' });
    if (mutation === 'team') await eventsDataLayer.update(created.id, { teamId: 'away' });
    const projected = (await db.matches.get('match-1'))!;
    const delayed = deferredPage();
    const refresh = cacheRecentMatches();
    await delayed.entered;
    await syncService.flushOnce();
    if (mutation === 'undo') expect(await db.events.get(created.id)).toBeUndefined();
    else expect(await db.events.get(created.id)).toMatchObject({ synced: true });
    expect((await db.matches.get('match-1'))?.scoreRevision).toBe(projected.scoreRevision);
    delayed.response.resolve(page([{ ...serverMatch(), homeScore: 20, awayScore: 10 }]));
    await refresh;
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: projected.homeScore, awayScore: projected.awayScore,
      recordingRevision: (projected.recordingRevision ?? 0) + 1 });
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([{ ...serverMatch(), homeScore: 8, awayScore: 4 }]));
    await cacheRecentMatches();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 8, awayScore: 4 });
  });

  it.each(['goal', 'undo', 'kind', 'team'] as const)('keeps a same-millisecond %s mutation during a deferred refresh and refreshes safe fields', async mutation => {
    const delayed = deferredPage();
    const refresh = cacheRecentMatches();
    await delayed.entered;
    const created = await eventsDataLayer.create(goal);
    if (mutation === 'undo') await eventsDataLayer.delete(created.id);
    if (mutation === 'kind') await eventsDataLayer.update(created.id, { kind: 'foul' });
    if (mutation === 'team') await eventsDataLayer.update(created.id, { teamId: 'away', kind: 'own_goal' });
    const latest = await db.matches.get('match-1');
    expect((await db.events.get(created.id))?.updatedAt).toBe(now);
    delayed.response.resolve(page([{ ...serverMatch(), homeScore: 19, awayScore: 17, homeTeamId: 'different-home' }]));
    expect(await refresh).toBe(1);
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: latest!.homeScore, awayScore: latest!.awayScore,
      homeTeamId: 'home', awayTeamId: 'away', venue: 'Server venue', synced: true, scoreRevision: latest!.scoreRevision });
  });

  it('retains the revision made during a request even if its event is acknowledged before the stale response arrives', async () => {
    const delayed = deferredPage();
    const refresh = cacheRecentMatches();
    await delayed.entered;
    const created = await eventsDataLayer.create(goal);
    await db.events.update(created.id, { synced: true });
    delayed.response.resolve(page([serverMatch()]));
    await refresh;
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 6, awayScore: 2, venue: 'Server venue' });
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([{ ...serverMatch(), homeScore: 8 }]));
    await cacheRecentMatches();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 8 });
  });

  it('preserves partial-history projection for an already pending goal and for its non-scoring replacement', async () => {
    await db.events.add({ ...goal, id: 'cached-goal', createdByUserId: session.userId, synced: true, isDeleted: false } as any);
    const created = await eventsDataLayer.create(goal);
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([serverMatch()]));
    await cacheRecentMatches();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 6, awayScore: 2 });
    await eventsDataLayer.update(created.id, { kind: 'foul' });
    expect(await db.events.get(created.id)).toMatchObject({ kind: 'foul', synced: false, scoreProjectionPending: true });
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([{ ...serverMatch(), homeScore: 9 }]));
    await cacheRecentMatches();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 5, awayScore: 2 });
    await eventsDataLayer.delete('cached-goal');
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([serverMatch()]));
    await cacheRecentMatches();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 4, awayScore: 2 });
  });

  it.each(['none', 'foul', 'sentiment'] as const)('accepts remote scores when only %s is pending', async pending => {
    if (pending === 'foul') await eventsDataLayer.create({ ...goal, kind: 'foul' });
    if (pending === 'sentiment') {
      await db.events.add({ ...goal, id: 'server-goal', createdByUserId: session.userId, synced: true, isDeleted: false } as any);
      await eventsDataLayer.update('server-goal', { sentiment: 2 });
    }
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([{ ...serverMatch(), homeScore: 8, awayScore: 3 }]));
    await cacheRecentMatches();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 8, awayScore: 3, venue: 'Server venue' });
  });

  it('uses fresh checks for background pages rather than carrying first-page eligibility', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([], true));
    const entered = deferred<void>(), response = deferred<any>();
    vi.mocked(apiClient.get).mockImplementationOnce(async () => { entered.resolve(); return response.promise; });
    const backgroundDone = new Promise<void>(resolve => window.addEventListener('cache:matches:updated', () => resolve(), { once: true }));
    expect(await cacheRecentMatches()).toBe(0);
    await entered.promise;
    const created = await eventsDataLayer.create(goal);
    await eventsDataLayer.update(created.id, { teamId: 'away' });
    response.resolve(page([serverMatch()]));
    await backgroundDone;
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 5, awayScore: 3, venue: 'Server venue' });
    expect(apiClient.get).toHaveBeenCalledWith('/matches?page=2&limit=100');
  });

  it.each(['delete', 'edit'] as const)('preserves a match %s made while the refresh is awaiting', async change => {
    const delayed = deferredPage();
    const refresh = cacheRecentMatches();
    await delayed.entered;
    if (change === 'delete') await matchesDataLayer.delete('match-1');
    else await matchesDataLayer.update('match-1', { venue: 'Edited venue' });
    delayed.response.resolve(page([serverMatch()]));
    expect(await refresh).toBe(0);
    expect(await db.matches.get('match-1')).toMatchObject(change === 'delete'
      ? { isDeleted: true, synced: false } : { venue: 'Edited venue', synced: false });
  });

  it('rejects foreign server/local owners, missing server attribution and an account switch during fetch', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([{ ...serverMatch(), createdByUserId: 'other-user', homeScore: 50 },
      { ...serverMatch(), id: 'missing-owner', createdByUserId: undefined },
      { ...serverMatch(), id: 'conflicted-owner', created_by_user_id: 'other-user' }]));
    expect(await cacheRecentMatches()).toBe(0);
    expect(await db.matches.get('missing-owner')).toBeUndefined();
    expect(await db.matches.get('conflicted-owner')).toBeUndefined();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 5 });
    await db.matches.update('match-1', { createdByUserId: 'other-user' });
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([serverMatch()]));
    expect(await cacheRecentMatches()).toBe(0);
    const delayed = deferredPage();
    const original = serverMatch();
    const refresh = cacheRecentMatches();
    await delayed.entered;
    session.userId = 'new-account';
    delayed.response.resolve(page([{ ...original, id: 'old-account-match' }]));
    expect(await refresh).toBe(0);
    expect(await db.matches.get('old-account-match')).toBeUndefined();
  });

  it('conservatively retains scores for legacy pending events without a projection marker', async () => {
    await db.events.add({ ...goal, id: 'legacy-edit', kind: 'foul', createdByUserId: session.userId,
      synced: false, isDeleted: false } as any);
    vi.mocked(apiClient.get).mockResolvedValueOnce(page([{ ...serverMatch(), homeScore: 8 }]));
    await cacheRecentMatches();
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 5, venue: 'Server venue' });
  });
});
