import type {
  Player as SharedPlayer,
  Team as SharedTeam,
  Match as SharedMatch,
  Season as SharedSeason,
  Position as SharedPosition,
  IsoDateTimeString,
  IsoDateString
} from '@shared/types';

/**
 * Core type definitions for the Grassroots Football Logger
 * 
 * This file re-exports types from @shared/types to ensure consistency
 * across the frontend and backend.
 */

/**
 * Represents a football player
 */
export type Player = SharedPlayer;

/**
 * Football team
 */
export type Team = SharedTeam;

/**
 * Complete Match information (frontend extended version)
 */
export type {
  Match,
  MatchStatus,
  MatchSettings,
  MatchResult,
  MatchClock
} from './match';

/**
 * Season information
 */
export type Season = SharedSeason;

/**
 * Football position
 */
export type Position = SharedPosition;

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
  { value: 4, label: 'Outstanding' },
  { value: 3, label: 'Excellent' },
  { value: 2, label: 'Good' },
  { value: 1, label: 'Solid' },
  { value: 0, label: 'Neutral' },
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

// Create/Update request types are also managed in shared types
export type {
  PlayerCreateRequest as CreatePlayer,
  PlayerUpdateRequest as UpdatePlayer,
  TeamCreateRequest as CreateTeam,
  TeamUpdateRequest as UpdateTeam
} from '@shared/types';
