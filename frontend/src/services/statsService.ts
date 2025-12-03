/**
 * Global Stats Service
 * 
 * Implements cached + background refresh strategy for global platform statistics.
 * Shows community activity while maintaining privacy.
 */

import { apiClient } from './api/baseApi';

export interface GlobalStats {
  total_teams: number;
  active_teams: number;
  total_players: number;
  total_matches: number;
  matches_played: number;
  active_matches: number;
  matches_today: number;
  last_updated: string;
}

export interface StatsResult {
  success: boolean;
  data?: GlobalStats;
  error?: string;
  fromCache?: boolean;
}

class StatsService {
  private readonly CACHE_KEY = 'matchmaster-global-stats';
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  
  private isRefreshing = false;

  /**
   * Get global stats with cached + background refresh strategy
   */
  async getGlobalStats(): Promise<StatsResult> {
    try {
      // Try to get cached stats first
      const cached = this.getCachedStats();
      
      if (cached && !this.isCacheStale(cached)) {
        // Cache is fresh, use it and maybe refresh in background
        this.maybeRefreshInBackground(cached);
        console.log('Using fresh cached stats');
        return {
          success: true,
          data: cached,
          fromCache: true
        };
      }

      // No cache or cache is stale, fetch fresh data synchronously
      console.log('Cache is stale or missing, fetching fresh data...');
      return await this.fetchFreshStats();

    } catch (error) {
      console.error('Error getting global stats:', error);
      
      // Try to return cached data as fallback
      const cached = this.getCachedStats();
      if (cached) {
        return {
          success: true,
          data: cached,
          fromCache: true
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch stats'
      };
    }
  }

  /**
   * Get cached stats from localStorage
   */
  private getCachedStats(): GlobalStats | null {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return null;

      const { data, timestamp } = JSON.parse(cached);
      
      // Validate cache structure
      if (!data || !timestamp) return null;
      
      return data as GlobalStats;
    } catch (error) {
      console.warn('Error reading cached stats:', error);
      return null;
    }
  }

  /**
   * Check if cached stats are stale
   */
  private isCacheStale(stats: GlobalStats): boolean {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return true;

      const { timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      return age > this.CACHE_DURATION;
    } catch {
      return true;
    }
  }

  /**
   * Fetch fresh stats from API
   */
  private async fetchFreshStats(): Promise<StatsResult> {
    try {
      console.log('Fetching fresh stats from API...');
      const response = await apiClient.get<GlobalStats>('/stats/global');
      
      if (response.success && response.data) {
        const freshStats = response.data as GlobalStats & { degraded?: boolean };

        // If server indicates degraded mode, prefer cached data if available
        if ((freshStats as any)?.degraded === true) {
          const cached = this.getCachedStats();
          if (cached) {
            return {
              success: true,
              data: cached,
              fromCache: true,
              error: 'Server degraded; showing cached data'
            };
          }
          // No cache; return degraded response without caching
          return {
            success: true,
            data: freshStats,
            fromCache: false
          };
        }

        // Cache the fresh data when not degraded
        this.setCachedStats(freshStats);
        
        // Emit update event
        this.emitStatsUpdate(freshStats);
        
        console.log('Fresh stats loaded successfully:', freshStats);
        
        return {
          success: true,
          data: freshStats,
          fromCache: false
        };
      } else {
        throw new Error(response.message || 'API request failed');
      }
    } catch (error) {
      console.error('Error fetching fresh stats from API:', error);
      
      // Fallback to cached data if available
      const cachedStats = this.getCachedStats();
      if (cachedStats) {
        console.log('Using cached stats as fallback');
        return {
          success: true,
          data: cachedStats,
          fromCache: true,
          error: `Using cached data: ${error instanceof Error ? error.message : 'API unavailable'}`
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load stats',
        fromCache: false
      };
    }
  }

  /**
   * Cache stats in localStorage
   */
  private setCachedStats(stats: GlobalStats): void {
    try {
      const cacheData = {
        data: stats,
        timestamp: Date.now()
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
      console.log('Stats cached successfully');
    } catch (error) {
      console.warn('Error caching stats:', error);
    }
  }

  /**
   * Maybe refresh stats in background if cache is getting old
   */
  private maybeRefreshInBackground(stats: GlobalStats): void {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (!cached) return;

      const { timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      
      // Refresh in background if cache is 80% of max age
      if (age > (this.CACHE_DURATION * 0.8)) {
        this.refreshInBackground();
      }
    } catch (error) {
      console.warn('Error checking cache age:', error);
    }
  }

  /**
   * Refresh stats in background
   */
  private async refreshInBackground(): Promise<void> {
    if (this.isRefreshing) return;
    
    this.isRefreshing = true;
    try {
      console.log('Refreshing global stats in background...');
      const result = await this.fetchFreshStats();
      
      if (result.success && result.data) {
        this.emitStatsUpdate(result.data);
      }
    } catch (error) {
      console.warn('Background refresh failed:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Emit stats update event
   */
  private emitStatsUpdate(stats: GlobalStats): void {
    const event = new CustomEvent('globalStatsUpdated', { detail: stats });
    window.dispatchEvent(event);
  }

  /**
   * Force refresh stats (for manual refresh)
   */
  async forceRefresh(): Promise<StatsResult> {
    console.log('Force refreshing global stats...');
    return await this.fetchFreshStats();
  }

  /**
   * Clear cached stats
   */
  clearCache(): void {
    try {
      localStorage.removeItem(this.CACHE_KEY);
      console.log('Global stats cache cleared');
    } catch (error) {
      console.warn('Error clearing stats cache:', error);
    }
  }

  /**
   * Get cache info for debugging
   */
  getCacheInfo(): { hasCache: boolean; age?: number; isStale?: boolean } {
    const cached = localStorage.getItem(this.CACHE_KEY);
    if (!cached) return { hasCache: false };

    try {
      const { timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      const isStale = age > (this.CACHE_DURATION * 0.8);
      
      return { hasCache: true, age, isStale };
    } catch {
      return { hasCache: false };
    }
  }
}

// Export singleton instance
export const statsService = new StatsService();
