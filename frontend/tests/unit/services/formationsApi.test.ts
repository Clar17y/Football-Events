import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
const context = vi.hoisted(() => ({ owner: 'guest-one', quota: Promise.resolve({ ok: true }) }));
vi.mock('../../../src/utils/network', () => ({ getCurrentUserId: () => context.owner }));
vi.mock('../../../src/utils/guest', () => ({ getGuestId: () => context.owner, isGuest: () => true }));
vi.mock('../../../src/services/api/authApi', () => ({ authApi: { isAuthenticated: () => false } }));
vi.mock('../../../src/utils/quotas', () => ({ canChangeFormation: () => context.quota, GUEST_LIMITS: { maxNonScoringEventsPerMatch: 40 } }));
vi.mock('../../../src/db/eventLinking', () => ({ autoLinkEvents: async () => {} }));
import { db } from '../../../src/db/indexedDB';
import formationsApi from '../../../src/services/api/formationsApi';
const formation = { players: [] };
beforeEach(async () => {
  context.owner = 'guest-one'; context.quota = Promise.resolve({ ok: true });
  await db.open(); await Promise.all(db.tables.map(table => table.clear()));
  await db.matches.add({ id: 'm', matchId: 'm', createdByUserId: context.owner, synced: true, homeTeamId: 'home', awayTeamId: 'away' } as any);
  await db.matchState.add({ matchId: 'm', createdByUserId: context.owner, status: 'SCHEDULED', synced: true } as any);
});
afterEach(() => vi.restoreAllMocks());
describe('formation recording boundary', () => {
  it.each(['invalidated', 'owner', 'COMPLETED', 'CANCELLED', 'POSTPONED', 'missing'])('rejects deferred apply after %s change', async change => {
    let resolve!: (value: { ok: boolean }) => void;
    context.quota = new Promise(done => { resolve = done; });
    let current = true;
    const pending = formationsApi.applyChange('m', 12, formation, 'rotation', { isCurrent: () => current, teamId: 'away' });
    const rejected = expect(pending).rejects.toThrow('Match recording context changed');
    if (change === 'invalidated') current = false;
    else if (change === 'owner') context.owner = 'guest-two';
    else if (change === 'missing') await db.matchState.delete('m');
    else await db.matchState.update('m', { status: change as any });
    resolve({ ok: true }); await rejected;
    expect(await db.events.count()).toBe(0);
  });
  it.each(['SCHEDULED', 'LIVE', 'PAUSED'])('records captured match/team/time for %s', async status => {
    await db.matchState.update('m', { status: status as any });
    await formationsApi.applyChange('m', 12, formation, 'rotation', { isCurrent: () => true, teamId: 'away' });
    expect(await db.events.toArray()).toEqual([expect.objectContaining({ matchId: 'm', teamId: 'away', clockMs: 720000, createdByUserId: 'guest-one', kind: 'formation_change' })]);
  });
});
