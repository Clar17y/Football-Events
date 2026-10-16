import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  match: { findFirst: vi.fn() }, match_state: { findFirst: vi.fn() },
  match_periods: { findMany: vi.fn() }, event: { findMany: vi.fn() }, player: { findMany: vi.fn() },
}));
vi.mock('@prisma/client', () => ({ PrismaClient: vi.fn(() => prisma) }));
import { buildSnapshot } from '../../src/utils/sse';

beforeEach(() => {
  vi.resetAllMocks();
  prisma.match.findFirst.mockResolvedValue({ match_id: 'm', period_format: 'half', duration_mins: 60 });
  prisma.match_periods.findMany.mockResolvedValue([{ id: 'p1', period_number: 1, period_type: 'REGULAR',
    started_at: new Date('2026-10-14T12:00:00Z'), ended_at: null, duration_seconds: null }]);
  prisma.event.findMany.mockResolvedValue([]);
});

describe('spectator snapshot clock anchors', () => {
  it('serializes the latest resume anchor independently of later metadata updates', async () => {
    prisma.match_state.findFirst.mockResolvedValue({ status: 'LIVE', total_elapsed_seconds: 600,
      active_since: new Date('2026-10-14T12:15:00Z'), updated_at: new Date('2026-10-14T12:16:00Z') });
    const payload = JSON.parse(JSON.stringify(await buildSnapshot('m')));
    expect(payload.summary).toMatchObject({ status: 'LIVE', totalElapsedSeconds: 600, activeSince: '2026-10-14T12:15:00.000Z' });
    expect(payload.periods[0].startedAt).toBe('2026-10-14T12:00:00.000Z');
    expect((await buildSnapshot('m')).summary.activeSince).toBe(payload.summary.activeSince);
  });

  it.each(['PAUSED', 'COMPLETED'])('keeps a null playing anchor for %s', async status => {
    prisma.match_state.findFirst.mockResolvedValue({ status, total_elapsed_seconds: 720, active_since: null });
    expect((await buildSnapshot('m')).summary).toMatchObject({ status, totalElapsedSeconds: 720, activeSince: null });
  });

  it('does not invent a playing anchor when the state is absent', async () => {
    prisma.match_state.findFirst.mockResolvedValue(null);
    expect((await buildSnapshot('m')).summary).toMatchObject({ status: 'SCHEDULED', totalElapsedSeconds: 0, activeSince: null });
  });
});
