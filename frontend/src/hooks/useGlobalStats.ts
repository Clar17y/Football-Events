/**
 * React hook for global stats with IndexedDB caching (pull-only).
 */

import { useEffect, useState } from 'react';
import { db } from '../db/indexedDB';
import { apiClient } from '../services/api/baseApi';
import { isOnline } from '../utils/network';
import type { GlobalStatsData } from '../types/globalStats';

export interface UseGlobalStatsResult {
  stats: GlobalStatsData | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
}

export const useGlobalStats = (): UseGlobalStatsResult => {
  const [stats, setStats] = useState<GlobalStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchAndCache = async (options: { showLoading: boolean }) => {
    if (!isOnline()) {
      setError('Offline');
      setFromCache(true);
      setLoading(false);
      return;
    }

    try {
      if (options.showLoading) setLoading(true);
      setError(null);

      const response = await apiClient.request<GlobalStatsData>('/stats/global', {
        method: 'GET',
        cache: 'no-store'
      });

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to fetch global stats');
      }

      const data = response.data;
      const degraded = (data as any)?.degraded === true;

      // Don't overwrite existing cache with degraded/zeroed stats.
      if (degraded) {
        const cached = await db.globalStats.get('current');
        if (cached) {
          setStats(cached.data);
          setLastUpdated(cached.lastUpdated);
          setFromCache(true);
          setError('Server degraded; showing cached data');
          return;
        }
      }

      const nextUpdated = Date.now();
      await db.globalStats.put({ id: 'current', data, lastUpdated: nextUpdated });
      setStats(data);
      setLastUpdated(nextUpdated);
      setFromCache(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch global stats');
      setFromCache(true);
    } finally {
      if (options.showLoading) setLoading(false);
    }
  };

  const refresh = async () => {
    await fetchAndCache({ showLoading: stats == null });
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      let hasCached = false;
      try {
        const cached = await db.globalStats.get('current');
        if (cancelled) return;

        if (cached) {
          hasCached = true;
          setStats(cached.data);
          setLastUpdated(cached.lastUpdated);
          setFromCache(true);
          setLoading(false);
        }
      } catch (err) {
        console.warn('[useGlobalStats] Failed to read from cache', err);
        if (cancelled) return;
      } finally {
        if (cancelled) return;
        if (!isOnline()) setLoading(false);
      }

      if (!isOnline()) return;
      await fetchAndCache({ showLoading: !hasCached });
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    stats,
    loading,
    error,
    fromCache,
    lastUpdated,
    refresh
  };
};
