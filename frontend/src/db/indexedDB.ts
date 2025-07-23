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
import type { EnhancedEvent, EnhancedMatch, EnhancedTeam, EnhancedPlayer, EnhancedSeason, EnhancedLineup } from './schema';

// Define IndexedDB-specific types with authentication fields
interface OutboxEvent {
  id?: number;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  data?: any;
  synced: number; // Use number (0/1) instead of boolean for IndexedDB compatibility
  created_at: number;
  retry_count: number;
  last_sync_attempt?: number;
  sync_error?: string;
  failed_at?: number;
  created_by_user_id: string;
}

interface SyncMetadata {
  id?: number;
  table_name: string;
  record_id: string;
  last_synced: number;
  server_version?: string;
  local_version: string;
}

import { SCHEMA_INDEXES } from './schema';
import { autoLinkEvents } from './eventLinking';
import { runMigrations } from './migrations';
import { addToOutbox } from './utils';
import { performanceMonitor } from './performance';

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
    // Note: Incremented version to avoid primary key change conflicts
    this.version(4).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
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
    created_by_user_id?: string; // Optional for now, will be required when auth is implemented
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
      
      const event: EnhancedEvent = {
        id: eventId,
        // Schema-required properties
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
        updated_at: now,
        created_by_user_id: eventData.created_by_user_id || 'temp-user-id',
        is_deleted: false,
        // Note: EnhancedEvent uses snake_case properties only
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

      // Check for some basic required fields
      if (!payload.kind && !payload.match_id && !payload.team_id) {
        return {
          success: false,
          error: 'Invalid payload: missing required fields (kind, match_id, or team_id)',
          affected_count: 0
        };
      }

      const outboxEvent: Omit<OutboxEvent, 'id'> = {
        table_name: 'events',
        record_id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        operation: 'INSERT',
        data: payload,
        synced: 0, // Use 0 instead of false for IndexedDB compatibility
        created_at: Date.now(),
        retry_count: 0,
        created_by_user_id: payload.created_by_user_id || 'temp-user-id'
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
        .filter(event => (event.retry_count || 0) < 3) // Exclude events with high retry count
        .sortBy('created_at');

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
        last_sync_attempt: Date.now()
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
        retry_count: (event.retry_count || 0) + 1,
        last_sync_attempt: Date.now(),
        sync_error: error,
        failed_at: Date.now(),
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
  async getAllTeams(): Promise<DatabaseResult<Team[]>> {
    try {
      const enhancedTeams = await this.teams.orderBy('name').toArray();
      // Transform Enhanced types to frontend types
      const teams: Team[] = enhancedTeams.map(team => ({
        id: team.team_id || team.id,
        name: team.name,
        homeKitPrimary: team.color_primary,
        homeKitSecondary: team.color_secondary,
        awayKitPrimary: team.color_primary,
        awayKitSecondary: team.color_secondary,
        logoUrl: undefined,
        createdAt: new Date(team.created_at),
        updatedAt: team.updated_at ? new Date(team.updated_at) : undefined,
        created_by_user_id: team.created_by_user_id,
        deleted_at: team.deleted_at ? new Date(team.deleted_at) : undefined,
        deleted_by_user_id: team.deleted_by_user_id,
        is_deleted: team.is_deleted
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
   * Get players for a specific team
   */
  async getPlayersByTeam(teamId: ID): Promise<DatabaseResult<Player[]>> {
    try {
      const enhancedPlayers = await this.players
        .where('current_team')
        .equals(teamId)
        .sortBy('squad_number');

      // Transform Enhanced types to frontend types
      const players: Player[] = enhancedPlayers.map(player => ({
        id: player.id,
        name: player.full_name,
        squadNumber: player.squad_number,
        preferredPosition: player.preferred_pos,
        dateOfBirth: player.dob ? new Date(player.dob) : undefined,
        notes: player.notes,
        currentTeam: player.current_team,
        createdAt: new Date(player.created_at),
        updatedAt: player.updated_at ? new Date(player.updated_at) : undefined,
        created_by_user_id: player.created_by_user_id,
        deleted_at: player.deleted_at ? new Date(player.deleted_at) : undefined,
        deleted_by_user_id: player.deleted_by_user_id,
        is_deleted: player.is_deleted
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
  async getMatchEvents(matchId: ID): Promise<DatabaseResult<OutboxEvent[]>> {
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

