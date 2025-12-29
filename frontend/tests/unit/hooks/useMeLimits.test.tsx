import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMeLimits } from '../../../src/hooks/useMeLimits';
import { db } from '../../../src/db/indexedDB';
import { ME_LIMITS_SETTINGS_KEY } from '../../../src/services/limitsCache';
import { CORE_EVENT_KINDS } from '@shared/types/limits';

describe('useMeLimits', () => {
  beforeEach(async () => {
    await db.open();
    await db.settings.clear();
  });

  it('returns free defaults when cache is empty', async () => {
    const { result } = renderHook(() => useMeLimits());
    await waitFor(() => {
      expect(result.current.planType).toBe('free');
    });

    expect(result.current.meLimits).toBeNull();
    expect(result.current.allowedEventKinds).toEqual([...CORE_EVENT_KINDS]);
  });

  it('returns cached limits when present', async () => {
    await db.settings.put({
      key: ME_LIMITS_SETTINGS_KEY,
      value: JSON.stringify({
        planType: 'premium',
        limits: {
          ownedTeams: 5,
          playersPerOwnedTeam: 40,
          seasons: null,
          matchesPerSeason: null,
          eventsPerMatch: 150,
          formationChangesPerMatch: 20,
          activeShareLinks: null,
        },
        allowedEventKinds: ['goal', 'assist'],
        features: { analyticsDashboard: true, csvExport: true },
        usage: { ownedTeams: 0, opponentTeams: 0, seasons: 0, activeShareLinks: 0, playersByTeam: {} },
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const { result } = renderHook(() => useMeLimits());

    await waitFor(() => {
      expect(result.current.planType).toBe('premium');
    });

    expect(result.current.allowedEventKinds).toEqual(['goal', 'assist']);
  });
});

