import React, { createContext, useState, useCallback, useContext } from 'react';
import type { MatchClock, MatchContextState, MatchContextActions, MatchSettings } from '../types/match';
import type { MatchEvent } from '../types/events';
import type { Team } from '../types/index';
import type { Match } from '../types/match';
import { db } from '../db/indexedDB';
import { validateOrThrow, MatchEventSchema } from '../schemas/validation';

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
  addEvent: async () => {},
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
 * Match provider component with comprehensive match management
 */
export const MatchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State management
  const [clock, setClock] = useState<MatchClock>(defaultContextValue.clock);
  const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [settings, setSettings] = useState(defaultContextValue.settings);

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
      return {
        ...prevClock,
        running: false,
        start_ts: null,
        offset_ms: prevClock.offset_ms + (now - prevClock.start_ts)
      };
    });
  }, []);

  const resetClock = useCallback(() => {
    setClock({
      running: false,
      start_ts: null,
      offset_ms: 0,
      current_period: 1,
      period_starts: {}
    });
    setEvents([]);
  }, []);

  const startPeriod = useCallback((period: number) => {
    setClock(prevClock => ({
      ...prevClock,
      current_period: period,
      running: false,
      start_ts: null,
      offset_ms: 0
    }));
  }, []);

  const endPeriod = useCallback(() => {
    pauseClock();
    // Additional period end logic can be added here
  }, [pauseClock]);

  // Event management actions
  const addEvent = useCallback(async (eventData: Omit<MatchEvent, 'id' | 'created'>) => {
    try {
      // Validate event data
      const eventWithDefaults = {
        ...eventData,
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        created: Date.now()
      };

      validateOrThrow(MatchEventSchema, eventWithDefaults, 'MatchEvent');

      // Add to database
      const result = await db.addEvent({
        ...eventData,
        created: Date.now()
      });
      if (!result.success) {
        throw new Error(result.error || 'Failed to save event');
      }

      // Update local state
      setEvents(prevEvents => [eventWithDefaults, ...prevEvents]);
      
      console.log('Event added successfully:', eventWithDefaults);
    } catch (error) {
      console.error('Failed to add event:', error);
      throw error; // Re-throw to allow UI to handle the error
    }
  }, []);

  const updateEvent = useCallback(async (id: string, updates: Partial<MatchEvent>) => {
    try {
      // Update local state optimistically
      setEvents(prevEvents => 
        prevEvents.map(event => 
          event.id === id ? { ...event, ...updates } : event
        )
      );

      // TODO: Update in database when update functionality is implemented
      console.log('Event updated:', { id, updates });
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  }, []);

  const deleteEvent = useCallback(async (id: string) => {
    try {
      // Remove from local state
      setEvents(prevEvents => prevEvents.filter(event => event.id !== id));

      // TODO: Remove from database when delete functionality is implemented
      console.log('Event deleted:', id);
    } catch (error) {
      console.error('Failed to delete event:', error);
      throw error;
    }
  }, []);

  // Match management actions
  const loadMatch = useCallback(async (match: Match) => {
    try {
      setCurrentMatch(match);
      setClock(match.clock);
      setSettings(match.settings);

      // Load events for this match
      const eventsResult = await db.getMatchEvents(match.id);
      if (eventsResult.success && eventsResult.data) {
        // Convert outbox events to match events for display
        const matchEvents: MatchEvent[] = eventsResult.data.map(outboxEvent => ({
          id: outboxEvent.id?.toString() || '',
          ...(outboxEvent.payload || outboxEvent.data || {}),
          metadata: {}
        }));
        setEvents(matchEvents);
      }

      console.log('Match loaded:', match);
    } catch (error) {
      console.error('Failed to load match:', error);
      throw error;
    }
  }, []);

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
