/**
 * Cache Utility Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cache, CacheKeys, CacheTTL } from '../../src/utils/cache';

describe('Cache Utility', () => {
  beforeEach(() => {
    cache.clear();
  });

  afterEach(() => {
    cache.clear();
  });

  it('should set and get values from cache', () => {
    const key = 'test-key';
    const value = { id: '123', name: 'test' };
    
    cache.set(key, value, 1000);
    const retrieved = cache.get(key);
    
    expect(retrieved).toEqual(value);
  });

  it('should return null for non-existent keys', () => {
    const result = cache.get('non-existent-key');
    expect(result).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    const key = 'expire-test';
    const value = 'test-value';
    
    cache.set(key, value, 50); // 50ms TTL
    
    // Should be available immediately
    expect(cache.get(key)).toBe(value);
    
    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should be expired
    expect(cache.get(key)).toBeNull();
  });

  it('should delete specific keys', () => {
    cache.set('key1', 'value1', 1000);
    cache.set('key2', 'value2', 1000);
    
    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');
    
    cache.delete('key1');
    
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBe('value2');
  });

  it('should clear all entries', () => {
    cache.set('key1', 'value1', 1000);
    cache.set('key2', 'value2', 1000);
    
    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');
    
    cache.clear();
    
    expect(cache.get('key1')).toBeNull();
    expect(cache.get('key2')).toBeNull();
  });

  it('should provide cache statistics', () => {
    cache.set('key1', 'value1', 1000);
    cache.set('key2', 'value2', 1000);
    
    const stats = cache.getStats();
    
    expect(stats.size).toBe(2);
    expect(stats.keys).toContain('key1');
    expect(stats.keys).toContain('key2');
  });

  describe('Cache Key Generators', () => {
    it('should generate consistent match state keys', () => {
      const matchId = '123e4567-e89b-12d3-a456-426614174000';
      const key1 = CacheKeys.matchState(matchId);
      const key2 = CacheKeys.matchState(matchId);
      
      expect(key1).toBe(key2);
      expect(key1).toBe(`match_state:${matchId}`);
    });

    it('should generate consistent match status keys', () => {
      const matchId = '123e4567-e89b-12d3-a456-426614174000';
      const key1 = CacheKeys.matchStatus(matchId);
      const key2 = CacheKeys.matchStatus(matchId);
      
      expect(key1).toBe(key2);
      expect(key1).toBe(`match_status:${matchId}`);
    });

    it('should generate consistent live matches keys', () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const userRole = 'USER';
      const key1 = CacheKeys.liveMatches(userId, userRole);
      const key2 = CacheKeys.liveMatches(userId, userRole);
      
      expect(key1).toBe(key2);
      expect(key1).toBe(`live_matches:${userRole}:${userId}`);
    });

    it('should generate different keys for different users', () => {
      const userId1 = '123e4567-e89b-12d3-a456-426614174000';
      const userId2 = '987fcdeb-51d2-43a1-b456-426614174000';
      const userRole = 'USER';
      
      const key1 = CacheKeys.liveMatches(userId1, userRole);
      const key2 = CacheKeys.liveMatches(userId2, userRole);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Cache TTL Constants', () => {
    it('should have reasonable TTL values', () => {
      expect(CacheTTL.MATCH_STATE).toBe(30 * 1000); // 30 seconds
      expect(CacheTTL.MATCH_STATUS).toBe(60 * 1000); // 1 minute
      expect(CacheTTL.LIVE_MATCHES).toBe(15 * 1000); // 15 seconds
      expect(CacheTTL.USER_TEAMS).toBe(5 * 60 * 1000); // 5 minutes
    });
  });
});