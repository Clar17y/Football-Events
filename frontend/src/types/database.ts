/**
 * Database-specific type definitions
 * 
 * This file contains types for database operations,
 * sync functionality, and data persistence.
 */

import type { ID, Timestamp } from './index';
import type { EventPayload } from './events';

/**
 * Outbox event for offline sync
 */
export interface OutboxEvent {
  /** Auto-generated ID */
  id?: number;
  /** Table name being synced */
  table_name: string;
  /** Record ID being synced */
  record_id: string;
  /** Operation type */
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Record data (for INSERT/UPDATE) */
  data?: any;
  /** Event payload for match events (legacy compatibility) */
  payload?: EventPayload;
  /** Whether the event has been synced to server */
  synced: boolean;
  /** When the event was created locally */
  created_at: Timestamp;
  /** Number of sync attempts */
  retry_count?: number;
  /** Last sync attempt timestamp */
  last_sync_attempt?: Timestamp;
  /** Error message if sync failed */
  sync_error?: string;
  /** When sync failed (if applicable) */
  failed_at?: Timestamp;
  /** User who created this outbox entry */
  created_by_user_id: string;
}

/**
 * Database table schemas
 */
export interface DatabaseSchema {
  /** Match events outbox for sync */
  outbox: OutboxEvent;
  /** Matches table */
  matches: StoredMatch;
  /** Teams table */
  teams: StoredTeam;
  /** Players table */
  players: StoredPlayer;
  /** Seasons table */
  seasons: StoredSeason;
  /** Events table */
  events: StoredEvent;
  /** Lineup table */
  lineup: StoredLineup;
  /** Player teams table */
  player_teams: StoredPlayerTeam;
  /** Settings table */
  settings: StoredSetting;
  /** Sync metadata */
  sync_metadata: SyncMetadata;
}

/**
 * Stored match data
 */
export interface StoredMatch {
  id: ID;
  match_id: ID; // Primary key (UUID)
  season_id: ID;
  home_team_id: ID;
  away_team_id: ID;
  kickoff_ts: Timestamp; // Updated field name
  competition?: string;
  venue?: string;
  duration_mins: number;
  period_format: string;
  our_score: number;
  opponent_score: number;
  notes?: string;
  // Legacy fields for compatibility
  date?: Timestamp;
  status?: string; // MatchStatus as string
  settings?: string; // JSON string of MatchSettings
  current_period?: number;
  clock_state?: string; // JSON string of MatchClock
  result?: string; // JSON string of MatchResult
  metadata?: string; // JSON string of MatchMetadata
  created_at: Timestamp;
  updated_at: Timestamp;
  // Authentication and soft delete fields
  created_by_user_id: string;
  deleted_at?: Timestamp;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

/**
 * Stored team data
 */
export interface StoredTeam {
  id: ID;
  team_id: ID; // Primary key (UUID)
  name: string;
  home_kit_primary?: string;
  home_kit_secondary?: string;
  away_kit_primary?: string;
  away_kit_secondary?: string;
  logo_url?: string;
  // Legacy fields for compatibility
  color_primary?: string;
  color_secondary?: string;
  formation?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  // Authentication and soft delete fields
  created_by_user_id: string;
  deleted_at?: Timestamp;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

/**
 * Stored player data
 */
export interface StoredPlayer {
  id: ID; // Primary key (UUID)
  full_name: string;
  squad_number?: number;
  preferred_pos?: string;
  dob?: string; // ISO date string
  notes?: string;
  current_team?: ID;
  // Legacy fields for compatibility
  team_id?: ID;
  jersey_number?: number;
  position?: string;
  is_active?: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  // Authentication and soft delete fields
  created_by_user_id: string;
  deleted_at?: Timestamp;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

/**
 * Stored season data
 */
export interface StoredSeason {
  id: ID; // For compatibility
  season_id: ID; // Primary key (UUID)
  label: string;
  start_date?: string;
  end_date?: string;
  is_current: boolean;
  description?: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  // Authentication and soft delete fields
  created_by_user_id: string;
  deleted_at?: Timestamp;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

/**
 * Stored event data
 */
export interface StoredEvent {
  id: ID; // Primary key (UUID)
  match_id: ID;
  season_id: ID;
  ts_server: Timestamp;
  period_number: number;
  clock_ms: number;
  kind: string; // EventKind as string
  team_id: ID;
  player_id: ID;
  notes?: string;
  sentiment: number;
  linked_events?: ID[];
  auto_linked_at?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
  // Authentication and soft delete fields
  created_by_user_id: string;
  deleted_at?: Timestamp;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

/**
 * Stored lineup data
 */
export interface StoredLineup {
  id: string; // Composite key: `${match_id}-${player_id}-${start_min}`
  match_id: ID;
  player_id: ID;
  start_min: number;
  end_min?: number;
  position: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  // Authentication and soft delete fields
  created_by_user_id: string;
  deleted_at?: Timestamp;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

/**
 * Stored player team relationship data
 */
export interface StoredPlayerTeam {
  id: ID; // Primary key (UUID)
  player_id: ID;
  team_id: ID;
  start_date: string; // ISO date string
  end_date?: string; // ISO date string
  jersey_number?: number;
  position?: string;
  is_active: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  // Authentication and soft delete fields
  created_by_user_id: string;
  deleted_at?: Timestamp;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

/**
 * Application settings
 */
export interface StoredSetting {
  key: string;
  value: string; // JSON string
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * Sync metadata for tracking sync state
 */
export interface SyncMetadata {
  id?: number;
  table_name: string;
  record_id: ID;
  last_synced: Timestamp;
  sync_version: number;
  checksum?: string;
}

/**
 * Database query filters
 */
export interface QueryFilter {
  /** Field to filter on */
  field: string;
  /** Filter operator */
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in' | 'contains';
  /** Value to filter by */
  value: any;
}

/**
 * Database query options
 */
export interface QueryOptions {
  /** Filters to apply */
  filters?: QueryFilter[];
  /** Field to sort by */
  sort_by?: string;
  /** Sort direction */
  sort_direction?: 'asc' | 'desc';
  /** Maximum number of results */
  limit?: number;
  /** Number of results to skip */
  offset?: number;
}

/**
 * Database operation result
 */
export interface DatabaseResult<T> {
  /** Whether the operation was successful */
  success: boolean;
  /** Result data (if successful) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
  /** Number of affected records */
  affected_count?: number;
}

/**
 * Bulk operation result
 */
export interface BulkOperationResult {
  /** Total number of operations attempted */
  total: number;
  /** Number of successful operations */
  successful: number;
  /** Number of failed operations */
  failed: number;
  /** Details of failed operations */
  failures: Array<{
    index: number;
    error: string;
    data: any;
  }>;
}

/**
 * Sync status enumeration
 */
export type SyncStatus = 
  | 'idle'
  | 'syncing'
  | 'success'
  | 'error'
  | 'conflict';

/**
 * Sync operation result
 */
export interface SyncResult {
  /** Sync status */
  status: SyncStatus;
  /** Number of records synced */
  synced_count: number;
  /** Number of conflicts encountered */
  conflict_count: number;
  /** Number of errors encountered */
  error_count: number;
  /** Detailed error messages */
  errors: string[];
  /** Sync duration in milliseconds */
  duration: number;
  /** Timestamp when sync completed */
  completed_at: Timestamp;
}

/**
 * Database migration
 */
export interface DatabaseMigration {
  /** Migration version number */
  version: number;
  /** Migration description */
  description: string;
  /** Migration function */
  migrate: (db: any) => Promise<void>;
  /** Rollback function (optional) */
  rollback?: (db: any) => Promise<void>;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  /** Database name */
  name: string;
  /** Current version */
  version: number;
  /** Available migrations */
  migrations: DatabaseMigration[];
  /** Whether to enable debug logging */
  debug: boolean;
  /** Sync configuration */
  sync: {
    /** Sync endpoint URL */
    endpoint?: string;
    /** Sync interval in milliseconds */
    interval: number;
    /** Maximum retry attempts */
    max_retries: number;
    /** Retry delay in milliseconds */
    retry_delay: number;
  };
}

/**
 * Export/import data structures
 */
export interface ExportData {
  /** Export metadata */
  metadata: {
    version: string;
    exported_at: Timestamp;
    app_version: string;
  };
  /** Exported matches */
  matches: StoredMatch[];
  /** Exported teams */
  teams: StoredTeam[];
  /** Exported players */
  players: StoredPlayer[];
  /** Exported seasons */
  seasons: StoredSeason[];
  /** Exported events */
  events: StoredEvent[];
  /** Exported lineup */
  lineup: StoredLineup[];
  /** Exported player teams */
  player_teams: StoredPlayerTeam[];
  /** Exported outbox events */
  outbox: OutboxEvent[];
  /** Exported settings */
  settings: StoredSetting[];
}

/**
 * Import result
 */
export interface ImportResult {
  /** Whether import was successful */
  success: boolean;
  /** Import summary */
  summary: {
    matches_imported: number;
    teams_imported: number;
    players_imported: number;
    events_imported: number;
    settings_imported: number;
  };
  /** Import errors */
  errors: string[];
  /** Import warnings */
  warnings: string[];
}