/**
 * Frontend-friendly interfaces with camelCase naming and UI-optimized structure
 * These interfaces are designed for React components and form handling
 */

import type { EventKind } from './prisma';

// ============================================================================
// CORE ENTITIES - Frontend Interfaces
// ============================================================================

export interface Player {
  id: string;
  name: string;                    // mapped from full_name
  squadNumber?: number;            // mapped from squad_number
  preferredPosition?: string;      // mapped from preferred_pos
  dateOfBirth?: Date;             // mapped from dob
  notes?: string;
  currentTeam?: string;           // mapped from current_team
  createdAt: Date;                // mapped from created_at
  updatedAt?: Date;               // mapped from updated_at
}

export interface Team {
  id: string;
  name: string;
  homeKitPrimary?: string;        // mapped from home_kit_primary
  homeKitSecondary?: string;      // mapped from home_kit_secondary
  awayKitPrimary?: string;        // mapped from away_kit_primary
  awayKitSecondary?: string;      // mapped from away_kit_secondary
  logoUrl?: string;               // mapped from logo_url
  createdAt: Date;
  updatedAt?: Date;
}

export interface Match {
  id: string;                     // mapped from match_id
  seasonId: string;               // mapped from season_id
  kickoffTime: Date;              // mapped from kickoff_ts
  competition?: string;
  homeTeamId: string;             // mapped from home_team_id
  awayTeamId: string;             // mapped from away_team_id
  venue?: string;
  durationMinutes: number;        // mapped from duration_mins
  periodFormat: string;           // mapped from period_format
  ourScore: number;               // mapped from our_score
  opponentScore: number;          // mapped from opponent_score
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Event {
  id: string;
  matchId: string;                // mapped from match_id
  seasonId: string;               // mapped from season_id
  createdAt: Date;                // mapped from created_at
  periodNumber?: number;          // mapped from period_number
  clockMs?: number;               // mapped from clock_ms
  kind: EventKind;
  teamId?: string;                // mapped from team_id
  playerId?: string;              // mapped from player_id
  notes?: string;
  sentiment: number;
  updatedAt?: Date;
}

export interface Season {
  id: string;                     // mapped from season_id
  label: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Position {
  code: string;                   // mapped from pos_code
  longName: string;               // mapped from long_name
  createdAt: Date;
  updatedAt?: Date;
}

export interface Season {
  id: string;                     // mapped from season_id
  label: string;
  createdAt: Date;                // mapped from created_at
  updatedAt?: Date;               // mapped from updated_at
}

export interface Position {
  code: string;                   // mapped from pos_code
  longName: string;               // mapped from long_name
  createdAt: Date;                // mapped from created_at
  updatedAt?: Date;               // mapped from updated_at
}

export interface Lineup {
  matchId: string;                // mapped from match_id
  playerId: string;               // mapped from player_id
  startMinute: number;            // mapped from start_min
  endMinute?: number;             // mapped from end_min
  position: string;               // position code reference
  createdAt: Date;                // mapped from created_at
  updatedAt?: Date;               // mapped from updated_at
}

// ============================================================================
// FORM INPUT TYPES - For Creating/Updating Records
// ============================================================================

export interface PlayerCreateRequest {
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: Date;
  notes?: string;
  currentTeam?: string;
}

export interface PlayerUpdateRequest {
  name?: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: Date;
  notes?: string;
  currentTeam?: string;
}

export interface TeamCreateRequest {
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
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
  seasonId: string;
  kickoffTime: Date;
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
  kickoffTime?: Date;
  competition?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: string;
  ourScore?: number;
  opponentScore?: number;
  notes?: string;
}

export interface EventCreateRequest {
  matchId: string;
  seasonId: string;
  periodNumber?: number;
  clockMs?: number;
  kind: EventKind;
  teamId?: string;
  playerId?: string;
  notes?: string;
  sentiment?: number;
}

export interface SeasonCreateRequest {
  label: string;
}

export interface SeasonUpdateRequest {
  label?: string;
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
  createdAt: Date;
  updatedAt?: Date;
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
  createdAt: Date;
  updatedAt?: Date;
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

// ============================================================================
// UI-SPECIFIC TYPES
// ============================================================================

export interface PlayerWithTeam extends Player {
  team?: Team;
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

export interface SeasonWithStats extends Season {
  matchCount: number;
  playerCount: number;
  teamCount: number;
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