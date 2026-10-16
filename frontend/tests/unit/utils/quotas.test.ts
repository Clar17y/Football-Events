import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
const session = vi.hoisted(() => ({ guest: true, owner: 'guest-current' }));
vi.mock('../../../src/utils/guest', () => ({ isGuest: () => session.guest, getGuestId: () => session.owner }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => session.owner, getCurrentUserId: () => session.owner }));
vi.mock('../../../src/db/eventLinking', () => ({ autoLinkEvents: async () => {} }));
import { db } from '../../../src/db/indexedDB';
import { canAddEvent, canChangeFormation } from '../../../src/utils/quotas';

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map(table => table.clear()));
});
afterEach(() => vi.restoreAllMocks());

describe('separate recording allowances', () => {
  it.each([true, false])('does not spend ordinary events on formations (guest=%s)', async guest => {
    session.guest = guest; session.owner = guest ? 'guest-current' : 'user-current';
    const add = (kind: string, owner = session.owner, isDeleted = false) => db.events.add({ id: crypto.randomUUID(),
      matchId: 'match-1', kind, createdByUserId: owner, isDeleted, synced: false } as any);
    await Promise.all(Array.from({ length: 5 }, () => add('formation_change')));
    expect(await canAddEvent('match-1', 'foul')).toMatchObject({ ok: true, remaining: 40 });
    expect(await canAddEvent('match-1', 'formation_change')).toEqual(await canChangeFormation('match-1'));
    expect(await canAddEvent('match-1', 'formation_change')).toMatchObject({ ok: false, remaining: 0 });
    await Promise.all(Array.from({ length: 39 }, () => add('foul')));
    await add('foul', 'other-owner'); await add('foul', session.owner, true);
    await add('goal'); await add('own_goal');
    expect(await canAddEvent('match-1', 'foul')).toMatchObject({ ok: true, remaining: 1 });
    await add('foul');
    expect(await canAddEvent('match-1', 'foul')).toMatchObject({ ok: false, remaining: 0 });
    expect(await canAddEvent('match-1', 'goal')).toMatchObject({ ok: true });
    expect(await canAddEvent('match-1', 'own_goal')).toMatchObject({ ok: true });
  });
});
