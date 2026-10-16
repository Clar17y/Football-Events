import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../src/db/indexedDB';
import { apiClient } from '../../../src/services/api/baseApi';
import { bootstrapOwnedTeams } from '../../../src/services/ownedTeamBootstrap';

const session = vi.hoisted(() => ({ subject: 'a' as string | null, profile: 'a' as string | null, generation: 1 }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => session.subject, getCurrentUserId: () => session.subject || 'guest-one' }));
vi.mock('../../../src/services/api/authApi', () => ({ authApi: {
  getSessionGeneration: () => session.generation,
  getCachedProfile: () => session.profile ? { id: session.profile } : null,
} }));
const team = (id: string, owner = 'a', extra = {}) => ({ id, name: id, createdByUserId: owner, isOpponent: false,
  isDeleted: false, createdAt: '2026-01-01', updatedAt: '2026-01-01', ...extra });
const page = (data: unknown[], number = 1, hasNext = false) => ({ success: true, data: { data, pagination: { page: number, hasNext } } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(async () => {
  session.subject = session.profile = 'a'; session.generation = 1;
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  await db.open(); await db.teams.clear();
});
afterEach(async () => { vi.restoreAllMocks(); await db.teams.clear(); });

describe('owned managed-team bootstrap', () => {
  it('uses actual endpoint pagination and imports only raw proven active managed rows', async () => {
    const request = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(page([
      team('owned'), team('foreign', 'b'), team('conflict', 'a', { created_by_user_id: 'b' }),
      team('deleted', 'a', { is_deleted: true }), team('opponent', 'a', { isOpponent: true }),
      team('snake-opponent', 'a', { is_opponent: true }), team('missing', 'a', { createdByUserId: undefined }),
    ]) as any);
    await bootstrapOwnedTeams('a');
    expect(request).toHaveBeenCalledWith('/teams', new URLSearchParams({ page: '1', limit: '100', includeOpponents: 'false' }));
    expect(await db.teams.toArray()).toEqual([expect.objectContaining({ id: 'owned', createdByUserId: 'a', synced: true })]);
  });

  it('fetches all hasNext pages and normalizes proven snake ownership only after validation', async () => {
    const request = vi.spyOn(apiClient, 'get').mockResolvedValueOnce(page([team('first')], 1, true) as any)
      .mockResolvedValueOnce(page([team('second', 'a', { createdByUserId: undefined, created_by_user_id: 'a' })], 2) as any);
    await bootstrapOwnedTeams('a');
    expect(request).toHaveBeenCalledTimes(2);
    expect((await db.teams.toArray()).map(row => row.id).sort()).toEqual(['first', 'second']);
    expect((await db.teams.get('second'))?.createdByUserId).toBe('a');
  });

  it('preserves unsynced, colliding foreign/deleted and omitted cached teams without purging', async () => {
    const local = [team('pending', 'a', { synced: false }), team('collision', 'b', { synced: true }),
      team('deleted', 'a', { synced: false, isDeleted: true }), team('cached', 'a', { synced: true })];
    await db.teams.bulkPut(local as any);
    vi.spyOn(apiClient, 'get').mockResolvedValue(page([team('pending'), team('collision'), team('deleted')]) as any);
    await bootstrapOwnedTeams('a');
    expect(await db.teams.toArray()).toEqual([...local].sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('does not overwrite a local edit that was saved and ACKed during the fetch', async () => {
    await db.teams.put(team('owned', 'a', { synced: true }) as any);
    const response = deferred<any>(); const request = vi.spyOn(apiClient, 'get').mockReturnValue(response.promise);
    const run = bootstrapOwnedTeams('a');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await db.teams.update('owned', { name: 'Local changed and ACKed', synced: true });
    response.resolve(page([team('owned')])); await run;
    expect((await db.teams.get('owned'))?.name).toBe('Local changed and ACKed');
  });

  it('discards a hanging A response after B becomes current and lets B initialize', async () => {
    const response = deferred<any>(); const request = vi.spyOn(apiClient, 'get').mockReturnValueOnce(response.promise).mockResolvedValueOnce(page([team('b-team', 'b')]) as any);
    const oldRun = bootstrapOwnedTeams('a');
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    session.subject = session.profile = 'b'; session.generation++;
    await bootstrapOwnedTeams('b'); response.resolve(page([team('a-team')])); await oldRun;
    expect((await db.teams.toArray()).map(row => row.id)).toEqual(['b-team']);
  });

  it('rolls back the whole import when caller identity changes after an asynchronous write', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(page([team('first'), team('second')]) as any);
    let current = true; const original = db.teams.put.bind(db.teams);
    vi.spyOn(db.teams, 'put').mockImplementationOnce((...args: Parameters<typeof original>) =>
      original(...args).then(result => { current = false; return result; }));
    await expect(bootstrapOwnedTeams('a', () => current)).rejects.toThrow('session changed');
    expect(await db.teams.count()).toBe(0);
  });

  it.each(['offline', 'guest', 'unknown', 'mismatched'])('does not fetch or write for %s identity', async scenario => {
    const request = vi.spyOn(apiClient, 'get');
    if (scenario === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    if (scenario === 'guest') session.subject = session.profile = null;
    if (scenario === 'unknown') session.profile = null;
    if (scenario === 'mismatched') session.profile = 'b';
    await bootstrapOwnedTeams(scenario === 'guest' ? 'guest-one' : 'a');
    expect(request).not.toHaveBeenCalled(); expect(await db.teams.count()).toBe(0);
  });

  it('fails malformed pagination without applying earlier pages', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(page([team('first')], 1, true) as any)
      .mockResolvedValueOnce(page([team('second')], 1) as any);
    await expect(bootstrapOwnedTeams('a')).rejects.toThrow('Invalid team bootstrap');
    expect(await db.teams.count()).toBe(0);
  });
});
