import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecentActivity from '../../../src/components/RecentActivity';

let owner = 'account-a';
let latestOptions: any;
const rows = (id: string) => [{ id: `period-${id}`, type: 'event', action: 'period_summary',
    title: `${id} highlights`, entityId: id, createdAt: new Date().toISOString(), metadata: {
        matchId: id, children: [{ id: 'goal', kind: 'goal', title: `${id} goal`, createdAt: new Date().toISOString() }]
    } }];
let previousRowClick: (() => void) | undefined;
vi.mock('../../../src/hooks/useLocalRecentActivity', () => ({ useLocalRecentActivity: (options: any) => {
    latestOptions = options;
    const captured = owner;
    return { activities: rows(owner), loading: false, hasMore: options.limit < 40, sessionKey: owner, isCurrent: () => owner === captured };
} }));
vi.mock('@ionic/react', async () => {
    const actual = await vi.importActual<any>('@ionic/react');
    return { ...actual, IonItem: ({ children, onClick }: any) => {
        if (onClick) previousRowClick = onClick;
        return <div onClick={onClick}>{children}</div>;
    } };
});
beforeEach(() => { owner = 'account-a'; localStorage.clear(); previousRowClick = undefined; });

describe('RecentActivity session UI', () => {
    it('resets expansion/pagination on account replacement and rejects retained row navigation', () => {
        const navigate = vi.fn();
        const view = render(<RecentActivity onNavigate={navigate} />);
        fireEvent.click(screen.getByText('account-a highlights'));
        expect(screen.getByText('account-a goal')).toBeInTheDocument();
        const staleClick = previousRowClick!;
        fireEvent.click(screen.getByText(/Load More/i));
        expect(latestOptions.limit).toBe(40);
        owner = 'account-b'; view.rerender(<RecentActivity onNavigate={navigate} />);
        expect(latestOptions.limit).toBe(20);
        expect(screen.queryByText('account-a highlights')).not.toBeInTheDocument();
        expect(screen.queryByText('account-b goal')).not.toBeInTheDocument();
        act(() => { staleClick(); });
        expect(navigate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('account-b highlights'));
        fireEvent.click(screen.getByText('account-b goal'));
        expect(navigate).toHaveBeenCalledWith('live/account-b');
    });

    it('retains stored filters and updates them from storage events', () => {
        localStorage.setItem('matchmaster_app_settings', JSON.stringify({ activityFilters: { teams: false } }));
        render(<RecentActivity />);
        expect(latestOptions.filters.teams).toBe(false);
        act(() => { window.dispatchEvent(new StorageEvent('storage', {
            key: 'matchmaster_app_settings', newValue: JSON.stringify({ activityFilters: { players: false } })
        })); });
        expect(latestOptions.filters.players).toBe(false);
        expect(latestOptions.filters.teams).toBe(true);
    });
});
