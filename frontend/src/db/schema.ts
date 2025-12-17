/**
 * Enhanced Database Schema for IndexedDB
 * 
 * This schema is based on the PostgreSQL database structure but optimized
 * for IndexedDB performance and offline-first functionality with bidirectional sync.
 * 
 * NOTE: All field names use camelCase to align with API responses and frontend types.
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
  syncedAt?: Timestamp;
}

/**
 * Enhanced Event interface with auto-linking support
 */
export interface EnhancedEvent extends SyncableRecord {
  /** UUID primary key */
  id: ID;
  /** Foreign key to matches table */
  matchId: ID;
  /** Server timestamp when event was created */
  tsServer: Timestamp;
  /** Match period number (1, 2, 3, 4 for quarters) */
  periodNumber: number;
  /** Game clock in milliseconds */
  clockMs: number;
  /** Type of event (goal, assist, foul, etc.) */
  kind: EventKind;
  /** Foreign key to teams table */
  teamId: ID;
  /** Foreign key to players table */
  playerId: ID;
  /** Optional notes about the event */
  notes?: string;
  /** Sentiment rating from -4 to +4 */
  sentiment: number;
  /** Array of linked event IDs (auto-generated) */
  linkedEvents?: ID[];
  /** Timestamp when auto-linking was performed */
  autoLinkedAt?: Timestamp;
  /** Client timestamp when event was created locally */
  createdAt: Timestamp;
  /** Client timestamp when event was last updated */
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Enhanced Match interface aligned with PostgreSQL schema
 */
export interface EnhancedMatch extends SyncableRecord {
  /** UUID primary key */
  matchId: ID;
  /** Legacy compatibility - alias for matchId */
  id: ID;
  /** Foreign key to seasons table */
  seasonId: ID;
  /** Match kickoff timestamp */
  kickoffTs: Timestamp;
  /** Competition name */
  competition?: string;
  /** Foreign key to home team */
  homeTeamId: ID;
  /** Foreign key to away team */
  awayTeamId: ID;
  /** Venue name */
  venue?: string;
  /** Match duration in minutes */
  durationMins: number;
  /** Period format: 'half' or 'quarter' */
  periodFormat: 'half' | 'quarter';
  /** Home team's score */
  homeScore: number;
  /** Away team's score */
  awayScore: number;
  /** Match notes */
  notes?: string;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Enhanced Team interface
 */
export interface EnhancedTeam extends SyncableRecord {
  /** UUID primary key */
  teamId: ID;
  /** Legacy compatibility - alias for teamId */
  id: ID;
  /** Team name (unique) */
  name: string;
  /** Primary team color (home kit) */
  colorPrimary?: string;
  /** Secondary team color (home kit) */
  colorSecondary?: string;
  /** Primary away kit color */
  awayColorPrimary?: string;
  /** Secondary away kit color */
  awayColorSecondary?: string;
  /** Team logo URL */
  logoUrl?: string;
  /** Whether this is an opponent team (not user's own team) */
  isOpponent?: boolean;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Enhanced Player interface aligned with PostgreSQL schema
 */
export interface EnhancedPlayer extends SyncableRecord {
  /** UUID primary key */
  id: ID;
  /** Player's full name */
  fullName: string;
  /** Squad/jersey number */
  squadNumber?: number;
  /** Preferred position code */
  preferredPos?: string;
  /** Date of birth */
  dob?: string; // ISO date string
  /** Player notes */
  notes?: string;
  /** Current team (foreign key) */
  currentTeam?: ID;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Season interface
 */
export interface EnhancedSeason extends SyncableRecord {
  /** UUID primary key */
  seasonId: ID;
  /** Legacy compatibility - some code uses 'id' */
  id?: ID;
  /** Season label (unique) */
  label: string;
  /** Season start date (ISO string) */
  startDate?: string;
  /** Season end date (ISO string) */
  endDate?: string;
  /** Whether this is the current season */
  isCurrent?: boolean;
  /** Season description/notes */
  description?: string;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Lineup interface for tracking player positions and substitutions
 */
export interface EnhancedLineup extends SyncableRecord {
  /** Composite key: matchId + playerId + startMin */
  id: string; // Generated: `${matchId}-${playerId}-${startMin}`
  /** Foreign key to matches */
  matchId: ID;
  /** Foreign key to players */
  playerId: ID;
  /** Start time in minutes */
  startMin: number;
  /** End time in minutes (null if still playing) */
  endMin?: number;
  /** Position code */
  position: string;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Match notes for period-specific observations
 */
export interface EnhancedMatchNote {
  /** UUID primary key */
  matchNoteId: ID;
  /** Foreign key to matches */
  matchId: ID;
  /** Note content */
  notes: string;
  /** Period number (0 for general match notes) */
  periodNumber: number;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Match period for tracking match time segments
 */
export interface LocalMatchPeriod extends SyncableRecord {
  /** UUID primary key */
  id: ID;
  /** Foreign key to matches table */
  matchId: ID;
  /** Period number (1, 2, 3, 4 for quarters; 1, 2 for halves) */
  periodNumber: number;
  /** Period type */
  periodType: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  /** When the period started (timestamp - preserves original) */
  startedAt: Timestamp;
  /** When the period ended (timestamp - preserves original) */
  endedAt?: Timestamp;
  /** Duration in seconds */
  durationSeconds?: number;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Match state for tracking current match status
 */
export interface LocalMatchState extends SyncableRecord {
  /** Match ID (primary key) */
  matchId: ID;
  /** Current match status */
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  /** Current period ID (if match is live) */
  currentPeriodId?: ID;
  /** Elapsed timer in milliseconds */
  timerMs: number;
  /** Last updated timestamp */
  lastUpdatedAt: Timestamp;
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
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
  teamId: ID;
  /** Formation data - array of player positions */
  formation: FormationPlayerPosition[];
  /** Client timestamps */
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** USER AUTHENTICATION & SOFT DELETE FIELDS */
  createdByUserId: ID;
  deletedAt?: Timestamp;
  deletedByUserId?: ID;
  isDeleted: boolean;
}

/**
 * Enhanced outbox for bidirectional sync
 */
export interface EnhancedOutboxEvent {
  /** Auto-generated ID */
  id?: number;
  /** Table name being synced */
  tableName: string;
  /** Record ID being synced */
  recordId: ID;
  /** Operation type */
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Record data (for INSERT/UPDATE) */
  data?: any;
  /** Event payload for match events (legacy compatibility) */
  payload?: any;
  /** Whether the event has been synced to server */
  synced: boolean;
  /** When the event was created locally */
  createdAt: Timestamp;
  /** Number of sync attempts */
  retryCount: number;
  /** Last sync attempt timestamp */
  lastSyncAttempt?: Timestamp;
  /** Error message if sync failed */
  syncError?: string;
  /** When sync failed (if applicable) */
  failedAt?: Timestamp;
}

/**
 * Enhanced sync metadata for conflict resolution
 */
export interface EnhancedSyncMetadata {
  /** Auto-generated ID */
  id?: number;
  /** Table name */
  tableName: string;
  /** Record ID */
  recordId: ID;
  /** Last successful sync timestamp */
  lastSynced: Timestamp;
  /** Server version/etag for conflict detection */
  serverVersion?: string;
  /** Local version for conflict detection */
  localVersion: string;
  /** Conflict resolution strategy */
  conflictStrategy?: 'server_wins' | 'client_wins' | 'merge' | 'manual';
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
  matchNotes: EnhancedMatchNote;
  matchPeriods: LocalMatchPeriod;
  matchState: LocalMatchState;

  // Sync infrastructure
  outbox: EnhancedOutboxEvent;
  syncMetadata: EnhancedSyncMetadata;

  // Settings (keeping existing)
  settings: {
    key: string;
    value: string;
    createdAt: Timestamp;
  };
}


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
    'tsServer',                         // Sync ordering
    'updatedAt',                        // Change tracking
    'synced',                           // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Matches table
  matches: [
    'seasonId',                          // Season filtering
    'homeTeamId',                        // Team match history
    'awayTeamId',                        // Team match history
    'kickoffTs',                         // Date-based queries
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    '[seasonId+kickoffTs]',             // Season timeline
    '[homeTeamId+kickoffTs]',           // Team schedule
    '[awayTeamId+kickoffTs]',           // Team schedule
    'updatedAt',                         // Change tracking
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Players table
  players: [
    'currentTeam',                       // Team roster queries
    'fullName',                          // Name-based search
    'squadNumber',                       // Number-based lookup
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    '[currentTeam+squadNumber]',        // Unique team numbers
    '[currentTeam+fullName]',           // Team roster with names
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
    '[matchId+startMin]',               // Timeline-based queries
    '[matchId+position]',               // Position-based analysis
    '[playerId+matchId]',               // Player match participation
    'updatedAt',                         // Change tracking
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Match notes table
  matchNotes: [
    'matchId',                           // Match-specific notes
    '[matchId+periodNumber]',           // Period-specific notes
    'updatedAt'                          // Change tracking
  ],

  // Outbox table - sync optimization
  outbox: [
    'synced',                            // Unsynced items
    'tableName',                         // Table-specific sync
    'operation',                         // Operation-specific sync
    'createdByUserId',                   // Source attribution (guest/import detection)
    '[synced+createdAt]',               // Sync queue ordering
    '[tableName+synced]',               // Table-specific sync status
    'retryCount',                        // Failed sync tracking
    'lastSyncAttempt'                    // Retry timing
  ],

  // Sync metadata table
  syncMetadata: [
    'tableName',                         // Table-specific metadata
    'recordId',                          // Record-specific metadata
    '[tableName+recordId]',             // Unique record tracking
    '[tableName+lastSynced]',           // Table sync status
    'lastSynced'                         // Global sync status
  ],

  // Settings table
  settings: [
    'key',                               // Key-based lookup
    'updatedAt'                          // Change tracking
  ],

  // Match periods table (camelCase key for version 11)
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

  // Match state table (camelCase key for version 11)
  matchState: [
    'matchId',                           // Primary key
    'status',                            // Status filtering
    'createdByUserId',                   // Guest/user scoping
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
  ],

  // Default lineups table (camelCase key for version 11)
  defaultLineups: [
    'teamId',                            // Primary lookup by team
    'createdByUserId',                   // Guest/user scoping
    'isDeleted',                         // Soft delete filtering
    'synced',                            // Sync status
    '[synced+createdByUserId]'          // Unsynced guest data
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
