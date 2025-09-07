/**
 * Prisma-generated types for database entities
 * This file exports types from @prisma/client for use across the application
 * 
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 * Run `npx prisma generate` in backend to update these types
 */

// Re-export actual Prisma types for shared use
export type {
  Player as PrismaPlayer,
  Team as PrismaTeam,
  Match as PrismaMatch,
  Event as PrismaEvent,
  awards as PrismaAward,
  match_awards as PrismaMatchAward,
  seasons as PrismaSeason,
  lineup as PrismaLineup,
  player_teams as PrismaPlayerTeam,
  match_state as PrismaMatchState,
  match_periods as PrismaMatchPeriod,
} from '@prisma/client';

// Position type (not in main schema)
export type PrismaPosition = {
  pos_code: string;
  long_name: string;
  created_at: Date;
  updated_at?: Date | null;
};

// Import enum using $ namespace
import type { Prisma } from '@prisma/client';

// Export enum type
export type EventKind = 'goal' | 'assist' | 'key_pass' | 'save' | 'interception' | 'tackle' | 'foul' | 'penalty' | 'free_kick' | 'ball_out' | 'own_goal' | 'formation_change';

// Create our own input types since Event model is ignored
export type PrismaPlayerCreateInput = {
  name: string;
  squad_number?: number | null;
  preferred_pos?: string | null;
  dob?: Date | null;
  notes?: string | null;
  created_by_user_id: string;
};

export type PrismaPlayerUpdateInput = {
  name?: string;
  squad_number?: number | null;
  preferred_pos?: string | null;
  dob?: Date | null;
  notes?: string | null;
  current_team?: string | null;
};

export type PrismaTeamCreateInput = {
  name: string;
  is_opponent?: boolean;
  home_kit_primary?: string | null;
  home_kit_secondary?: string | null;
  away_kit_primary?: string | null;
  away_kit_secondary?: string | null;
  logo_url?: string | null;
  created_by_user_id: string;
};

export type PrismaTeamUpdateInput = {
  name?: string;
  home_kit_primary?: string | null;
  home_kit_secondary?: string | null;
  away_kit_primary?: string | null;
  away_kit_secondary?: string | null;
  logo_url?: string | null;
};

export type PrismaMatchCreateInput = {
  season_id: string;
  kickoff_ts: Date;
  competition?: string | null;
  home_team_id: string;
  away_team_id: string;
  venue?: string | null;
  duration_mins?: number;
  period_format?: string;
  home_score?: number;
  away_score?: number;
  notes?: string | null;
  created_by_user_id: string;
};

export type PrismaMatchUpdateInput = {
  season_id?: string;
  kickoff_ts?: Date;
  competition?: string | null;
  home_team_id?: string;
  away_team_id?: string;
  venue?: string | null;
  duration_mins?: number;
  period_format?: string;
  home_score?: number;
  away_score?: number;
  notes?: string | null;
};

export type PrismaEventCreateInput = {
  match_id: string;
  period_number?: number | null;
  clock_ms?: number | null;
  kind: EventKind;
  team_id?: string | null;
  player_id?: string | null;
  notes?: string | null;
  sentiment?: number;
  created_by_user_id: string;
};

// Season input types
export type PrismaSeasonCreateInput = {
  label: string;
  start_date: Date;
  end_date: Date;
  is_current?: boolean;
  description?: string | null;
  created_by_user_id: string;
};

export type PrismaSeasonUpdateInput = {
  label?: string;
  start_date?: Date;
  end_date?: Date;
  is_current?: boolean;
  description?: string | null;
};

// Position input types
export type PrismaPositionCreateInput = {
  pos_code: string;
  long_name: string;
};

export type PrismaPositionUpdateInput = {
  pos_code?: string;
  long_name?: string;
};

// Lineup input types
export type PrismaLineupCreateInput = {
  match_id: string;
  player_id: string;
  start_min?: number;
  end_min?: number | null;
  position: string;
  created_by_user_id: string;
};

export type PrismaLineupUpdateInput = {
  start_min?: number;
  end_min?: number | null;
  position?: string;
};

// Award input types
export type PrismaAwardCreateInput = {
  season_id: string;
  player_id: string;
  category: string;
  notes?: string | null;
  created_by_user_id: string;
};

export type PrismaAwardUpdateInput = {
  category?: string;
  notes?: string | null;
};

// Match Award input types
export type PrismaMatchAwardCreateInput = {
  match_id: string;
  player_id: string;
  category: string;
  notes?: string | null;
  created_by_user_id: string;
};

export type PrismaMatchAwardUpdateInput = {
  category?: string;
  notes?: string | null;
};

// Player Team input types
export type PrismaPlayerTeamCreateInput = {
  player_id: string;
  team_id: string;
  start_date: Date;
  end_date?: Date | null;
  created_by_user_id: string;
};

export type PrismaPlayerTeamUpdateInput = {
  player_id?: string;
  team_id?: string;
  start_date?: Date;
  end_date?: Date | null;
  deleted_at?: Date | null;
  deleted_by_user_id?: string | null;
  is_deleted?: boolean;
};

// Match State input types
export type PrismaMatchStateCreateInput = {
  match_id: string;
  status?: string;
  current_period?: number | null;
  current_period_type?: string | null;
  match_started_at?: Date | null;
  match_ended_at?: Date | null;
  total_elapsed_seconds?: number;
  created_by_user_id: string;
};

export type PrismaMatchStateUpdateInput = {
  status?: string;
  current_period?: number | null;
  current_period_type?: string | null;
  match_started_at?: Date | null;
  match_ended_at?: Date | null;
  total_elapsed_seconds?: number;
};

// Match Period input types
export type PrismaMatchPeriodCreateInput = {
  match_id: string;
  period_number: number;
  period_type?: string;
  started_at?: Date | null;
  ended_at?: Date | null;
  duration_seconds?: number | null;
  created_by_user_id: string;
};

export type PrismaMatchPeriodUpdateInput = {
  ended_at?: Date | null;
  duration_seconds?: number | null;
};
