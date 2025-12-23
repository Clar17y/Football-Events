/**
 * Real-Time First Service
 * 
 * Implements the real-time first architecture with direct events table storage as fallback.
 * Priority: Try WebSocket first, store locally only when real-time fails.
 */

import { io, Socket } from 'socket.io-client';
// Database import removed - will use dynamic import to avoid blocking
import type { MatchEvent } from '../types/events';

export interface RealTimeConfig {
  serverUrl: string;
  reconnectionAttempts: number;
  reconnectionDelay: number;
  timeout: number;
}

export class RealTimeService {
  private socket: Socket | null = null;
  private isConnected = false;
  private currentMatchId: string | null = null;
  private syncInProgress = false;
  private eventCallbacks: ((event: MatchEvent) => void)[] = [];
  private connectionCallbacks: ((connected: boolean) => void)[] = [];

  constructor(private config: RealTimeConfig) {
    this.initializeSocket();
  }

  /**
   * Initialize Socket.IO connection
   */
  private initializeSocket(): void {
    this.socket = io(this.config.serverUrl, {
      reconnectionAttempts: this.config.reconnectionAttempts,
      reconnectionDelay: this.config.reconnectionDelay,
      reconnectionDelayMax: 10000, // Max 10 seconds between attempts
      randomizationFactor: 0.5, // Add some randomization to avoid thundering herd
      timeout: this.config.timeout,
      transports: ['websocket', 'polling'] // Fallback for mobile networks
    });

    this.setupEventHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('🔗 Real-time connection established');
      this.isConnected = true;
      this.notifyConnectionChange(true);

      // Rejoin current match if we have one
      if (this.currentMatchId) {
        this.joinMatch(this.currentMatchId);
      }

      // Sync any unsynced events
      this.syncUnsyncedEvents();
    });

    this.socket.on('disconnect', () => {
      console.log('📡 Real-time connection lost - using local storage mode');
      this.isConnected = false;
      this.notifyConnectionChange(false);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('Real-time connection error:', error);
      this.isConnected = false;
      this.notifyConnectionChange(false);
    });

    // Match event handlers
    this.socket.on('live_event', (event: MatchEvent) => {
      console.log('📡 Received live event:', event);
      this.notifyEventReceived(event);
    });

    this.socket.on('match_event_confirmed', (eventId: string) => {
      console.log('✅ Event confirmed by server:', eventId);
      // Mark as synced in events table
      this.markEventSynced(eventId);
    });
  }

  /**
   * Real-time first event publishing
   * Try real-time first, fallback to local storage if it fails
   */
  async publishEvent(event: MatchEvent): Promise<{ success: boolean; method: 'realtime' | 'local' }> {
    // 1. ALWAYS try real-time first
    if (this.isConnected && this.socket) {
      try {
        const success = await this.tryRealTimePublish(event);
        if (success) {
          console.log('✅ Event sent real-time:', event.id);
          return { success: true, method: 'realtime' };
        }
      } catch (error) {
        console.log('❌ Real-time failed, storing locally:', error);
      }
    }

    // 2. ONLY store locally if real-time fails
    try {
      await this.storeEventLocally(event);
      console.log('📦 Event stored locally:', event.id);
      return { success: true, method: 'local' };
    } catch (error) {
      console.error('❌ Failed to store event locally:', error);
      return { success: false, method: 'local' };
    }
  }

  /**
   * Attempt real-time event publishing
   */
  private async tryRealTimePublish(event: MatchEvent): Promise<boolean> {
    if (!this.socket || !this.isConnected) {
      return false;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.config.timeout);

      this.socket!.emit('match_event', event, (response: { success: boolean }) => {
        clearTimeout(timeout);
        resolve(response.success);
      });
    });
  }

  /**
   * Store event locally in the events table (for offline-first architecture)
   * Events are stored with synced: false and will be synced when connectivity is restored
   */
  private async storeEventLocally(event: MatchEvent): Promise<void> {
    try {
      const { db } = await import('../db/indexedDB');
      const result = await db.addEventToTable({
        kind: event.kind,
        matchId: event.matchId,
        teamId: event.teamId || undefined,
        playerId: event.playerId || null,
        clockMs: event.clockMs || 0,
        periodNumber: event.periodNumber,
        notes: event.notes || '',
        createdAt: event.createdAt || new Date().toISOString(),
        createdByUserId: (await import('../utils/guest')).isGuest() ? (await import('../utils/guest')).getGuestId() : 'authenticated-user'
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to store event locally');
      }
    } catch (dbError) {
      console.warn('Database not available for local storage:', dbError);
      throw new Error('Database not available');
    }
  }

  /**
   * Join a match room for live updates
   */
  joinMatch(matchId: string): void {
    this.currentMatchId = matchId;

    if (this.isConnected && this.socket) {
      this.socket.emit('join-match', matchId);
      console.log(`🏟️ Joined match room: ${matchId}`);
    }
  }

  /**
   * Leave current match room
   */
  leaveMatch(): void {
    if (this.currentMatchId && this.isConnected && this.socket) {
      this.socket.emit('leave-match', this.currentMatchId);
      console.log(`🚪 Left match room: ${this.currentMatchId}`);
    }

    this.currentMatchId = null;
  }

  /**
   * Sync unsynced events when connection is restored
   * Queries events table for records where synced === false
   */
  private async syncUnsyncedEvents(): Promise<void> {
    if (this.syncInProgress || !this.isConnected) {
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Syncing unsynced events...');

    try {
      const { db } = await import('../db/indexedDB');
      
      // Query events table for unsynced records
      // Use filter since synced is a boolean and not indexed as IndexableType
      const unsyncedEvents = await db.events
        .filter(event => event.synced === false)
        .toArray();
      
      if (unsyncedEvents.length === 0) {
        console.log('No unsynced events to process');
        return;
      }

      console.log(`📦 Found ${unsyncedEvents.length} unsynced events`);

      for (const event of unsyncedEvents) {
        try {
          // Validate event has required fields
          if (!event || typeof event !== 'object' || !event.kind || !event.matchId) {
            console.warn('Invalid event structure or missing required fields:', event);
            continue;
          }

          // Convert DbEvent to MatchEvent format for transmission
          const matchEvent: MatchEvent = {
            id: event.id,
            kind: event.kind,
            matchId: event.matchId,
            teamId: event.teamId,
            playerId: event.playerId,
            periodNumber: event.periodNumber || 1,
            clockMs: event.clockMs || 0,
            sentiment: event.sentiment || 0,
            notes: event.notes || '',
            createdAt: event.createdAt || new Date().toISOString(),
            createdByUserId: event.createdByUserId || 'system',
            isDeleted: event.isDeleted || false
          };

          const success = await this.tryRealTimePublish(matchEvent);

          if (success) {
            // On success: set synced: true and syncedAt to ISO string
            const nowIso = new Date().toISOString();
            await db.events.update(event.id, {
              synced: true,
              syncedAt: nowIso
            });
            console.log(`✅ Synced event: ${event.id}`);
          } else {
            // On failure: keep synced: false (no update needed)
            console.log(`❌ Failed to sync event: ${event.id}`);
          }
        } catch (error) {
          // On error: keep synced: false (no update needed)
          console.error(`❌ Error syncing event ${event.id}:`, error);
        }
      }

      console.log('🔄 Event sync completed');
    } catch (error) {
      console.error('❌ Event sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Mark event as synced in events table
   * Called when server confirms event receipt
   */
  private async markEventSynced(eventId: string): Promise<void> {
    try {
      const { db } = await import('../db/indexedDB');
      const nowIso = new Date().toISOString();
      
      // Update the event directly in the events table
      await db.events.update(eventId, {
        synced: true,
        syncedAt: nowIso
      });
    } catch (error) {
      console.warn('Failed to mark event as synced:', error);
    }
  }

  /**
   * Subscribe to live events
   */
  onEvent(callback: (event: MatchEvent) => void): () => void {
    this.eventCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index > -1) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void): () => void {
    this.connectionCallbacks.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.connectionCallbacks.indexOf(callback);
      if (index > -1) {
        this.connectionCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify event callbacks
   */
  private notifyEventReceived(event: MatchEvent): void {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
  }

  /**
   * Notify connection callbacks
   */
  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(callback => {
      try {
        callback(connected);
      } catch (error) {
        console.error('Error in connection callback:', error);
      }
    });
  }

  /**
   * Get current connection status
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get current match ID
   */
  get matchId(): string | null {
    return this.currentMatchId;
  }

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.currentMatchId = null;
    this.eventCallbacks = [];
    this.connectionCallbacks = [];
  }
}

// Create singleton instance
export const realTimeService = new RealTimeService({
  serverUrl: (() => {
    // Smart server URL detection
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.replace('/api/v1', '');
    }

    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    } else {
      return `http://${hostname}:3001`;
    }
  })(),
  reconnectionAttempts: Infinity, // Keep trying forever
  reconnectionDelay: 2000, // Try every 2 seconds
  timeout: 5000
});
