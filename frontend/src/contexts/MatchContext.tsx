import React, { createContext, useState, useCallback, useContext, useEffect } from 'react';
import type { MatchClock, MatchContextState, MatchContextActions, MatchSettings } from '../types/match';
import type { MatchEvent } from '../types/events';
import type { Team } from '../types/index';
import type { Match } from '../types/match';
// Database import removed - will be accessed via DatabaseContext
import { validateOrThrow, MatchEventSchema } from '../schemas/validation';
import { realTimeService } from '../services/realTimeService';
import { useDatabase } from './DatabaseContext';

/**
 * Combined match context type
 */
type MatchContextType = MatchContextState & MatchContextActions;

/**
 * Default match context value with proper typing
 */
const defaultContextValue: MatchContextType = {
  // State
  clock: {
    running: false,
    start_ts: null,
    offset_ms: 0,
    current_period: 1,
    period_starts: {}
  },
  current_match: null,
  events: [],
  settings: {
    period_duration: 45,
    total_periods: 2,
    half_time_duration: 15,
    allow_extra_time: false,
    extra_time_duration: 15,
    allow_penalty_shootout: false,
    max_substitutions: 5,
    track_injury_time: true
  },
  
  // Actions (will be overridden by provider)
  startClock: () => {},
  pauseClock: () => {},
  resetClock: () => {},
  startPeriod: () => {},
  endPeriod: () => {},
  addEvent: async () => { return {} as MatchEvent; },
  updateEvent: async () => {},
  deleteEvent: async () => {},
  loadMatch: async () => {},
  saveMatch: async () => {}
};

/**
 * Match context for managing match state and actions
 */
export const MatchContext = createContext<MatchContextType>(defaultContextValue);

/**
 * Hook to use match context with proper error handling
 */
export const useMatchContext = (): MatchContextType => {
  const context = useContext(MatchContext);
  if (!context) {
    throw new Error('useMatchContext must be used within a MatchProvider');
  }
  return context;
};

/**
 * Match provider component with comprehensive match management and real-time first architecture
 */
export const MatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State management
  const [clock, setClock] = useState<MatchClock>(defaultContextValue.clock);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [settings, setSettings] = useState(defaultContextValue.settings);
  const [isConnected, setIsConnected] = useState(false);
  
  // Database context for non-blocking database access
  const { isReady: isDatabaseReady } = useDatabase();

  // Setup real-time event listeners
  useEffect(() => {
    // Subscribe to live events from other clients
    const unsubscribeEvents = realTimeService.onEvent((event: MatchEvent) => {
      console.log('Real-time: Received live event from another client:', event);
      
      // Update local state immediately
      setEvents(prev => {
        // Check if event already exists (avoid duplicates)
        const exists = prev.some(e => e.id === event.id);
        if (exists) {
          return prev;
        }
        
        // Add new event and sort by timestamp
        return [...prev, event].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });
    });

    // Subscribe to connection status changes
    const unsubscribeConnection = realTimeService.onConnectionChange((connected: boolean) => {
      setIsConnected(connected);
      console.log(`Real-time connection: ${connected ? 'connected' : 'disconnected'}`);
    });

    // Cleanup subscriptions
    return () => {
      unsubscribeEvents();
      unsubscribeConnection();
    };
  }, []);

  // Join/leave match rooms when current match changes
  useEffect(() => {
    if (currentMatch) {
      realTimeService.joinMatch(currentMatch.id);
      console.log(`Joined real-time match room: ${currentMatch.id}`);
    } else {
      realTimeService.leaveMatch();
    }

    // Cleanup on unmount
    return () => {
      realTimeService.leaveMatch();
    };
  }, [currentMatch]);

  // Clock management actions
  const startClock = useCallback(() => {
    setClock(prevClock => {
      if (prevClock.running) return prevClock;
      
      const now = Date.now();
      return {
        ...prevClock,
        running: true,
        start_ts: now,
        period_starts: {
          ...prevClock.period_starts,
          [prevClock.current_period]: now
        }
      };
    });
  }, []);

  const pauseClock = useCallback(() => {
    setClock(prevClock => {
      if (!prevClock.running || !prevClock.start_ts) return prevClock;
      
      const now = Date.now();
      const elapsed = now - prevClock.start_ts;
      
      return {
        ...prevClock,
        running: false,
        start_ts: null,
        offset_ms: prevClock.offset_ms + elapsed
      };
    });
  }, []);

  const resetClock = useCallback(() => {
    setClock(defaultContextValue.clock);
  }, []);

  const startPeriod = useCallback((period: number) => {
    setClock(prevClock => ({
      ...prevClock,
      current_period: period,
      offset_ms: 0,
      period_starts: {
        ...prevClock.period_starts,
        [period]: Date.now()
      }
    }));
  }, []);

  const endPeriod = useCallback(() => {
    setClock(prevClock => ({
      ...prevClock,
      running: false,
      start_ts: null
    }));
  }, []);

  // Real-time first event management
  const addEvent = useCallback(async (eventData: Omit<MatchEvent, 'id' | 'createdAt'>) => {
    try {
      // Create complete event with ID and timestamp
      const event: MatchEvent = {
        id: crypto.randomUUID(),
        createdAt: new Date(),
        kind: eventData.kind,
        matchId: eventData.matchId,
        periodNumber: eventData.periodNumber,
        clockMs: eventData.clockMs,
        teamId: eventData.teamId,
        playerId: eventData.playerId,
        sentiment: eventData.sentiment || 0,
        notes: eventData.notes,
        // Auth fields
        created_by_user_id: eventData.created_by_user_id,
        is_deleted: false
      };

      // REAL-TIME FIRST APPROACH: Try real-time first, fallback to outbox
      const result = await realTimeService.publishEvent(event);
      
      if (result.success) {
        // Update local state immediately for instant UI feedback
        setEvents(prev => [...prev, event].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        
        if (result.method === 'realtime') {
          console.log('Event sent real-time:', event.id);
        } else {
          console.log('Event queued in outbox (will sync when connected):', event.id);
        }
      } else {
        throw new Error('Failed to publish event via real-time or outbox');
      }

      return event;
    } catch (error) {
      console.error('Failed to add event:', error);
      throw error;
    }
  }, []);

  const updateEvent = useCallback(async (id: string, updates: Partial<MatchEvent>) => {
    try {
      // Update local state
      setEvents(prev => prev.map(event => 
        event.id === id ? { ...event, ...updates } : event
      ));

      // TODO: Implement proper event update method in database
      // For now, we'll skip database persistence for updates
      console.log('Event update stored in memory only (database update not implemented)');

      console.log('Event updated:', id);
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    try {
      // Remove from local state immediately
      setEvents(prev => prev.filter(event => event.id !== id));

      // Delete from IndexedDB only if database is ready
      if (isDatabaseReady) {
        try {
          const { db } = await import('../db/indexedDB');
          const result = await db.deleteEnhancedEvent(id);
          if (!result.success) {
            console.warn('Failed to delete event from database:', result.error);
          }
        } catch (dbError) {
          console.warn('Database not available for event deletion:', dbError);
        }
      }

      console.log('Event deleted:', id);
    } catch (error) {
      console.error('Failed to delete event:', error);
      throw error;
    }
  }, [isDatabaseReady]);

  const loadMatch = useCallback(async (match: Match) => {
    try {
      setCurrentMatch(match);
      setClock(match.clock || defaultContextValue.clock);
      setSettings(match.settings || defaultContextValue.settings);

      // Load events for this match from IndexedDB only if database is ready
      if (isDatabaseReady) {
        try {
          const { db } = await import('../db/indexedDB');
          const result = await db.getEnhancedMatchEvents(match.id);
          if (result.success && result.data) {
            const matchEvents: MatchEvent[] = result.data.map(event => ({
              id: event.id,
              kind: event.kind,
              matchId: event.match_id,
              createdAt: new Date(event.created_at),
              periodNumber: event.period_number || 1,
              clockMs: event.clock_ms || 0,
              teamId: event.team_id,
              playerId: event.player_id,
              sentiment: event.sentiment || 0,
              notes: event.notes || '',
              // Auth fields required by shared types
              created_by_user_id: event.created_by_user_id || 'system',
              is_deleted: event.is_deleted || false,
            }));
            
            setEvents(matchEvents.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
          }
        } catch (dbError) {
          console.warn('Database not available for loading match events:', dbError);
          // Continue without events - they'll be loaded when database becomes available
        }
      }

      console.log('Match loaded:', match.id);
    } catch (error) {
      console.error('Failed to load match:', error);
      throw error;
    }
  }, [isDatabaseReady]);

  const saveMatch = useCallback(async () => {
    if (!currentMatch) {
      throw new Error('No current match to save');
    }

    try {
      // Update match with current state
      const updatedMatch: Match = {
        ...currentMatch,
        clock,
        settings,
        status: clock.running ? 'in_progress' : 'not_started'
      };

      setCurrentMatch(updatedMatch);
      console.log('Match saved:', updatedMatch);
    } catch (error) {
      console.error('Failed to save match:', error);
      throw error;
    }
  }, [currentMatch, clock, settings]);

  // Context value
  const contextValue: MatchContextType = {
    // State
    clock,
    current_match: currentMatch,
    events,
    settings,
    
    // Actions
    startClock,
    pauseClock,
    resetClock,
    startPeriod,
    endPeriod,
    addEvent,
    updateEvent,
    deleteEvent,
    loadMatch,
    saveMatch
  };

  return (
    <MatchContext.Provider value={contextValue}>
      {children}
    </MatchContext.Provider>
  );
};