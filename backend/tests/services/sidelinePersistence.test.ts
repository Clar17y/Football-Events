import { beforeEach, describe, expect, it, vi } from 'vitest';

const records = vi.hoisted(() => ({ periods: [] as any[], state: null as any }));
const prisma = vi.hoisted(() => ({
  match: { findFirst: vi.fn() },
  match_periods: { upsert: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), update: vi.fn(), create: vi.fn() },
  match_state: { findFirst: vi.fn(), upsert: vi.fn(), create: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(function () { return prisma; }) }));
vi.mock('../../src/utils/prismaErrorHandler', () => ({ withPrismaErrorHandling: async (fn: any) => fn() }));
vi.mock('../../src/utils/sse', () => ({ sseHub: { broadcast: vi.fn() } }));
vi.mock('../../src/utils/cache', () => ({ cache: { delete: vi.fn(), get: vi.fn(), set: vi.fn() }, CacheKeys: { matchState: () => 'state', matchStatus: () => 'status', liveMatches: () => 'live' }, CacheTTL: {} }));
vi.mock('../../src/services/ScoreService', () => ({ ScoreService: { recomputeAndPersistScore: vi.fn() } }));
import { MatchPeriodsService } from '../../src/services/MatchPeriodsService';
import { MatchStateService } from '../../src/services/MatchStateService';
import { matchStateReplaySchema, matchPauseSchema, matchResumeSchema, matchCompleteSchema, periodImportSchema, matchCreateSchema, matchUpdateSchema } from '../../src/validation/schemas';

let periods: MatchPeriodsService, states: MatchStateService;
const matchId = 'match-1', userId = 'user-1';
const startedAt = '2026-10-14T12:00:00.000Z';
const endedAt = '2026-10-14T14:00:00.000Z';
const snapshot = { periodNumber: 1, periodType: 'REGULAR' as const, startedAt };

beforeEach(() => {
  vi.resetAllMocks();
  records.periods = [];
  records.state = null;
  prisma.$transaction.mockImplementation(async fn => fn(prisma));
  prisma.match.findFirst.mockResolvedValue({ created_by_user_id: userId });
  prisma.match_periods.upsert.mockImplementation(async ({ where, create, update }) => {
    const key = where.match_id_period_number_period_type;
    const existing = records.periods.find(p => p.match_id === key.match_id && p.period_number === key.period_number && p.period_type === key.period_type);
    if (existing) { Object.assign(existing, update); return existing; }
    const row = { id: `remote-${records.periods.length + 1}`, created_at: new Date(), is_deleted: false, ...create };
    records.periods.push(row);
    return row;
  });
  prisma.match_periods.findMany.mockImplementation(async ({ where }) => records.periods.filter(p =>
    p.match_id === where.match_id && !p.is_deleted && (!where.ended_at || p.ended_at != null)));
  prisma.match_periods.findFirst.mockImplementation(async () => records.periods.find(p => !p.ended_at && !p.is_deleted) ?? null);
  prisma.match_periods.count.mockImplementation(async () => records.periods.length);
  prisma.match_periods.update.mockImplementation(async ({ where, data }) => {
    const row = records.periods.find(p => p.id === where.id);
    Object.assign(row, data); return row;
  });
  prisma.match_state.findFirst.mockImplementation(async () => records.state);
  prisma.match_state.upsert.mockImplementation(async ({ create, update }) => {
    records.state = records.state ? { ...records.state, ...update } : { id: 'state-1', created_at: new Date(), ...create };
    return records.state;
  });
  prisma.match_state.update.mockImplementation(async ({ data }) => {
    records.state = { ...records.state, ...data }; return records.state;
  });
  periods = new MatchPeriodsService();
  states = new MatchStateService();
});

describe('logical period import', () => {
  it('uses one logical database key for open import, retry and explicit end without duplicating kickoff', async () => {
    const first = await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    const retry = await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    const ended = await periods.importPeriod(matchId, { ...snapshot, endedAt, durationSeconds: 17 }, userId, 'ADMIN');
    expect(retry.id).toBe(first.id);
    expect(ended.id).toBe(first.id);
    expect(ended.durationSeconds).toBe(17);
    expect(records.periods).toHaveLength(1);
    expect(prisma.match_periods.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: {
      match_id_period_number_period_type: { match_id: matchId, period_number: 1, period_type: 'REGULAR' },
    } }));
    await states.reconcileState(matchId, userId, 'ADMIN', { status: 'PAUSED', totalElapsedSeconds: 17 });
    expect(prisma.match_periods.create).not.toHaveBeenCalled();
  });

  it('does not reopen an ended period when a delayed open request arrives', async () => {
    await periods.importPeriod(matchId, { ...snapshot, endedAt, durationSeconds: 17 }, userId, 'ADMIN');
    const result = await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    expect(result.durationSeconds).toBe(17);
    expect(result.endedAt).toBe(endedAt);
    expect(records.periods).toHaveLength(1);
  });

  it('restores the same logical key from a tombstone instead of violating uniqueness', async () => {
    await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    records.periods[0].is_deleted = true;
    records.periods[0].deleted_by_user_id = userId;
    await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    expect(records.periods).toHaveLength(1);
    expect(records.periods[0]).toMatchObject({ is_deleted: false, deleted_by_user_id: null });
  });

  it('supports a zero-duration period and keeps elapsed fallback for older callers', async () => {
    const result = await periods.importPeriod(matchId, { ...snapshot, endedAt: startedAt, durationSeconds: 0 }, userId, 'ADMIN');
    expect(result.durationSeconds).toBe(0);
    const fallback = await periods.importPeriod(matchId, { ...snapshot, periodNumber: 2, endedAt }, userId, 'ADMIN');
    expect(fallback.durationSeconds).toBe(7200);
    await expect(periods.importPeriod(matchId, { ...snapshot, endedAt: '2026-10-14T11:59:59Z' }, userId, 'ADMIN')).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('idempotent lifecycle reconciliation', () => {
  it.each(['SCHEDULED', 'LIVE', 'PAUSED', 'COMPLETED'] as const)('preserves POSTPONED against stale %s replay', async status => {
    records.state = { id: 'postponed', match_id: matchId, status: 'POSTPONED', total_elapsed_seconds: 18,
      current_period: 2, current_period_type: 'REGULAR', is_deleted: false, active_since: null };
    const before = { ...records.state };
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status, totalElapsedSeconds: 0 }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(records.state).toEqual(before);
    expect(prisma.match_state.upsert).not.toHaveBeenCalled();
    expect(prisma.match_periods.upsert).not.toHaveBeenCalled();
  });
  it('rejects LIVE with an ended selected period or no active period, preserving the paused break', async () => {
    await periods.importPeriod(matchId, { ...snapshot, endedAt, durationSeconds: 8 }, userId, 'ADMIN');
    await states.reconcileState(matchId, userId, 'ADMIN', { status: 'PAUSED', totalElapsedSeconds: 8,
      currentPeriod: null, currentPeriodType: null });
    const before = { ...records.state };
    for (const current of [{ currentPeriod: 1, currentPeriodType: 'REGULAR' as const }, {}]) {
      await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'LIVE', totalElapsedSeconds: 8, ...current }))
        .rejects.toMatchObject({ statusCode: 409, message: 'LIVE requires an active imported period' });
      expect(records.state).toEqual(before);
    }
    await periods.importPeriod(matchId, { ...snapshot, periodNumber: 2 }, userId, 'ADMIN');
    const paused = await states.reconcileState(matchId, userId, 'ADMIN', { status: 'PAUSED', totalElapsedSeconds: 8,
      currentPeriod: 2, currentPeriodType: 'REGULAR' });
    expect(paused).toMatchObject({ status: 'PAUSED', activeSince: null });
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'LIVE', totalElapsedSeconds: 8,
      currentPeriod: 1, currentPeriodType: 'REGULAR' })).rejects.toMatchObject({ statusCode: 409 });
    expect(await states.reconcileState(matchId, userId, 'ADMIN', { status: 'LIVE', totalElapsedSeconds: 8,
      currentPeriod: 2, currentPeriodType: 'REGULAR', activeSince: endedAt })).toMatchObject({ status: 'LIVE', activeSince: new Date(endedAt) });
  });

  it('replays offline kickoff, pause, resume, end and complete while preserving playing time', async () => {
    await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    const current = { currentPeriod: 1, currentPeriodType: 'REGULAR' as const };
    const first = await states.reconcileState(matchId, userId, 'ADMIN', {
      status: 'PAUSED', totalElapsedSeconds: 10, matchStartedAt: startedAt, ...current,
    });
    expect(first.createdByUserId).toBe(userId);
    expect(first).toMatchObject({ activeSince: null });
    const retry = await states.reconcileState(matchId, userId, 'ADMIN', { status: 'PAUSED', totalElapsedSeconds: 10, ...current });
    expect(retry.id).toBe(first.id);
    expect(records.state.active_since).toBeNull();
    const live = await states.reconcileState(matchId, userId, 'ADMIN', { status: 'LIVE', totalElapsedSeconds: 10, activeSince: endedAt, ...current });
    expect(live).toMatchObject({ activeSince: new Date(endedAt) });
    expect(JSON.parse(JSON.stringify(live)).activeSince).toBe(endedAt);
    expect(records.state).toMatchObject({ total_elapsed_seconds: 10, active_since: new Date(endedAt) });
    await periods.importPeriod(matchId, { ...snapshot, endedAt, durationSeconds: 13 }, userId, 'ADMIN');
    const periodBreak = await states.reconcileState(matchId, userId, 'ADMIN', {
      status: 'PAUSED', totalElapsedSeconds: 13, currentPeriod: null, currentPeriodType: null,
    });
    expect(periodBreak).toMatchObject({ status: 'PAUSED', activeSince: null });
    const complete = { status: 'COMPLETED' as const, totalElapsedSeconds: 13, matchEndedAt: endedAt };
    const completed = await states.reconcileState(matchId, userId, 'ADMIN', complete);
    expect(completed).toMatchObject({ activeSince: null });
    await states.reconcileState(matchId, userId, 'ADMIN', complete);
    expect(records.state).toMatchObject({ status: 'COMPLETED', total_elapsed_seconds: 13, active_since: null, match_ended_at: new Date(endedAt) });
    expect(records.periods).toHaveLength(1);
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'LIVE', totalElapsedSeconds: 13 })).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each(['LIVE', 'PAUSED'] as const)('refuses a stale SCHEDULED replay over a %s match without changing it', async status => {
    await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    const current = { currentPeriod: 1, currentPeriodType: 'REGULAR' as const };
    await states.reconcileState(matchId, userId, 'ADMIN', { status, totalElapsedSeconds: 30, activeSince: startedAt, ...current });
    const before = { ...records.state };
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'SCHEDULED', totalElapsedSeconds: 0 }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(records.state).toEqual(before);
  });

  it('acknowledges a repeated completion without overwriting the saved result', async () => {
    await periods.importPeriod(matchId, { ...snapshot, endedAt, durationSeconds: 13 }, userId, 'ADMIN');
    await states.reconcileState(matchId, userId, 'ADMIN', { status: 'COMPLETED', totalElapsedSeconds: 13, matchEndedAt: endedAt });
    const retry = await states.reconcileState(matchId, userId, 'ADMIN', {
      status: 'COMPLETED', totalElapsedSeconds: 99, matchEndedAt: '2026-10-14T15:00:00.000Z',
    });
    expect(retry).toMatchObject({ status: 'COMPLETED', totalElapsedSeconds: 13 });
    expect(records.state).toMatchObject({ total_elapsed_seconds: 13, match_ended_at: new Date(endedAt) });
  });

  it('accepts an entire completed offline match without artificial start or initial period creation', async () => {
    for (const [periodNumber, periodType, durationSeconds] of [[1, 'REGULAR', 10], [2, 'REGULAR', 5], [1, 'EXTRA_TIME', 2], [1, 'PENALTY_SHOOTOUT', 0]] as const) {
      await periods.importPeriod(matchId, { periodNumber, periodType, startedAt, endedAt, durationSeconds }, userId, 'ADMIN');
    }
    const result = await states.reconcileState(matchId, userId, 'ADMIN', { status: 'COMPLETED', totalElapsedSeconds: 17, matchStartedAt: startedAt, matchEndedAt: endedAt });
    expect(result.status).toBe('COMPLETED');
    expect(result.totalElapsedSeconds).toBe(17);
    expect(records.periods).toHaveLength(4);
    expect(prisma.match_periods.create).not.toHaveBeenCalled();
  });

  it('requires imported periods and a coherent current logical key before acknowledging replay', async () => {
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'PAUSED', totalElapsedSeconds: 0 })).rejects.toMatchObject({ statusCode: 409 });
    await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'LIVE', totalElapsedSeconds: 0, currentPeriod: 2, currentPeriodType: 'REGULAR' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'COMPLETED', totalElapsedSeconds: 0 })).rejects.toMatchObject({ statusCode: 409 });
    expect(records.state).toBeNull();
  });

  it('refuses unauthorized replay and propagates storage failures', async () => {
    prisma.match.findFirst.mockResolvedValue(null);
    await expect(states.reconcileState(matchId, userId, 'USER', { status: 'PAUSED', totalElapsedSeconds: 0 })).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.match_state.upsert).not.toHaveBeenCalled();
    prisma.$transaction.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(states.reconcileState(matchId, userId, 'ADMIN', { status: 'SCHEDULED', totalElapsedSeconds: 0 })).rejects.toThrow('database unavailable');
  });

  it('passes explicit playing time through existing pause/resume/complete calls', async () => {
    await periods.importPeriod(matchId, snapshot, userId, 'ADMIN');
    await states.reconcileState(matchId, userId, 'ADMIN', { status: 'LIVE', totalElapsedSeconds: 8, activeSince: startedAt });
    const paused = await states.pauseMatch(matchId, userId, 'ADMIN', { totalElapsedSeconds: 9 });
    expect(paused.totalElapsedSeconds).toBe(9);
    expect(paused).toMatchObject({ activeSince: null });
    expect(records.state.active_since).toBeNull();
    const resumed = await states.resumeMatch(matchId, userId, 'ADMIN', { totalElapsedSeconds: 9 });
    expect(resumed.totalElapsedSeconds).toBe(9);
    const complete = await states.completeMatch(matchId, userId, 'ADMIN', { totalElapsedSeconds: 12 });
    expect(complete.totalElapsedSeconds).toBe(12);
    expect(complete).toMatchObject({ activeSince: null });
    expect(records.periods[0].duration_seconds).toBe(12);
  });

  it('validates replay and elapsed options without treating planned offsets as playing seconds', () => {
    expect(matchStateReplaySchema.parse({ status: 'PAUSED', totalElapsedSeconds: 0 })).toMatchObject({ totalElapsedSeconds: 0 });
    for (const schema of [matchPauseSchema, matchResumeSchema, matchCompleteSchema]) {
      expect(schema.parse({ totalElapsedSeconds: 12 })).toMatchObject({ totalElapsedSeconds: 12 });
      expect(schema.safeParse({ totalElapsedSeconds: -1 }).success).toBe(false);
    }
    expect(periodImportSchema.parse({ ...snapshot, endedAt, durationSeconds: 0 })).toMatchObject({ durationSeconds: 0 });
    expect(periodImportSchema.parse({ ...snapshot, endedAt, durationSeconds: 7201 })).toMatchObject({ durationSeconds: 7201 });
  });
});

describe('match format validation compatibility', () => {
  it.each(['whole', 'third'] as const)('accepts %s in normal match creation and updates', periodFormat => {
    const create = { seasonId: '11111111-1111-4111-8111-111111111111',
      homeTeamId: '22222222-2222-4222-8222-222222222222', awayTeamId: '33333333-3333-4333-8333-333333333333',
      kickoffTime: startedAt, periodFormat };
    expect(matchCreateSchema.parse(create).periodFormat).toBe(periodFormat);
    expect(matchUpdateSchema.parse({ periodFormat }).periodFormat).toBe(periodFormat);
    expect(matchCreateSchema.safeParse({ ...create, periodFormat: 'unsupported' }).success).toBe(false);
  });
});
