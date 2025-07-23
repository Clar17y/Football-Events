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
// Import EventKind from shared types to ensure consistency
export type { EventKind } from '@shared/types';

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
// Update EVENT_METADATA to include all EventKind values from shared types
export const EVENT_METADATA: Partial<Record<EventKind, EventMetadata>> = {
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
  interception: {
    kind: 'interception',
    label: 'Interception',
    category: 'positive',
    icon: checkmarkCircle,
    color: 'success',
    description: 'Player intercepts opponent pass'
  },
  tackle: {
    kind: 'tackle',
    label: 'Tackle',
    category: 'positive',
    icon: shieldCheckmark,
    color: 'success',
    description: 'Player wins ball through tackle'
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
  ball_out: {
    kind: 'ball_out',
    label: 'Ball Out',
    category: 'negative',
    icon: removeCircle,
    color: 'medium',
    description: 'Ball goes out of play'
  },
  own_goal: {
    kind: 'own_goal',
    label: 'Own Goal',
    category: 'negative',
    icon: sad,
    color: 'danger',
    description: 'Player scores in own goal'
  }
};

// Import Event from shared types for consistency
export type { Event as MatchEvent } from '@shared/types';

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