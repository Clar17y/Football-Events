import React from 'react';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../../src/contexts/AuthContext';
import { apiClient } from '../../../src/services/api/baseApi';
import { OFFLINE_IDENTITY_KEY } from '../../../src/services/api/authOfflineIdentity';
import { db } from '../../../src/db/indexedDB';
import { useLocalRecentActivity } from '../../../src/hooks/useLocalRecentActivity';
import { useOwnedDiscovery } from '../../../src/hooks/useOwnedDiscovery';
import { DEFAULT_ACTIVITY_FILTERS, type ActivityItem } from '../../../src/types/activity';

vi.mock('../../../src/services/limitsService', () => ({ fetchAndCacheMeLimits: vi.fn() }));
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
const profile = { id: 'account-a', email: 'a@example.test', role: 'USER', first_name: null,
    last_name: null, email_verified: true, created_at: '2026-01-01', updated_at: '2026-01-01' };
function signIn(cached = true, subject = profile.id) {
    apiClient.setToken(`header.${btoa(JSON.stringify({ userId: subject, exp: Date.now() / 1000 - 60 }))}.signature`, true);
    localStorage.setItem('refresh_token', 'retained');
    if (cached) localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 1, subject: profile.id, profile }));
}
const base = (owner = profile.id) => ({ createdByUserId: owner, createdAt: new Date().toISOString(), isDeleted: false, synced: true });
const team = (id: string, owner = profile.id) => ({ ...base(owner), id, name: id, isOpponent: false });
const match = (id: string, owner = profile.id) => ({ ...base(owner), id, matchId: id, homeTeamId: 'home', awayTeamId: 'away',
    kickoffTime: new Date().toISOString(), durationMinutes: 60, periodFormat: 'half', homeScore: 0, awayScore: 0 });
const period = (id: string, owner: string, parent = 'owned-match', number = 1) => ({ ...base(owner), id, matchId: parent,
    periodNumber: number, periodType: 'REGULAR', endedAt: Date.now(), startedAt: Date.now() - 1000 });
const event = (id: string, owner: string, parent = 'owned-match') => ({ ...base(owner), id, matchId: parent, periodNumber: 1,
    kind: 'goal', teamId: 'home', playerId: 'owned-player', clockMs: 46 * 60000 });
const children = (item: ActivityItem) => item.metadata?.children as Array<{ id: string; timeLabel: string; playerId?: string }>;
async function snapshot() {
    return Promise.all([db.teams, db.players, db.seasons, db.matches, db.playerTeams, db.matchPeriods, db.events, db.defaultLineups, db.matchState].map(table => table.toArray()));
}
beforeEach(async () => {
    apiClient.clearSession(); localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await db.open(); await Promise.all(db.tables.map(table => table.clear()));
    signIn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); apiClient.clearSession(); });

describe('persisted account discovery', () => {
    it('filters every root using raw canonical/snake proof without changing persisted rows', async () => {
        const variants = [
            ['owned', { createdByUserId: profile.id }], ['snake', { createdByUserId: undefined, created_by_user_id: profile.id }],
            ['foreign', { createdByUserId: 'account-b' }], ['guest', { createdByUserId: 'guest-one' }],
            ['missing', { createdByUserId: undefined }], ['conflict', { createdByUserId: profile.id, created_by_user_id: 'account-b' }],
            ['deleted', { isDeleted: true }], ['snake-deleted', { is_deleted: true }]
        ] as const;
        await db.teams.bulkPut([team('home'), team('away')]);
        for (const [suffix, proof] of variants) {
            await db.teams.put({ ...team(`club-${suffix}`), ...proof } as any);
            await db.players.put({ ...base(), id: `player-${suffix}`, name: `Player ${suffix}`, ...proof } as any);
            await db.seasons.put({ ...base(), id: `season-${suffix}`, seasonId: `season-${suffix}`, label: `Season ${suffix}`, ...proof } as any);
            await db.matches.put({ ...match(`fixture-${suffix}`), ...proof } as any);
            await db.defaultLineups.put({ ...base(), id: `lineup-${suffix}`, teamId: 'home', ...proof } as any);
        }
        const before = await snapshot();
        const activity = renderHook(() => useLocalRecentActivity({ limit: 100 }), { wrapper });
        const discovery = renderHook(() => useOwnedDiscovery(), { wrapper });
        await waitFor(() => expect(activity.result.current.loading || discovery.result.current.loading).toBe(false));
        for (const prefix of ['team-club', 'player-player', 'season-season', 'match-fixture', 'lineup-lineup']) {
            expect(activity.result.current.activities.filter(item => item.id.startsWith(prefix)).map(item => item.id).sort())
                .toEqual([`${prefix}-owned`, `${prefix}-snake`].sort());
        }
        expect(discovery.result.current.matches.map(row => row.id).sort()).toEqual(['fixture-owned', 'fixture-snake']);
        expect(discovery.result.current.teams.map(row => row.id).sort()).toEqual(['away', 'club-owned', 'club-snake', 'home']);
        expect(discovery.result.current.ownerId).toBe(profile.id);
        expect(await snapshot()).toEqual(before);
    });

    it('scopes all relationships, event groups, player labels and period counts', async () => {
        await db.teams.bulkPut([team('home'), team('away'), team('Foreign club', 'account-b')]);
        await db.players.bulkPut([{ ...base(), id: 'owned-player', name: 'Owned child' },
            { ...base('account-b'), id: 'foreign-player', name: 'Foreign child' }] as any);
        await db.playerTeams.bulkPut([
            { ...base(), id: 'foreign-link', playerId: 'owned-player', teamId: 'Foreign club', isActive: true },
            { ...base('account-b'), id: 'foreign-relation', playerId: 'owned-player', teamId: 'home', isActive: true }
        ] as any);
        await db.matches.bulkPut([match('owned-match'), match('foreign-match', 'account-b'),
            { ...match('conflict-match'), created_by_user_id: 'account-b' }] as any);
        await db.matchPeriods.bulkPut([
            period('owned-period', profile.id), period('owned-second', profile.id, 'owned-match', 2),
            period('foreign-period', 'account-b', 'owned-match', 3), period('foreign-fourth', 'account-b', 'owned-match', 4),
            period('alias-foreign-parent', 'server', 'foreign-match'), period('alias-conflict-parent', 'server', 'conflict-match'),
            { ...period('conflict-period', profile.id), created_by_user_id: 'account-b' }
        ] as any);
        await db.events.bulkPut([event('owned-goal', profile.id), event('foreign-goal', 'account-b'),
            { ...event('foreign-player-goal', profile.id), playerId: 'foreign-player' },
            { ...event('conflict-event', profile.id), created_by_user_id: 'account-b' },
            { ...event('deleted-event', profile.id), is_deleted: true }, { ...event('missing-event', profile.id), createdByUserId: undefined }
        ] as any);
        await db.defaultLineups.bulkPut([{ ...base(), id: 'owned-lineup', teamId: 'home' },
            { ...base(), id: 'foreign-team-lineup', teamId: 'Foreign club' }] as any);
        const before = await snapshot();
        const { result } = renderHook(() => useLocalRecentActivity({ limit: 100 }), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        const player = result.current.activities.find(row => row.id === 'player-owned-player')!;
        expect(player.title).toBe('New player Owned child looking for a team.');
        expect(player.metadata?.teamId).toBeUndefined();
        const summary = result.current.activities.find(row => row.id === 'period-owned-period')!;
        expect(summary.title).toMatch(/^1st Half highlights: home vs away — 2 moments$/);
        expect(children(summary).map(child => child.id).sort()).toEqual(['foreign-player-goal', 'owned-goal']);
        expect(children(summary)[0].timeLabel).toBe("45'+1");
        expect(children(summary).find(child => child.id === 'foreign-player-goal')?.playerId).toBeUndefined();
        expect(JSON.stringify(result.current.activities)).not.toMatch(/Foreign club|Foreign child|foreign-goal|conflict-event|deleted-event|missing-event/);
        expect(result.current.activities.filter(row => row.type === 'lineup').map(row => row.id)).toEqual(['lineup-owned-lineup']);
        expect(await snapshot()).toEqual(before);
    });

    it.each(['server', 'authenticated-user', 'local-user'])('projects %s recordings only beneath proven owned account parents', async alias => {
        await db.teams.bulkPut([team('home'), team('away')]);
        await db.matches.bulkPut([match('owned-match'), match('foreign-match', 'account-b'),
            { ...match('missing-match'), createdByUserId: undefined },
            { ...match('conflict-match'), created_by_user_id: 'account-b' }] as any);
        await db.matchPeriods.bulkPut([period('alias-period', alias), period('foreign-parent-period', alias, 'foreign-match'),
            period('missing-parent-period', alias, 'missing-match'), period('conflict-parent-period', alias, 'conflict-match') ] as any);
        await db.events.bulkPut([event('alias-event', alias), event('real-foreign', 'account-b'),
            { ...event('ambiguous-alias', alias), created_by_user_id: 'account-b' }] as any);
        const before = await snapshot();
        const { result } = renderHook(() => useLocalRecentActivity(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        const groups = result.current.activities.filter(row => row.type === 'event');
        expect(groups.map(row => row.id)).toEqual(['period-alias-period']);
        expect(children(groups[0]).map(child => child.id)).toEqual(['alias-event']);
        expect(await snapshot()).toEqual(before);
    });

    it('keeps current guest roots/relationships and excludes account legacy aliases', async () => {
        apiClient.clearSession(); localStorage.setItem('guest_id', 'guest-one');
        await db.teams.bulkPut([team('home', 'guest-one'), team('away', 'guest-one'), team('foreign', profile.id)]);
        await db.matches.bulkPut([match('owned-match', 'guest-one'), match('foreign-match') ] as any);
        await db.players.put({ ...base('guest-one'), id: 'owned-player', name: 'Guest child' } as any);
        await db.playerTeams.put({ ...base('guest-one'), id: 'guest-link', playerId: 'owned-player', teamId: 'home', isActive: true } as any);
        await db.matchPeriods.bulkPut([period('guest-period', 'guest-one'), period('alias-period', 'server')] as any);
        await db.events.bulkPut([event('guest-event', 'guest-one'), event('alias-event', 'server'), event('foreign-event', profile.id)] as any);
        const { result } = renderHook(() => useLocalRecentActivity(), { wrapper });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.activities.find(row => row.type === 'player')?.title).toBe('home signs Guest child.');
        expect(result.current.activities.filter(row => row.type === 'event').map(row => row.id)).toEqual(['period-guest-period']);
        expect(children(result.current.activities.find(row => row.type === 'event')!).map(child => child.id)).toEqual(['guest-event']);
    });

    it.each(['absent', 'mismatched'])('has no discovery owner or guest fallback with %s recovery identity', async scenario => {
        apiClient.clearSession(); localStorage.clear(); signIn(scenario !== 'absent', scenario === 'mismatched' ? 'account-b' : profile.id);
        await db.teams.bulkPut([team('account-data'), team('guest-data', 'guest-one')]);
        localStorage.setItem('guest_id', 'guest-one');
        const before = await snapshot();
        const activity = renderHook(() => useLocalRecentActivity(), { wrapper });
        const discovery = renderHook(() => useOwnedDiscovery(), { wrapper });
        expect(discovery.result.current.ownerId).toBeNull();
        expect(discovery.result.current.teams).toEqual([]);
        expect(activity.result.current.activities).toEqual([]);
        await waitFor(() => expect(activity.result.current.loading).toBe(false));
        expect(localStorage.getItem('refresh_token')).toBe('retained');
        expect(await snapshot()).toEqual(before);
    });

    it('preserves filter, order, limit and hasMore semantics for current-owned activity', async () => {
        const recent = Date.now();
        await db.teams.bulkPut([{ ...team('older'), createdAt: new Date(recent - 1000).toISOString() }, team('newer')]);
        await db.players.put({ ...base(), id: 'player', name: 'Hidden' } as any);
        const { result, rerender } = renderHook(({ limit }) => useLocalRecentActivity({ limit, filters: { ...DEFAULT_ACTIVITY_FILTERS, players: false } }), { wrapper, initialProps: { limit: 1 } });
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.activities.map(row => row.id)).toEqual(['team-newer']);
        expect(result.current.hasMore).toBe(true);
        rerender({ limit: 10 });
        await waitFor(() => expect(result.current.activities).toHaveLength(2));
        expect(result.current.activities.map(row => row.id)).toEqual(['team-newer', 'team-older']);
        expect(result.current.hasMore).toBe(false);
    });
});
