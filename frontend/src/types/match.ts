import type {
  Match as SharedMatch
} from '@shared/types';
import type { ID, Timestamp, Team } from './index';
import type { MatchEvent } from './events';

/**
 * Match clock state
 */
export interface MatchClock {
  /** Whether the clock is currently running */
  running: boolean;
  /** Wall-clock timestamp when the current period started */
  startTs: Timestamp | null;
  /** Total paused time in milliseconds */
  offsetMs: number;
  /** Current period number */
  currentPeriod: number;
  /** Period start times for tracking */
  periodStarts: Record<number, Timestamp>;
}

/**
 * Match context state
 */
export interface MatchContextState {
  /** Current match clock */
  clock: MatchClock;
  /** Current match information */
  currentMatch: Match | null;
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
  addEvent: (event: Omit<MatchEvent, 'id' | 'createdAt'>) => Promise<MatchEvent>;
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
 * Complete Match information (extended for frontend use)
 */
export interface Match extends SharedMatch {
  /** Current match status */
  status: MatchStatus;
  /** Match settings */
  settings: MatchSettings;
  /** Current period */
  currentPeriod: number;
  /** Match clock state */
  clock: MatchClock;
  /** Match result (if completed) */
  result?: MatchResult;
  /** Metadata and sync fields */
  metadata?: MatchMetadata;
}

/**
 * Match status enumeration
 */
export type MatchStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'HALF_TIME'
  | 'EXTRA_TIME'
  | 'PENALTY_SHOOTOUT'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'POSTPONED';

/**
 * Match settings and configuration
 */
export interface MatchSettings {
  /** Match duration per period in minutes */
  periodDuration: number;
  /** Number of periods (usually 2 for halves) */
  totalPeriods: number;
  /** Half-time duration in minutes */
  halfTimeDuration: number;
  /** Whether extra time is allowed */
  allowExtraTime: boolean;
  /** Extra time duration per period in minutes */
  extraTimeDuration: number;
  /** Whether penalty shootout is allowed */
  allowPenaltyShootout: boolean;
  /** Maximum number of substitutions allowed per team */
  maxSubstitutions: number;
  /** Whether to track injury time */
  trackInjuryTime: boolean;
}

/**
 * Default match settings
 */
export const DEFAULT_MATCH_SETTINGS: MatchSettings = {
  periodDuration: 45, // 45 minutes per half
  totalPeriods: 2,
  halfTimeDuration: 15,
  allowExtraTime: false,
  extraTimeDuration: 15,
  allowPenaltyShootout: false,
  maxSubstitutions: 5,
  trackInjuryTime: true,
};

/**
 * Match result
 */
export interface MatchResult {
  /** Home team score */
  homeScore: number;
  /** Away team score */
  awayScore: number;
  /** Whether the match went to extra time */
  wentToExtraTime: boolean;
  /** Whether the match went to penalty shootout */
  wentToPenaltyShootout: boolean;
  /** Penalty shootout result (if applicable) */
  penaltyResult?: PenaltyShootoutResult;
  /** Match winner (if not a draw) */
  winner?: 'home' | 'away';
  /** Final match status */
  finalStatus: MatchStatus;
}

/**
 * Penalty shootout result
 */
export interface PenaltyShootoutResult {
  /** Home team penalty goals */
  homePenalties: number;
  /** Away team penalty goals */
  awayPenalties: number;
  /** Penalty sequence details */
  sequence: PenaltyAttempt[];
}

/**
 * Individual penalty attempt
 */
export interface PenaltyAttempt {
  /** Team taking the penalty */
  teamId: ID;
  /** Player taking the penalty */
  playerId: ID;
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
  matchType?: 'league' | 'cup' | 'friendly' | 'playoff';
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
  matchId: ID;
  /** Team making the substitution */
  teamId: ID;
  /** Player coming off */
  playerOffId: ID;
  /** Player coming on */
  playerOnId: ID;
  /** Time of substitution (match clock in ms) */
  clockMs: number;
  /** Period when substitution occurred */
  periodNumber: number;
  /** Reason for substitution */
  reason?: 'tactical' | 'injury' | 'performance' | 'disciplinary';
  /** When the substitution was recorded */
  createdAt: string;
}

/**
 * Match statistics summary
 */
export interface MatchStatistics {
  /** Basic match info */
  matchId: ID;
  /** Team statistics */
  teamStats: Record<ID, TeamMatchStats>;
  /** Player statistics */
  playerStats: Record<ID, PlayerMatchStats>;
  /** Overall match stats */
  matchSummary: MatchSummaryStats;
}

/**
 * Team statistics for a match
 */
export interface TeamMatchStats {
  teamId: ID;
  goals: number;
  shots: number;
  shotsOnTarget: number;
  possessionPercentage: number;
  passes: number;
  passAccuracy: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  substitutions: number;
}

/**
 * Player statistics for a match
 */
export interface PlayerMatchStats {
  playerId: ID;
  teamId: ID;
  minutesPlayed: number;
  goals: number;
  assists: number;
  shots: number;
  passes: number;
  passAccuracy: number;
  tackles: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  rating: number; // Average sentiment
}

/**
 * Overall match summary statistics
 */
export interface MatchSummaryStats {
  totalEvents: number;
  totalGoals: number;
  totalFouls: number;
  totalCards: number;
  matchDuration: number; // in minutes
  mostActivePlayer: ID;
  mostActiveTeam: ID;
}
