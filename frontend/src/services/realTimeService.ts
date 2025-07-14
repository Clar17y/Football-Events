/**
 * Real-Time First Service
 * 
 * Implements the real-time first architecture with IndexedDB outbox as fallback.
 * Priority: Try WebSocket first, use outbox only when real-time fails.
 */

import { io, Socket } from 'socket.io-client';
import { db } from '../db/indexedDB';
import type { MatchEvent } from '../types/events';
import type { EnhancedOutboxEvent } from '../db/schema';

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
      
      // Sync any queued events
      this.syncOutboxEvents();
    });

    this.socket.on('disconnect', () => {
      console.log('📡 Real-time connection lost - using outbox mode');
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
      // Mark as synced in outbox if it exists
      this.markEventSynced(eventId);
    });
  }

  /**
   * Real-time first event publishing
   * Try real-time first, fallback to outbox if it fails
   */
  async publishEvent(event: MatchEvent): Promise<{ success: boolean; method: 'realtime' | 'outbox' }> {
    // 1. ALWAYS try real-time first
    if (this.isConnected && this.socket) {
      try {
        const success = await this.tryRealTimePublish(event);
        if (success) {
          console.log('✅ Event sent real-time:', event.id);
          return { success: true, method: 'realtime' };
        }
      } catch (error) {
        console.log('❌ Real-time failed, using outbox:', error);
      }
    }

    // 2. ONLY use outbox if real-time fails
    try {
      await this.addToOutbox(event);
      console.log('📦 Event queued in outbox:', event.id);
      return { success: true, method: 'outbox' };
    } catch (error) {
      console.error('❌ Failed to queue event in outbox:', error);
      return { success: false, method: 'outbox' };
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
   * Add event to outbox as fallback
   */
  private async addToOutbox(event: MatchEvent): Promise<void> {
    const result = await db.addEvent({
      kind: event.kind,
      match_id: event.match_id,
      team_id: event.team_id || null,
      player_id: event.player_id || null,
      minute: Math.floor(event.clock_ms / 60000), // Convert ms to minutes
      second: Math.floor((event.clock_ms % 60000) / 1000), // Convert remainder to seconds
      period: event.period_number,
      data: event.notes ? { notes: event.notes } : {},
      created: event.created
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to add to outbox');
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
   * Sync outbox events when connection is restored
   */
  private async syncOutboxEvents(): Promise<void> {
    if (this.syncInProgress || !this.isConnected) {
      return;
    }

    this.syncInProgress = true;
    console.log('🔄 Syncing outbox events...');

    try {
      const result = await db.getUnsyncedEvents();
      if (!result.success || !result.data) {
        console.log('No unsynced events to process');
        return;
      }

      const unsyncedEvents = result.data;
      console.log(`📦 Found ${unsyncedEvents.length} unsynced events`);

      for (const outboxEvent of unsyncedEvents) {
        try {
          // Check if outboxEvent has the expected structure
          if (!outboxEvent || typeof outboxEvent !== 'object') {
            console.warn('Invalid outbox event structure:', outboxEvent);
            await db.markEventSyncFailed(outboxEvent?.id || 0, 'Invalid event structure');
            continue;
          }

          // Handle different outbox event structures
          let payload;
          if (outboxEvent.payload) {
            payload = outboxEvent.payload;
          } else {
            // Direct event structure (fallback)
            payload = outboxEvent;
          }

          if (!payload.kind || !payload.match_id) {
            console.warn('Missing required fields in outbox event:', payload);
            await db.markEventSyncFailed(outboxEvent.id, 'Missing required fields');
            continue;
          }

          // Convert outbox event back to MatchEvent format
          const matchEvent: MatchEvent = {
            id: crypto.randomUUID(), // Generate new ID for real-time transmission
            kind: payload.kind,
            match_id: payload.match_id,
            season_id: payload.match_id, // Use match_id as fallback for season_id
            team_id: payload.team_id,
            player_id: payload.player_id,
            period_number: payload.period || 1,
            clock_ms: ((payload.minute || 0) * 60000) + ((payload.second || 0) * 1000),
            sentiment: 0, // Default sentiment
            notes: payload.data?.notes || payload.notes || '',
            created: payload.created || Date.now()
          };

          const success = await this.tryRealTimePublish(matchEvent);
          
          if (success) {
            await db.markEventSynced(outboxEvent.id);
            console.log(`✅ Synced event: ${matchEvent.id}`);
          } else {
            await db.markEventSyncFailed(outboxEvent.id, 'Real-time sync failed');
            console.log(`❌ Failed to sync event: ${matchEvent.id}`);
          }
        } catch (error) {
          await db.markEventSyncFailed(outboxEvent.id, error instanceof Error ? error.message : 'Unknown error');
          console.error(`❌ Error syncing event ${outboxEvent.id}:`, error);
        }
      }

      console.log('🔄 Outbox sync completed');
    } catch (error) {
      console.error('❌ Outbox sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Mark event as synced in outbox
   */
  private async markEventSynced(eventId: string): Promise<void> {
    try {
      // Find the outbox event by payload ID
      const outboxEvents = await db.outbox.where('synced').equals(0).toArray();
      const outboxEvent = outboxEvents.find(e => e.payload.id === eventId);
      
      if (outboxEvent) {
        await db.markEventSynced(outboxEvent.id);
      }
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
  serverUrl: (typeof window !== 'undefined' && (window as any).VITE_API_URL) || 'http://localhost:3001',
  reconnectionAttempts: Infinity, // Keep trying forever
  reconnectionDelay: 2000, // Try every 2 seconds
  timeout: 5000
});