/**
 * Live viewer transport and durable local event publishing
 * 
 * Recording delivery and acknowledgement belong exclusively to REST sync.
 */

import { io, Socket } from 'socket.io-client';
// Database import removed - will use dynamic import to avoid blocking
import type { MatchEvent } from '../types/events';
import { eventsDataLayer } from './dataLayer';
import { apiClient } from './api/baseApi';
import { getCurrentUserId } from '../utils/network';
import { buildWsUrl } from '../utils/protocol';

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

  }

  async publishEvent(event: MatchEvent): Promise<{ success: boolean; method: 'realtime' | 'local' }> {
    const ownerId = getCurrentUserId();
    const generation = apiClient.getSessionGeneration();
    try {
      if (!event.teamId) throw new Error('Team ID is required for events');
      if (event.createdByUserId && event.createdByUserId !== ownerId) throw new Error('Recording belongs to another user');
      await eventsDataLayer.create({ ...event, teamId: event.teamId, createdByUserId: ownerId }, {
        ownerId,
        isCurrent: () => getCurrentUserId() === ownerId && apiClient.getSessionGeneration() === generation,
      });
      return { success: true, method: 'local' };
    } catch (error) {
      console.error('Failed to save event locally:', error);
      return { success: false, method: 'local' };
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

// Create singleton instance with secure WebSocket support
export const realTimeService = new RealTimeService({
  serverUrl: buildWsUrl(),
  reconnectionAttempts: Infinity, // Keep trying forever
  reconnectionDelay: 2000, // Try every 2 seconds
  timeout: 5000
});
