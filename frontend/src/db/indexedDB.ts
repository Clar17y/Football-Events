import Dexie, { Table } from 'dexie';
import type { 
  OutboxEvent, 
  StoredMatch, 
  StoredTeam, 
  StoredPlayer, 
  StoredSetting,
  SyncMetadata,
  DatabaseResult
} from '../types/database';
import type { EventPayload } from '../types/events';
import type { ID } from '../types/index';
import { validateOrThrow, OutboxEventSchema, EventPayloadSchema } from '../schemas/validation';
import type { 
  EnhancedEvent, 
  EnhancedMatch, 
  EnhancedTeam, 
  EnhancedPlayer, 
  EnhancedSeason,
  EnhancedLineup,
  EnhancedMatchNote,
  EnhancedOutboxEvent,
  EnhancedSyncMetadata,
  EnhancedDatabaseSchema
} from './schema';
import { SCHEMA_INDEXES } from './schema';
import { autoLinkEvents } from './eventLinking';
import { runMigrations } from './migrations';
import { addToOutbox } from './utils';
import { performanceMonitor } from './performance';

/**
 * Enhanced IndexedDB database with proper typing and validation
 */
export class GrassrootsDB extends Dexie {
  // Enhanced database tables with proper typing
  public events!: Table<EnhancedEvent, string>;
  public matches!: Table<EnhancedMatch, string>;
  public teams!: Table<EnhancedTeam, string>;
  public players!: Table<EnhancedPlayer, string>;
  public seasons!: Table<EnhancedSeason, string>;
  public lineup!: Table<EnhancedLineup, string>;
  public match_notes!: Table<EnhancedMatchNote, string>;
  public outbox!: Table<EnhancedOutboxEvent, number>;
  public sync_metadata!: Table<EnhancedSyncMetadata, number>;
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

    // Version 3: Enhanced schema with event linking and PostgreSQL alignment
    this.version(3).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `match_id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `team_id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `season_id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      match_notes: `match_note_id, ${SCHEMA_INDEXES.match_notes.join(', ')}`,
      outbox: `++id, ${SCHEMA_INDEXES.outbox.join(', ')}`,
      sync_metadata: `++id, ${SCHEMA_INDEXES.sync_metadata.join(', ')}`,
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

    // Hook for outbox tracking
    this.events.hook('creating', (primKey, obj, trans) => {
      trans.on('complete', () => {
        addToOutbox('events', obj.id, 'INSERT', obj).catch(error => {
          console.warn('Failed to add event to outbox:', error);
        });
      });
    });

    this.events.hook('updating', (modifications, primKey, obj, trans) => {
      trans.on('complete', () => {
        addToOutbox('events', primKey, 'UPDATE', { ...obj, ...modifications }).catch(error => {
          console.warn('Failed to add event update to outbox:', error);
        });
      });
    });

    this.events.hook('deleting', (primKey, obj, trans) => {
      trans.on('complete', () => {
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
      
      // Run any pending migrations
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
    match_id: string;
    season_id: string;
    period_number: number;
    clock_ms: number;
    team_id: string;
    player_id: string;
    sentiment: number;
    notes?: string;
  }): Promise<DatabaseResult<string>> {
    try {
      // Validate required fields
      if (!eventData.kind || !eventData.match_id || !eventData.season_id || 
          !eventData.team_id || !eventData.player_id) {
        return {
          success: false,
          error: 'Missing required fields: kind, match_id, season_id, team_id, player_id are required',
          affected_count: 0
        };
      }

      // Validate data types
      if (typeof eventData.period_number !== 'number' || 
          typeof eventData.clock_ms !== 'number' || 
          typeof eventData.sentiment !== 'number') {
        return {
          success: false,
          error: 'Invalid data types: period_number, clock_ms, and sentiment must be numbers',
          affected_count: 0
        };
      }

      const now = Date.now();
      const eventId = `event-${now}-${Math.random().toString(36).substr(2, 9)}`;
      
      const enhancedEvent: EnhancedEvent = {
        id: eventId,
        match_id: eventData.match_id,
        season_id: eventData.season_id,
        ts_server: now,
        period_number: eventData.period_number,
        clock_ms: eventData.clock_ms,
        kind: eventData.kind as any, // EventKind
        team_id: eventData.team_id,
        player_id: eventData.player_id,
        sentiment: eventData.sentiment,
        notes: eventData.notes,
        created_at: now,
        updated_at: now
      };

      await this.events.add(enhancedEvent);
      
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
        .where('match_id')
        .equals(matchId)
        .toArray();
      
      // Sort by clock_ms
      events.sort((a, b) => a.clock_ms - b.clock_ms);

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
   * Add an event to the outbox with validation
   */
  async addEvent(payload: EventPayload): Promise<DatabaseResult<number>> {
    try {
      // Validate the payload
      const validatedPayload = validateOrThrow(EventPayloadSchema, payload, 'EventPayload');
      
      const outboxEvent: Omit<EnhancedOutboxEvent, 'id'> = {
        table_name: 'events',
        record_id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operation: 'INSERT',
        data: validatedPayload,
        synced: false,
        created_at: Date.now(),
        retry_count: 0
      };

      // Note: Skip validation for now as we need to update the schema

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
  async getUnsyncedEvents(): Promise<DatabaseResult<EnhancedOutboxEvent[]>> {
    try {
      const events = await this.outbox
        .filter(event => !event.synced && (event.retry_count || 0) < 3)
        .sortBy('created_at');

      return {
        success: true,
        data: events,
        affected_count: events.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get unsynced events',
        affected_count: 0
      };
    }
  }

  /**
   * Mark event as synced
   */
  async markEventSynced(id: number): Promise<DatabaseResult<void>> {
    try {
      await this.outbox.update(id, { 
        synced: true,
        last_sync_attempt: Date.now()
      });

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
        retry_count: (event.retry_count || 0) + 1,
        last_sync_attempt: Date.now(),
        sync_error: error,
        failed_at: Date.now()
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
  async upsertTeam(team: Omit<EnhancedTeam, 'created_at' | 'updated_at'>): Promise<DatabaseResult<string>> {
    try {
      const now = Date.now();
      const existingTeam = await this.teams.get(team.team_id);
      
      if (existingTeam) {
        await this.teams.update(team.team_id, {
          ...team,
          updated_at: now
        });
      } else {
        await this.teams.add({
          ...team,
          created_at: now,
          updated_at: now
        });
      }

      return {
        success: true,
        data: team.team_id,
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
  async upsertPlayer(player: Omit<StoredPlayer, 'created_at' | 'updated_at'>): Promise<DatabaseResult<string>> {
    try {
      const now = Date.now();
      const existingPlayer = await this.players.get(player.id);
      
      if (existingPlayer) {
        await this.players.update(player.id, {
          ...player,
          updated_at: now
        });
      } else {
        await this.players.add({
          ...player,
          created_at: now,
          updated_at: now
        });
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
  async getAllTeams(): Promise<DatabaseResult<EnhancedTeam[]>> {
    try {
      const teams = await this.teams.orderBy('name').toArray();
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
   * Get players for a specific team
   */
  async getPlayersByTeam(teamId: ID): Promise<DatabaseResult<EnhancedPlayer[]>> {
    try {
      const players = await this.players
        .where('current_team')
        .equals(teamId)
        .sortBy('squad_number');

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
  async getMatchEvents(matchId: ID): Promise<DatabaseResult<EnhancedOutboxEvent[]>> {
    try {
      const events = await this.outbox
        .filter(event => event.data && event.data.match_id === matchId)
        .sortBy('created_at');

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
        this.match_notes.clear(),
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

// Initialize database on module load
db.initialize().catch(error => {
  console.error('Failed to initialize database:', error);
});

// Export types for use in other files
export type { OutboxEvent, StoredTeam, StoredPlayer, DatabaseResult };
export type { EnhancedEvent, EnhancedMatch, EnhancedTeam, EnhancedPlayer, EnhancedSeason };
