/**
 * Event-specific type definitions for match events
 * 
 * This file contains all types related to match events, including
 * event kinds, payloads, and metadata.
 */

import type { ID, Timestamp } from './index';
import { 
  football, 
  ribbon, 
  key, 
  shieldCheckmark, 
  checkmarkCircle, 
  flagOutline, 
  medal, 
  warning, 
  closeCircle, 
  sad, 
  removeCircle 
} from 'ionicons/icons';

/**
 * All possible event types in a football match
 */
export type EventKind = 
  // Positive events
  | 'goal'
  | 'assist'
  | 'key_pass'
  | 'save'
  | 'ball_won'
  // Neutral events
  | 'corner'
  | 'free_kick'
  | 'penalty'
  // Negative events
  | 'foul'
  | 'ball_lost'
  | 'own_goal'
  | 'ball_out';

/**
 * Event categories for UI grouping
 */
export type EventCategory = 'positive' | 'neutral' | 'negative';

/**
 * Event metadata for UI display
 */
export interface EventMetadata {
  kind: EventKind;
  label: string;
  category: EventCategory;
  icon: any; // Ionicon component
  color: 'success' | 'primary' | 'warning' | 'danger' | 'medium';
  description?: string;
}


/**
 * Default event configurations
 */
export const EVENT_METADATA: Record<EventKind, EventMetadata> = {
  // Positive events
  goal: {
    kind: 'goal',
    label: 'Goal',
    category: 'positive',
    icon: football,
    color: 'success',
    description: 'Ball crosses the goal line'
  },
  assist: {
    kind: 'assist',
    label: 'Assist',
    category: 'positive',
    icon: ribbon,
    color: 'success',
    description: 'Pass leading directly to a goal'
  },
  key_pass: {
    kind: 'key_pass',
    label: 'Key Pass',
    category: 'positive',
    icon: key,
    color: 'success',
    description: 'Pass leading to a scoring opportunity'
  },
  save: {
    kind: 'save',
    label: 'Save',
    category: 'positive',
    icon: shieldCheckmark,
    color: 'success',
    description: 'Goalkeeper prevents a goal'
  },
  ball_won: {
    kind: 'ball_won',
    label: 'Ball Won',
    category: 'positive',
    icon: checkmarkCircle,
    color: 'success',
    description: 'Player regains possession'
  },
  // Neutral events
  corner: {
    kind: 'corner',
    label: 'Corner',
    category: 'neutral',
    icon: flagOutline,
    color: 'primary',
    description: 'Corner kick awarded'
  },
  free_kick: {
    kind: 'free_kick',
    label: 'Free Kick',
    category: 'neutral',
    icon: medal,
    color: 'primary',
    description: 'Free kick awarded'
  },
  penalty: {
    kind: 'penalty',
    label: 'Penalty',
    category: 'neutral',
    icon: ribbon,
    color: 'primary',
    description: 'Penalty kick awarded'
  },
  // Negative events
  foul: {
    kind: 'foul',
    label: 'Foul',
    category: 'negative',
    icon: warning,
    color: 'warning',
    description: 'Foul committed'
  },
  ball_lost: {
    kind: 'ball_lost',
    label: 'Ball Lost',
    category: 'negative',
    icon: closeCircle,
    color: 'danger',
    description: 'Player loses possession'
  },
  own_goal: {
    kind: 'own_goal',
    label: 'Own Goal',
    category: 'negative',
    icon: sad,
    color: 'danger',
    description: 'Player scores in own goal'
  },
  ball_out: {
    kind: 'ball_out',
    label: 'Ball Out',
    category: 'negative',
    icon: removeCircle,
    color: 'medium',
    description: 'Ball goes out of play'
  }
};

/**
 * Core match event structure
 */
export interface MatchEvent {
  /** Unique identifier for the event */
  id: ID;
  /** Type of event */
  kind: EventKind;
  /** Match this event belongs to */
  match_id: ID;
  /** Season this event belongs to */
  season_id: ID;
  /** Team involved in the event */
  team_id: ID;
  /** Player involved in the event */
  player_id: ID;
  /** Match period when event occurred */
  period_number: number;
  /** Time in match when event occurred (milliseconds) */
  clock_ms: number;
  /** Sentiment rating for the event (-4 to 4) */
  sentiment: number;
  /** Optional notes about the event */
  notes?: string;
  /** When the event was created (Unix timestamp) */
  created: Timestamp;
  /** Field coordinates where event occurred (optional) */
  coordinates?: {
    x: number; // 0-100 (percentage of field width)
    y: number; // 0-100 (percentage of field height)
  };
  /** Additional metadata */
  metadata?: {
    /** Whether this event was auto-detected */
    auto_detected?: boolean;
    /** Confidence score for auto-detected events */
    confidence?: number;
    /** Related events (e.g., assist for a goal) */
    related_events?: ID[];
  };
}

/**
 * Event payload for database storage
 */
export interface EventPayload {
  kind: EventKind;
  match_id: ID;
  season_id: ID;
  team_id: ID;
  player_id: ID;
  period_number: number;
  clock_ms: number;
  sentiment: number;
  notes?: string;
  created: Timestamp;
  coordinates?: {
    x: number;
    y: number;
  };
}

/**
 * Event for UI display (simplified)
 */
export interface EventDisplay {
  kind: EventKind;
  team: string;
  player: string;
  timestamp: number; // clock_ms
  metadata: EventMetadata;
}

/**
 * Event statistics
 */
export interface EventStats {
  total_events: number;
  events_by_kind: Record<EventKind, number>;
  events_by_team: Record<ID, number>;
  events_by_player: Record<ID, number>;
  events_by_period: Record<number, number>;
}

/**
 * Helper functions for event categorization
 */
export const getEventsByCategory = (category: EventCategory): EventKind[] => {
  return Object.values(EVENT_METADATA)
    .filter(meta => meta.category === category)
    .map(meta => meta.kind);
};

export const getEventMetadata = (kind: EventKind): EventMetadata => {
  return EVENT_METADATA[kind];
};

export const isPositiveEvent = (kind: EventKind): boolean => {
  return EVENT_METADATA[kind].category === 'positive';
};

export const isNegativeEvent = (kind: EventKind): boolean => {
  return EVENT_METADATA[kind].category === 'negative';
};