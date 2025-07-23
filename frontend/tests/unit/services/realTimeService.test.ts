import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { RealTimeService } from '../../../src/services/realTimeService';
import { db } from '../../../src/db/indexedDB';
import type { MatchEvent } from '../../../src/types/events';
import type { EnhancedOutboxEvent } from '../../../src/db/schema';

// Mock Socket.IO
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false
  };
  
  return {
    io: vi.fn(() => mockSocket)
  };
});

// Mock database
vi.mock('../../../src/db/indexedDB', () => ({
  db: {
    addEvent: vi.fn(),
    getUnsyncedEvents: vi.fn(),
    markEventSynced: vi.fn(),
    markEventSyncFailed: vi.fn(),
    outbox: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          toArray: vi.fn()
        }))
      }))
    }
  }
}));

describe('RealTimeService', () => {
  let realTimeService: RealTimeService;
  let mockEvent: MatchEvent;
  let mockSocket: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Get fresh mock socket instance
    mockSocket = {
      on: vi.fn(),
      emit: vi.fn(),
      disconnect: vi.fn(),
      connected: false
    };
    
    realTimeService = new RealTimeService({
      serverUrl: 'http://localhost:3001',
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      timeout: 5000
    });

    mockEvent = {
      id: 'test-event-1',
      kind: 'goal',
      match_id: 'test-match-1',
      season_id: 'test-season-1',
      team_id: 'test-team-1',
      player_id: 'test-player-1',
      period_number: 1,
      clock_ms: 300000,
      sentiment: 3,
      notes: 'Test goal',
      created: Date.now()
    };
  });

  afterEach(() => {
    realTimeService.disconnect();
  });

  describe('publishEvent', () => {
    it('should try real-time first when connected', async () => {
      // Mock connected state
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;
      
      // Mock successful real-time publish
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          callback({ success: true });
        }
      });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.method).toBe('realtime');
      expect(mockSocket.emit).toHaveBeenCalledWith('match_event', mockEvent, expect.any(Function));
      expect(db.addEvent).not.toHaveBeenCalled();
    });

    it('should fallback to outbox when real-time fails', async () => {
      // Mock connected state but failing real-time
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;
      
      // Mock failed real-time publish
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          callback({ success: false });
        }
      });

      // Mock successful outbox add
      (db.addEvent as Mock).mockResolvedValue({ success: true, data: 1 });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.method).toBe('outbox');
      expect(mockSocket.emit).toHaveBeenCalledWith('match_event', mockEvent, expect.any(Function));
      expect(db.addEvent).toHaveBeenCalled();
    });

    it('should use outbox when disconnected', async () => {
      // Mock disconnected state
      (realTimeService as any).isConnected = false;
      (realTimeService as any).socket = null;
      
      // Mock successful outbox add
      (db.addEvent as Mock).mockResolvedValue({ success: true, data: 1 });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.method).toBe('outbox');
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(db.addEvent).toHaveBeenCalled();
    });

    it('should handle outbox failure gracefully', async () => {
      // Mock disconnected state
      (realTimeService as any).isConnected = false;
      (realTimeService as any).socket = null;
      
      // Mock failed outbox add
      (db.addEvent as Mock).mockResolvedValue({ 
        success: false, 
        error: 'Database error' 
      });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(false);
      expect(result.method).toBe('outbox');
    });
  });

  describe('syncOutboxEvents', () => {
    it('should sync unsynced events when connected', async () => {
      // Mock connected state
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;
      
      // Mock unsynced events with payload structure that realTimeService expects
      const unsyncedEvents: any[] = [
        {
          id: 1,
          table_name: 'events',
          record_id: 'event-1',
          operation: 'INSERT',
          payload: {
            kind: 'goal',
            match_id: 'test-match-1',
            team_id: 'test-team-1',
            player_id: 'test-player-1',
            minute: 5,
            second: 0,
            period: 1,
            data: { notes: 'Test goal' },
            created: Date.now()
          },
          synced: false,
          created_at: Date.now(),
          retry_count: 0
        }
      ];

      (db.getUnsyncedEvents as Mock).mockResolvedValue({
        success: true,
        data: unsyncedEvents
      });

      // Mock successful real-time publish
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          callback({ success: true });
        }
      });

      (db.markEventSynced as Mock).mockResolvedValue({ success: true });

      // Trigger sync
      await (realTimeService as any).syncOutboxEvents();

      expect(db.getUnsyncedEvents).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'match_event',
        expect.objectContaining({
          kind: 'goal',
          match_id: 'test-match-1'
        }),
        expect.any(Function)
      );
      expect(db.markEventSynced).toHaveBeenCalledWith(1);
    });

    it('should mark events as failed when real-time sync fails', async () => {
      // Mock connected state
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;
      
      // Mock unsynced events with payload structure that realTimeService expects
      const unsyncedEvents: any[] = [
        {
          id: 1,
          table_name: 'events',
          record_id: 'event-1',
          operation: 'INSERT',
          payload: {
            kind: 'goal',
            match_id: 'test-match-1',
            team_id: 'test-team-1',
            player_id: 'test-player-1',
            minute: 5,
            second: 0,
            period: 1,
            data: { notes: 'Test goal' },
            created: Date.now()
          },
          synced: false,
          created_at: Date.now(),
          retry_count: 0
        }
      ];

      (db.getUnsyncedEvents as Mock).mockResolvedValue({
        success: true,
        data: unsyncedEvents
      });

      // Mock failed real-time publish
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          callback({ success: false });
        }
      });

      (db.markEventSyncFailed as Mock).mockResolvedValue({ success: true });

      // Trigger sync
      await (realTimeService as any).syncOutboxEvents();

      expect(db.markEventSyncFailed).toHaveBeenCalledWith(1, 'Real-time sync failed');
    });

    it('should handle invalid outbox events gracefully', async () => {
      // Mock connected state
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;
      
      // Mock invalid unsynced events
      const unsyncedEvents = [
        {
          id: 1,
          // Missing required fields
          data: {}
        }
      ] as EnhancedOutboxEvent[];

      (db.getUnsyncedEvents as Mock).mockResolvedValue({
        success: true,
        data: unsyncedEvents
      });

      (db.markEventSyncFailed as Mock).mockResolvedValue({ success: true });

      // Trigger sync
      await (realTimeService as any).syncOutboxEvents();

      expect(db.markEventSyncFailed).toHaveBeenCalledWith(1, 'Missing required fields');
    });

    it('should not sync when already in progress', async () => {
      // Mock sync in progress
      (realTimeService as any).syncInProgress = true;
      (realTimeService as any).isConnected = true;

      await (realTimeService as any).syncOutboxEvents();

      expect(db.getUnsyncedEvents).not.toHaveBeenCalled();
    });

    it('should not sync when disconnected', async () => {
      // Mock disconnected state
      (realTimeService as any).isConnected = false;
      (realTimeService as any).syncInProgress = false;

      await (realTimeService as any).syncOutboxEvents();

      expect(db.getUnsyncedEvents).not.toHaveBeenCalled();
    });
  });

  describe('connection management', () => {
    it('should handle connection events', () => {
      const connectionCallback = vi.fn();
      const unsubscribe = realTimeService.onConnectionChange(connectionCallback);

      // Manually trigger connection change since we're mocking
      (realTimeService as any).isConnected = true;
      (realTimeService as any).notifyConnectionChange(true);

      expect(connectionCallback).toHaveBeenCalledWith(true);

      // Simulate disconnection
      (realTimeService as any).isConnected = false;
      (realTimeService as any).notifyConnectionChange(false);

      expect(connectionCallback).toHaveBeenCalledWith(false);

      // Test unsubscribe
      unsubscribe();
      connectionCallback.mockClear();

      // Try to trigger connection change after unsubscribe
      (realTimeService as any).notifyConnectionChange(true);

      expect(connectionCallback).not.toHaveBeenCalled();
    });

    it('should handle live events', () => {
      const eventCallback = vi.fn();
      const unsubscribe = realTimeService.onEvent(eventCallback);

      // Manually trigger event notification since we're mocking
      (realTimeService as any).notifyEventReceived(mockEvent);

      expect(eventCallback).toHaveBeenCalledWith(mockEvent);

      // Test unsubscribe
      unsubscribe();
      eventCallback.mockClear();

      // Try to trigger event after unsubscribe
      (realTimeService as any).notifyEventReceived(mockEvent);

      expect(eventCallback).not.toHaveBeenCalled();
    });
  });

  describe('match room management', () => {
    it('should join match room when connected', () => {
      // Mock connected state
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;

      realTimeService.joinMatch('test-match-1');

      expect(mockSocket.emit).toHaveBeenCalledWith('join-match', 'test-match-1');
      expect(realTimeService.matchId).toBe('test-match-1');
    });

    it('should leave match room when connected', () => {
      // Setup current match
      (realTimeService as any).currentMatchId = 'test-match-1';
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;

      realTimeService.leaveMatch();

      expect(mockSocket.emit).toHaveBeenCalledWith('leave-match', 'test-match-1');
      expect(realTimeService.matchId).toBe(null);
    });

    it('should store match ID even when disconnected', () => {
      // Mock disconnected state
      (realTimeService as any).isConnected = false;
      (realTimeService as any).socket = null;

      realTimeService.joinMatch('test-match-1');

      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(realTimeService.matchId).toBe('test-match-1');
    });
  });
});