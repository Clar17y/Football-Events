import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MatchProvider, useMatchContext as useMatch } from '../../src/contexts/MatchContext';
import { ToastProvider } from '../../src/contexts/ToastContext';
import { db } from '../../src/db/indexedDB';
import { realTimeService } from '../../src/services/realTimeService';
import type { MatchEvent } from '../../src/types/events';
import type { Match } from '../../src/types/match';

// Mock Socket.IO
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket)
}));

// Test component to access MatchContext
const TestComponent = ({ onEventAdded }: { onEventAdded?: (event: MatchEvent) => void }) => {
  const { addEvent, events, currentMatch } = useMatch();

  const handleAddEvent = async () => {
    if (!currentMatch) return;

    const eventData = {
      kind: 'goal' as const,
      matchId: currentMatch.id,
      teamId: 'test-team-1',
      playerId: 'test-player-1',
      periodNumber: 1,
      clockMs: 300000,
      sentiment: 3,
      notes: 'Integration test goal',
      createdByUserId: 'test-user',
      isDeleted: false
    };

    const event = await addEvent(eventData);
    onEventAdded?.(event);
  };

  return (
    <div>
      <div data-testid="event-count">{events.length}</div>
      <div data-testid="match-id">{currentMatch?.id || 'no-match'}</div>
      <button data-testid="add-event" onClick={handleAddEvent}>
        Add Event
      </button>
    </div>
  );
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>
    <MatchProvider>
      {children}
    </MatchProvider>
  </ToastProvider>
);

describe('Real-Time Sync Integration', () => {
  const mockMatch: Match = {
    id: 'test-match-1',
    seasonId: 'test-season-1',
    homeTeamId: 'test-team-1',
    awayTeamId: 'test-team-2',
    kickoffTime: new Date().toISOString(),
    status: 'NOT_STARTED',
    homeScore: 0,
    awayScore: 0,
    durationMinutes: 90,
    periodFormat: '2x45',
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
    homeTeam: {
      id: 'test-team-1',
      name: 'Home Team',
      createdAt: new Date().toISOString(),
      createdByUserId: 'user1',
      isDeleted: false,
      isOpponent: false
    },
    awayTeam: {
      id: 'test-team-2',
      name: 'Away Team',
      createdAt: new Date().toISOString(),
      createdByUserId: 'user1',
      isDeleted: false,
      isOpponent: true
    },
    currentPeriod: 1,
    clock: {
      running: false,
      startTs: null,
      offsetMs: 0,
      currentPeriod: 1,
      periodStarts: {}
    },
    settings: {
      periodDuration: 45,
      totalPeriods: 2,
      halfTimeDuration: 15,
      allowExtraTime: false,
      extraTimeDuration: 15,
      allowPenaltyShootout: false,
      maxSubstitutions: 5,
      trackInjuryTime: true
    }
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset database
    await db.initialize();
    await db.resetDatabase();

    // Reset real-time service state
    realTimeService.disconnect();
  });

  afterEach(async () => {
    if (db.isOpen()) {
      await db.resetDatabase();
      db.close();
    }
    realTimeService.disconnect();
  });

  describe('Online Real-Time Flow', () => {
    it('should send events real-time when connected', async () => {
      // Mock connected state
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;

      // Mock successful real-time publish
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          setTimeout(() => callback({ success: true }), 10);
        }
      });

      const eventsAdded: MatchEvent[] = [];
      const { getByTestId } = render(
        <TestWrapper>
          <TestComponent onEventAdded={(event) => eventsAdded.push(event)} />
        </TestWrapper>
      );

      // Load match first
      const { loadMatch } = (window as any).testMatchContext || {};
      if (loadMatch) {
        await loadMatch(mockMatch);
      }

      // Add event
      const addButton = getByTestId('add-event');
      addButton.click();

      await waitFor(() => {
        expect(eventsAdded).toHaveLength(1);
      });

      // Verify real-time was attempted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'match_event',
        expect.objectContaining({
          kind: 'goal',
          matchId: 'test-match-1'
        }),
        expect.any(Function)
      );

      // Verify event was not added to outbox (since real-time succeeded)
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(0);
    });

    it('should receive and deduplicate live events', async () => {
      const { getByTestId } = render(
        <TestWrapper>
          <TestComponent />
        </TestWrapper>
      );

      // Simulate receiving a live event
      const liveEventHandler = mockSocket.on.mock.calls.find(call => call[0] === 'live_event')?.[1];

      const liveEvent: MatchEvent = {
        id: 'live-event-1',
        kind: 'goal',
        matchId: 'test-match-1',
        teamId: 'test-team-1',
        playerId: 'test-player-1',
        periodNumber: 1,
        clockMs: 300000,
        sentiment: 3,
        notes: 'Live goal',
        createdAt: new Date().toISOString(),
        createdByUserId: 'server',
        isDeleted: false
      };

      if (liveEventHandler) {
        liveEventHandler(liveEvent);
      }

      await waitFor(() => {
        expect(getByTestId('event-count').textContent).toBe('1');
      });

      // Send same event again - should be deduplicated
      if (liveEventHandler) {
        liveEventHandler(liveEvent);
      }

      // Should still be 1 event
      await waitFor(() => {
        expect(getByTestId('event-count').textContent).toBe('1');
      });
    });
  });

  describe('Offline Outbox Flow', () => {
    it('should queue events in outbox when disconnected', async () => {
      // Mock disconnected state
      (realTimeService as any).isConnected = false;
      (realTimeService as any).socket = null;

      const eventsAdded: MatchEvent[] = [];
      const { getByTestId } = render(
        <TestWrapper>
          <TestComponent onEventAdded={(event) => eventsAdded.push(event)} />
        </TestWrapper>
      );

      // Add event while offline
      const addButton = getByTestId('add-event');
      addButton.click();

      await waitFor(() => {
        expect(eventsAdded).toHaveLength(1);
      });

      // Verify event was added to outbox
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(1);
      expect(unsyncedResult.data![0].synced).toBe(0);

      // Verify real-time was not attempted
      expect(mockSocket.emit).not.toHaveBeenCalled();
    });

    it('should sync outbox events when connection restored', async () => {
      // Start offline and add events
      (realTimeService as any).isConnected = false;
      (realTimeService as any).socket = null;

      // Add event to outbox
      // Add event to outbox
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

      // Verify event is in outbox
      const unsyncedBefore = await db.getUnsyncedEvents();
      expect(unsyncedBefore.data).toHaveLength(1);

      // Mock connection restoration
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;

      // Mock successful real-time publish for sync
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          setTimeout(() => callback({ success: true }), 10);
        }
      });

      // Trigger connection event (simulates real connection restoration)
      const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
      if (connectHandler) {
        connectHandler();
      }

      // Wait for sync to complete
      await waitFor(async () => {
        const unsyncedAfter = await db.getUnsyncedEvents();
        expect(unsyncedAfter.data).toHaveLength(0);
      }, { timeout: 5000 });

      // Verify real-time sync was attempted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'match_event',
        expect.objectContaining({
          kind: 'goal',
          matchId: 'test-match-1'
        }),
        expect.any(Function)
      );
    });
  });

  describe('Hybrid Online/Offline Scenarios', () => {
    it('should handle real-time failure gracefully', async () => {
      // Mock connected state but failing real-time
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;

      // Mock failed real-time publish
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          setTimeout(() => callback({ success: false }), 10);
        }
      });

      const eventsAdded: MatchEvent[] = [];
      const { getByTestId } = render(
        <TestWrapper>
          <TestComponent onEventAdded={(event) => eventsAdded.push(event)} />
        </TestWrapper>
      );

      // Add event
      const addButton = getByTestId('add-event');
      addButton.click();

      await waitFor(() => {
        expect(eventsAdded).toHaveLength(1);
      });

      // Verify real-time was attempted
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'match_event',
        expect.objectContaining({
          kind: 'goal',
          matchId: 'test-match-1'
        }),
        expect.any(Function)
      );

      // Verify event was added to outbox as fallback
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(1);
    });

    it('should handle intermittent connectivity', async () => {
      const eventsAdded: MatchEvent[] = [];
      const { getByTestId } = render(
        <TestWrapper>
          <TestComponent onEventAdded={(event) => eventsAdded.push(event)} />
        </TestWrapper>
      );

      // Start connected
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          setTimeout(() => callback({ success: true }), 10);
        }
      });

      // Add event while connected
      getByTestId('add-event').click();
      await waitFor(() => expect(eventsAdded).toHaveLength(1));

      // Verify no outbox usage
      let unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(0);

      // Simulate disconnection
      (realTimeService as any).isConnected = false;
      const disconnectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'disconnect')?.[1];
      if (disconnectHandler) {
        disconnectHandler();
      }

      // Add event while disconnected
      getByTestId('add-event').click();
      await waitFor(() => expect(eventsAdded).toHaveLength(2));

      // Verify outbox usage
      unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(1);

      // Simulate reconnection
      (realTimeService as any).isConnected = true;
      const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
      if (connectHandler) {
        connectHandler();
      }

      // Wait for sync
      await waitFor(async () => {
        const unsyncedAfter = await db.getUnsyncedEvents();
        expect(unsyncedAfter.data).toHaveLength(0);
      }, { timeout: 5000 });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle sync failures with retry logic', async () => {
      // Add event to outbox
      // Add event to outbox
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

      // Mock connected state with failing sync
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;

      let attemptCount = 0;
      mockSocket.emit.mockImplementation((event, data, callback) => {
        if (event === 'match_event' && callback) {
          attemptCount++;
          // Fail first 2 attempts, succeed on 3rd
          setTimeout(() => callback({ success: attemptCount >= 3 }), 10);
        }
      });

      // Trigger sync multiple times
      const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];

      // First sync attempt (should fail)
      if (connectHandler) {
        connectHandler();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second sync attempt (should fail)
      if (connectHandler) {
        connectHandler();
      }
      await new Promise(resolve => setTimeout(resolve, 100));

      // Third sync attempt (should succeed)
      if (connectHandler) {
        connectHandler();
      }

      // Wait for final sync
      await waitFor(async () => {
        const unsyncedResult = await db.getUnsyncedEvents();
        expect(unsyncedResult.data).toHaveLength(0);
      }, { timeout: 5000 });

      expect(attemptCount).toBeGreaterThanOrEqual(3);
    });

    it('should handle malformed outbox events', async () => {
      // Manually add malformed event to outbox
      await db.outbox.add({
        tableName: 'events',
        recordId: 'malformed-event',
        operation: 'INSERT',
        data: null as any, // Malformed data
        synced: 0,
        createdAt: Date.now(),
        retryCount: 0,
        createdByUserId: 'test-user'
      });

      // Mock connected state
      (realTimeService as any).isConnected = true;
      (realTimeService as any).socket = mockSocket;

      // Trigger sync
      const connectHandler = mockSocket.on.mock.calls.find(call => call[0] === 'connect')?.[1];
      if (connectHandler) {
        connectHandler();
      }

      // Wait for sync to handle malformed event
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify malformed event was marked as failed
      const unsyncedResult = await db.getUnsyncedEvents();
      expect(unsyncedResult.data).toHaveLength(0); // Should be excluded due to high retry count
    });
  });
});