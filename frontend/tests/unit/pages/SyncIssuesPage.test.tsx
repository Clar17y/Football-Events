import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { db } from '../../../src/db/indexedDB';
import { syncService } from '../../../src/services/syncService';

vi.mock('../../../src/components/PageHeader', () => ({
  default: () => <div data-testid="page-header" />,
}));

import SyncIssuesPage from '../../../src/pages/SyncIssuesPage';

describe('SyncIssuesPage', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.open();
    await db.syncFailures.clear();
    await db.teams.clear();
    vi.spyOn(syncService, 'flushOnce').mockResolvedValue({ synced: 0, failed: 0, errors: [] });
  });

  it('shows Retry All / Discard All when there are blocked items', async () => {
    await db.syncFailures.put({
      table: 'teams',
      recordId: 'team-1',
      attemptCount: 1,
      lastAttemptAt: Date.now(),
      nextRetryAt: Date.now(),
      lastStatus: 400,
      lastError: 'invalid payload',
      permanent: true,
      reasonCode: 'INVALID_PAYLOAD',
    } as any);

    render(<SyncIssuesPage />);

    expect(await screen.findByText('Retry All')).toBeInTheDocument();
    expect(screen.getByText('Discard All')).toBeInTheDocument();
    expect(screen.getByText('Export All JSON')).toBeInTheDocument();
  });

  it('Retry All clears permanent failures', async () => {
    await db.syncFailures.put({
      table: 'teams',
      recordId: 'team-1',
      attemptCount: 2,
      lastAttemptAt: Date.now(),
      nextRetryAt: Date.now(),
      lastStatus: 402,
      lastError: 'quota',
      permanent: true,
      reasonCode: 'QUOTA_EXCEEDED',
    } as any);

    render(<SyncIssuesPage />);

    fireEvent.click(await screen.findByText('Retry All'));

    await waitFor(async () => {
      const remaining = (await db.syncFailures.toArray()).filter((r: any) => r.permanent);
      expect(remaining).toHaveLength(0);
    });
  });

  it('Discard All deletes never-synced records locally and clears failures', async () => {
    await db.teams.put({
      id: 'team-1',
      teamId: 'team-1',
      name: 'Local Team',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByUserId: 'user-123',
      isDeleted: false,
      isOpponent: false,
      synced: false,
      // intentionally no syncedAt (never synced)
    } as any);

    await db.syncFailures.put({
      table: 'teams',
      recordId: 'team-1',
      attemptCount: 1,
      lastAttemptAt: Date.now(),
      nextRetryAt: Date.now(),
      lastStatus: 400,
      lastError: 'invalid',
      permanent: true,
      reasonCode: 'INVALID_PAYLOAD',
    } as any);

    render(<SyncIssuesPage />);

    fireEvent.click(await screen.findByText('Discard All'));
    const alert = await screen.findByTestId('ion-alert');
    fireEvent.click(within(alert).getByText('Discard All'));

    await waitFor(async () => {
      const team = await db.teams.get('team-1');
      expect(team).toBeUndefined();
      const failure = await db.syncFailures.get(['teams', 'team-1']);
      expect(failure).toBeUndefined();
    });
  });
});
