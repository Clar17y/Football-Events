import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { transferableAbortController } from 'node:util';
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/db/indexedDB';
import { apiClient } from '../../src/services/api/baseApi';
import { matchesApi } from '../../src/services/api/matchesApi';
import { eventsApi } from '../../src/services/api/eventsApi';
import { seasonsDataLayer, matchPeriodsDataLayer, matchStateDataLayer } from '../../src/services/dataLayer';
import { syncService, __syncQuarantineTestUtils } from '../../src/services/syncService';
import { refreshReferenceData, cacheRecentMatches } from '../../src/services/cacheService';
import { getAuthUserId } from '../../src/utils/network';

function online(value: boolean) { Object.defineProperty(navigator, 'onLine', { configurable: true, value }); }
const year = new Date().getFullYear();
const cloud = { label: `${year}-${year + 1} Season`, startDate: `${year}-09-01`, endDate: `${year + 1}-06-30`,
  isCurrent: true, description: 'Existing cloud season configuration' };
async function flush() { online(true); const result = await syncService.flushOnce(); expect(result.errors).toEqual([]); expect(result.failed).toBe(0); }
async function quarantine(table: string, recordId: string, status: number) {
  await db.syncFailures.put({ table, recordId, permanent: true, lastStatus: status,
    reasonCode: status === 403 ? 'ACCESS_DENIED' : `HTTP_${status}`, attemptCount: 1,
    lastAttemptAt: Date.now(), nextRetryAt: 0, lastError: 'Legacy prerequisite denial' });
}
describe('season identity coupled replay over actual HTTP and IndexedDB', () => {
  beforeAll(() => {
    vi.stubGlobal('AbortController', transferableAbortController().constructor);
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
  });
  beforeEach(async () => {
    await db.open(); await db.clearAllData(); localStorage.clear(); apiClient.setToken(null); online(true);
    __syncQuarantineTestUtils.resetGlobalBackoff();
    const response = await apiClient.post<any>('/auth/register', { email: `sideline-season-${randomUUID()}@example.com`,
      password: 'TemporarySideline123!', firstName: 'Season', lastName: 'Recovery' });
    apiClient.setToken(response.data.access_token);
  });
  afterEach(() => vi.restoreAllMocks());
  it.each(['lost-label', 'lost-description', 'lost-date', 'old409-edit', 'old409-delete', 'default-concurrent-edit'])('%s preserves explicit changes over the correct cloud baseline', async scenario => {
    const remote = scenario.startsWith('lost-') ? undefined :
      (await apiClient.post<any>('/seasons', { id: randomUUID(), ...cloud })).data;
    online(false);
    const match = await matchesApi.quickStart({ myTeamName: 'Season Recovery FC', opponentName: 'Season Test FC',
      isHome: true, kickoffTime: new Date().toISOString(), periodFormat: 'whole', durationMinutes: 50 });
    const localId = match.seasonId;
    const original = (await db.seasons.get(localId))!;
    const changes = scenario === 'lost-label' ? { label: 'Explicit renamed season' } : scenario === 'lost-date' ?
      { startDate: `${year}-10-01` } : { description: 'Explicit preserved description' };
    if (scenario.startsWith('lost-')) {
      const post = apiClient.post.bind(apiClient); let first = true;
      vi.spyOn(apiClient, 'post').mockImplementation(async (path, data) => {
        const result = await post(path, data);
        if (first && path === '/seasons') { first = false; throw new TypeError('Lost successful create response'); }
        return result;
      });
      online(true); expect((await syncService.flushOnce()).failed).toBe(1);
      online(false); await seasonsDataLayer.update(localId, changes);
      await db.syncFailures.update(['seasons', localId], { nextRetryAt: 0 });
    } else {
      if (scenario.startsWith('old409')) await quarantine('seasons', localId, 409);
      const get = apiClient.get.bind(apiClient); let first = true;
      vi.spyOn(apiClient, 'get').mockImplementation(async (path, params) => {
        const result = await get(path, params);
        if (first && path === '/seasons') {
          first = false;
          if (scenario === 'old409-delete') await seasonsDataLayer.delete(localId);
          else await seasonsDataLayer.update(localId, changes);
        }
        return result;
      });
    }
    await flush();
    const remoteId = remote?.id ?? localId;
    expect((await db.seasons.get(localId))?.synced).toBe(false);
    expect((await db.seasons.get(localId))?.remoteSeasonId).toBe(remoteId);
    expect(await db.syncFailures.get(['seasons', localId])).toBeUndefined();
    if (scenario === 'old409-delete') {
      // Parent tombstone correctly defers its never-persisted match.
      expect((await db.matches.get(match.id))?.synced).toBe(false);
      await flush(); expect(await db.seasons.get(localId)).toBeUndefined();
      await expect(apiClient.get(`/seasons/${remoteId}`)).rejects.toMatchObject({ status: 404 });
    } else {
      expect((await db.matches.get(match.id))?.synced).toBe(true);
      expect((await apiClient.get<any>(`/matches/${match.id}`)).data.seasonId).toBe(remoteId);
      await flush();
      expect((await db.seasons.get(localId))?.synced).toBe(true);
      const stored = (await apiClient.get<any>(`/seasons/${remoteId}`)).data;
      const baseline = remote ? cloud : { label: original.label, startDate: original.startDate, endDate: original.endDate,
        isCurrent: original.isCurrent, description: original.description };
      expect(stored).toMatchObject({ ...baseline, ...changes });
      expect((await apiClient.get<any>('/seasons')).data.data).toHaveLength(1);
      await refreshReferenceData(); await cacheRecentMatches();
      expect(await db.seasons.count()).toBe(1); expect((await db.matches.get(match.id))?.seasonId).toBe(localId);
    }
  });
  it.each(['returning-cold-cache', 'offline-collision-409', 'lost-create-response', 'old-409-quarantine'])('%s preserves IDs, cloud metadata and recording delivery', async scenario => {
    const remote = scenario !== 'lost-create-response'
      ? (await apiClient.post<any>('/seasons', { id: randomUUID(), ...cloud })).data : undefined;
    online(false);
    const match = await matchesApi.quickStart({ myTeamName: 'Season Recovery FC', opponentName: 'Season Test FC',
      isHome: true, kickoffTime: new Date().toISOString(), periodFormat: 'whole', durationMinutes: 50 });
    const localId = match.seasonId;
    const period = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1 });
    await matchStateDataLayer.upsert(match.id, { status: 'LIVE', currentPeriodId: period.id, timerMs: 0, totalElapsedSeconds: 0 });
    const event = await eventsApi.create({ matchId: match.id, teamId: match.homeTeamId, kind: 'goal', periodNumber: 1, clockMs: 1000 });
    if (scenario === 'offline-collision-409') {
      const get = apiClient.get.bind(apiClient); let first = true;
      vi.spyOn(apiClient, 'get').mockImplementation(async (path, params) => {
        if (first && path === '/seasons') { first = false; return { data: { data: [], pagination: { hasNext: false } } } as any; }
        return get(path, params);
      });
    }
    if (scenario === 'old-409-quarantine') {
      await quarantine('seasons', localId, 409); await quarantine('matches', match.id, 403);
      await quarantine('events', event.id, 403); await quarantine('matchState', match.id, 403);
    }
    if (scenario === 'lost-create-response') {
      const post = apiClient.post.bind(apiClient); let first = true;
      vi.spyOn(apiClient, 'post').mockImplementation(async (path, data) => {
        const result = await post(path, data);
        if (first && path === '/seasons') { first = false; throw new TypeError('Lost response after durable create'); }
        return result;
      });
      online(true); expect((await syncService.flushOnce()).failed).toBe(1);
      expect((await db.matches.get(match.id))?.synced).toBe(false);
      expect(await db.syncFailures.get(['matches', match.id])).toBeUndefined();
      await db.syncFailures.update(['seasons', localId], { nextRetryAt: 0 });
    }
    await flush();
    const local = (await db.seasons.get(localId))!;
    const remoteId = remote?.id ?? localId;
    expect(local).toMatchObject({ seasonId: localId, synced: true, remoteSeasonId: remoteId });
    expect((await db.matches.get(match.id))?.seasonId).toBe(localId);
    const remoteMatch = (await apiClient.get<any>(`/matches/${match.id}`)).data;
    expect(remoteMatch).toMatchObject({ seasonId: remoteId, homeScore: 1, awayScore: 0 });
    expect((await matchesApi.getMatchState(match.id)).status).toBe('LIVE');
    expect(await matchesApi.getMatchPeriods(match.id)).toHaveLength(1);
    expect(await eventsApi.getByMatch(match.id)).toHaveLength(1);
    expect((await db.events.get(event.id))?.synced).toBe(true);
    expect(await db.syncFailures.toArray()).toEqual([]);
    const rows = (await apiClient.get<any>('/seasons')).data.data;
    expect(rows.filter((row: any) => row.createdByUserId === getAuthUserId() && row.label === cloud.label)).toHaveLength(1);
    if (remote) expect((await apiClient.get<any>(`/seasons/${remoteId}`)).data).toMatchObject(cloud);
    await refreshReferenceData(); await cacheRecentMatches();
    expect(await db.seasons.count()).toBe(1);
    expect((await db.matches.get(match.id))?.seasonId).toBe(localId);
    online(false); await seasonsDataLayer.update(localId, { description: 'Explicit revised configuration' }); await flush();
    expect((await apiClient.get<any>(`/seasons/${remoteId}`)).data.description).toBe('Explicit revised configuration');
    // Keep match/season FK safety; delete its match before exercising season alias deletion.
    await apiClient.delete(`/matches/${match.id}`);
    online(false); await seasonsDataLayer.delete(localId); await flush();
    await expect(apiClient.get(`/seasons/${remoteId}`)).rejects.toMatchObject({ status: 404 });
    expect(await db.seasons.get(localId)).toBeUndefined();
  });
});
