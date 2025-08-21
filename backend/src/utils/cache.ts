/**
 * Simple in-memory cache utility for frequently accessed data
 * This can be easily replaced with Redis or other caching solutions
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class InMemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Set a value in the cache with TTL
   */
  set<T>(key: string, value: T, ttlMs: number = 5 * 60 * 1000): void {
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredKeys.push(key);
      }
    }

    expiredKeys.forEach(key => this.cache.delete(key));
  }

  /**
   * Destroy the cache and cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Create a singleton cache instance
export const cache = new InMemoryCache();

// Cache key generators for consistent naming
export const CacheKeys = {
  matchState: (matchId: string) => `match_state:${matchId}`,
  matchStatus: (matchId: string) => `match_status:${matchId}`,
  liveMatches: (userId: string, userRole: string) => `live_matches:${userRole}:${userId}`,
  userTeams: (userId: string) => `user_teams:${userId}`
};

// Cache TTL constants (in milliseconds)
export const CacheTTL = {
  MATCH_STATE: 30 * 1000,      // 30 seconds for live match states
  MATCH_STATUS: 60 * 1000,     // 1 minute for match status
  LIVE_MATCHES: 15 * 1000,     // 15 seconds for live matches list
  USER_TEAMS: 5 * 60 * 1000    // 5 minutes for user teams
};