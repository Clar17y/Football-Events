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
export type EventKind = 'goal' | 'assist' | 'key_pass' | 'save' | 'interception' | 'tackle' | 'foul' | 'penalty' | 'free_kick' | 'ball_out' | 'own_goal';

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
  our_score?: number;
  opponent_score?: number;
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
  our_score?: number;
  opponent_score?: number;
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