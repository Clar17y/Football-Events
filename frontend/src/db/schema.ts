/**
 * Enhanced Database Schema for IndexedDB
 * 
 * This schema is based on the PostgreSQL database structure but optimized
 * for IndexedDB performance and offline-first functionality with bidirectional sync.
 */

import type { ID, Timestamp } from '../types/index';
import type { EventKind } from '../types/events';

/**
 * Base interface for records that can be synced to server
 */
export interface SyncableRecord {
  /** Whether this record has been synced to server */
  synced: boolean;
  /** Timestamp of last successful sync */
  synced_at?: Timestamp;
}

/**
 * Enhanced Event interface with auto-linking support
 */
export interface EnhancedEvent extends SyncableRecord {
  /** UUID primary key */
  id: ID;
  /** Foreign key to matches table */
  match_id: ID;
  /** Server timestamp when event was created */
  ts_server: Timestamp;
  /** Match period number (1, 2, 3, 4 for quarters) */
  period_number: number;
  /** Game clock in milliseconds */
  clock_ms: number;
  /** Type of event (goal, assist, foul, etc.) */
  kind: EventKind;
  /** Foreign key to teams table */
  team_id: ID;
  /** Foreign key to players table */
  player_id: ID;
  /** Optional notes about the event */
  notes?: string;
  /** Sentiment rating from -4 to +4 */
  sentiment: number;
  /** Array of linked event IDs (auto-generated) */
  linked_events?: ID[];
  /** Timestamp when auto-linking was performed */
  auto_linked_at?: Timestamp;
  /** Client timestamp when event was created locally */
  created_at: Timestamp;
  /** Client timestamp when event was last updated */
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Enhanced Match interface aligned with PostgreSQL schema
 */
export interface EnhancedMatch extends SyncableRecord {
  /** UUID primary key */
  match_id: ID;
  /** Legacy compatibility - alias for match_id */
  id: ID;
  /** Foreign key to seasons table */
  season_id: ID;
  /** Match kickoff timestamp */
  kickoff_ts: Timestamp;
  /** Competition name */
  competition?: string;
  /** Foreign key to home team */
  home_team_id: ID;
  /** Foreign key to away team */
  away_team_id: ID;
  /** Venue name */
  venue?: string;
  /** Match duration in minutes */
  duration_mins: number;
  /** Period format: 'half' or 'quarter' */
  period_format: 'half' | 'quarter';
  /** Home team's score */
  home_score: number;
  /** Away team's score */
  away_score: number;
  /** Match notes */
  notes?: string;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Enhanced Team interface
 */
export interface EnhancedTeam extends SyncableRecord {
  /** UUID primary key */
  team_id: ID;
  /** Legacy compatibility - alias for team_id */
  id: ID;
  /** Team name (unique) */
  name: string;
  /** Primary team color */
  color_primary?: string;
  /** Secondary team color */
  color_secondary?: string;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Enhanced Player interface aligned with PostgreSQL schema
 */
export interface EnhancedPlayer extends SyncableRecord {
  /** UUID primary key */
  id: ID;
  /** Player's full name */
  full_name: string;
  /** Squad/jersey number */
  squad_number?: number;
  /** Preferred position code */
  preferred_pos?: string;
  /** Date of birth */
  dob?: string; // ISO date string
  /** Player notes */
  notes?: string;
  /** Current team (foreign key) */
  current_team?: ID;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Season interface
 */
export interface EnhancedSeason extends SyncableRecord {
  /** UUID primary key */
  season_id: ID;
  /** Season label (unique) */
  label: string;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Lineup interface for tracking player positions and substitutions
 */
export interface EnhancedLineup extends SyncableRecord {
  /** Composite key: match_id + player_id + start_min */
  id: string; // Generated: `${match_id}-${player_id}-${start_min}`
  /** Foreign key to matches */
  match_id: ID;
  /** Foreign key to players */
  player_id: ID;
  /** Start time in minutes */
  start_min: number;
  /** End time in minutes (null if still playing) */
  end_min?: number;
  /** Position code */
  position: string;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Match notes for period-specific observations
 */
export interface EnhancedMatchNote {
  /** UUID primary key */
  match_note_id: ID;
  /** Foreign key to matches */
  match_id: ID;
  /** Note content */
  notes: string;
  /** Period number (0 for general match notes) */
  period_number: number;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Match period for tracking match time segments
 */
export interface LocalMatchPeriod extends SyncableRecord {
  /** UUID primary key */
  id: ID;
  /** Foreign key to matches table */
  match_id: ID;
  /** Period number (1, 2, 3, 4 for quarters; 1, 2 for halves) */
  period_number: number;
  /** Period type */
  period_type: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  /** When the period started (timestamp - preserves original) */
  started_at: Timestamp;
  /** When the period ended (timestamp - preserves original) */
  ended_at?: Timestamp;
  /** Duration in seconds */
  duration_seconds?: number;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Match state for tracking current match status
 */
export interface LocalMatchState extends SyncableRecord {
  /** Match ID (primary key) */
  match_id: ID;
  /** Current match status */
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  /** Current period ID (if match is live) */
  current_period_id?: ID;
  /** Elapsed timer in milliseconds */
  timer_ms: number;
  /** Last updated timestamp */
  last_updated_at: Timestamp;
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Formation player position in a default lineup
 */
export interface FormationPlayerPosition {
  playerId: string;
  position: string;
  pitchX: number;
  pitchY: number;
}

/**
 * Default lineup for a team (stored locally)
 */
export interface LocalDefaultLineup extends SyncableRecord {
  /** Unique ID */
  id: ID;
  /** Team ID this lineup belongs to */
  team_id: ID;
  /** Formation data - array of player positions */
  formation: FormationPlayerPosition[];
  /** Client timestamps */
  created_at: Timestamp;
  updated_at: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  created_by_user_id: ID;
  deleted_at?: Timestamp;
  deleted_by_user_id?: ID;
  is_deleted: boolean;
}

/**
 * Enhanced outbox for bidirectional sync
 */
export interface EnhancedOutboxEvent {
  /** Auto-generated ID */
  id?: number;
  /** Table name being synced */
  table_name: string;
  /** Record ID being synced */
  record_id: ID;
  /** Operation type */
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Record data (for INSERT/UPDATE) */
  data?: any;
  /** Event payload for match events (legacy compatibility) */
  payload?: any;
  /** Whether the event has been synced to server */
  synced: boolean;
  /** When the event was created locally */
  created_at: Timestamp;
  /** Number of sync attempts */
  retry_count: number;
  /** Last sync attempt timestamp */
  last_sync_attempt?: Timestamp;
  /** Error message if sync failed */
  sync_error?: string;
  /** When sync failed (if applicable) */
  failed_at?: Timestamp;
}

/**
 * Enhanced sync metadata for conflict resolution
 */
export interface EnhancedSyncMetadata {
  /** Auto-generated ID */
  id?: number;
  /** Table name */
  table_name: string;
  /** Record ID */
  record_id: ID;
  /** Last successful sync timestamp */
  last_synced: Timestamp;
  /** Server version/etag for conflict detection */
  server_version?: string;
  /** Local version for conflict detection */
  local_version: string;
  /** Conflict resolution strategy */
  conflict_strategy?: 'server_wins' | 'client_wins' | 'merge' | 'manual';
}

/**
 * Complete database schema definition
 */
export interface EnhancedDatabaseSchema {
  // Core tables
  events: EnhancedEvent;
  matches: EnhancedMatch;
  teams: EnhancedTeam;
  players: EnhancedPlayer;
  seasons: EnhancedSeason;
  lineup: EnhancedLineup;
  match_notes: EnhancedMatchNote;
  match_periods: LocalMatchPeriod;
  match_state: LocalMatchState;

  // Sync infrastructure
  outbox: EnhancedOutboxEvent;
  sync_metadata: EnhancedSyncMetadata;

  // Settings (keeping existing)
  settings: {
    key: string;
    value: string;
    created_at: Timestamp;
  };
}

/**
 * Index definitions for optimal query performance
 */
export const SCHEMA_INDEXES = {
  // Events table - optimized for linking and common queries
  events: [
    'match_id',                           // Basic match filtering
    'player_id',                          // Player performance queries
    'team_id',                            // Team analysis
    'kind',                               // Event type filtering
    'sentiment',                          // Performance analysis
    '[match_id+player_id]',              // Player events within a match
    '[match_id+team_id]',                // Team events within a match
    '[match_id+clock_ms]',               // Timeline queries (most common)
    '[match_id+kind]',                   // Event type filtering per match
    '[match_id+period_number]',          // Period-specific analysis
    '[player_id+kind]',                  // Player event type analysis
    '[player_id+sentiment]',             // Player performance tracking
    '[team_id+period_number]',           // Team period analysis
    'linked_events',                     // Multi-entry index for linked events
    'ts_server',                         // Sync ordering
    'updated_at',                        // Change tracking
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ],
  
  // Matches table
  matches: [
    'season_id',                         // Season filtering
    'home_team_id',                      // Team match history
    'away_team_id',                      // Team match history
    'kickoff_ts',                        // Date-based queries
    'created_by_user_id',                // Guest/user scoping
    'is_deleted',                        // Soft delete filtering
    '[season_id+kickoff_ts]',           // Season timeline
    '[home_team_id+kickoff_ts]',        // Team schedule
    '[away_team_id+kickoff_ts]',        // Team schedule
    'updated_at',                        // Change tracking
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ],
  
  // Players table
  players: [
    'current_team',                      // Team roster queries
    'full_name',                         // Name-based search
    'squad_number',                      // Number-based lookup
    'created_by_user_id',                // Guest/user scoping
    'is_deleted',                        // Soft delete filtering
    '[current_team+squad_number]',      // Unique team numbers
    '[current_team+full_name]',         // Team roster with names
    'updated_at',                        // Change tracking
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ],

  // Teams table
  teams: [
    'name',                              // Name-based search
    'created_by_user_id',                // Guest/user scoping
    'is_deleted',                        // Soft delete filtering
    'updated_at',                        // Change tracking
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ],

  // Seasons table
  seasons: [
    'label',                             // Label-based search
    'created_by_user_id',                // Guest/user scoping
    'is_deleted',                        // Soft delete filtering
    'updated_at',                        // Change tracking
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ],

  // Lineup table
  lineup: [
    'match_id',                          // Match lineup queries
    'player_id',                         // Player match history
    '[match_id+start_min]',             // Timeline-based queries
    '[match_id+position]',              // Position-based analysis
    '[player_id+match_id]',             // Player match participation
    'updated_at',                        // Change tracking
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ],
  
  // Match notes table
  match_notes: [
    'match_id',                          // Match-specific notes
    '[match_id+period_number]',         // Period-specific notes
    'updated_at'                         // Change tracking
  ],
  
  // Outbox table - sync optimization
  outbox: [
    'synced',                            // Unsynced items
    'table_name',                        // Table-specific sync
    'operation',                         // Operation-specific sync
    'created_by_user_id',                // Source attribution (guest/import detection)
    '[synced+created_at]',              // Sync queue ordering
    '[table_name+synced]',              // Table-specific sync status
    'retry_count',                       // Failed sync tracking
    'last_sync_attempt'                  // Retry timing
  ],
  
  // Sync metadata table
  sync_metadata: [
    'table_name',                        // Table-specific metadata
    'record_id',                         // Record-specific metadata
    '[table_name+record_id]',           // Unique record tracking
    '[table_name+last_synced]',         // Table sync status
    'last_synced'                        // Global sync status
  ],
  
  // Settings table
  settings: [
    'key',                               // Key-based lookup
    'updated_at'                         // Change tracking
  ],

  // Match periods table
  match_periods: [
    'match_id',                          // Match-specific periods
    'period_number',                     // Period ordering
    '[match_id+period_number]',         // Unique period per match
    'started_at',                        // Timeline ordering
    'created_by_user_id',                // Guest/user scoping
    'is_deleted',                        // Soft delete filtering
    'synced',                            // Sync status
    '[synced+created_by_user_id]',      // Unsynced guest data
    '[match_id+synced]'                 // Match sync status
  ],

  // Match state table
  match_state: [
    'match_id',                          // Primary key
    'status',                            // Status filtering
    'created_by_user_id',                // Guest/user scoping
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ],

  // Default lineups table
  default_lineups: [
    'team_id',                           // Primary lookup by team
    'created_by_user_id',                // Guest/user scoping
    'is_deleted',                        // Soft delete filtering
    'synced',                            // Sync status
    '[synced+created_by_user_id]'       // Unsynced guest data
  ]
} as const;

/**
 * Event relationship definitions for auto-linking
 */
export const EVENT_RELATIONSHIPS = {
  // Bidirectional relationships - either event can be added first
  'goal': ['assist', 'key_pass'],
  'assist': ['goal'],
  'key_pass': ['goal'],
  
  'penalty': ['foul'],
  'foul': ['penalty', 'free_kick'],
  
  'free_kick': ['foul'],
  'save': [],
  
  'own_goal': [],
  'interception': ['tackle'], // Add missing interception
  'tackle': ['interception'], // Add missing tackle
  'corner': [],
  'ball_out': []
} as const;

/**
 * Auto-linking configuration
 */
export const LINKING_CONFIG = {
  /** Time window for auto-linking events (60 seconds) */
  TIME_WINDOW_MS: 60000,
  
  /** Maximum number of events to link to a single event */
  MAX_LINKS_PER_EVENT: 5,
  
  /** Whether to link events across different teams */
  CROSS_TEAM_LINKING: true,
  
  /** Whether to perform retroactive linking when new events are added */
  RETROACTIVE_LINKING: true
} as const;

/**
 * Sentiment scale documentation
 */
export const SENTIMENT_SCALE = {
  /** Minimum sentiment value */
  MIN: -4,
  
  /** Maximum sentiment value */
  MAX: 4,
  
  /** Neutral sentiment value */
  NEUTRAL: 0,
  
  /** Scale descriptions */
  DESCRIPTIONS: {
    '-4': 'Very Poor Performance',
    '-3': 'Poor Performance', 
    '-2': 'Below Average',
    '-1': 'Slightly Below Average',
    '0': 'Average/Neutral',
    '1': 'Slightly Above Average',
    '2': 'Above Average',
    '3': 'Good Performance',
    '4': 'Excellent Performance'
  }
} as const;
