import Dexie, { Table } from 'dexie';
import type { 
  StoredMatch, 
  StoredTeam, 
  StoredPlayer, 
  StoredSeason,
  StoredEvent,
  StoredLineup,
  StoredPlayerTeam,
  StoredSetting,
  DatabaseResult
} from '../types/database';
import type { EventPayload } from '../types/events';
import type { ID } from '../types/index';
import { validateOrThrow, OutboxEventSchema, EventPayloadSchema } from '../schemas/validation';
import type { 
  Event, 
  Match, 
  Team, 
  Player, 
  Season,
  Lineup,
  PlayerTeam
} from '../../../shared/types/frontend';
import type { EnhancedEvent, EnhancedMatch, EnhancedTeam, EnhancedPlayer, EnhancedSeason, EnhancedLineup, EnhancedMatchNote, LocalMatchPeriod, LocalMatchState, LocalDefaultLineup } from './schema';

// Define IndexedDB-specific types with authentication fields (camelCase)
interface OutboxEvent {
  id?: number;
  tableName: string;
  recordId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  data?: any;
  synced: number; // Use number (0/1) instead of boolean for IndexedDB compatibility
  createdAt: number;
  retryCount: number;
  lastSyncAttempt?: number;
  syncError?: string;
  failedAt?: number;
  createdByUserId: string;
}

interface SyncMetadata {
  id?: number;
  tableName: string;
  recordId: string;
  lastSynced: number;
  serverVersion?: string;
  localVersion: string;
}

import { SCHEMA_INDEXES } from './schema';
import { autoLinkEvents } from './eventLinking';
import { runMigrations } from './migrations';
import { addToOutbox } from './utils';
import { performanceMonitor } from './performance';
import { getGuestId, isGuest } from '../utils/guest';
import { canAddEvent } from '../utils/guestQuota';

/**
 * Enhanced IndexedDB database with proper typing and validation
 */
export class GrassrootsDB extends Dexie {
  // Database tables using enhanced types for compatibility
  public events!: Table<EnhancedEvent, string>;
  public matches!: Table<EnhancedMatch, string>;
  public teams!: Table<EnhancedTeam, string>;
  public players!: Table<EnhancedPlayer, string>;
  public seasons!: Table<EnhancedSeason, string>;
  public lineup!: Table<EnhancedLineup, string>;
  public player_teams!: Table<PlayerTeam, string>;
  public match_notes!: Table<EnhancedMatchNote, string>;
  public match_periods!: Table<LocalMatchPeriod, string>;
  public match_state!: Table<LocalMatchState, string>;
  public default_lineups!: Table<LocalDefaultLineup, string>;
  public outbox!: Table<OutboxEvent, number>;
  public sync_metadata!: Table<SyncMetadata, number>;
  public settings!: Table<StoredSetting, string>;

  constructor() {
    super('grassroots_db');
    
    // Version 1: Initial schema (legacy)
    this.version(1).stores({
      outbox: '++id, synced, created_at, retry_count, last_sync_attempt',
      matches: 'id, season_id, home_team_id, away_team_id, date, status, created_at',
      teams: 'id, name, created_at',
      players: 'id, team_id, full_name, jersey_number, is_active, created_at',
      settings: 'key, created_at',
      sync_metadata: '++id, table_name, record_id, last_synced'
    });

    // Version 2: Add performance indexes (legacy)
    this.version(2).stores({
      outbox: '++id, synced, created_at, retry_count, last_sync_attempt, [synced+created_at]',
      matches: 'id, season_id, home_team_id, away_team_id, date, status, created_at, [season_id+date]',
      teams: 'id, name, created_at',
      players: 'id, team_id, full_name, jersey_number, is_active, created_at, [team_id+is_active], [team_id+jersey_number]',
      settings: 'key, created_at',
      sync_metadata: '++id, table_name, record_id, last_synced, [table_name+record_id]'
    });

    // Version 4: Enhanced schema with event linking and PostgreSQL alignment
    this.version(4).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 5: Add indexes for created_by_user_id and is_deleted on teams/matches
    // This enables guest-mode counts and filtering by creator without full scans
    this.version(5).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 6: Add created_by_user_id / is_deleted indexes for seasons (missed previously)
    this.version(6).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 7: Add composite event indexes used in utils ([match_id+player_id], [match_id+team_id])
    this.version(7).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 8: Add created_by_user_id index on outbox for import detection
    this.version(8).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 9: Add synced field and new match_periods/match_state tables
    this.version(9).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
      match_periods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      match_state: `match_id, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    }).upgrade(async (trans) => {
      // Initialize synced field to false for all existing records
      console.log('Migrating to version 9: Adding synced field to all tables');

      // Update events
      const events = await trans.table('events').toArray();
      for (const event of events) {
        await trans.table('events').update(event.id, { synced: false });
      }

      // Update matches
      const matches = await trans.table('matches').toArray();
      for (const match of matches) {
        await trans.table('matches').update(match.id, { synced: false });
      }

      // Update teams
      const teams = await trans.table('teams').toArray();
      for (const team of teams) {
        await trans.table('teams').update(team.id, { synced: false });
      }

      // Update players
      const players = await trans.table('players').toArray();
      for (const player of players) {
        await trans.table('players').update(player.id, { synced: false });
      }

      // Update seasons
      const seasons = await trans.table('seasons').toArray();
      for (const season of seasons) {
        await trans.table('seasons').update(season.id, { synced: false });
      }

      // Update lineup
      const lineups = await trans.table('lineup').toArray();
      for (const lineup of lineups) {
        await trans.table('lineup').update(lineup.id, { synced: false });
      }

      console.log('Version 9 migration complete: synced field added to all tables');
    });

    // Version 10: Add default_lineups table
    this.version(10).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
      match_periods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      match_state: `match_id, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      default_lineups: `id, ${SCHEMA_INDEXES.defaultLineups.join(', ')}`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 11: camelCase migration - clean slate approach
    // Bumping version auto-clears old snake_case data since there are no active users
    this.version(11).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, playerId, teamId, startDate, isActive, createdAt, updatedAt`,
      match_notes: `matchNoteId, ${SCHEMA_INDEXES.matchNotes.join(', ')}`,
      match_periods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      match_state: `matchId, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      default_lineups: `id, ${SCHEMA_INDEXES.defaultLineups.join(', ')}`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Hook for auto-linking events
    this.events.hook('creating', (primKey, obj, trans) => {
      // Auto-link events after creation
      trans.on('complete', () => {
        autoLinkEvents(obj).catch(error => {
          console.warn('Auto-linking failed for event:', obj.id, error);
        });
      });
    });

    // Hook for outbox tracking - only for authenticated users (guests don't need outbox)
    this.events.hook('creating', (primKey, obj, trans) => {
      trans.on('complete', () => {
        // Skip outbox for guests - they sync everything on sign-up via synced:false flag
        if (isGuest()) return;
        addToOutbox('events', obj.id, 'INSERT', obj).catch(error => {
          console.warn('Failed to add event to outbox:', error);
        });
      });
    });

    this.events.hook('updating', (modifications, primKey, obj, trans) => {
      trans.on('complete', () => {
        // Skip outbox for guests
        if (isGuest()) return;
        addToOutbox('events', primKey, 'UPDATE', { ...obj, ...modifications }).catch(error => {
          console.warn('Failed to add event update to outbox:', error);
        });
      });
    });

    this.events.hook('deleting', (primKey, obj, trans) => {
      trans.on('complete', () => {
        // Skip outbox for guests
        if (isGuest()) return;
        addToOutbox('events', primKey, 'DELETE').catch(error => {
          console.warn('Failed to add event deletion to outbox:', error);
        });
      });
    });
  }

  /**
   * Initialize database with migrations
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing enhanced database...');
      
      // Open the database
      await this.open();
      
      await runMigrations(this);
      
      console.log('Database initialization completed successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      
      // Handle constraint errors by resetting the database
      if (error instanceof Error && error.name === 'ConstraintError' && error.message.includes('already exists')) {
        console.log('Constraint error detected - resetting database...');
        await this.resetDatabase();
        return;
      }

      // Gracefully handle Dexie upgrade errors regarding primary key changes
      // Seen as DatabaseClosedError with inner UpgradeError: "Not yet support for changing primary key"
      const err: any = error;
      const innerName = err?.inner?.name || err?.cause?.name;
      const innerMsg = err?.inner?.message || err?.cause?.message || '';
      if (
        (error instanceof Error && (error.name === 'UpgradeError' || error.name === 'DatabaseClosedError')) ||
        innerName === 'UpgradeError' ||
        (typeof innerMsg === 'string' && innerMsg.includes('changing primary key'))
      ) {
        console.warn('Upgrade error detected (likely primary key change). Resetting IndexedDB...');
        await this.resetDatabase();
        return;
      }
      
      throw error;
    }
  }

  /**
   * Reset database by deleting and recreating it
   */
  async resetDatabase(): Promise<void> {
    try {
      console.log('Resetting database...');
      
      // Close current connection
      this.close();
      
      // Delete the database
      await Dexie.delete('grassroots_db');
      
      // Reinitialize
      await this.open();
      await runMigrations(this);
      
      console.log('Database reset completed successfully');
    } catch (error) {
      console.error('Database reset failed:', error);
      throw error;
    }
  }

  /**
   * Add an enhanced event with auto-linking
   */
  async addEnhancedEvent(eventData: {
    kind: string;
    matchId: string;
    periodNumber: number;
    clockMs: number;
    teamId: string;
    playerId: string;
    sentiment: number;
    notes?: string;
    createdByUserId?: string; // Optional for now, will be required when auth is implemented
  }): Promise<DatabaseResult<string>> {
    try {
      // Validate required fields
      if (!eventData.kind || !eventData.matchId ||
          !eventData.teamId || !eventData.playerId) {
        return {
          success: false,
          error: 'Missing required fields: kind, matchId, teamId, playerId are required',
          affected_count: 0
        };
      }

      // Validate data types
      if (typeof eventData.periodNumber !== 'number' || 
          typeof eventData.clockMs !== 'number' || 
          typeof eventData.sentiment !== 'number') {
        return {
          success: false,
          error: 'Invalid data types: periodNumber, clockMs, and sentiment must be numbers',
          affected_count: 0
        };
      }

      const now = Date.now();
      const eventId = globalThis.crypto?.randomUUID?.() ?? `event-${now}-${Math.random().toString(36).substr(2, 9)}`;
      
      const event: EnhancedEvent = {
        id: eventId,
        // Schema-required properties (camelCase)
        matchId: eventData.matchId,
        tsServer: now,
        periodNumber: eventData.periodNumber,
        clockMs: eventData.clockMs,
        kind: eventData.kind as any, // EventKind
        teamId: eventData.teamId,
        playerId: eventData.playerId,
        sentiment: eventData.sentiment,
        notes: eventData.notes,
        createdAt: now,
        updatedAt: now,
        createdByUserId: eventData.createdByUserId || (isGuest() ? getGuestId() : 'authenticated-user'),
        isDeleted: false,
        synced: false,
      };

      await this.events.add(event);
      
      return {
        success: true,
        data: eventId,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add enhanced event',
        affected_count: 0
      };
    }
  }

  /**
   * Get enhanced events for a match
   */
  async getEnhancedMatchEvents(matchId: string): Promise<DatabaseResult<EnhancedEvent[]>> {
    try {
      const events = await this.events
        .where('matchId')
        .equals(matchId)
        .toArray();
      
      // Sort by clockMs
      events.sort((a, b) => a.clockMs - b.clockMs);

      return {
        success: true,
        data: events,
        affected_count: events.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get enhanced match events',
        affected_count: 0
      };
    }
  }

  /**
   * Delete an enhanced event
   */
  async deleteEnhancedEvent(eventId: string): Promise<DatabaseResult<void>> {
    try {
      await this.events.delete(eventId);
      
      return {
        success: true,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete enhanced event',
        affected_count: 0
      };
    }
  }

  /**
   * Add an event directly to the events table (for new offline-first architecture)
   *
   * @param payload Event data with required fields
   * @returns DatabaseResult with the event ID
   */
  async addEventToTable(payload: {
    kind: string;
    matchId: string;
    teamId?: string; // Optional for formation_change events
    playerId?: string | null;
    minute?: number;
    second?: number;
    clockMs?: number;
    period?: number;
    periodNumber?: number;
    sentiment?: number;
    notes?: string;
    data?: any;
    createdByUserId?: string;
  }): Promise<DatabaseResult<string>> {
    try {
      // Validate required fields (teamId is optional for formation_change events)
      if (!payload.kind || !payload.matchId) {
        return {
          success: false,
          error: 'Missing required fields: kind and matchId are required',
          affected_count: 0
        };
      }
      // teamId is required for most events, but optional for formation_change
      if (!payload.teamId && payload.kind !== 'formation_change') {
        return {
          success: false,
          error: 'Missing required field: teamId is required for non-formation events',
          affected_count: 0
        };
      }

      // Enforce guest quota for non-scoring events
      try {
        const quota = await canAddEvent(payload.matchId, payload.kind);
        if (!quota.ok) {
          return {
            success: false,
            error: quota.reason,
            affected_count: 0
          };
        }
      } catch (e) {
        console.warn('Quota check failed:', e);
      }

      const now = Date.now();
      const eventId = globalThis.crypto?.randomUUID?.() ?? `event-${now}-${Math.random().toString(36).substr(2, 9)}`;

      // Calculate clockMs if not provided
      const clockMs = payload.clockMs ??
        ((payload.minute ?? 0) * 60000 + (payload.second ?? 0) * 1000);

      const event: EnhancedEvent = {
        id: eventId,
        matchId: payload.matchId,
        tsServer: now,
        periodNumber: payload.periodNumber ?? payload.period ?? 1,
        clockMs: clockMs,
        kind: payload.kind as any,
        teamId: payload.teamId || '', // Empty string for formation_change events
        playerId: payload.playerId ?? '',
        sentiment: payload.sentiment ?? 0,
        notes: payload.notes || (payload.data?.notes as string) || '',
        createdAt: now,
        updatedAt: now,
        createdByUserId: payload.createdByUserId || (isGuest() ? getGuestId() : 'authenticated-user'),
        isDeleted: false,
        synced: false, // Mark as unsynced
      };

      await this.events.add(event);

      return {
        success: true,
        data: eventId,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add event to table',
        affected_count: 0
      };
    }
  }

  /**
   * Add an event to the outbox with validation
   * @deprecated Use addEventToTable instead for new offline-first architecture
   */
  async addEvent(payload: any): Promise<DatabaseResult<number>> {
    try {
      // Basic validation - check for required fields
      if (!payload || typeof payload !== 'object') {
        return {
          success: false,
          error: 'Invalid payload: must be an object',
          affected_count: 0
        };
      }

      // Check for some basic required fields (support both camelCase and snake_case for backwards compatibility)
      if (!payload.kind && !payload.matchId && !payload.match_id && !payload.teamId && !payload.team_id) {
        return {
          success: false,
          error: 'Invalid payload: missing required fields (kind, matchId, or teamId)',
          affected_count: 0
        };
      }

      // Enforce guest quota for non-scoring events
      try {
        const kind = payload.kind;
        const matchId = payload.matchId || payload.match_id;
        const quota = await canAddEvent(String(matchId || ''), String(kind || ''));
        if (!quota.ok) {
          return {
            success: false,
            error: quota.reason,
            affected_count: 0
          };
        }
      } catch {}

      const outboxEvent: Omit<OutboxEvent, 'id'> = {
        tableName: 'events',
        recordId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operation: 'INSERT',
        data: payload,
        synced: 0, // Use 0 instead of false for IndexedDB compatibility
        createdAt: Date.now(),
        retryCount: 0,
        createdByUserId: payload.createdByUserId || payload.created_by_user_id || (isGuest() ? getGuestId() : 'authenticated-user')
      };

      const id = await this.outbox.add(outboxEvent);
      
      return {
        success: true,
        data: id,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        affected_count: 0
      };
    }
  }

  /**
   * Get unsynced events from outbox
   */
  async getUnsyncedEvents(): Promise<DatabaseResult<OutboxEvent[]>> {
    try {
      const events = await this.outbox
        .where('synced')
        .equals(0) // Use 0 instead of false for IndexedDB compatibility
        .filter(event => (event.retryCount || 0) < 3) // Exclude events with high retry count
        .sortBy('createdAt');

      return {
        success: true,
        data: events || [], // Ensure we always return an array
        affected_count: events ? events.length : 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get unsynced events',
        affected_count: 0,
        data: [] // Ensure we return an empty array on error
      };
    }
  }


  /**
   * Mark event as synced
   */
  async markEventSynced(id: number): Promise<DatabaseResult<void>> {
    try {
      const result = await this.outbox.update(id, { 
        synced: 1, // Use 1 instead of true for IndexedDB compatibility
        lastSyncAttempt: Date.now()
      });

      if (result === 0) {
        return {
          success: false,
          error: 'Event not found',
          affected_count: 0
        };
      }

      return {
        success: true,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to mark event as synced',
        affected_count: 0
      };
    }
  }

  /**
   * Mark event sync as failed and increment retry count
   */
  async markEventSyncFailed(id: number, error: string): Promise<DatabaseResult<void>> {
    try {
      const event = await this.outbox.get(id);
      if (!event) {
        return {
          success: false,
          error: 'Event not found',
          affected_count: 0
        };
      }

      await this.outbox.update(id, {
        retryCount: (event.retryCount || 0) + 1,
        lastSyncAttempt: Date.now(),
        syncError: error,
        failedAt: Date.now(),
        synced: 0 // Ensure it stays unsynced (use 0 instead of false)
      });

      return {
        success: true,
        affected_count: 1
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to mark event sync as failed',
        affected_count: 0
      };
    }
  }

  /**
   * Delete an event from the outbox
   */
  async deleteEvent(id: number): Promise<DatabaseResult<void>> {
    try {
      await this.outbox.delete(id);
      
      return {
        success: true,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete event',
        affected_count: 0
      };
    }
  }

  /**
   * Add or update a team
   */
  async upsertTeam(team: Omit<EnhancedTeam, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<string>> {
    try {
      const now = Date.now();
      const existingTeam = await this.teams.get(team.teamId);
      
      if (existingTeam) {
        await this.teams.update(team.teamId, {
          ...team,
          updatedAt: now
        });
      } else {
        await this.teams.add({
          ...team,
          createdAt: now,
          updatedAt: now
        });
      }

      return {
        success: true,
        data: team.teamId,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upsert team',
        affected_count: 0
      };
    }
  }

  /**
   * Add or update a player
   */
  async upsertPlayer(player: Omit<StoredPlayer, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<string>> {
    try {
      const now = Date.now();
      const existingPlayer = await this.players.get(player.id);
      
      // Transform snake_case StoredPlayer to camelCase EnhancedPlayer
      const enhancedPlayer: EnhancedPlayer = {
        id: player.id,
        fullName: player.full_name,
        squadNumber: player.squad_number,
        preferredPos: player.preferred_pos,
        dob: player.dob,
        notes: player.notes,
        currentTeam: player.current_team,
        createdAt: existingPlayer?.createdAt ?? now,
        updatedAt: now,
        synced: false,
        createdByUserId: player.created_by_user_id,
        deletedAt: player.deleted_at,
        deletedByUserId: player.deleted_by_user_id,
        isDeleted: player.is_deleted
      };
      
      if (existingPlayer) {
        await this.players.update(player.id, enhancedPlayer);
      } else {
        await this.players.add(enhancedPlayer);
      }

      return {
        success: true,
        data: player.id,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upsert player',
        affected_count: 0
      };
    }
  }

  /**
   * Get all teams
   */
  async getAllTeams(): Promise<DatabaseResult<Team[]>> {
    try {
      const enhancedTeams = await this.teams.orderBy('name').toArray();
      // Transform Enhanced types to frontend types
      const teams: Team[] = enhancedTeams.map(team => ({
        id: team.teamId || team.id,
        name: team.name,
        homeKitPrimary: team.colorPrimary,
        homeKitSecondary: team.colorSecondary,
        awayKitPrimary: team.colorPrimary,
        awayKitSecondary: team.colorSecondary,
        logoUrl: undefined,
        createdAt: new Date(team.createdAt),
        updatedAt: team.updatedAt ? new Date(team.updatedAt) : undefined,
        created_by_user_id: team.createdByUserId,
        deleted_at: team.deletedAt ? new Date(team.deletedAt) : undefined,
        deleted_by_user_id: team.deletedByUserId,
        is_deleted: team.isDeleted,
        is_opponent: team.isOpponent || false
      }));
      return {
        success: true,
        data: teams,
        affected_count: teams.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get teams',
        affected_count: 0
      };
    }
  }

  /**
   * Get players for a specific team using player_teams junction table
   */
  async getPlayersByTeam(teamId: ID): Promise<DatabaseResult<Player[]>> {
    try {
      console.log('[getPlayersByTeam] Querying players for team:', teamId);
      
      // Get active player-team relationships for this team
      const playerTeamRelations = await this.player_teams
        .where('teamId')
        .equals(teamId)
        .filter((pt: any) => !pt.isDeleted && pt.isActive !== false)
        .toArray();
      
      console.log('[getPlayersByTeam] Found player-team relations:', playerTeamRelations.length);
      
      // Get the player IDs from the relationships
      const playerIds = playerTeamRelations.map((pt: any) => pt.playerId);
      
      // Fetch the actual player records
      const enhancedPlayers = await this.players
        .where('id')
        .anyOf(playerIds)
        .filter(p => !p.isDeleted)
        .sortBy('squadNumber');
      
      console.log('[getPlayersByTeam] Found players:', enhancedPlayers.length);

      // Transform Enhanced types to frontend types
      const players: Player[] = enhancedPlayers.map(player => ({
        id: player.id,
        name: player.fullName,
        squadNumber: player.squadNumber,
        preferredPosition: player.preferredPos,
        dateOfBirth: player.dob ? new Date(player.dob) : undefined,
        notes: player.notes,
        currentTeam: player.currentTeam,
        createdAt: new Date(player.createdAt),
        updatedAt: player.updatedAt ? new Date(player.updatedAt) : undefined,
        created_by_user_id: player.createdByUserId,
        deleted_at: player.deletedAt ? new Date(player.deletedAt) : undefined,
        deleted_by_user_id: player.deletedByUserId,
        is_deleted: player.isDeleted
      }));

      return {
        success: true,
        data: players,
        affected_count: players.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get players',
        affected_count: 0
      };
    }
  }

  /**
   * Get all events for a match
   */
  async getMatchEvents(matchId: ID): Promise<DatabaseResult<EnhancedEvent[]>> {
    try {
      // Read from events table (not outbox) - events are stored directly in the events table
      const events = await this.events
        .where('matchId')
        .equals(matchId)
        .and(e => !e.isDeleted)
        .sortBy('createdAt');

      return {
        success: true,
        data: events,
        affected_count: events.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get match events',
        affected_count: 0
      };
    }
  }

  /**
   * Create a new match period
   */
  async createMatchPeriod(period: Partial<LocalMatchPeriod>): Promise<DatabaseResult<string>> {
    try {
      if (!period.matchId || !period.periodNumber) {
        return {
          success: false,
          error: 'Missing required fields: matchId and periodNumber are required',
          affected_count: 0
        };
      }

      const now = Date.now();
      const id = period.id || `period-${now}-${Math.random().toString(36).substr(2, 9)}`;

      const matchPeriod: LocalMatchPeriod = {
        id,
        matchId: period.matchId,
        periodNumber: period.periodNumber,
        periodType: period.periodType || 'REGULAR',
        startedAt: period.startedAt || now,
        endedAt: period.endedAt,
        durationSeconds: period.durationSeconds,
        createdAt: now,
        updatedAt: now,
        createdByUserId: period.createdByUserId || (isGuest() ? getGuestId() : 'authenticated-user'),
        isDeleted: false,
        synced: false,
      };

      await this.match_periods.add(matchPeriod);

      return {
        success: true,
        data: id,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create match period',
        affected_count: 0
      };
    }
  }

  /**
   * End a match period
   */
  async endMatchPeriod(matchId: string, periodId: string, endedAt?: number): Promise<DatabaseResult<void>> {
    try {
      const period = await this.match_periods.get(periodId);
      if (!period) {
        return {
          success: false,
          error: 'Period not found',
          affected_count: 0
        };
      }

      const endTime = endedAt || Date.now();
      const durationSeconds = Math.floor((endTime - period.startedAt) / 1000);

      await this.match_periods.update(periodId, {
        endedAt: endTime,
        durationSeconds: durationSeconds,
        updatedAt: Date.now(),
        synced: false
      });

      return {
        success: true,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to end match period',
        affected_count: 0
      };
    }
  }

  /**
   * Get all periods for a match
   */
  async getMatchPeriods(matchId: string): Promise<DatabaseResult<LocalMatchPeriod[]>> {
    try {
      const periods = await this.match_periods
        .where('matchId')
        .equals(matchId)
        .and(p => !p.isDeleted)
        .sortBy('periodNumber');

      return {
        success: true,
        data: periods,
        affected_count: periods.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get match periods',
        affected_count: 0,
        data: []
      };
    }
  }

  /**
   * Update or create match state
   */
  async updateMatchState(matchId: string, updates: Partial<LocalMatchState>): Promise<DatabaseResult<void>> {
    try {
      if (!matchId) {
        return {
          success: false,
          error: 'matchId is required',
          affected_count: 0
        };
      }

      const existing = await this.match_state.get(matchId);
      const now = Date.now();

      if (existing) {
        await this.match_state.update(matchId, {
          ...updates,
          lastUpdatedAt: now,
          updatedAt: now,
          synced: false
        });
      } else {
        const newState: LocalMatchState = {
          matchId: matchId,
          status: updates.status || 'NOT_STARTED',
          currentPeriodId: updates.currentPeriodId,
          timerMs: updates.timerMs || 0,
          lastUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
          createdByUserId: updates.createdByUserId || (isGuest() ? getGuestId() : 'authenticated-user'),
          isDeleted: false,
          synced: false,
        };
        await this.match_state.add(newState);
      }

      return {
        success: true,
        affected_count: 1
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update match state',
        affected_count: 0
      };
    }
  }

  /**
   * Get match state
   */
  async getMatchState(matchId: string): Promise<DatabaseResult<LocalMatchState | undefined>> {
    try {
      const state = await this.match_state.get(matchId);

      return {
        success: true,
        data: state,
        affected_count: state ? 1 : 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get match state',
        affected_count: 0
      };
    }
  }

  /**
   * Clear all data (useful for testing/reset)
   */
  async clearAllData(): Promise<DatabaseResult<void>> {
    try {
      await Promise.all([
        this.events.clear(),
        this.outbox.clear(),
        this.matches.clear(),
        this.teams.clear(),
        this.players.clear(),
        this.seasons.clear(),
        this.lineup.clear(),
        this.match_periods.clear(),
        this.match_state.clear(),
        this.settings.clear(),
        this.sync_metadata.clear()
      ]);

      return {
        success: true,
        affected_count: 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear data',
        affected_count: 0
      };
    }
  }

  /**
   * Force database reset (for development/troubleshooting)
   */
  async forceReset(): Promise<DatabaseResult<void>> {
    try {
      await this.resetDatabase();
      return {
        success: true,
        affected_count: 0
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset database',
        affected_count: 0
      };
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<DatabaseResult<{
    outbox_count: number;
    unsynced_count: number;
    teams_count: number;
    players_count: number;
    matches_count: number;
  }>> {
    try {
      const [outboxCount, unsyncedCount, teamsCount, playersCount, matchesCount] = await Promise.all([
        this.outbox.count(),
        this.outbox.where('synced').equals(0).count(),
        this.teams.count(),
        this.players.count(),
        this.matches.count()
      ]);

      return {
        success: true,
        data: {
          outbox_count: outboxCount,
          unsynced_count: unsyncedCount,
          teams_count: teamsCount,
          players_count: playersCount,
          matches_count: matchesCount
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats'
      };
    }
  }
}

// Export singleton instance
export const db = new GrassrootsDB();

// Note: Database initialization is now handled by DatabaseContext
// to prevent blocking the app on module load

// Export types for use in other files
export type { OutboxEvent, StoredTeam, StoredPlayer, DatabaseResult };

