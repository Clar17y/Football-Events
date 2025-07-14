/**
 * Global Stats Service
 * 
 * Implements cached + background refresh strategy for global platform statistics.
 * Shows community activity while maintaining privacy.
 */

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
  private readonly API_URL = 'http://localhost:3001/api/v1/stats/global';
  
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
        return {
          success: true,
          data: cached,
          fromCache: true
        };
      }

      // Cache is stale or missing, fetch fresh data
      if (cached && this.isCacheStale(cached)) {
        // Return stale cache immediately, refresh in background
        this.refreshInBackground();
        return {
          success: true,
          data: cached,
          fromCache: true
        };
      }

      // No cache, fetch fresh data synchronously
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
    const cacheAge = Date.now() - new Date(stats.last_updated).getTime();
    return cacheAge > this.CACHE_DURATION;
  }

  /**
   * Fetch fresh stats from API
   */
  private async fetchFreshStats(): Promise<StatsResult> {
    try {
      const response = await fetch(this.API_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: GlobalStats = await response.json();
      
      // Cache the fresh data
      this.cacheStats(data);
      
      // Emit update event
      this.emitStatsUpdated(data);

      return {
        success: true,
        data,
        fromCache: false
      };
    } catch (error) {
      console.error('Error fetching fresh stats:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  /**
   * Maybe refresh stats in background if cache is getting old
   */
  private maybeRefreshInBackground(stats: GlobalStats): void {
    const cacheAge = Date.now() - new Date(stats.last_updated).getTime();
    const shouldRefresh = cacheAge > (this.CACHE_DURATION * 0.8); // Refresh when 80% stale
    
    if (shouldRefresh && !this.isRefreshing) {
      this.refreshInBackground();
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
      
      if (result.success) {
        console.log('Global stats refreshed successfully');
      }
    } catch (error) {
      console.warn('Background stats refresh failed:', error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Cache stats to localStorage
   */
  private cacheStats(stats: GlobalStats): void {
    try {
      const cacheData = {
        data: stats,
        timestamp: Date.now()
      };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Error caching stats:', error);
    }
  }

  /**
   * Emit stats updated event for reactive components
   */
  private emitStatsUpdated(stats: GlobalStats): void {
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