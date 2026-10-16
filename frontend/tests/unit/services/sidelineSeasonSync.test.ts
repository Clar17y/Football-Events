import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ owner: 'owner-a', generation: 0 }));
const socket = vi.hoisted(() => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }));
vi.mock('socket.io-client', () => ({ io: () => socket }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => session.owner, getCurrentUserId: () => session.owner }));
vi.mock('../../../src/utils/guest', () => ({ isGuest: () => false, getGuestId: () => 'guest-test' }));
vi.mock('../../../src/db/eventLinking', () => ({ autoLinkEvents: async () => {} }));
vi.mock('../../../src/services/importService', () => ({ isGuestId: (id?: string) => id?.startsWith('guest-'), hasGuestData: async () => false }));
vi.mock('../../../src/services/api/baseApi', () => {
  const client = { isAuthenticated: () => true, getSessionGeneration: () => session.generation,
    get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() };
  return { apiClient: client, default: client, ApiRequestError: class extends Error {
    constructor(message: string, public status: number, public code?: string) { super(message); }
  } };
});
import { db } from '../../../src/db/indexedDB';
import { apiClient, ApiRequestError } from '../../../src/services/api/baseApi';
import { syncService, __syncQuarantineTestUtils } from '../../../src/services/syncService';
import { refreshReferenceData, cacheRecentMatches } from '../../../src/services/cacheService';
import { seasonsDataLayer, matchesDataLayer } from '../../../src/services/dataLayer';
import type { DbSeason } from '../../../src/db/schema';
import { RealTimeService } from '../../../src/services/realTimeService';

const localId = '11111111-1111-4111-8111-111111111111', remoteId = '22222222-2222-4222-8222-222222222222';
const matchId = '33333333-3333-4333-8333-333333333333', eventId = '44444444-4444-4444-8444-444444444444';
function localSeason(): DbSeason { return { id: localId, seasonId: localId, label: '2026-2027 Season',
  startDate: '2026-08-01', endDate: '2027-07-31', description: 'Auto-created season', isCurrent: true,
  createdByUserId: session.owner, synced: false, createdAt: '2026-10-14T12:00:00Z', updatedAt: '2026-10-14T12:00:00Z', isDeleted: false }; }
function remoteSeason() { return { ...localSeason(), id: remoteId, seasonId: remoteId,
  startDate: '2026-09-01', description: 'Existing cloud configuration' }; }
const page = (rows: any[]) => ({ success: true, data: { data: rows, pagination: { hasNext: false } } });
async function seedMatch() {
  await db.matches.add({ id: matchId, matchId, seasonId: localId, homeTeamId: 'home', awayTeamId: 'away',
    createdByUserId: session.owner, synced: false, isDeleted: false, durationMinutes: 60, periodFormat: 'whole' } as any);
  await db.events.add({ id: eventId, matchId, teamId: 'home', kind: 'goal', synced: false, createdByUserId: session.owner } as any);
  await db.matchState.put({ matchId, status: 'SCHEDULED', timerMs: 0, lastUpdatedAt: Date.now(),
    synced: false, createdByUserId: session.owner } as any);
}
async function failure(table: string, recordId: string, status: number) {
  await db.syncFailures.put({ table, recordId, permanent: true, lastStatus: status,
    reasonCode: status === 403 ? 'ACCESS_DENIED' : `HTTP_${status}`, attemptCount: 1,
    lastAttemptAt: Date.now(), nextRetryAt: Date.now(), lastError: 'old failure' });
}
function deferred() {
  let resolve!: (value: any) => void, reject!: (value: any) => void;
  const promise = new Promise<any>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(async () => {
  vi.resetAllMocks(); session.owner = 'owner-a'; session.generation = 0;
  await db.open(); await Promise.all(db.tables.map(table => table.clear()));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  __syncQuarantineTestUtils.resetGlobalBackoff();
  vi.mocked(apiClient.get).mockResolvedValue(page([]));
  vi.mocked(apiClient.post).mockResolvedValue({ success: true, data: {} });
  vi.mocked(apiClient.put).mockResolvedValue({ success: true, data: {} });
  vi.mocked(apiClient.delete).mockResolvedValue({ success: true, data: {} });
  await db.seasons.add(localSeason());
});
afterEach(() => vi.restoreAllMocks());
describe('owned season identity and prerequisite delivery', () => {
  it('leaves every pending owner, guest and tombstone untouched by socket connection or receipt, then delivers only owned REST work', async () => {
    await seedMatch();
    await db.events.bulkAdd(['owner-b', 'guest-test', session.owner].map((owner, index) => ({
      id: index === 2 ? '55555555-5555-4555-8555-555555555555' : `pending-${index}`, matchId, teamId: 'home', kind: 'goal', createdByUserId: owner,
      synced: false, isDeleted: index === 2,
    })) as any);
    const service = new RealTimeService({ serverUrl: 'http://localhost', timeout: 5, reconnectionAttempts: 1, reconnectionDelay: 1 });
    const before = await db.events.toArray();
    socket.on.mock.calls.find(([name]) => name === 'connect')?.[1]();
    socket.on.mock.calls.find(([name]) => name === 'match_event_confirmed')?.[1](eventId);
    expect(await db.events.toArray()).toEqual(before);
    expect(socket.emit).not.toHaveBeenCalled();
    await syncService.flushOnce();
    expect((await db.events.get(eventId))?.synced).toBe(true);
    expect((await db.events.get('pending-0'))?.synced).toBe(false);
    expect((await db.events.get('pending-1'))?.synced).toBe(false);
    expect(await db.events.get('55555555-5555-4555-8555-555555555555')).toBeUndefined();
    expect(apiClient.delete).toHaveBeenCalledWith('/events/55555555-5555-4555-8555-555555555555');
    service.disconnect();
  });
  it('creates a new season then delivers its match and recording children', async () => {
    await seedMatch(); await syncService.flushOnce();
    expect(await db.seasons.get(localId)).toMatchObject({ synced: true });
    expect(apiClient.post).toHaveBeenCalledWith('/matches', expect.objectContaining({ seasonId: localId }));
    expect((await db.events.get(eventId))?.synced).toBe(true);
  });
  it('reuses a returning account season without overwriting cloud metadata or local references', async () => {
    await seedMatch(); vi.mocked(apiClient.get).mockResolvedValue(page([remoteSeason()]));
    await syncService.flushOnce();
    expect(await db.seasons.get(localId)).toMatchObject({ remoteSeasonId: remoteId, description: 'Existing cloud configuration', synced: true });
    expect(await db.matches.get(matchId)).toMatchObject({ seasonId: localId, synced: true });
    expect(apiClient.post).toHaveBeenCalledWith('/matches', expect.objectContaining({ seasonId: remoteId }));
    expect(apiClient.post).not.toHaveBeenCalledWith('/seasons', expect.anything());
    expect(await db.seasons.count()).toBe(1);
  });
  it('resolves a 409 race during offline reconnect creation', async () => {
    await seedMatch(); vi.mocked(apiClient.get).mockResolvedValueOnce(page([])).mockResolvedValue(page([remoteSeason()]));
    vi.mocked(apiClient.post).mockRejectedValueOnce(new ApiRequestError('collision', 409));
    await syncService.flushOnce();
    expect(await db.seasons.get(localId)).toMatchObject({ remoteSeasonId: remoteId, synced: true });
    expect(await db.syncFailures.toArray()).toEqual([]);
    expect((await db.matches.get(matchId))?.synced).toBe(true);
  });
  it('recovers a lost create response without duplicating the season', async () => {
    vi.mocked(apiClient.post).mockRejectedValueOnce(new TypeError('response lost')); await syncService.flushOnce();
    expect(await db.seasons.get(localId)).toMatchObject({ syncAttempted: true, synced: false });
    await db.syncFailures.update(['seasons', localId], { nextRetryAt: 0 });
    vi.mocked(apiClient.get).mockResolvedValue(page([{ ...remoteSeason(), id: localId, seasonId: localId }]));
    await syncService.flushOnce(); expect((await db.seasons.get(localId))?.synced).toBe(true);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
  });
  it('repairs old 409 and only related never-persisted ACCESS_DENIED children', async () => {
    await seedMatch(); await failure('seasons', localId, 409); await failure('matches', matchId, 403);
    await failure('events', eventId, 403); await failure('matchState', matchId, 403); await failure('events', 'unrelated', 403);
    vi.mocked(apiClient.get).mockResolvedValue(page([remoteSeason()])); await syncService.flushOnce();
    expect((await db.events.get(eventId))?.synced).toBe(true);
    expect((await db.matchState.get(matchId))?.synced).toBe(true);
    expect(await db.syncFailures.toArray()).toMatchObject([{ recordId: 'unrelated' }]);
  });
  it.each(['foreign', 'missing-owner', 'deleted', 'conflicting-owner', 'ambiguous', 'conflicting-edit'])('refuses %s adoption and defers children', async scenario => {
    await seedMatch(); let rows: any[] = [remoteSeason()];
    if (scenario === 'foreign') rows[0].createdByUserId = 'owner-b';
    if (scenario === 'missing-owner') delete rows[0].createdByUserId;
    if (scenario === 'deleted') rows[0].isDeleted = true;
    if (scenario === 'conflicting-owner') rows[0].created_by_user_id = 'owner-b';
    if (scenario === 'ambiguous') rows.push({ ...remoteSeason(), id: crypto.randomUUID(), seasonId: undefined });
    if (scenario === 'conflicting-edit') await db.seasons.update(localId, { description: 'User configuration' });
    vi.mocked(apiClient.get).mockResolvedValue(page(rows)); vi.mocked(apiClient.post).mockRejectedValue(new ApiRequestError('collision', 409));
    await syncService.flushOnce(); expect((await db.seasons.get(localId))?.remoteSeasonId).toBeUndefined();
    expect(apiClient.put).not.toHaveBeenCalled(); expect(apiClient.post).not.toHaveBeenCalledWith('/matches', expect.anything());
  });
  it('preserves an edit during lookup and sends it later to the proven alias', async () => {
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.get).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise; await seasonsDataLayer.update(localId, { description: 'Edited while looking up' });
    response.resolve(page([remoteSeason()])); await flush;
    expect(await db.seasons.get(localId)).toMatchObject({ description: 'Edited while looking up', synced: false, remoteSeasonId: remoteId });
    await syncService.flushOnce();
    expect(apiClient.put).toHaveBeenCalledWith(`/seasons/${remoteId}`, expect.objectContaining({ id: remoteId, description: 'Edited while looking up', startDate: '2026-09-01' }));
  });
  it.each(['label', 'description', 'startDate'] as const)('recovers an attempted same-ID create after a %s edit without treating proof as an ACK', async field => {
    const persisted = localSeason();
    await db.seasons.update(localId, { syncAttempted: true, [field]: field === 'startDate' ? '2026-10-01' : 'Explicit edit' });
    await failure('seasons', localId, 409); await seedMatch();
    vi.mocked(apiClient.get).mockImplementation(async path => path === `/seasons/${localId}` ? { data: persisted } as any : page([]));
    await syncService.flushOnce();
    expect(await db.seasons.get(localId)).toMatchObject({ synced: false, remoteSeasonId: localId, [field]: field === 'startDate' ? '2026-10-01' : 'Explicit edit' });
    expect(await db.syncFailures.get(['seasons', localId])).toBeUndefined();
    expect((await db.matches.get(matchId))?.synced).toBe(true);
    await syncService.flushOnce();
    expect((await db.seasons.get(localId))?.synced).toBe(true);
    expect(apiClient.post).not.toHaveBeenCalledWith('/seasons', expect.anything());
    expect(apiClient.put).toHaveBeenCalledWith(`/seasons/${localId}`, expect.objectContaining({ [field]: field === 'startDate' ? '2026-10-01' : 'Explicit edit' }));
  });
  it.each(['description', 'label', 'dates-current', 'delete'] as const)('releases old 409 after concurrent %s while importing only untouched cloud fields', async mutation => {
    await failure('seasons', localId, 409);
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.get).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise;
    const changes = mutation === 'description' ? { description: 'Explicit description' } : mutation === 'label' ? { label: 'Explicit label' } :
      { startDate: '2026-10-01', endDate: '2027-05-31', isCurrent: false };
    if (mutation === 'delete') await seasonsDataLayer.delete(localId); else await seasonsDataLayer.update(localId, changes);
    response.resolve(page([remoteSeason()])); await flush;
    expect(await db.syncFailures.get(['seasons', localId])).toBeUndefined();
    expect((await db.seasons.get(localId))?.synced).toBe(false);
    await syncService.flushOnce();
    if (mutation === 'delete') {
      expect(apiClient.delete).toHaveBeenCalledWith(`/seasons/${remoteId}`); expect(await db.seasons.get(localId)).toBeUndefined();
    } else {
      expect(apiClient.put).toHaveBeenCalledWith(`/seasons/${remoteId}`, expect.objectContaining({
        startDate: '2026-09-01', description: 'Existing cloud configuration', ...changes,
      }));
      expect((await db.seasons.get(localId))?.synced).toBe(true);
    }
  });
  it('rejects A to B to A generation replacement during exact-ID recovery', async () => {
    await db.seasons.update(localId, { syncAttempted: true }); await failure('seasons', localId, 409);
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.get).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise;
    session.owner = 'owner-b'; session.generation++; session.owner = 'owner-a'; session.generation++;
    response.resolve({ data: localSeason() }); await flush;
    expect((await db.seasons.get(localId))?.syncedAt).toBeUndefined();
    expect(await db.syncFailures.get(['seasons', localId])).toMatchObject({ permanent: true });
    expect(apiClient.post).not.toHaveBeenCalled();
  });
  it('preserves a newer edit during exact-ID GET and acknowledges only its subsequent PUT', async () => {
    const persisted = localSeason();
    await db.seasons.update(localId, { syncAttempted: true }); await failure('seasons', localId, 409);
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.get).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise;
    await seasonsDataLayer.update(localId, { label: 'Renamed during exact-ID GET', description: 'Current change' });
    response.resolve({ data: persisted }); await flush;
    expect(await db.seasons.get(localId)).toMatchObject({ synced: false, label: 'Renamed during exact-ID GET', description: 'Current change' });
    expect(await db.syncFailures.get(['seasons', localId])).toBeUndefined();
    await syncService.flushOnce();
    expect(apiClient.put).toHaveBeenCalledWith(`/seasons/${localId}`, expect.objectContaining({ label: 'Renamed during exact-ID GET', description: 'Current change' }));
    expect((await db.seasons.get(localId))?.synced).toBe(true);
  });
  it.each([403, 402])('does not release a genuine %s failure that replaces the old conflict during lookup', async status => {
    await failure('seasons', localId, 409);
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.get).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise;
    await seasonsDataLayer.update(localId, { description: 'Current change' }); await failure('seasons', localId, status);
    response.resolve(page([remoteSeason()])); await flush;
    expect(await db.syncFailures.get(['seasons', localId])).toMatchObject({ permanent: true, lastStatus: status });
    await syncService.flushOnce(); expect(apiClient.put).not.toHaveBeenCalled();
    expect((await db.seasons.get(localId))?.synced).toBe(false);
  });
  it.each(['foreign', 'absent-owner', 'deleted', 'mismatched-id', 'conflicting-id', 'request-failure'])('does not trust %s exact-ID recovery', async scenario => {
    await db.seasons.update(localId, { syncAttempted: true, label: 'Renamed' }); await failure('seasons', localId, 409); await seedMatch();
    const remote: any = localSeason();
    if (scenario === 'foreign') remote.createdByUserId = 'owner-b';
    if (scenario === 'absent-owner') delete remote.createdByUserId;
    if (scenario === 'deleted') remote.isDeleted = true;
    if (scenario === 'mismatched-id') remote.id = remote.seasonId = remoteId;
    if (scenario === 'conflicting-id') remote.seasonId = remoteId;
    vi.mocked(apiClient.get).mockImplementation(async path => {
      if (path !== `/seasons/${localId}`) return page([]);
      if (scenario === 'request-failure') throw new ApiRequestError('lookup unavailable', 503);
      return { data: remote } as any;
    });
    await syncService.flushOnce();
    expect((await db.seasons.get(localId))?.syncedAt).toBeUndefined();
    expect(apiClient.post).not.toHaveBeenCalledWith('/matches', expect.anything());
    expect(await db.syncFailures.get(['seasons', localId])).toBeDefined();
  });
  it.each(['owner', 'generation'])('rejects a session %s replacement during lookup', async change => {
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.get).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise;
    if (change === 'owner') session.owner = 'owner-b'; else session.generation++;
    response.resolve(page([remoteSeason()])); await flush;
    expect((await db.seasons.get(localId))?.remoteSeasonId).toBeUndefined();
    expect(apiClient.post).not.toHaveBeenCalled(); expect(await db.syncFailures.count()).toBe(0);
  });
  it.each(['success', 'failure'])('ignores stale session %s after a request', async outcome => {
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.post).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise; session.generation++;
    if (outcome === 'success') response.resolve({ data: {} }); else response.reject(new ApiRequestError('old denial', 403));
    await flush; expect((await db.seasons.get(localId))?.synced).toBe(false); expect(await db.syncFailures.count()).toBe(0);
  });
  it('uses the remote identity for season deletion', async () => {
    await db.seasons.update(localId, { remoteSeasonId: remoteId, syncedAt: new Date().toISOString(), isDeleted: true });
    await syncService.flushOnce(); expect(apiClient.delete).toHaveBeenCalledWith(`/seasons/${remoteId}`);
    expect(await db.seasons.get(localId)).toBeUndefined();
  });
  it('retains a tombstone made during lookup and deletes the proven remote identity next', async () => {
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.get).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise;
    await seasonsDataLayer.delete(localId);
    response.resolve(page([remoteSeason()])); await flush;
    expect(await db.seasons.get(localId)).toMatchObject({ remoteSeasonId: remoteId, isDeleted: true, synced: false });
    await syncService.flushOnce();
    expect(apiClient.delete).toHaveBeenCalledWith(`/seasons/${remoteId}`);
    expect(await db.seasons.get(localId)).toBeUndefined();
  });
  it('refuses a second local alias for an already bound remote season', async () => {
    await seedMatch();
    const otherId = crypto.randomUUID();
    await db.seasons.add({ ...localSeason(), id: otherId, seasonId: otherId, remoteSeasonId: remoteId, synced: true });
    vi.mocked(apiClient.get).mockResolvedValue(page([remoteSeason()])); await syncService.flushOnce();
    expect((await db.seasons.get(localId))?.remoteSeasonId).toBeUndefined();
    expect(apiClient.post).not.toHaveBeenCalledWith('/matches', expect.anything());
    expect((await db.seasons.get(otherId))?.remoteSeasonId).toBe(remoteId);
  });
  it('rolls back a session replacement inside the attempt transaction without sending a request', async () => {
    const update = db.seasons.update.bind(db.seasons);
    vi.spyOn(db.seasons, 'update').mockImplementationOnce(((...args: any[]) =>
      (update as any)(...args).then((result: number) => { session.generation++; return result; })) as any);
    await syncService.flushOnce();
    expect((await db.seasons.get(localId))?.syncAttempted).toBeUndefined();
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(await db.syncFailures.count()).toBe(0);
  });
  it.each(['backoff-season', 'backoff-match'])('defers %s children without permission failures and reports them ineligible', async scenario => {
    await seedMatch();
    if (scenario === 'backoff-match') await db.seasons.update(localId, { synced: true });
    const table = scenario === 'backoff-season' ? 'seasons' : 'matches';
    const recordId = table === 'seasons' ? localId : matchId;
    await db.syncFailures.put({ table, recordId, permanent: false, lastStatus: 503, reasonCode: 'SERVER_ERROR',
      attemptCount: 1, nextRetryAt: Date.now() + 60000, lastAttemptAt: Date.now(), lastError: 'Retry later' });
    expect((await syncService.getPendingCounts()).eligible).toBe(0);
    await syncService.flushOnce();
    expect(apiClient.post).not.toHaveBeenCalled(); expect(apiClient.put).not.toHaveBeenCalled();
    expect((await db.events.get(eventId))?.synced).toBe(false);
    expect(await db.syncFailures.count()).toBe(1);
  });
  it('round-trips refresh and reverses cloud match season references without duplication', async () => {
    await seedMatch(); vi.mocked(apiClient.get).mockResolvedValue(page([remoteSeason()])); await syncService.flushOnce();
    vi.mocked(apiClient.get).mockImplementation(async path => path.startsWith('/seasons') ? page([remoteSeason()]) :
      path.startsWith('/matches') ? page([{ ...(await db.matches.get(matchId)), seasonId: remoteId }]) : page([]));
    await refreshReferenceData(); await cacheRecentMatches();
    expect(await db.seasons.count()).toBe(1); expect((await db.matches.get(matchId))?.seasonId).toBe(localId);
  });
  it('merges an already cached canonical row and its same-owner references', async () => {
    await db.seasons.add({ ...remoteSeason(), synced: true });
    await db.matches.add({ id: 'other-match', seasonId: remoteId, createdByUserId: session.owner, synced: true } as any);
    vi.mocked(apiClient.get).mockResolvedValue(page([remoteSeason()])); await syncService.flushOnce();
    expect(await db.seasons.count()).toBe(1); expect((await db.matches.get('other-match'))?.seasonId).toBe(localId);
  });
  it('does not overwrite a foreign canonical cache identity', async () => {
    await db.seasons.add({ ...remoteSeason(), createdByUserId: 'owner-b', synced: true });
    vi.mocked(apiClient.get).mockResolvedValue(page([remoteSeason()])); await syncService.flushOnce();
    expect((await db.seasons.get(localId))?.remoteSeasonId).toBeUndefined();
    expect((await db.seasons.get(remoteId))?.createdByUserId).toBe('owner-b');
  });
  it('filters deferred dependencies before batch limits without starving a confirmed match', async () => {
    await seedMatch(); await failure('seasons', localId, 402);
    await db.events.bulkAdd(Array.from({ length: 55 }, () => ({ id: crypto.randomUUID(), matchId, teamId: 'home',
      kind: 'goal', createdByUserId: session.owner, synced: false })) as any);
    const confirmedId = crypto.randomUUID(), eligibleId = crypto.randomUUID();
    await db.matches.add({ id: confirmedId, createdByUserId: session.owner, synced: true } as any);
    await db.events.add({ id: eligibleId, matchId: confirmedId, teamId: 'home', kind: 'goal', createdByUserId: session.owner, synced: false } as any);
    expect((await syncService.getPendingCounts()).eligible).toBe(1);
    await syncService.flushOnce(); expect((await db.events.get(eligibleId))?.synced).toBe(true);
    expect((await db.events.get(eventId))?.synced).toBe(false); expect(await db.syncFailures.get(['events', eventId])).toBeUndefined();
  });
  it('allows children while a newer persisted parent edit is quarantined', async () => {
    await seedMatch(); await db.matches.update(matchId, { syncedAt: new Date().toISOString() });
    await failure('matches', matchId, 403); await syncService.flushOnce();
    expect((await db.events.get(eventId))?.synced).toBe(true);
    expect(await db.syncFailures.get(['matches', matchId])).toMatchObject({ permanent: true });
  });
  it('preserves a match edit during the create response and still delivers children', async () => {
    await seedMatch(); await db.seasons.update(localId, { synced: true });
    const entered = deferred(), response = deferred();
    vi.mocked(apiClient.post).mockImplementationOnce(() => { entered.resolve(null); return response.promise; });
    const flush = syncService.flushOnce(); await entered.promise; await matchesDataLayer.update(matchId, { venue: 'Changed venue' });
    response.resolve({ data: {} }); await flush;
    expect(await db.matches.get(matchId)).toMatchObject({ venue: 'Changed venue', synced: false });
    expect((await db.events.get(eventId))?.synced).toBe(true);
  });
});
