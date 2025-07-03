/**
 * Core type definitions for the Grassroots Football Logger
 * 
 * This file contains the main entity types used throughout the application.
 * All property names use snake_case for consistency with database schema.
 */

/**
 * Represents a football player
 */
export interface Player {
  /** Unique identifier for the player */
  id: string;
  /** Player's full name */
  full_name: string;
  /** Player's jersey number (optional) */
  jersey_number?: number;
  /** Player's position on the field (optional) */
  position?: PlayerPosition;
  /** Whether the player is currently active in the squad */
  is_active: boolean;
  /** Team ID this player belongs to */
  team_id?: string;
}

/**
 * Football positions
 */
export type PlayerPosition = 
  | 'goalkeeper'
  | 'defender' 
  | 'midfielder'
  | 'forward'
  | 'substitute';

/**
 * Match clock state
 */
export interface MatchClock {
  /** Whether the clock is currently running */
  running: boolean;
  /** Wall-clock timestamp when the current period started */
  start_ts: number | null;
  /** Total paused time in milliseconds */
  offset_ms: number;
  /** Current period number */
  current_period: number;
  /** Period start times for tracking */
  period_starts: Record<number, number>;
}

/**
 * Represents a football team
 */
export interface Team {
  /** Unique identifier for the team */
  id: string;
  /** Team name */
  name: string;
  /** List of players in the team */
  players: Player[];
  /** Primary team color (hex code) */
  color_primary?: string;
  /** Secondary team color (hex code) */
  color_secondary?: string;
  /** Team formation (e.g., "4-4-2") */
  formation?: string;
}

/**
 * Represents a football match
 */
export interface Match {
  /** Unique identifier for the match */
  id: string;
  /** Season this match belongs to */
  season_id: string;
  /** Home team */
  home_team: Team;
  /** Away team */
  away_team: Team;
  /** Match date and time */
  date: number; // Unix timestamp
  /** Current match status */
  status: MatchStatus;
  /** Match settings and configuration */
  settings: MatchSettings;
  /** Current period (1 = first half, 2 = second half, etc.) */
  current_period: number;
  /** Match clock state */
  clock: MatchClock;
  /** Match result (if completed) */
  result?: MatchResult;
}

/**
 * Match status enumeration
 */
export type MatchStatus = 
  | 'not_started'
  | 'in_progress'
  | 'half_time'
  | 'extra_time'
  | 'penalty_shootout'
  | 'completed'
  | 'abandoned'
  | 'postponed';

/**
 * Match settings and configuration
 */
export interface MatchSettings {
  /** Match duration per period in minutes */
  period_duration: number;
  /** Number of periods (usually 2 for halves) */
  total_periods: number;
  /** Half-time duration in minutes */
  half_time_duration: number;
  /** Whether extra time is allowed */
  allow_extra_time: boolean;
  /** Extra time duration per period in minutes */
  extra_time_duration: number;
  /** Whether penalty shootout is allowed */
  allow_penalty_shootout: boolean;
  /** Maximum number of substitutions allowed per team */
  max_substitutions: number;
  /** Whether to track injury time */
  track_injury_time: boolean;
}

/**
 * Match result
 */
export interface MatchResult {
  /** Home team score */
  home_score: number;
  /** Away team score */
  away_score: number;
  /** Whether the match went to extra time */
  extra_time: boolean;
  /** Whether the match went to penalty shootout */
  penalty_shootout: boolean;
  /** Penalty shootout result (if applicable) */
  penalty_result?: {
    home_penalties: number;
    away_penalties: number;
  };
}

/**
 * Sentiment rating scale
 */
export interface SentimentOption {
  value: number;
  label: string;
}

/**
 * Default sentiment options
 */
export const SENTIMENT_OPTIONS: SentimentOption[] = [
  { value: 4,  label: 'Outstanding' },
  { value: 3,  label: 'Excellent' },
  { value: 2,  label: 'Good' },
  { value: 1,  label: 'Solid' },
  { value: 0,  label: 'Neutral' },
  { value: -1, label: 'Below par' },
  { value: -2, label: 'Poor' },
  { value: -3, label: 'Bad' },
  { value: -4, label: 'Terrible' },
];

/**
 * Common utility types
 */
export type ID = string;
export type Timestamp = number;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;