import type { ID, Timestamp } from './index';
import type { EventKind, Event as SharedEvent } from '@shared/types';
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

// Re-export EventKind for consumers of this module
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

/** Re-export Shared Event as MatchEvent */
export type MatchEvent = SharedEvent;

/**
 * Event payload for database storage (standardized camelCase)
 */
export interface EventPayload {
  kind: EventKind;
  matchId: ID;
  seasonId: ID;
  teamId: ID;
  playerId: ID;
  periodNumber: number;
  clockMs: number;
  sentiment: number;
  notes?: string;
  createdAt: string;
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
  timestamp: number; // clockMs
  metadata: EventMetadata;
}

/**
 * Event statistics
 */
export interface EventStats {
  totalEvents: number;
  eventsByKind: Record<EventKind, number>;
  eventsByTeam: Record<ID, number>;
  eventsByPlayer: Record<ID, number>;
  eventsByPeriod: Record<number, number>;
}

/**
 * Helper functions for event categorization
 */
export const getEventsByCategory = (category: EventCategory): EventKind[] => {
  return (Object.values(EVENT_METADATA) as EventMetadata[])
    .filter(meta => meta?.category === category)
    .map(meta => meta.kind);
};

export const getEventMetadata = (kind: EventKind): EventMetadata | undefined => {
  return EVENT_METADATA[kind];
};

export const isPositiveEvent = (kind: EventKind): boolean => {
  return EVENT_METADATA[kind]?.category === 'positive';
};

export const isNegativeEvent = (kind: EventKind): boolean => {
  return EVENT_METADATA[kind]?.category === 'negative';
};