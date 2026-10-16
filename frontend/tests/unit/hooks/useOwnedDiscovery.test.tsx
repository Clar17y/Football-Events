import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../src/db/indexedDB';
import { useOwnedDiscovery, useDiscoveryActor } from '../../../src/hooks/useOwnedDiscovery';
import { useLocalRecentActivity } from '../../../src/hooks/useLocalRecentActivity';

const session = vi.hoisted(() => ({ profile: 'account-a' as string | null, subject: 'account-a' as string | null, generation: 1 }));
vi.mock('../../../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: session.profile ? { id: session.profile } : null, isAuthenticated: !!session.profile }) }));
vi.mock('../../../src/services/api/authApi', () => ({ authApi: { isAuthenticated: () => !!session.subject, getSessionGeneration: () => session.generation } }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => session.subject, getCurrentUserId: () => 'guest-one' }));

// Model retained useLiveQuery values and even a late publication from an old query.
// Dependency cancellation alone would not make these tests pass.
const queries: Array<() => Promise<void>> = [];
vi.mock('dexie-react-hooks', () => ({ useLiveQuery: (query: () => Promise<any>, deps: unknown[]) => {
    const [value, setValue] = React.useState<any>();
    React.useEffect(() => { queries.push(async () => { setValue(await query()); }); }, deps);
    return value;
} }));
async function publish(index: number) { await act(async () => { await queries[index](); }); }
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
const match = (id: string, owner: string) => ({ id, matchId: id, createdByUserId: owner, isDeleted: false, synced: true,
    createdAt: new Date().toISOString(), homeTeamId: 'home', awayTeamId: 'away', kickoffTime: new Date().toISOString() });
beforeEach(async () => {
    session.profile = session.subject = 'account-a'; session.generation = 1; queries.length = 0;
    await db.open(); await Promise.all(db.tables.map(table => table.clear()));
    await db.matches.bulkPut([match('a', 'account-a'), match('b', 'account-b'), match('guest', 'guest-one')] as any);
    await db.teams.bulkPut(['account-a', 'account-b'].map(id => ({ id, name: id, createdByUserId: id, createdAt: new Date().toISOString(), isDeleted: false, synced: true })) as any);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('discovery session transitions', () => {
    it('hides retained discovery rows immediately, rejects old closures and ignores a deferred previous query', async () => {
        const { result, rerender } = renderHook(() => useOwnedDiscovery());
        await publish(0);
        expect(result.current.matches.map(row => row.id)).toEqual(['a']);
        const oldAction = result.current.canAccessMatch;
        const rows = await db.matches.toArray();
        const pending = deferred<typeof rows>();
        vi.spyOn(db.matches, 'toArray').mockReturnValueOnce(pending.promise as any);
        let oldQuery!: Promise<void>;
        act(() => { oldQuery = queries[0](); });
        session.profile = session.subject = 'account-b'; session.generation++;
        rerender();
        expect(result.current.matches).toEqual([]);
        expect(result.current.teams).toEqual([]);
        expect(result.current.loading).toBe(true);
        expect(oldAction('a')).toBe(false);
        await act(async () => { pending.resolve(rows); await oldQuery; });
        expect(result.current.matches).toEqual([]);
        await publish(1);
        expect(result.current.matches.map(row => row.id)).toEqual(['b']);
        expect(result.current.canAccessMatch('b')).toBe(true);
        expect(oldAction('a')).toBe(false);
    });

    it('tags activity results so retained and late old-account activity cannot appear during replacement', async () => {
        const { result, rerender } = renderHook(() => useLocalRecentActivity());
        await publish(0);
        expect(result.current.activities.map(row => row.id).sort()).toEqual(['match-a', 'team-account-a']);
        const oldAction = result.current.isCurrent;
        const original = db.teams.filter.bind(db.teams);
        const entered = deferred<void>(), release = deferred<void>();
        vi.spyOn(db.teams, 'filter').mockImplementationOnce(predicate => {
            const collection = original(predicate);
            const read = collection.toArray.bind(collection);
            collection.toArray = (async () => {
                const rows = await read(); entered.resolve(); await release.promise; return rows;
            }) as typeof collection.toArray;
            return collection;
        });
        let oldQuery!: Promise<void>;
        act(() => { oldQuery = queries[0](); });
        await entered.promise;
        session.profile = session.subject = 'account-b'; session.generation++;
        rerender();
        expect(result.current.activities).toEqual([]);
        expect(result.current.hasMore).toBe(false);
        expect(oldAction()).toBe(false);
        await act(async () => { release.resolve(); await oldQuery; });
        expect(result.current.activities).toEqual([]);
        await publish(1);
        expect(result.current.activities.map(row => row.id).sort()).toEqual(['match-b', 'team-account-b']);
    });

    it('invalidates same-owner previous-session actions and unresolved retained credentials', async () => {
        const { result, rerender } = renderHook(() => useOwnedDiscovery());
        await publish(0);
        const oldAction = result.current.canAccessMatch;
        session.generation++;
        rerender();
        expect(result.current.matches).toEqual([]);
        expect(oldAction('a')).toBe(false);
        await publish(1);
        expect(result.current.canAccessMatch('a')).toBe(true);
        session.profile = null;
        rerender();
        expect(result.current.ownerId).toBeNull();
        expect(result.current.matches).toEqual([]);
        expect(result.current.loading).toBe(false);
        await publish(2);
        expect(result.current.matches).toEqual([]);
    });

    it('checks current token/session at action time even before another render', () => {
        const { result } = renderHook(() => useDiscoveryActor());
        expect(result.current.isCurrent()).toBe(true);
        session.subject = 'account-b'; session.generation++;
        expect(result.current.isCurrent()).toBe(false);
    });
});
