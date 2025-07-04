/**
 * Match-specific type definitions
 * 
 * This file contains types related to match management,
 * clock functionality, and match state.
 */

import type { ID, Timestamp, Team } from './index';
import type { MatchEvent } from './events';

/**
 * Match clock state
 */
export interface MatchClock {
  /** Whether the clock is currently running */
  running: boolean;
  /** Wall-clock timestamp when the current period started */
  start_ts: Timestamp | null;
  /** Total paused time in milliseconds */
  offset_ms: number;
  /** Current period number */
  current_period: number;
  /** Period start times for tracking */
  period_starts: Record<number, Timestamp>;
}

/**
 * Match context state
 */
export interface MatchContextState {
  /** Current match clock */
  clock: MatchClock;
  /** Current match information */
  current_match: Match | null;
  /** All events for the current match */
  events: MatchEvent[];
  /** Match settings */
  settings: MatchSettings;
}

/**
 * Match context actions
 */
export interface MatchContextActions {
  /** Start the match clock */
  startClock: () => void;
  /** Pause the match clock */
  pauseClock: () => void;
  /** Reset the match clock */
  resetClock: () => void;
  /** Start a new period */
  startPeriod: (period: number) => void;
  /** End the current period */
  endPeriod: () => void;
  /** Add an event to the match */
  addEvent: (event: Omit<MatchEvent, 'id' | 'created'>) => Promise<void>;
  /** Update an existing event */
  updateEvent: (id: ID, updates: Partial<MatchEvent>) => Promise<void>;
  /** Delete an event */
  deleteEvent: (id: ID) => Promise<void>;
  /** Load a match */
  loadMatch: (match: Match) => Promise<void>;
  /** Save the current match */
  saveMatch: () => Promise<void>;
}

/**
 * Complete match information
 */
export interface Match {
  /** Unique identifier for the match */
  id: ID;
  /** Season this match belongs to */
  season_id: ID;
  /** Home team */
  home_team: Team;
  /** Away team */
  away_team: Team;
  /** Match date and time */
  date: Timestamp;
  /** Current match status */
  status: MatchStatus;
  /** Match settings */
  settings: MatchSettings;
  /** Current period */
  current_period: number;
  /** Match clock state */
  clock: MatchClock;
  /** Match result (if completed) */
  result?: MatchResult;
  /** Match metadata */
  metadata?: MatchMetadata;
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
 * Default match settings
 */
export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  period_duration: 45, // 45 minutes per half
  total_periods: 2,
  half_time_duration: 15,
  allow_extra_time: false,
  extra_time_duration: 15,
  allow_penalty_shootout: false,
  max_substitutions: 5,
  track_injury_time: true,
};

/**
 * Match result
 */
export interface MatchResult {
  /** Home team score */
  home_score: number;
  /** Away team score */
  away_score: number;
  /** Whether the match went to extra time */
  went_to_extra_time: boolean;
  /** Whether the match went to penalty shootout */
  went_to_penalty_shootout: boolean;
  /** Penalty shootout result (if applicable) */
  penalty_result?: PenaltyShootoutResult;
  /** Match winner (if not a draw) */
  winner?: 'home' | 'away';
  /** Final match status */
  final_status: MatchStatus;
}

/**
 * Penalty shootout result
 */
export interface PenaltyShootoutResult {
  /** Home team penalty goals */
  home_penalties: number;
  /** Away team penalty goals */
  away_penalties: number;
  /** Penalty sequence details */
  sequence: PenaltyAttempt[];
}

/**
 * Individual penalty attempt
 */
export interface PenaltyAttempt {
  /** Team taking the penalty */
  team_id: ID;
  /** Player taking the penalty */
  player_id: ID;
  /** Whether the penalty was scored */
  scored: boolean;
  /** Order in the sequence */
  order: number;
}

/**
 * Match metadata
 */
export interface MatchMetadata {
  /** Venue where the match was played */
  venue?: string;
  /** Weather conditions */
  weather?: string;
  /** Referee information */
  referee?: string;
  /** Competition/tournament */
  competition?: string;
  /** Match importance/type */
  match_type?: 'league' | 'cup' | 'friendly' | 'playoff';
  /** Additional notes */
  notes?: string;
}

/**
 * Substitution information
 */
export interface Substitution {
  /** Unique identifier */
  id: ID;
  /** Match this substitution belongs to */
  match_id: ID;
  /** Team making the substitution */
  team_id: ID;
  /** Player coming off */
  player_off_id: ID;
  /** Player coming on */
  player_on_id: ID;
  /** Time of substitution (match clock in ms) */
  clock_ms: number;
  /** Period when substitution occurred */
  period_number: number;
  /** Reason for substitution */
  reason?: 'tactical' | 'injury' | 'performance' | 'disciplinary';
  /** When the substitution was recorded */
  created: Timestamp;
}

/**
 * Match statistics summary
 */
export interface MatchStatistics {
  /** Basic match info */
  match_id: ID;
  /** Team statistics */
  team_stats: Record<ID, TeamMatchStats>;
  /** Player statistics */
  player_stats: Record<ID, PlayerMatchStats>;
  /** Overall match stats */
  match_summary: MatchSummaryStats;
}

/**
 * Team statistics for a match
 */
export interface TeamMatchStats {
  team_id: ID;
  goals: number;
  shots: number;
  shots_on_target: number;
  possession_percentage: number;
  passes: number;
  pass_accuracy: number;
  corners: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
  substitutions: number;
}

/**
 * Player statistics for a match
 */
export interface PlayerMatchStats {
  player_id: ID;
  team_id: ID;
  minutes_played: number;
  goals: number;
  assists: number;
  shots: number;
  passes: number;
  pass_accuracy: number;
  tackles: number;
  fouls: number;
  yellow_cards: number;
  red_cards: number;
  rating: number; // Average sentiment
}

/**
 * Overall match summary statistics
 */
export interface MatchSummaryStats {
  total_events: number;
  total_goals: number;
  total_fouls: number;
  total_cards: number;
  match_duration: number; // in minutes
  most_active_player: ID;
  most_active_team: ID;
}