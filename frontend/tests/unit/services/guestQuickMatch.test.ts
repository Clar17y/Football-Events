import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../src/db/indexedDB';
import { createLocalQuickMatch } from '../../../src/services/guestQuickMatch';
import { useLocalMatchStates } from '../../../src/hooks/useLocalData';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../../src/utils/guest', () => ({ getGuestId: () => 'guest-one' }));

const team = (id: string, name: string, owner = 'guest-one', isOpponent = false, isDeleted = false) => ({
  id, teamId: id, name, createdByUserId: owner, isOpponent, isDeleted,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), synced: false,
});

describe('guest quick match identity', () => {
  beforeEach(async () => {
    await db.open();
    await db.clearAllData();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.clearAllData();
    db.close();
  });

  it('keeps same-named managed and opponent clubs distinct and ignores other owners or deleted opponents', async () => {
    await db.teams.bulkAdd([
      team('our-club', 'United'),
      team('foreign-opponent', 'United', 'another-account', true),
      team('deleted-opponent', 'United', 'guest-one', true, true),
    ] as any[]);
    const { id } = await createLocalQuickMatch({
      myTeamId: 'our-club', opponentName: 'United', isHome: true, periodFormat: 'whole',
    });
    const match = await db.matches.get(id);
    expect(match?.homeTeamId).toBe('our-club');
    expect(match?.awayTeamId).not.toBe('our-club');
    expect(match?.awayTeamId).not.toBe('foreign-opponent');
    expect(match?.awayTeamId).not.toBe('deleted-opponent');
    expect(await db.teams.get(match!.awayTeamId)).toMatchObject({
      name: 'United', createdByUserId: 'guest-one', isOpponent: true, isDeleted: false,
    });
    expect(match?.periodFormat).toBe('whole');
    await db.matches.update(id, { synced: true });
    await db.matchState.update(id, { synced: true });
    db.close(); await db.open();
    expect(await db.matchState.get(id)).toMatchObject({ status: 'SCHEDULED', createdByUserId: 'guest-one', synced: true, timerMs: 0 });
  });

  it('resolves a named managed team only from active managed rows owned by this guest', async () => {
    await db.teams.bulkAdd([
      team('foreign-club', 'United', 'another-account'),
      team('deleted-club', 'United', 'guest-one', false, true),
      team('opponent-club', 'United', 'guest-one', true),
      team('our-club', 'United'),
      team('their-club', 'Riverside', 'guest-one', true),
    ] as any[]);
    const { id } = await createLocalQuickMatch({ myTeamName: ' United ', opponentName: 'Riverside', isHome: false });
    expect(await db.matches.get(id)).toMatchObject({ homeTeamId: 'their-club', awayTeamId: 'our-club' });
    expect(await db.teams.count()).toBe(5);
  });

  it.each([
    ['missing', undefined],
    ['foreign', team('foreign', 'United', 'another-account')],
    ['deleted', team('deleted', 'United', 'guest-one', false, true)],
    ['opponent', team('opponent', 'United', 'guest-one', true)],
  ])('rejects an unavailable selected team (%s) before creating setup records', async (id, row) => {
    if (row) await db.teams.add(row as any);
    await expect(createLocalQuickMatch({ myTeamId: id as string, opponentName: 'Riverside', isHome: true }))
      .rejects.toThrow('Please choose your team again');
    expect(await db.matches.count()).toBe(0);
    expect(await db.seasons.count()).toBe(0);
  });

  it('ignores a deleted guest season and a different account season when choosing setup', async () => {
    const year = new Date().getFullYear();
    const label = `${year}-${year + 1} Season`;
    await db.seasons.bulkAdd([
      { id: 'deleted-season', seasonId: 'deleted-season', label, createdByUserId: 'guest-one', isDeleted: true },
      { id: 'foreign-season', seasonId: 'foreign-season', label, createdByUserId: 'another-account', isDeleted: false },
    ] as any[]);
    await db.teams.add(team('our-club', 'United') as any);
    const { id } = await createLocalQuickMatch({ myTeamId: 'our-club', opponentName: ' ', isHome: true });
    const match = await db.matches.get(id);
    expect(match?.seasonId).not.toBe('deleted-season');
    expect(match?.seasonId).not.toBe('foreign-season');
    expect(await db.seasons.get(match!.seasonId)).toMatchObject({ createdByUserId: 'guest-one', isDeleted: false });
    expect(await db.teams.get(match!.awayTeamId)).toMatchObject({ name: 'Unknown Opponent', isOpponent: true });
  });

  it('rolls back guest parent and initial state together', async () => {
    vi.spyOn(db.matchState, 'add').mockRejectedValueOnce(new Error('state failed'));
    await expect(createLocalQuickMatch({ opponentName: 'United', isHome: true })).rejects.toThrow('state failed');
    expect(await db.matches.count()).toBe(0); expect(await db.matchState.count()).toBe(0);
  });

  it('updates the discovery state reader reactively and excludes deleted state records', async () => {
    await db.matchState.bulkAdd([
      { matchId: 'active-match', status: 'LIVE', isDeleted: false },
      { matchId: 'deleted-match', status: 'LIVE', isDeleted: true },
    ] as any[]);
    const view = renderHook(() => useLocalMatchStates());
    await waitFor(() => expect(view.result.current.matchStates.map(state => state.matchId)).toEqual(['active-match']));
    await act(async () => { await db.matchState.update('active-match', { status: 'PAUSED' }); });
    await waitFor(() => expect(view.result.current.matchStates[0].status).toBe('PAUSED'));
    await act(async () => { await db.matchState.update('active-match', { isDeleted: true }); });
    await waitFor(() => expect(view.result.current.matchStates).toEqual([]));
    view.unmount();
  });
});
