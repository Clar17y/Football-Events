/**
 * Database-specific type definitions
 * 
 * This file contains types for database operations,
 * sync functionality, and data persistence.
 */

import type { ID, Timestamp } from './index';
import type { EventPayload } from './events';

/**
 * Database table schemas
 */
export interface DatabaseSchema {
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
  playerTeams: StoredPlayerTeam;
  /** Settings table */
  settings: StoredSetting;
  /** Sync metadata */
  syncMetadata: SyncMetadata;
}

/**
 * Stored match data
 */
export interface StoredMatch {
  id: ID;
  matchId: ID; // Primary key (UUID)
  seasonId: ID;
  homeTeamId: ID;
  awayTeamId: ID;
  kickoffTime: Timestamp;
  competition?: string;
  venue?: string;
  durationMinutes: number;
  periodFormat: string;
  homeScore: number;
  awayScore: number;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: string;
  deletedAt?: Timestamp;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Stored team data
 */
export interface StoredTeam {
  id: ID;
  teamId: ID; // Primary key (UUID)
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: string;
  deletedAt?: Timestamp;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Stored player data
 */
export interface StoredPlayer {
  id: ID; // Primary key (UUID)
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: string; // ISO date string
  notes?: string;
  currentTeam?: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: string;
  deletedAt?: Timestamp;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Stored season data
 */
export interface StoredSeason {
  id: ID; // For compatibility
  seasonId: ID; // Primary key (UUID)
  label: string;
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: string;
  deletedAt?: Timestamp;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Stored event data
 */
export interface StoredEvent {
  id: ID; // Primary key (UUID)
  matchId: ID;
  seasonId: ID;
  periodNumber: number;
  clockMs: number;
  kind: string; // EventKind as string
  teamId: ID;
  playerId: ID;
  notes?: string;
  sentiment: number;
  linkedEvents?: ID[];
  autoLinkedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: string;
  deletedAt?: Timestamp;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Stored lineup data
 */
export interface StoredLineup {
  id: string; // Composite key: `${matchId}-${playerId}-${startMinute}`
  matchId: ID;
  playerId: ID;
  startMinute: number;
  endMinute?: number;
  position: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: string;
  deletedAt?: Timestamp;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Stored player team relationship data
 */
export interface StoredPlayerTeam {
  id: ID; // Primary key (UUID)
  playerId: ID;
  teamId: ID;
  startDate: string; // ISO date string
  endDate?: string; // ISO date string
  jerseyNumber?: number;
  position?: string;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: string;
  deletedAt?: Timestamp;
  deletedByUserId?: string;
  isDeleted: boolean;
}

/**
 * Application settings
 */
export interface StoredSetting {
  key: string;
  value: string; // JSON string
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Sync metadata for tracking sync state
 */
export interface SyncMetadata {
  id?: number;
  tableName: string;
  recordId: ID;
  lastSynced: Timestamp;
  syncVersion: number;
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
  sortBy?: string;
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
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
  affectedCount?: number;
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
  syncedCount: number;
  /** Number of conflicts encountered */
  conflictCount: number;
  /** Number of errors encountered */
  errorCount: number;
  /** Detailed error messages */
  errors: string[];
  /** Sync duration in milliseconds */
  duration: number;
  /** Timestamp when sync completed */
  completedAt: Timestamp;
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
    maxRetries: number;
    /** Retry delay in milliseconds */
    retryDelay: number;
  };
}

/**
 * Export/import data structures
 */
export interface ExportData {
  /** Export metadata */
  metadata: {
    version: string;
    exportedAt: Timestamp;
    appVersion: string;
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
  playerTeams: StoredPlayerTeam[];
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
    matchesImported: number;
    teamsImported: number;
    playersImported: number;
    eventsImported: number;
    settingsImported: number;
  };
  /** Import errors */
  errors: string[];
  /** Import warnings */
  warnings: string[];
}
