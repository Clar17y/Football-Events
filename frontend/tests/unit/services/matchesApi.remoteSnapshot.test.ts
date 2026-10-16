import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
vi.mock('../../../src/services/api/baseApi', () => ({ default: { get: vi.fn() } }));
import apiClient from '../../../src/services/api/baseApi';
import matchesApi from '../../../src/services/api/matchesApi';
import { db } from '../../../src/db/indexedDB';

beforeEach(async () => {
  vi.resetAllMocks();
  await db.open();
  await Promise.all(db.tables.map(table => table.clear()));
});

describe('authoritative match snapshot reader', () => {
  it('reads the authenticated remote endpoint without caching or changing local-first getMatch', async () => {
    const local = { id: 'm', matchId: 'm', homeTeamId: 'home', awayTeamId: 'away', homeScore: 3, awayScore: 1,
      createdByUserId: 'owner', isDeleted: false, synced: true } as any;
    await db.matches.put(local);
    const remote = { ...local, homeScore: 2 };
    vi.mocked(apiClient.get).mockResolvedValue({ success: true, data: remote });
    expect(await matchesApi.getRemoteMatchSnapshot('m')).toEqual(remote);
    expect(apiClient.get).toHaveBeenCalledExactlyOnceWith('/matches/m');
    expect(await db.matches.get('m')).toEqual(local);
    expect((await matchesApi.getMatch('m')).homeScore).toBe(3);
    expect(apiClient.get).toHaveBeenCalledTimes(1);
  });

  it('propagates failed parent reads without returning a local fallback', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('Offline'));
    await expect(matchesApi.getRemoteMatchSnapshot('m')).rejects.toThrow('Offline');
    expect(await db.matches.count()).toBe(0);
  });
});
