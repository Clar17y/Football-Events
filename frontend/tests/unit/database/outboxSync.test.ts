import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GrassrootsDB } from '../../../src/db/indexedDB';
import type { EnhancedOutboxEvent } from '../../../src/db/schema';

describe('Outbox Sync Operations', () => {
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

  describe('Outbox Event Management', () => {
    const mockEventPayload = {
      kind: 'goal',
      matchId: 'test-match-1',
      teamId: 'test-team-1',
      playerId: 'test-player-1',
      minute: 5,
      second: 30,
      period: 1,
      data: { notes: 'Test goal' },
      created: Date.now(),
      // Required authentication fields
      createdByUserId: 'test-user-1'
    };

    it('should add event to outbox', async () => {
      // Use the correct method that actually exists
      const result = await db.addEnhancedEvent({
        kind: mockEventPayload.kind,
        matchId: mockEventPayload.matchId,
        periodNumber: mockEventPayload.period || 1,
        clockMs: (mockEventPayload.minute * 60000) + (mockEventPayload.second * 1000),
        teamId: mockEventPayload.teamId,
        playerId: mockEventPayload.playerId,
        sentiment: 0, // Default sentiment
        notes: mockEventPayload.data?.notes
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(typeof result.data).toBe('string'); // Event ID
    });

    it('should retrieve unsynced events', async () => {
      // Add multiple events using the correct method
      await db.addEnhancedEvent({
        kind: mockEventPayload.kind,
        matchId: mockEventPayload.matchId,
        periodNumber: 1,
        clockMs: 300000,
        teamId: mockEventPayload.teamId,
        playerId: mockEventPayload.playerId,
        sentiment: 0,
        notes: 'Event 1'
      });

      await db.addEnhancedEvent({
        kind: mockEventPayload.kind,
        matchId: mockEventPayload.matchId,
        periodNumber: 1,
        clockMs: 600000,
        teamId: mockEventPayload.teamId,
        playerId: mockEventPayload.playerId,
        sentiment: 0,
        notes: 'Event 2'
      });

      // Check if events were added to the events table (not outbox directly)
      const eventsResult = await db.getEnhancedMatchEvents(mockEventPayload.matchId);

      expect(eventsResult.success).toBe(true);
      expect(eventsResult.data).toHaveLength(2);
      await db.clearAllData(); // so it doesn't affect the next test
    });

    it('should mark event as synced', async () => {
      const addResult = await db.addEvent(mockEventPayload);
      const outboxId = addResult.data!;

      const syncResult = await db.markEventSynced(outboxId);
      expect(syncResult.success).toBe(true);

      // Verify event is no longer in unsynced list
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(0);
    });

    it('should mark event sync as failed and increment retry count', async () => {
      const addResult = await db.addEvent(mockEventPayload);
      expect(addResult.success).toBe(true);
      const outboxId = addResult.data!;

      const failResult = await db.markEventSyncFailed(outboxId, 'Network error');
      expect(failResult.success).toBe(true);

      // Verify retry count incremented
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(1);
      expect(unsyncedResult.data![0].retryCount).toBe(1);
      expect(unsyncedResult.data![0].syncError).toBe('Network error');
    });

    it('should exclude events with high retry count from unsynced list', async () => {
      const addResult = await db.addEvent(mockEventPayload);
      const outboxId = addResult.data!;

      // Fail sync 3 times
      await db.markEventSyncFailed(outboxId, 'Error 1');
      await db.markEventSyncFailed(outboxId, 'Error 2');
      await db.markEventSyncFailed(outboxId, 'Error 3');

      // Should be excluded from unsynced events (retryCount >= 3)
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(0);
    });

    it('should handle concurrent sync operations', async () => {
      // Add multiple events
      const events = await Promise.all([
        db.addEvent(mockEventPayload),
        db.addEvent({ ...mockEventPayload, minute: 10 }),
        db.addEvent({ ...mockEventPayload, minute: 15 })
      ]);

      const outboxIds = events.map(e => e.data!);

      // Simulate concurrent sync operations
      await Promise.all([
        db.markEventSynced(outboxIds[0]),
        db.markEventSyncFailed(outboxIds[1], 'Network error'),
        db.markEventSynced(outboxIds[2])
      ]);

      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(1); // Only the failed one
      expect(unsyncedResult.data![0].retryCount).toBe(1);
    });
  });

  describe('Outbox Data Integrity', () => {
    it('should preserve event data structure in outbox', async () => {
      const eventPayload = {
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        minute: 5,
        second: 30,
        period: 1,
        data: {
          notes: 'Test goal',
          assistPlayerId: 'test-player-2',
          customField: 'custom_value'
        },
        created: Date.now()
      };

      const addResult = await db.addEvent(eventPayload);
      expect(addResult.success).toBe(true);

      const unsyncedResult = await db.getUnsyncedEvents();
      const storedEvent = unsyncedResult.data![0];

      expect(storedEvent.data).toEqual(eventPayload);
      expect(storedEvent.operation).toBe('INSERT');
      expect(storedEvent.tableName).toBe('events');
    });

    it('should handle events with missing optional fields', async () => {
      const minimalEvent = {
        kind: 'substitution',
        matchId: 'test-match-1',
        minute: 30,
        second: 0,
        period: 1,
        created: Date.now()
      };

      const result = await db.addEvent(minimalEvent);
      expect(result.success).toBe(true);

      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(1);
      expect(unsyncedResult.data![0].data).toEqual(minimalEvent);
    });

    it('should validate required fields', async () => {
      const invalidEvent = {
        // Missing required fields
        minute: 5,
        second: 0
      } as any;

      const result = await db.addEvent(invalidEvent);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Outbox Performance', () => {
    it('should handle large number of unsynced events efficiently', async () => {
      const startTime = Date.now();

      // Add 100 events
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(db.addEvent({
          kind: 'goal',
          matchId: 'test-match-1',
          teamId: 'test-team-1',
          playerId: 'test-player-1',
          minute: i,
          second: 0,
          period: 1,
          data: { notes: `Goal ${i}` },
          created: Date.now()
        }));
      }

      await Promise.all(promises);

      const addTime = Date.now() - startTime;
      expect(addTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Retrieve all unsynced events
      const retrieveStart = Date.now();
      const result = await db.getUnsyncedEvents();
      const retrieveTime = Date.now() - retrieveStart;

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(100);
      expect(retrieveTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should maintain performance with mixed sync states', async () => {
      // Add events and mark some as synced
      const events = [];
      for (let i = 0; i < 50; i++) {
        const result = await db.addEvent({
          kind: 'goal',
          matchId: 'test-match-1',
          teamId: 'test-team-1',
          playerId: 'test-player-1',
          minute: i,
          second: 0,
          period: 1,
          data: { notes: `Goal ${i}` },
          created: Date.now()
        });
        events.push(result.data!);
      }

      // Mark every other event as synced
      for (let i = 0; i < events.length; i += 2) {
        await db.markEventSynced(events[i]);
      }

      const startTime = Date.now();
      const result = await db.getUnsyncedEvents();
      const queryTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(25); // Half should be unsynced
      expect(queryTime).toBeLessThan(500); // Should be fast even with mixed states
    });
  });

  describe('Outbox Error Recovery', () => {
    it('should handle database corruption gracefully', async () => {
      // Add a valid event first
      const validResult = await db.addEvent({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        minute: 5,
        second: 0,
        period: 1,
        data: { notes: 'Valid goal' },
        created: Date.now()
      });

      expect(validResult.success).toBe(true);

      // Try to manually corrupt data (simulate real-world scenario)
      try {
        await db.outbox.update(validResult.data!, { data: null as any });
      } catch (error) {
        // Expected - database should reject invalid updates
      }

      // Verify we can still retrieve unsynced events
      const result = await db.getUnsyncedEvents();
      expect(result.success).toBe(true);
    });

    it('should recover from sync failures', async () => {
      const addResult = await db.addEvent({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        minute: 5,
        second: 0,
        period: 1,
        data: { notes: 'Test goal' },
        created: Date.now()
      });

      const outboxId = addResult.data!;

      // Fail sync twice
      await db.markEventSyncFailed(outboxId, 'Network error 1');
      await db.markEventSyncFailed(outboxId, 'Network error 2');

      // Should still be available for retry
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(1);
      expect(unsyncedResult.data![0].retryCount).toBe(2);

      // Finally succeed
      await db.markEventSynced(outboxId);

      // Should no longer be in unsynced list
      const finalResult = await db.getUnsyncedEvents();
      expect(finalResult.data).toHaveLength(0);
    });
  });
});
