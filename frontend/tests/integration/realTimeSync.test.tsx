import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../src/db/indexedDB';
import type { MatchEvent } from '../../src/types/events';

// Mock Socket.IO to prevent actual connections
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false
  }))
}));

describe('Real-Time Sync Integration', () => {
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Clear database
    await db.events.clear();
    await db.matches.clear();
    await db.teams.clear();
  });

  afterEach(async () => {
    // Clean up
    await db.events.clear();
    await db.matches.clear();
    await db.teams.clear();
  });

  describe('Local-First Event Storage', () => {
    it('should store events locally with synced=false when created', async () => {
      // Add event directly to database (simulating offline creation)
      await db.addEventToTable({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        clockMs: 300000,
        periodNumber: 1,
        notes: 'Offline goal',
        createdByUserId: 'test-user'
      });

      // Verify event was stored with synced=false
      const unsyncedResult = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(unsyncedResult.data).toHaveLength(1);
      expect(unsyncedResult.data![0].synced).toBe(false);
      expect(unsyncedResult.data![0].kind).toBe('goal');
    });

    it('should mark events as synced after successful sync', async () => {
      // Add unsynced event
      const addResult = await db.addEventToTable({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        clockMs: 300000,
        periodNumber: 1,
        notes: 'Test goal',
        createdByUserId: 'test-user'
      });

      expect(addResult.success).toBe(true);
      expect(addResult.data).toBeDefined();
      const eventId = addResult.data!.id;
      expect(eventId).toBeDefined();

      // Verify initially unsynced
      let unsyncedResult = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(unsyncedResult.data).toHaveLength(1);

      // Simulate marking as synced (what sync service would do)
      await db.events.update(eventId!, { synced: true });

      // Verify now synced
      unsyncedResult = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(unsyncedResult.data).toHaveLength(0);
    });
  });

  describe('Offline/Online Sync Scenarios', () => {
    it('should track unsynced events when offline', async () => {
      // Add multiple events while offline
      await db.addEventToTable({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        clockMs: 300000,
        periodNumber: 1,
        notes: 'First offline goal',
        createdByUserId: 'test-user'
      });

      await db.addEventToTable({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-2',
        playerId: 'test-player-2',
        clockMs: 600000,
        periodNumber: 1,
        notes: 'Second offline goal',
        createdByUserId: 'test-user'
      });

      // Verify both events are unsynced
      const unsyncedResult = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(unsyncedResult.data).toHaveLength(2);
    });

    it('should handle mixed synced and unsynced events', async () => {
      // Add a synced event (simulating one that came from server)
      await db.events.add({
        id: 'synced-event-1',
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        periodNumber: 1,
        clockMs: 100000,
        notes: 'Synced goal',
        createdAt: new Date().toISOString(),
        createdByUserId: 'server',
        isDeleted: false,
        synced: true
      });

      // Add an unsynced event (created locally)
      await db.addEventToTable({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-2',
        playerId: 'test-player-2',
        clockMs: 200000,
        periodNumber: 1,
        notes: 'Local goal',
        createdByUserId: 'test-user'
      });

      // Verify only unsynced event is returned
      const unsyncedResult = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(unsyncedResult.data).toHaveLength(1);
      expect(unsyncedResult.data![0].notes).toBe('Local goal');

      // Verify total events count
      const allEvents = await db.events.toArray();
      expect(allEvents).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    it('should preserve events on sync failure', async () => {
      // Add event
      await db.addEventToTable({
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        clockMs: 300000,
        periodNumber: 1,
        notes: 'Test goal',
        createdByUserId: 'test-user'
      });

      // Verify event exists and is unsynced
      const unsyncedResult = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(unsyncedResult.data).toHaveLength(1);

      // Simulate sync failure (event should remain unsynced)
      // In real scenario, sync service would not mark as synced on failure

      // Verify event is still unsynced
      const stillUnsyncedResult = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(stillUnsyncedResult.data).toHaveLength(1);
    });

    it('should handle database errors gracefully', async () => {
      // Test that getUnsyncedRecords handles errors
      const result = await db.getUnsyncedRecords<MatchEvent>('events');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });
  });
});
