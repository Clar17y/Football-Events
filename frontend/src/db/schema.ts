/**
 * Enhanced Database Schema for IndexedDB
 * 
 * This schema extends shared types from `@shared/types` with IndexedDB-specific
 * fields for offline-first functionality and bidirectional sync.
 * 
 * CONVENTIONS:
 * - All field names use camelCase (aligned with shared types)
 * - All date/time fields use ISO strings (JSON-native)
 * - Db* types extend shared types with sync metadata
 * - Local-only types (sync metadata, settings) are defined here
 */

import type {
  Player,
  Team,
  Match,
  Event,
  Season,
  Lineup,
  PlayerTeam,
  MatchState,
  MatchPeriod,
  IsoDateTimeString,
} from '@shared/types';
import type { EventKind } from '../types/events';
import type { GlobalStatsData } from '../types/globalStats';

// ============================================================================
// DATABASE OPERATION TYPES
// ============================================================================

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

// ============================================================================
// SYNC INFRASTRUCTURE TYPES
// ============================================================================

/**
 * Base interface for records that can be synced to server
 */
export interface SyncableRecord {
  /** Whether this record has been synced to server */
  synced: boolean;
  /** ISO timestamp of last successful sync */
  syncedAt?: IsoDateTimeString;
}

// ============================================================================
// DATABASE ENTITY TYPES (Extend Shared Types)
// ============================================================================

/**
 * IndexedDB Player type - extends shared Player with sync metadata
 * Note: Uses ISO strings for dates (aligned with shared types)
 * Includes legacy field aliases for backward compatibility during migration
 */
export interface DbPlayer extends Player, SyncableRecord {
  /** @deprecated Use `name` instead - legacy alias for backward compatibility */
  fullName?: string;
  /** @deprecated Use `preferredPosition` instead - legacy alias */
  preferredPos?: string;
  /** @deprecated Use `dateOfBirth` instead - legacy alias */
  dob?: string;
}

/**
 * IndexedDB Team type - extends shared Team with sync metadata
 * Note: Uses ISO strings for dates (aligned with shared types)
 * Includes legacy field aliases for backward compatibility during migration
 */
export interface DbTeam extends Team, SyncableRecord {
  /** @deprecated Use `id` instead - legacy alias for backward compatibility */
  teamId?: string;
  /** @deprecated Use `homeKitPrimary` instead - legacy alias */
  colorPrimary?: string;
  /** @deprecated Use `homeKitSecondary` instead - legacy alias */
  colorSecondary?: string;
  /** @deprecated Use `awayKitPrimary` instead - legacy alias */
  awayColorPrimary?: string;
  /** @deprecated Use `awayKitSecondary` instead - legacy alias */
  awayColorSecondary?: string;
}

/**
 * IndexedDB Match type - extends shared Match with sync metadata
 * Note: IndexedDB uses `matchId` as alias for `id` for legacy compatibility
 */
export interface DbMatch extends Match, SyncableRecord {
  /** Primary key alias for IndexedDB (same as id) */
  matchId: string;
}

/**
 * IndexedDB Event type - extends shared Event with sync metadata and linking
 * Note: Uses ISO strings for dates (aligned with shared types)
 */
export interface DbEvent extends Event, SyncableRecord {
  /** Array of linked event IDs (auto-generated) */
  linkedEvents?: string[];
  /** Timestamp when auto-linking was performed (ISO string) */
  autoLinkedAt?: IsoDateTimeString;
}

/**
 * IndexedDB Season type - extends shared Season with sync metadata
 * Note: Uses ISO strings for dates (aligned with shared types)
 */
export type DbSeason = Season & SyncableRecord;

/**
 * IndexedDB Lineup type - extends shared Lineup with sync metadata
 * Note: Uses ISO strings for dates (aligned with shared types)
 */
export type DbLineup = Lineup & SyncableRecord;

/**
 * IndexedDB PlayerTeam type - extends shared PlayerTeam with sync metadata
 */
export interface DbPlayerTeam extends PlayerTeam, SyncableRecord {
  /** Whether this relationship is currently active */
  isActive?: boolean;
}

/**
 * IndexedDB MatchState type - local match state with sync metadata
 * Note: Local match state may have different status values during live matches
 * Uses timestamps (numbers) for performance-critical timer operations
 */
export interface DbMatchState extends SyncableRecord {
  /** Match ID (primary key) */
  matchId: string;
  /** Current match status */
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  /** Current period ID (if match is live) */
  currentPeriodId?: string;
  /** Elapsed timer in milliseconds */
  timerMs: number;
  /** Last updated timestamp (number for timer precision) */
  lastUpdatedAt: number;
  /** Client timestamps (ISO strings for consistency) */
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * IndexedDB MatchPeriod type - local match period with sync metadata
 * Uses timestamps (numbers) for performance-critical timer operations
 */
export interface DbMatchPeriod extends SyncableRecord {
  /** UUID primary key */
  id: string;
  /** Foreign key to matches table */
  matchId: string;
  /** Period number (1, 2, 3, 4 for quarters; 1, 2 for halves) */
  periodNumber: number;
  /** Period type */
  periodType: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  /** When the period started (timestamp for timer precision) */
  startedAt: number;
  /** When the period ended (timestamp for timer precision) */
  endedAt?: number;
  /** Duration in seconds */
  durationSeconds?: number;
  /** Client timestamps (ISO strings for consistency) */
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Cached global (platform-wide) statistics (single-row, read-only on client).
 */
export interface DbGlobalStats {
  id: 'current';
  data: GlobalStatsData;
  lastUpdated: number;
}

// ============================================================================
// LOCAL-ONLY TYPES (Not in Shared Types)
// ============================================================================

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
export interface DbDefaultLineup extends SyncableRecord {
  /** Unique ID */
  id: string;
  /** Team ID this lineup belongs to */
  teamId: string;
  /** Formation data - array of player positions */
  formation: FormationPlayerPosition[];
  /** Client timestamps (ISO strings for consistency) */
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Match notes for period-specific observations (local-only)
 */
export interface DbMatchNote {
  /** UUID primary key */
  matchNoteId: string;
  /** Foreign key to matches */
  matchId: string;
  /** Note content */
  notes: string;
  /** Period number (0 for general match notes) */
  periodNumber: number;
  /** Client timestamps (ISO strings for consistency) */
  createdAt: IsoDateTimeString;
  updatedAt?: IsoDateTimeString;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Sync metadata for conflict resolution (local-only)
 */
export interface DbSyncMetadata {
  /** Auto-generated ID */
  id?: number;
  /** Table name */
  tableName: string;
  /** Record ID */
  recordId: string;
  /** Last successful sync timestamp */
  lastSynced: number;
  /** Server version/etag for conflict detection */
  serverVersion?: string;
  /** Local version for conflict detection */
  localVersion: string;
  /** Conflict resolution strategy */
  conflictStrategy?: 'server_wins' | 'client_wins' | 'merge' | 'manual';
}

/**
 * Per-record sync failure tracking (local-only).
 *
 * This prevents retry storms by allowing backoff and permanent quarantine.
 */
export interface DbSyncFailure {
  /** Table name (e.g. 'teams') */
  table: string;
  /** Record primary key in that table */
  recordId: string;
  attemptCount: number;
  lastAttemptAt: number;
  nextRetryAt: number;
  lastStatus?: number;
  lastError?: string;
  permanent: boolean;
  reasonCode?: string;
}

/**
 * Application settings (local-only)
 */
export interface DbSetting {
  /** Setting key (primary key) */
  key: string;
  /** Setting value (JSON string) */
  value: string;
  /** When the setting was created (ISO string) */
  createdAt: IsoDateTimeString;
  /** When the setting was last updated (ISO string) */
  updatedAt?: IsoDateTimeString;
}

// ============================================================================
// LEGACY TYPE ALIASES (For Backward Compatibility During Migration)
// ============================================================================

/** @deprecated Use DbEvent instead */
export type EnhancedEvent = DbEvent;

/** @deprecated Use DbMatch instead */
export type EnhancedMatch = DbMatch;

/** @deprecated Use DbTeam instead */
export type EnhancedTeam = DbTeam;

/** @deprecated Use DbPlayer instead */
export type EnhancedPlayer = DbPlayer;

/** @deprecated Use DbSeason instead */
export type EnhancedSeason = DbSeason;

/** @deprecated Use DbLineup instead */
export type EnhancedLineup = DbLineup;

/** @deprecated Use DbMatchNote instead */
export type EnhancedMatchNote = DbMatchNote;

/** @deprecated Use DbMatchPeriod instead */
export type LocalMatchPeriod = DbMatchPeriod;

/** @deprecated Use DbMatchState instead */
export type LocalMatchState = DbMatchState;

/** @deprecated Use DbDefaultLineup instead */
export type LocalDefaultLineup = DbDefaultLineup;

/** @deprecated Use DbSyncMetadata instead */
export type EnhancedSyncMetadata = DbSyncMetadata;

// ============================================================================
// DATABASE SCHEMA DEFINITION
// ============================================================================

/**
 * Complete database schema definition
 */
export interface DatabaseSchema {
  // Core tables
  events: DbEvent;
  matches: DbMatch;
  teams: DbTeam;
  players: DbPlayer;
  seasons: DbSeason;
  lineup: DbLineup;
  playerTeams: DbPlayerTeam;
  matchNotes: DbMatchNote;
  matchPeriods: DbMatchPeriod;
  matchState: DbMatchState;
  defaultLineups: DbDefaultLineup;

  // Global stats cache
  globalStats: DbGlobalStats;

  // Sync infrastructure
  syncMetadata: DbSyncMetadata;
  syncFailures: DbSyncFailure;

  // Settings
  settings: DbSetting;
}

// ============================================================================
// INDEX DEFINITIONS
// ============================================================================

/**
 * Index definitions for optimal query performance
 * NOTE: All field names use camelCase to align with interface definitions.
 */
export const SCHEMA_INDEXES = {
  // Events table - optimized for linking and common queries
  events: [
    'matchId',                           // Basic match filtering
    'playerId',                          // Player performance queries
    'teamId',                            // Team analysis
    'kind',                              // Event type filtering
    'sentiment',                         // Performance analysis
    '[matchId+playerId]',               // Player events within a match
    '[matchId+teamId]',                 // Team events within a match
    '[matchId+clockMs]',                // Timeline queries (most common)
    '[matchId+kind]',                   // Event type filtering per match
    '[matchId+periodNumber]',           // Period-specific analysis
    '[playerId+kind]',                  // Player event type analysis
    '[playerId+sentiment]',             // Player performance tracking
    '[teamId+periodNumber]',            // Team period analysis
    'linkedEvents',                     // Multi-entry index for linked events
    'createdAt',                        // Sync ordering / Creation time
    'updatedAt',                        // Change tracking
    'synced',                           // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Matches table
  matches: [
    'seasonId',                          // Season filtering
    'homeTeamId',                        // Team match history
    'awayTeamId',                        // Team match history
    'kickoffTime',                       // Date-based queries
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    '[seasonId+kickoffTime]',           // Season timeline
    '[homeTeamId+kickoffTime]',         // Team schedule
    '[awayTeamId+kickoffTime]',         // Team schedule
    'updatedAt',                         // Change tracking
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Players table
  players: [
    'currentTeam',                       // Team roster queries
    'name',                              // Name-based search
    'squadNumber',                       // Number-based lookup
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    '[currentTeam+squadNumber]',        // Unique team numbers
    '[currentTeam+name]',               // Team roster with names
    'updatedAt',                         // Change tracking
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Teams table
  teams: [
    'name',                              // Name-based search
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    'updatedAt',                         // Change tracking
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Seasons table
  seasons: [
    'label',                             // Label-based search
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    'updatedAt',                         // Change tracking
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Lineup table
  lineup: [
    'matchId',                           // Match lineup queries
    'playerId',                          // Player match history
    '[matchId+startMinute]',            // Timeline-based queries
    '[matchId+position]',               // Position-based analysis
    '[playerId+matchId]',               // Player match participation
    'updatedAt',                         // Change tracking
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Player teams table
  playerTeams: [
    'playerId',                          // Player team history
    'teamId',                            // Team roster
    '[playerId+teamId]',                // Unique player-team relationship
    'startDate',                         // Date-based queries
    'isActive',                          // Active relationships
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Match notes table
  matchNotes: [
    'matchId',                           // Match-specific notes
    '[matchId+periodNumber]',           // Period-specific notes
    'updatedAt'                          // Change tracking
  ],

  // Sync metadata table
  syncMetadata: [
    'tableName',                         // Table-specific metadata
    'recordId',                          // Record-specific metadata
    '[tableName+recordId]',             // Unique record tracking
    '[tableName+lastSynced]',           // Table sync status
    'lastSynced'                         // Global sync status
  ],

  // Per-record sync failure tracking
  syncFailures: [
    'table',
    'recordId',
    '[table+recordId]',
    'nextRetryAt',
    'permanent',
    'lastAttemptAt',
    'reasonCode'
  ],

  // Settings table
  settings: [
    'key',                               // Key-based lookup
    'updatedAt'                          // Change tracking
  ],

  // Match periods table
  matchPeriods: [
    'matchId',                           // Match-specific periods
    'periodNumber',                      // Period ordering
    '[matchId+periodNumber]',           // Unique period per match
    'startedAt',                         // Timeline ordering
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    'synced',                            // Sync status
    '[synced+createdByUserId]',         // Unsynced guest data
    '[matchId+synced]'                  // Match sync status
  ],

  // Match state table
  matchState: [
    'matchId',                           // Primary key
    'status',                            // Status filtering
    'createdByUserId',                   // Guest/user scoping
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Default lineups table
  defaultLineups: [
    'teamId',                            // Primary lookup by team
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ]
  ,

  // Global stats cache (single row)
  globalStats: [
    'lastUpdated'
  ]
} as const;

// ============================================================================
// EVENT RELATIONSHIP DEFINITIONS
// ============================================================================

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
  'interception': ['tackle'],
  'tackle': ['interception'],
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
