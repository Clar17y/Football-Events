/**
 * React hook for global stats with cached + background refresh
 */

import { useState, useEffect } from 'react';
import { statsService, GlobalStats, StatsResult } from '../services/statsService';

export interface UseGlobalStatsResult {
  stats: GlobalStats | null;
  loading: boolean;
  error: string | null;
  fromCache: boolean;
  refresh: () => Promise<void>;
}

export const useGlobalStats = (): UseGlobalStatsResult => {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const result: StatsResult = await statsService.getGlobalStats();
      
      if (result.success && result.data) {
        setStats(result.data);
        setFromCache(result.fromCache || false);
      } else {
        setError(result.error || 'Failed to load stats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    try {
      setError(null);
      const result = await statsService.forceRefresh();
      
      if (result.success && result.data) {
        setStats(result.data);
        setFromCache(false);
      } else {
        setError(result.error || 'Failed to refresh stats');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    }
  };

  useEffect(() => {
    loadStats();

    // Listen for background updates
    const handleStatsUpdated = (event: CustomEvent<GlobalStats>) => {
      setStats(event.detail);
      setFromCache(false);
    };

    window.addEventListener('globalStatsUpdated', handleStatsUpdated as EventListener);

    return () => {
      window.removeEventListener('globalStatsUpdated', handleStatsUpdated as EventListener);
    };
  }, []);

  return {
    stats,
    loading,
    error,
    fromCache,
    refresh
  };
};