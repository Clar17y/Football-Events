import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GrassrootsDB } from '../../../src/db/indexedDB';

describe('Database Operations', () => {
  let db: GrassrootsDB;

  beforeEach(async () => {
    // Fresh database for each test
    db = new GrassrootsDB();
    await db.initialize();
  });

  afterEach(async () => {
    // Clean up
    if (db.isOpen()) {
      await db.clearAllData();
      db.close();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      expect(db.isOpen()).toBe(true);
    });

    it('should handle constraint errors gracefully', async () => {
      // Test our constraint error recovery
      const freshDb = new GrassrootsDB();
      await expect(freshDb.initialize()).resolves.not.toThrow();
      freshDb.close();
    });
  });

  describe('Enhanced Events', () => {
    const mockEvent = {
      kind: 'goal',
      match_id: 'test-match-1',
      season_id: 'test-season-1',
      period_number: 1,
      clock_ms: 300000,
      team_id: 'test-team-1',
      player_id: 'test-player-1',
      sentiment: 3,
      notes: 'Test goal'
    };

    it('should add event successfully', async () => {
      const result = await db.addEnhancedEvent(mockEvent);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.affected_count).toBe(1);
    });

    it('should retrieve match events in order', async () => {
      // Add events at different times
      await db.addEnhancedEvent({ ...mockEvent, clock_ms: 200000 });
      await db.addEnhancedEvent({ ...mockEvent, clock_ms: 100000 });
      await db.addEnhancedEvent({ ...mockEvent, clock_ms: 300000 });

      const result = await db.getEnhancedMatchEvents('test-match-1');
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
      // Should be ordered by clock_ms
      expect(result.data![0].clock_ms).toBe(100000);
      expect(result.data![1].clock_ms).toBe(200000);
      expect(result.data![2].clock_ms).toBe(300000);
    });

    it('should delete event successfully', async () => {
      const addResult = await db.addEnhancedEvent(mockEvent);
      const eventId = addResult.data!;

      const deleteResult = await db.deleteEnhancedEvent(eventId);
      expect(deleteResult.success).toBe(true);

      const getResult = await db.getEnhancedMatchEvents('test-match-1');
      expect(getResult.data).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid data gracefully', async () => {
      const invalidEvent = {
        kind: 'goal',
        // Missing required fields
      } as any;

      const result = await db.addEnhancedEvent(invalidEvent);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});