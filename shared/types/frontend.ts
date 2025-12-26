/**
 * Frontend-friendly interfaces with camelCase naming and UI-optimized structure
 * These interfaces are designed for React components and form handling
 * 
 * CONVENTIONS:
 * - All field names use camelCase (no underscores)
 * - All date/time fields use ISO strings (JSON-native, no Date objects)
 * - snake_case is only used at the Prisma/PostgreSQL boundary
 */

import type { EventKind } from './prisma';

// ============================================================================
// TYPE ALIASES FOR ISO DATE STRINGS
// ============================================================================

/** ISO 8601 date-time string, e.g. "2025-12-17T12:34:56.789Z" */
export type IsoDateTimeString = string;

/** ISO 8601 date string, e.g. "2025-12-17" */
export type IsoDateString = string;

// ============================================================================
// CORE ENTITIES - Frontend Interfaces
// ============================================================================

export interface PlayerStats {
  matches: number;
  goals?: number;
  assists?: number;
  saves?: number;
  tackles?: number;
  interceptions?: number;
  keyPasses?: number;
  cleanSheets?: number;
}

export interface Player {
  id: string;
  name: string;                    // mapped from full_name
  squadNumber?: number;            // mapped from squad_number
  preferredPosition?: string;      // mapped from preferred_pos
  dateOfBirth?: IsoDateString;     // mapped from dob
  notes?: string;
  currentTeam?: string;            // mapped from current_team
  stats?: PlayerStats;             // Player statistics
  createdAt: IsoDateTimeString;    // mapped from created_at
  updatedAt?: IsoDateTimeString;   // mapped from updated_at
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface Team {
  id: string;
  name: string;
  homeKitPrimary?: string;         // mapped from home_kit_primary
  homeKitSecondary?: string;       // mapped from home_kit_secondary
  awayKitPrimary?: string;         // mapped from away_kit_primary
  awayKitSecondary?: string;       // mapped from away_kit_secondary
  logoUrl?: string;                // mapped from logo_url
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
  // Visibility flags (camelCase)
  isOpponent: boolean;
}

export interface Match {
  id: string;                      // mapped from match_id
  seasonId: string;                // mapped from season_id
  kickoffTime: IsoDateTimeString;  // mapped from kickoff_ts
  competition?: string;
  homeTeamId: string;              // mapped from home_team_id
  awayTeamId: string;              // mapped from away_team_id
  homeTeam?: Team;                 // nested home team data
  awayTeam?: Team;                 // nested away team data
  venue?: string;
  durationMinutes: number;         // mapped from duration_mins
  periodFormat: string;            // mapped from period_format
  homeScore: number;               // mapped from home_score
  awayScore: number;               // mapped from away_score
  // Deprecated: kept temporarily for compatibility in some UI components
  ourScore?: number;               // mapped from our_score
  opponentScore?: number;          // mapped from opponent_score
  notes?: string;
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface Event {
  id: string;
  matchId: string;                 // mapped from match_id
  createdAt: IsoDateTimeString;    // mapped from created_at
  periodNumber?: number;           // mapped from period_number
  clockMs?: number;                // mapped from clock_ms
  kind: EventKind;
  teamId?: string;                 // mapped from team_id
  playerId?: string;               // mapped from player_id
  notes?: string;
  sentiment: number;
  updatedAt?: IsoDateTimeString;
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface Season {
  id: string;                      // mapped from season_id (for compatibility)
  seasonId: string;                // mapped from season_id
  label: string;
  startDate?: IsoDateString;       // mapped from start_date
  endDate?: IsoDateString;         // mapped from end_date
  isCurrent: boolean;              // mapped from is_current
  description?: string;            // mapped from description
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface Position {
  code: string;                    // mapped from pos_code
  longName: string;                // mapped from long_name
  createdAt: IsoDateTimeString;    // mapped from created_at
  updatedAt?: IsoDateTimeString;   // mapped from updated_at
}

export interface Lineup {
  id: string;                      // UUID primary key
  matchId: string;                 // mapped from match_id
  playerId: string;                // mapped from player_id
  startMinute: number;             // mapped from start_min
  endMinute?: number;              // mapped from end_min
  position: string;                // position code reference
  createdAt: IsoDateTimeString;    // mapped from created_at
  updatedAt?: IsoDateTimeString;   // mapped from updated_at
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

// ============================================================================
// FORM INPUT TYPES - For Creating/Updating Records
// ============================================================================

export interface PlayerCreateRequest {
  /** Optional client-generated UUID for local-first creation */
  id?: string;
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: IsoDateString;
  notes?: string;
  currentTeam?: string;
}

export interface PlayerUpdateRequest {
  name?: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: IsoDateString;
  notes?: string;
  currentTeam?: string;
}

export interface TeamCreateRequest {
  /** Optional client-generated UUID for local-first creation */
  id?: string;
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
  // Visibility (camelCase)
  isOpponent?: boolean;
}

export interface TeamUpdateRequest {
  name?: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
}

export interface MatchCreateRequest {
  /** Optional client-generated UUID for local-first creation */
  id?: string;
  seasonId: string;
  kickoffTime: IsoDateTimeString;
  competition?: string;
  homeTeamId: string;
  awayTeamId: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: string;
  notes?: string;
}

export interface MatchUpdateRequest {
  seasonId?: string;
  kickoffTime?: IsoDateTimeString;
  competition?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: string;
  homeScore?: number;
  awayScore?: number;
  notes?: string;
}

export interface EventCreateRequest {
  /** Optional client-generated UUID for local-first creation */
  id?: string;
  matchId: string;
  periodNumber?: number;
  clockMs?: number;
  kind: EventKind;
  teamId?: string;
  playerId?: string;
  notes?: string;
  sentiment?: number;
}

export interface EventUpdateRequest {
  matchId?: string;
  periodNumber?: number;
  clockMs?: number;
  kind?: EventKind;
  teamId?: string;
  playerId?: string;
  notes?: string;
  sentiment?: number;
}

export interface SeasonCreateRequest {
  /** Optional client-generated UUID for local-first creation */
  id?: string;
  label: string;
  startDate: IsoDateString;
  endDate: IsoDateString;
  isCurrent?: boolean;
  description?: string;
}

export interface SeasonUpdateRequest {
  label?: string;
  startDate?: IsoDateString;
  endDate?: IsoDateString;
  isCurrent?: boolean;
  description?: string;
}

export interface PositionCreateRequest {
  code: string;
  longName: string;
}

export interface PositionUpdateRequest {
  code?: string;
  longName?: string;
}

export interface LineupCreateRequest {
  /** Optional client-generated UUID for local-first creation */
  id?: string;
  matchId: string;
  playerId: string;
  startMinute?: number;
  endMinute?: number;
  position: string;
}

export interface LineupUpdateRequest {
  startMinute?: number;
  endMinute?: number;
  position?: string;
}

// Award interfaces
export interface Award {
  id: string;
  seasonId: string;
  playerId: string;
  category: string;
  notes?: string;
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface AwardCreateRequest {
  seasonId: string;
  playerId: string;
  category: string;
  notes?: string;
}

export interface AwardUpdateRequest {
  category?: string;
  notes?: string;
}

// Match Award interfaces
export interface MatchAward {
  id: string;
  matchId: string;
  playerId: string;
  category: string;
  notes?: string;
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface MatchAwardCreateRequest {
  matchId: string;
  playerId: string;
  category: string;
  notes?: string;
}

export interface MatchAwardUpdateRequest {
  category?: string;
  notes?: string;
}

// Player Team interfaces
export interface PlayerTeam {
  id: string;
  playerId: string;
  teamId: string;
  startDate: IsoDateString;
  endDate?: IsoDateString;
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface PlayerTeamCreateRequest {
  /** Optional client-generated UUID for local-first creation */
  id?: string;
  playerId: string;
  teamId: string;
  startDate: IsoDateString;
  endDate?: IsoDateString;
}

export interface PlayerTeamUpdateRequest {
  playerId?: string;
  teamId?: string;
  startDate?: IsoDateString;
  endDate?: IsoDateString;
}

// ============================================================================
// UI-SPECIFIC TYPES
// ============================================================================

export interface PlayerWithTeam extends Player {
  team?: Team;
}

export interface TeamWithPlayers extends Team {
  players: Player[];
}

export interface MatchWithTeams extends Match {
  homeTeam: Team;
  awayTeam: Team;
  season: Season;
}

export interface EventWithDetails extends Event {
  player?: Player;
  team?: Team;
  match: Match;
}

export interface LineupWithDetails extends Lineup {
  player: Player;
  positionDetails?: Position;
}

export interface MatchWithFullDetails extends MatchWithTeams {
  lineup: LineupWithDetails[];
  events: EventWithDetails[];
}

export interface PlayerWithPosition extends Player {
  position?: Position;
}

export interface SubstitutionResult {
  playerOff: LineupWithDetails;
  playerOn: LineupWithDetails;
  timelineEvents: Event[];
}

export interface SeasonWithStats extends Season {
  matchCount: number;
  playerCount: number;
  teamCount: number;
}

// ============================================================================
// MATCH STATE AND PERIODS
// ============================================================================

export interface MatchState {
  id: string;
  matchId: string;                         // mapped from match_id
  status: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  currentPeriod?: number;                  // mapped from current_period
  currentPeriodType?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'; // mapped from current_period_type
  matchStartedAt?: IsoDateTimeString;      // mapped from match_started_at
  matchEndedAt?: IsoDateTimeString;        // mapped from match_ended_at
  totalElapsedSeconds: number;             // mapped from total_elapsed_seconds
  createdAt: IsoDateTimeString;            // mapped from created_at
  updatedAt?: IsoDateTimeString;           // mapped from updated_at
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

export interface MatchPeriod {
  id: string;
  matchId: string;                         // mapped from match_id
  periodNumber: number;                    // mapped from period_number
  periodType: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT'; // mapped from period_type
  startedAt?: IsoDateTimeString;           // mapped from started_at
  endedAt?: IsoDateTimeString;             // mapped from ended_at
  durationSeconds?: number;                // mapped from duration_seconds
  createdAt: IsoDateTimeString;            // mapped from created_at
  updatedAt?: IsoDateTimeString;           // mapped from updated_at
  // Authentication and soft delete fields (camelCase)
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

// Request types for match state operations
export interface StartMatchRequest {
  matchId: string;
}

export interface PauseMatchRequest {
  matchId: string;
}

export interface ResumeMatchRequest {
  matchId: string;
}

export interface CompleteMatchRequest {
  matchId: string;
}

export interface CancelMatchRequest {
  matchId: string;
  reason?: string;
}

// Period management request types
export interface StartPeriodRequest {
  matchId: string;
  periodNumber: number;
  periodType?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
}

export interface EndPeriodRequest {
  matchId: string;
  periodId: string;
}

// API response types for match state operations
export interface MatchStateResponse {
  matchState: MatchState;
  currentPeriod?: MatchPeriod;
  allPeriods: MatchPeriod[];
}

export interface MatchStatusResponse {
  matchId: string;
  status: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  currentPeriod?: number;
  currentPeriodType?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  totalElapsedSeconds: number;
  currentPeriodElapsedSeconds?: number;
  isLive: boolean;
}

export interface LiveMatchesResponse {
  matches: Array<{
    matchId: string;
    homeTeam: string;
    awayTeam: string;
    status: 'LIVE' | 'PAUSED';
    currentPeriod?: number;
    totalElapsedSeconds: number;
  }>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type EntityId = string;
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Form state types
export type FormMode = 'create' | 'edit' | 'view';
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// API response types
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
