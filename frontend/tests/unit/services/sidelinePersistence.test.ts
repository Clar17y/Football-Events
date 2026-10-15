import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';

const session = vi.hoisted(() => ({ guest: false, userId: 'user-123' }));
vi.mock('../../../src/utils/guest', () => ({
  isGuest: () => session.guest, getGuestId: () => 'guest-test',
}));
vi.mock('../../../src/utils/network', () => ({ getCurrentUserId: () => session.userId }));
vi.mock('../../../src/db/eventLinking', () => ({ autoLinkEvents: async () => {} }));
import { db } from '../../../src/db/indexedDB';
import { eventsDataLayer, matchPeriodsDataLayer, matchStateDataLayer, matchesDataLayer, teamsDataLayer, seasonsDataLayer } from '../../../src/services/dataLayer';
import { eventsApi } from '../../../src/services/api/eventsApi';
import { setCachedMeLimits } from '../../../src/services/limitsCache';

const event = { matchId: 'match-1', teamId: 'home', kind: 'goal' };

beforeEach(async () => {
  session.guest = false;
  session.userId = 'user-123';
  await db.open();
  await Promise.all(db.tables.map(t => t.clear()));
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  await db.matches.add({ id: 'match-1', matchId: 'match-1', homeTeamId: 'home', awayTeamId: 'away',
    homeScore: 0, awayScore: 0, synced: true, createdByUserId: 'user-123' } as any);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('durable sideline events', () => {
  it.each([0, 2])('preserves a cached server score with %s locally cached goals across create, edit and repeated Undo', async cachedGoals => {
    await db.matches.update('match-1', { homeScore: 5, awayScore: 2 });
    await db.events.bulkAdd(Array.from({ length: cachedGoals }, (_, index) => ({
      ...event, id: `cached-goal-${index}`, createdByUserId: session.userId, synced: true, isDeleted: false,
    } as any)));
    const created = await eventsDataLayer.create(event);
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 6, awayScore: 2, synced: true });
    const own = await eventsDataLayer.create({ ...event, teamId: 'away', kind: 'own_goal' });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 7, awayScore: 2 });
    await eventsDataLayer.update(created.id, { kind: 'own_goal' });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 6, awayScore: 3 });
    await eventsDataLayer.update(created.id, { teamId: 'away', sentiment: 2 });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 7, awayScore: 2 });
    await eventsDataLayer.update(created.id, { sentiment: -1 });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 7, awayScore: 2 });
    await eventsDataLayer.delete(created.id);
    await eventsDataLayer.delete(created.id);
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 6, awayScore: 2 });
    await eventsDataLayer.delete(own.id);
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 5, awayScore: 2, synced: true });
    if (cachedGoals) {
      await eventsDataLayer.update('cached-goal-0', { teamId: 'away' });
      expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 4, awayScore: 3 });
      await eventsDataLayer.delete('cached-goal-0');
      expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 4, awayScore: 2 });
    }
  });

  it.each([false, true])('projects goals, own goals, edits and Undo (guest=%s)', async guest => {
    session.guest = guest;
    const first = await eventsDataLayer.create(event);
    expect(first.syncedAt).toBeUndefined();
    expect((await db.events.get(first.id))?.synced).toBe(false);
    const own = await eventsDataLayer.create({ ...event, kind: 'own_goal' });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 1, awayScore: 1, synced: true });
    await eventsDataLayer.update(first.id, { teamId: 'away', sentiment: 2 });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 0, awayScore: 2 });
    await eventsDataLayer.update(own.id, { kind: 'foul' });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 0, awayScore: 1 });
    await eventsDataLayer.delete(first.id);
    expect(await db.events.get(first.id)).toMatchObject({ isDeleted: true, synced: false, sentiment: 2 });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 0, awayScore: 0, synced: true });
  });

  it('uses the same durable projection and quota path for the legacy guest entry point', async () => {
    session.guest = true;
    const result = await db.addEventToTable({ ...event, sentiment: -2, playerId: null });
    expect(result.success).toBe(true);
    expect(await db.events.get(result.data!)).toMatchObject({ sentiment: -2, createdByUserId: 'guest-test' });
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 1 });
    await db.close();
    await db.open();
    expect(await db.events.get(result.data!)).toMatchObject({ sentiment: -2 });
    await eventsDataLayer.delete(result.data!);
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 0 });
  });

  it('rolls back both event and score if the transaction fails', async () => {
    vi.spyOn(db.matches, 'update').mockRejectedValueOnce(new Error('write failed'));
    await expect(eventsDataLayer.create(event)).rejects.toThrow('write failed');
    expect(await db.events.count()).toBe(0);
    expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 0, awayScore: 0 });
  });

  it.each([[false, true], [false, false], [true, true], [true, false]])(
    'enforces 39/40/41 and scoring exemption (guest=%s online=%s)', async (guest, online) => {
      session.guest = guest;
      Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
      const owner = guest ? 'guest-test' : session.userId;
      await db.events.bulkAdd(Array.from({ length: 39 }, (_, i) => ({
        ...event, id: `quota-${i}`, kind: 'foul', createdByUserId: owner, isDeleted: false, synced: false,
      } as any)));
      const fortieth = await eventsDataLayer.create({ ...event, kind: 'foul' });
      await expect(eventsDataLayer.create({ ...event, kind: 'foul' })).rejects.toThrow('limit reached');
      await eventsDataLayer.create(event);
      await eventsDataLayer.create({ ...event, kind: 'own_goal' });
      expect(await db.matches.get('match-1')).toMatchObject({ homeScore: 1, awayScore: 1 });
      await expect(eventsDataLayer.update((await db.events.filter(e => e.kind === 'goal').first())!.id, { kind: 'foul' }))
        .rejects.toThrow('limit reached');
      await eventsDataLayer.delete(fortieth.id);
      await expect(eventsDataLayer.create({ ...event, kind: 'foul' })).resolves.toBeDefined();
    });

  it('serializes concurrent writes at the event quota boundary', async () => {
    await db.events.bulkAdd(Array.from({ length: 39 }, (_, i) => ({
      ...event, id: `quota-${i}`, kind: 'foul', createdByUserId: session.userId, isDeleted: false, synced: false,
    } as any)));
    const results = await Promise.allSettled([
      eventsDataLayer.create({ ...event, kind: 'foul' }),
      eventsDataLayer.create({ ...event, kind: 'foul' }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.events.filter(e => !e.isDeleted).count()).toBe(40);
  });

  it('counts only this owner and uses cached premium limits while online', async () => {
    await setCachedMeLimits({ limits: { eventsPerMatch: 2, formationChangesPerMatch: 1 }, allowedEventKinds: ['key_pass'] } as any);
    await db.events.add({ ...event, id: 'foreign', kind: 'key_pass', createdByUserId: 'another-user', isDeleted: false } as any);
    await eventsDataLayer.create({ ...event, kind: 'key_pass' });
    await eventsDataLayer.create({ ...event, kind: 'key_pass' });
    await expect(eventsDataLayer.create({ ...event, kind: 'key_pass' })).rejects.toThrow('limit reached');
  });

  it('accepts null players and rejects unsupported kinds and missing teams', async () => {
    const created = await eventsDataLayer.create({ ...event, playerId: 'player-1' });
    await eventsApi.update(created.id, { playerId: null });
    expect((await db.events.get(created.id))?.playerId).toBeUndefined();
    await expect(eventsDataLayer.create({ ...event, kind: 'invalid' })).rejects.toThrow('Invalid event kind');
    await expect(eventsDataLayer.create({ ...event, teamId: '' })).rejects.toThrow('Team ID');
  });

  it('refuses mutations owned by another account', async () => {
    const created = await eventsDataLayer.create(event);
    session.userId = 'another-user';
    await expect(eventsDataLayer.update(created.id, { sentiment: 3 })).rejects.toThrow('another user');
    await expect(eventsDataLayer.delete(created.id)).rejects.toThrow('another user');
    expect((await db.events.get(created.id))?.isDeleted).toBe(false);
  });
});

describe('local lifecycle persistence', () => {
  it('atomically reuses the same active logical period and rejects a different concurrent period', async () => {
    const [first, retry] = await Promise.all([
      matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 }),
      matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1 }),
    ]);
    expect(retry.id).toBe(first.id);
    expect(await db.matchPeriods.count()).toBe(1);
    await expect(matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 2 })).rejects.toThrow('already active');
    await matchPeriodsDataLayer.endPeriod(first.id, first.startedAt + 3600000, 23);
    expect(await db.matchPeriods.get(first.id)).toMatchObject({ durationSeconds: 23 });
    const results = await Promise.allSettled([
      matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 2 }),
      matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 3 }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.matchPeriods.filter(p => !p.isDeleted && p.endedAt == null).count()).toBe(1);
  });

  it('allows next periods, extra time and shootouts after ended periods', async () => {
    for (const periodType of ['REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'] as const) {
      const period = await matchPeriodsDataLayer.create({ matchId: 'match-1', periodNumber: 1, periodType });
      await matchPeriodsDataLayer.endPeriod(period.id, period.startedAt, 0);
    }
    expect(await db.matchPeriods.count()).toBe(3);
  });

  it('preserves omitted currentPeriodId and explicit playing seconds; only explicit clearing removes it', async () => {
    await matchStateDataLayer.upsert('match-1', { status: 'LIVE', currentPeriodId: 'local-id', timerMs: 900000, totalElapsedSeconds: 12 });
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', timerMs: 912000, totalElapsedSeconds: 24 });
    expect(await db.matchState.get('match-1')).toMatchObject({ currentPeriodId: 'local-id', totalElapsedSeconds: 24 });
    await matchStateDataLayer.upsert('match-1', { status: 'LIVE' });
    expect(await db.matchState.get('match-1')).toMatchObject({ currentPeriodId: 'local-id', totalElapsedSeconds: 24 });
    await matchStateDataLayer.upsert('match-1', { status: 'PAUSED', currentPeriodId: undefined });
    expect((await db.matchState.get('match-1'))?.currentPeriodId).toBeUndefined();
    await matchStateDataLayer.upsert('match-1', { status: 'COMPLETED', currentPeriodId: null });
    expect((await db.matchState.get('match-1'))?.currentPeriodId).toBeUndefined();
  });
});


describe('canonical initial match state', () => {
  const payload = { seasonId: 'season', kickoffTime: 1000, homeTeamId: 'home', awayTeamId: 'away' };
  it('retains Scheduled through ACK and failed kickoff, then retries original period after reload', async () => {
    const match = await matchesDataLayer.create(payload);
    await db.matches.update(match.id, { synced: true });
    await db.matchState.update(match.id, { synced: true });
    expect(await db.matchState.get(match.id)).toMatchObject({ status: 'SCHEDULED', createdByUserId: session.userId });
    const period = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1, startedAt: 1000 });
    vi.spyOn(db.matchState, 'put').mockRejectedValueOnce(new Error('state failed'));
    await expect(matchStateDataLayer.upsert(match.id, { status: 'LIVE', currentPeriodId: period.id })).rejects.toThrow('state failed');
    await db.matchPeriods.update(period.id, { synced: true });
    db.close(); await db.open();
    expect(await db.matchState.get(match.id)).toMatchObject({ status: 'SCHEDULED', synced: true });
    const retry = await matchPeriodsDataLayer.create({ matchId: match.id, periodNumber: 1, startedAt: 9000 });
    expect(retry).toMatchObject({ id: period.id, startedAt: 1000 });
    await matchStateDataLayer.upsert(match.id, { status: 'LIVE', currentPeriodId: retry.id });
    expect(await db.matchPeriods.where('matchId').equals(match.id).count()).toBe(1);
  });
  it('rolls back parent and state together if initial state persistence fails', async () => {
    const before = await db.matches.count();
    vi.spyOn(db.matchState, 'add').mockRejectedValueOnce(new Error('initial state failed'));
    await expect(matchesDataLayer.create(payload)).rejects.toThrow('initial state failed');
    expect(await db.matches.count()).toBe(before); expect(await db.matchState.count()).toBe(0);
  });
});


describe('account-root offline quota ownership', () => {
  it.each(['teams', 'seasons'])('excludes guest/foreign/conflicting/deleted %s from current account quota', async kind => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await setCachedMeLimits({ limits: { ownedTeams: 1, seasons: 1 }, allowedEventKinds: ['goal'] } as any);
    const table = kind === 'teams' ? db.teams : db.seasons;
    const rows = [
      { id: 'guest', createdByUserId: 'guest-test' },
      { id: 'foreign', createdByUserId: 'another-account' },
      { id: 'conflict', createdByUserId: session.userId, created_by_user_id: 'another-account' },
      { id: 'deleted', createdByUserId: session.userId, isDeleted: true },
      { id: 'legacy-deleted', createdByUserId: session.userId, is_deleted: true },
      ...(kind === 'teams' ? [{ id: 'opponent', createdByUserId: session.userId, isOpponent: true }] : []),
    ];
    if (kind === 'teams') await db.teams.bulkAdd(rows as any);
    else await db.seasons.bulkAdd(rows as any);
    const create = () => kind === 'teams' ? teamsDataLayer.create({ name: 'My Club' }) : seasonsDataLayer.create({ label: 'My Season' });
    expect(await create()).toMatchObject({ createdByUserId: session.userId });
    await expect(create()).rejects.toThrow('limit reached');
  });
  it.each(['teams', 'seasons'])('rejects %s creation if account changes during quota count', async kind => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    await setCachedMeLimits({ limits: { ownedTeams: 1, seasons: 1 }, allowedEventKinds: ['goal'] } as any);
    const table = kind === 'teams' ? db.teams : db.seasons;
    vi.spyOn(table, 'filter').mockImplementationOnce(() => ({ count: async () => { session.userId = 'new-account'; return 0; } }) as any);
    const create = kind === 'teams' ? teamsDataLayer.create({ name: 'My Club' }) : seasonsDataLayer.create({ label: 'My Season' });
    await expect(create).rejects.toThrow('Account changed'); expect(await table.count()).toBe(0);
  });
});
