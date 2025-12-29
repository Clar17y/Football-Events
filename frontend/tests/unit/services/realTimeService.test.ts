import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { RealTimeService } from '../../../src/services/realTimeService';
import type { MatchEvent } from '../../../src/types/events';

// Create mock db object that will be used by dynamic imports
const mockDb = {
  addEventToTable: vi.fn(),
  events: {
    filter: vi.fn(() => ({
      toArray: vi.fn()
    })),
    update: vi.fn()
  }
};

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

// Mock database - needs to handle dynamic imports
vi.mock('../../../src/db/indexedDB', () => ({
  db: mockDb
}));

// Mock guest utilities used by storeEventLocally
vi.mock('../../../src/utils/guest', () => ({
  isGuest: vi.fn(() => false),
  getGuestId: vi.fn(() => 'guest-123')
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
      matchId: 'test-match-1',
      teamId: 'test-team-1',
      playerId: 'test-player-1',
      periodNumber: 1,
      clockMs: 300000,
      sentiment: 3,
      notes: 'Test goal',
      createdAt: new Date().toISOString(),
      createdByUserId: 'user-1',
      isDeleted: false
    } as MatchEvent;
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
      mockSocket.emit.mockImplementation((event: string, data: any, callback?: (response: { success: boolean }) => void) => {
        if (event === 'match_event' && callback) {
          callback({ success: true });
        }
      });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.method).toBe('realtime');
      expect(mockSocket.emit).toHaveBeenCalledWith('match_event', mockEvent, expect.any(Function));
      expect(mockDb.addEventToTable).not.toHaveBeenCalled();
    });

    it('should fallback to local storage when real-time fails', async () => {
      // Mock connected state but failing real-time
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;
      
      // Mock failed real-time publish
      mockSocket.emit.mockImplementation((event: string, data: any, callback?: (response: { success: boolean }) => void) => {
        if (event === 'match_event' && callback) {
          callback({ success: false });
        }
      });

      // Mock successful local storage
      mockDb.addEventToTable.mockResolvedValue({ success: true, data: 'event-id' });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.method).toBe('local');
      expect(mockSocket.emit).toHaveBeenCalledWith('match_event', mockEvent, expect.any(Function));
      expect(mockDb.addEventToTable).toHaveBeenCalled();
    });

    it('should use local storage when disconnected', async () => {
      // Mock disconnected state
      (realTimeService as any).isConnected = false;
      (realTimeService as any).socket = null;
      
      // Mock successful local storage
      mockDb.addEventToTable.mockResolvedValue({ success: true, data: 'event-id' });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(true);
      expect(result.method).toBe('local');
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(mockDb.addEventToTable).toHaveBeenCalled();
    });

    it('should handle local storage failure gracefully', async () => {
      // Mock disconnected state
      (realTimeService as any).isConnected = false;
      (realTimeService as any).socket = null;
      
      // Mock failed local storage
      mockDb.addEventToTable.mockResolvedValue({ 
        success: false, 
        error: 'Database error' 
      });

      const result = await realTimeService.publishEvent(mockEvent);

      expect(result.success).toBe(false);
      expect(result.method).toBe('local');
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
