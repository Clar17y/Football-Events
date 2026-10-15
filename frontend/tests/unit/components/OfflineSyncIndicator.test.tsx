import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OfflineSyncIndicator from '../../../src/components/OfflineSyncIndicator';

const mocks = vi.hoisted(() => ({
  authenticated: true,
  getPendingCounts: vi.fn(),
}));

vi.mock('../../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: mocks.authenticated }),
}));
vi.mock('../../../src/services/syncService', () => ({
  syncService: { getPendingCounts: mocks.getPendingCounts },
}));

const progress = { total: 0, eligible: 0, blocked: 0, synced: 0 };

describe('OfflineSyncIndicator', () => {
  beforeEach(() => {
    mocks.authenticated = true;
    mocks.getPendingCounts.mockReset();
    mocks.getPendingCounts.mockResolvedValue(progress);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('labels guest recordings as device-only and never claims cloud sync', () => {
    mocks.authenticated = false;
    render(<OfflineSyncIndicator />);
    expect(screen.getByText('On this device')).toBeInTheDocument();
    expect(screen.queryByText('All synced')).not.toBeInTheDocument();
    expect(mocks.getPendingCounts).not.toHaveBeenCalled();
  });

  it('waits for sync evidence before showing all synced', async () => {
    let resolve!: (value: typeof progress) => void;
    mocks.getPendingCounts.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<OfflineSyncIndicator />);
    expect(screen.getByText('Checking sync')).toBeInTheDocument();
    expect(screen.queryByText('All synced')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.getPendingCounts).toHaveBeenCalled());
    await act(async () => { resolve(progress); });
    expect(await screen.findByText('All synced')).toBeInTheDocument();
  });

  it('does not turn a failed status check into a successful sync', async () => {
    mocks.getPendingCounts.mockRejectedValue(new Error('Storage unavailable'));
    render(<OfflineSyncIndicator />);
    expect(await screen.findByText('Sync status unavailable')).toBeInTheDocument();
    expect(screen.queryByText('All synced')).not.toBeInTheDocument();
  });

  it('ignores a status request that completes after signing out', async () => {
    let resolve!: (value: typeof progress) => void;
    mocks.getPendingCounts.mockReturnValue(new Promise(r => { resolve = r; }));
    const { rerender } = render(<OfflineSyncIndicator />);
    await waitFor(() => expect(mocks.getPendingCounts).toHaveBeenCalled());
    mocks.authenticated = false;
    rerender(<OfflineSyncIndicator />);
    await act(async () => { resolve(progress); });
    expect(screen.getByText('On this device')).toBeInTheDocument();
    expect(screen.queryByText('All synced')).not.toBeInTheDocument();
  });

  it('shows pending authenticated changes and tracks going offline', async () => {
    mocks.getPendingCounts.mockResolvedValue({ ...progress, total: 2, eligible: 2 });
    render(<OfflineSyncIndicator />);
    expect(await screen.findByText('Syncing 2')).toBeInTheDocument();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});
