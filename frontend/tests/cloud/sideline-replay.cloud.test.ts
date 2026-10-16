import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { transferableAbortController } from 'node:util';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/db/indexedDB';
import { apiClient } from '../../src/services/api/baseApi';
import { matchesApi } from '../../src/services/api/matchesApi';
import { eventsApi } from '../../src/services/api/eventsApi';
import { matchPeriodsDataLayer, matchStateDataLayer } from '../../src/services/dataLayer';
import { syncService } from '../../src/services/syncService';
import { actualPlayedSeconds, reconstructClock } from '../../src/utils/liveMatchTiming';
import { applyLiveMatchHydration, captureLiveMatchHydration } from '../../src/services/liveMatchHydration';

function online(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

async function flush() {
  online(true);
  const result = await syncService.flushOnce();
  expect(result.errors).toEqual([]);
  expect(result.failed).toBe(0);
}

async function localMatch(format: 'half' | 'whole', sameNamedSides = false) {
  online(false);
  return matchesApi.quickStart({
    myTeamName: 'Runtime Sideline FC',
    opponentName: sameNamedSides ? 'Runtime Sideline FC' : 'Runtime Riverside Juniors',
    isHome: true,
    kickoffTime: new Date().toISOString(),
    periodFormat: format,
    durationMinutes: 50,
  });
}

describe('Actual sideline local-to-cloud replay against the disposable PostgreSQL database', () => {
  beforeAll(() => {
    // Native Node fetch requires its own AbortSignal brand, not jsdom's DOM signal.
    // Keep actual HTTP delivery and the application's timeout behavior intact.
    vi.stubGlobal('AbortController', transferableAbortController().constructor);
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  beforeEach(async () => {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: randomUUID });
    await db.open();
    await db.clearAllData();
    localStorage.clear();
    apiClient.setToken(null);
    online(true);
    const response = await apiClient.post<any>('/auth/register', {
      email: `sideline-runtime-${crypto.randomUUID()}@example.com`,
      password: 'TemporarySideline123!',
      firstName: 'Runtime',
      lastName: 'Parent',
    });
    apiClient.setToken(response.data.access_token);
  });

  it('syncs Full Match with same-named sides and a paused first period, then resumes without duplicating the period', async () => {
    const match = await localMatch('whole', true);
    expect(match.homeTeamId).not.toBe(match.awayTeamId);
    const period = await matchPeriodsDataLayer.create({
      matchId: match.id, periodNumber: 1, startedAt: Date.now() - 15 * 60000,
    });
    await matchStateDataLayer.upsert(match.id, {
      status: 'PAUSED', currentPeriodId: period.id, timerMs: 600000, totalElapsedSeconds: 600,
    });
    await flush();
    const remoteMatch = (await apiClient.get<any>(`/matches/${match.id}`)).data;
    expect(remoteMatch.periodFormat).toBe('whole');
    expect(remoteMatch.homeTeamId).not.toBe(remoteMatch.awayTeamId);
    expect((await apiClient.get<any>(`/teams/${remoteMatch.homeTeamId}`)).data.name).toBe('Runtime Sideline FC');
    expect((await apiClient.get<any>(`/teams/${remoteMatch.awayTeamId}`)).data.name).toBe('Runtime Sideline FC');
    const state = await matchesApi.getMatchState(match.id);
    expect(state.status).toBe('PAUSED');
    expect(state.totalElapsedSeconds).toBe(600);
    expect(await matchesApi.getMatchPeriods(match.id)).toHaveLength(1);
    expect((await db.matchState.get(match.id))?.currentPeriodId).toBe(period.id);
    const hydrationToken = await captureLiveMatchHydration(match.id);
    expect(hydrationToken).not.toBeNull();
    expect(await applyLiveMatchHydration(hydrationToken!, {
      state,
      periods: await matchesApi.getMatchPeriods(match.id),
      events: await eventsApi.getByMatch(match.id),
    }, (remoteState, localPeriods, localRecord) => {
      const timerMs = reconstructClock(remoteState, localPeriods, localRecord);
      return { timerMs, totalElapsedSeconds: actualPlayedSeconds(timerMs, localRecord, localPeriods) };
    })).toBe(true);
    expect((await db.matchState.get(match.id))?.timerMs).toBe(600000);
    expect((await db.matchState.get(match.id))?.currentPeriodId).toBe(period.id);
    online(false);
    await matchStateDataLayer.upsert(match.id, {
      status: 'LIVE', currentPeriodId: period.id, timerMs: 600000, totalElapsedSeconds: 600,
    });
    await flush();
    expect((await matchesApi.getMatchState(match.id)).status).toBe('LIVE');
    expect(await matchesApi.getMatchPeriods(match.id)).toHaveLength(1);
  });

  it('replays an entire offline match with shortened periods and paused-adjusted durations', async () => {
    const match = await localMatch('half');
    const start = Date.now() - 40 * 60000;
    const first = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1, startedAt: start });
    await matchPeriodsDataLayer.endPeriod(first.id, start + 15 * 60000, 600);
    const second = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 2, startedAt: start + 20 * 60000 });
    await matchPeriodsDataLayer.endPeriod(second.id, start + 38 * 60000, 720);
    await matchStateDataLayer.upsert(match.id, {
      status: 'COMPLETED', currentPeriodId: undefined, timerMs: 2220000, totalElapsedSeconds: 1320,
    });
    await flush();
    const state = await matchesApi.getMatchState(match.id);
    expect(state.status).toBe('COMPLETED');
    expect(state.totalElapsedSeconds).toBe(1320);
    const periods = await matchesApi.getMatchPeriods(match.id);
    expect(periods.map(p => p.durationSeconds)).toEqual([600, 720]);
    await flush();
    expect(await matchesApi.getMatchPeriods(match.id)).toHaveLength(2);
  });

  it('uploads a goal, then persistently undoes it locally and remotely', async () => {
    const match = await localMatch('whole');
    const period = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1 });
    await matchStateDataLayer.upsert(match.id, {
      status: 'LIVE', currentPeriodId: period.id, timerMs: 0, totalElapsedSeconds: 0,
    });
    const event = await eventsApi.create({ matchId: match.id, teamId: match.homeTeamId, kind: 'goal', periodNumber: 1, clockMs: 10000 });
    expect((await db.matches.get(match.id))?.homeScore).toBe(1);
    await flush();
    expect(await eventsApi.getByMatch(match.id)).toHaveLength(1);
    expect((await apiClient.get<any>(`/matches/${match.id}`)).data.homeScore).toBe(1);
    online(false);
    await eventsApi.delete(event.id);
    expect((await db.matches.get(match.id))?.homeScore).toBe(0);
    await flush();
    expect(await eventsApi.getByMatch(match.id)).toHaveLength(0);
    expect((await apiClient.get<any>(`/matches/${match.id}`)).data.homeScore).toBe(0);
    expect(await db.syncFailures.toArray()).toEqual([]);
  });

  it('keeps the running clock anchor when cloud replay occurs five minutes later', async () => {
    const match = await localMatch('whole');
    const anchor = Date.now() - 5 * 60000;
    const period = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1, startedAt: anchor - 10 * 60000 });
    await matchStateDataLayer.upsert(match.id, {
      status: 'LIVE', currentPeriodId: period.id, timerMs: 600000, totalElapsedSeconds: 600,
    });
    await db.matchState.update(match.id, { lastUpdatedAt: anchor });
    await flush();
    const state = await matchesApi.getMatchState(match.id);
    const periods = await matchesApi.getMatchPeriods(match.id);
    expect(Date.parse(state.activeSince!)).toBe(anchor);
    const clock = reconstructClock(state, periods, match);
    expect(clock).toBeGreaterThanOrEqual(900000);
    expect(clock).toBeLessThan(910000);
  });

  it('recovers an older owned cache and persists its corrections and completion through the real API', async () => {
    const match = await localMatch('whole');
    const startedAt = Date.now() - 60000;
    const period = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1, startedAt });
    await matchStateDataLayer.upsert(match.id, {
      status: 'LIVE', currentPeriodId: period.id, timerMs: 0, totalElapsedSeconds: 0,
    });
    const event = await eventsApi.create({ matchId: match.id, teamId: match.homeTeamId, kind: 'goal', periodNumber: 1, clockMs: 10000 });
    await flush();
    const oldState = await matchesApi.getMatchState(match.id);
    await db.matchState.update(match.id, { createdByUserId: 'server', updatedAt: Date.parse(oldState.updatedAt!) } as any);
    await db.matchPeriods.update(period.id, { createdByUserId: 'server' });
    await db.events.update(event.id, { createdByUserId: 'authenticated-user' });
    online(false);
    await matchStateDataLayer.upsert(match.id, {
      status: 'PAUSED', currentPeriodId: period.id, timerMs: 60000, totalElapsedSeconds: 60,
    });
    await eventsApi.update(event.id, { sentiment: 1 });
    await eventsApi.delete(event.id);
    await matchPeriodsDataLayer.endPeriod(period.id, startedAt + 60000, 60);
    await matchStateDataLayer.upsert(match.id, {
      status: 'COMPLETED', currentPeriodId: undefined, timerMs: 60000, totalElapsedSeconds: 60,
    });
    await flush();
    const finalState = await matchesApi.getMatchState(match.id);
    expect(finalState.status).toBe('COMPLETED');
    expect(finalState.totalElapsedSeconds).toBe(60);
    expect((await matchesApi.getMatchPeriods(match.id)).map(p => p.durationSeconds)).toEqual([60]);
    expect(await eventsApi.getByMatch(match.id)).toEqual([]);
    expect((await db.matches.get(match.id))?.homeScore).toBe(0);
    expect((await db.matchState.get(match.id))?.createdByUserId).toBe((await db.matches.get(match.id))?.createdByUserId);
  });

  it('rejects LIVE against an ended cloud period without changing the saved break state', async () => {
    const match = await localMatch('half');
    const startedAt = Date.now() - 60000;
    const period = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1, startedAt });
    await matchPeriodsDataLayer.endPeriod(period.id, startedAt + 60000, 60);
    await matchStateDataLayer.upsert(match.id, {
      status: 'PAUSED', currentPeriodId: undefined, timerMs: 60000, totalElapsedSeconds: 60,
    });
    await flush();
    await expect(apiClient.post(`/matches/${match.id}/state/reconcile`, {
      status: 'LIVE', totalElapsedSeconds: 60, currentPeriod: 1, currentPeriodType: 'REGULAR',
      activeSince: new Date().toISOString(),
    })).rejects.toMatchObject({ status: 409 });
    const state = await matchesApi.getMatchState(match.id);
    expect(state.status).toBe('PAUSED');
    expect(state.totalElapsedSeconds).toBe(60);
  });
});
