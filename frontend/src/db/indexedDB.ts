import Dexie, { Table } from 'dexie';
// DatabaseResult type for database operations
import type { DatabaseResult } from './schema';
import type { ID } from '../types/index';
import type {
  Event,
  Match,
  Team,
  Player,
  Season,
  PlayerTeam
} from '@shared/types';
import type {
  DbEvent,
  DbMatch,
  DbTeam,
  DbPlayer,
  DbSeason,
  DbLineup,
  DbPlayerTeam,
  DbMatchNote,
  DbMatchPeriod,
  DbMatchState,
  DbDefaultLineup,
  DbGlobalStats,
  DbSyncMetadata,
  DbSyncFailure,
  DbSetting,
  // Legacy type aliases for backward compatibility
  EnhancedEvent,
  EnhancedMatch,
  EnhancedTeam,
  EnhancedPlayer,
  EnhancedSeason,
  EnhancedLineup,
  EnhancedMatchNote,
  LocalMatchPeriod,
  LocalMatchState,
  LocalDefaultLineup
} from './schema';

type SyncMetadata = DbSyncMetadata;
type SyncFailure = DbSyncFailure;

import { SCHEMA_INDEXES } from './schema';
import { autoLinkEvents } from './eventLinking';
import { runMigrations } from './migrations';
import { performanceMonitor } from './performance';
import { getGuestId, isGuest } from '../utils/guest';
import { getCurrentUserId } from '../utils/network';
import { canAddEvent } from '../utils/quotas';

/**
 * Enhanced IndexedDB database with proper typing and validation
 */
export class GrassrootsDB extends Dexie {
  // Database tables using Db* types from schema.ts
  public events!: Table<DbEvent, string>;
  public matches!: Table<DbMatch, string>;
  public teams!: Table<DbTeam, string>;
  public players!: Table<DbPlayer, string>;
  public seasons!: Table<DbSeason, string>;
  public lineup!: Table<DbLineup, string>;
  public playerTeams!: Table<DbPlayerTeam, string>;
  public matchNotes!: Table<DbMatchNote, string>;
  public matchPeriods!: Table<DbMatchPeriod, string>;
  public matchState!: Table<DbMatchState, string>;
  public defaultLineups!: Table<DbDefaultLineup, string>;
  public globalStats!: Table<DbGlobalStats, string>;
  public syncMetadata!: Table<DbSyncMetadata, number>;
  public syncFailures!: Table<SyncFailure, [string, string]>;
  public settings!: Table<DbSetting, string>;

  constructor() {
    super('grassroots_db');

    // Version 1: Initial schema (legacy)
    this.version(1).stores({
      matches: 'id, season_id, home_team_id, away_team_id, date, status, created_at',
      teams: 'id, name, created_at',
      players: 'id, team_id, full_name, jersey_number, is_active, created_at',
      settings: 'key, created_at',
      sync_metadata: '++id, table_name, record_id, last_synced'
    });

    // Version 2: Add performance indexes (legacy)
    this.version(2).stores({
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
      playerTeams: `id, ${SCHEMA_INDEXES.playerTeams.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 5: Add indexes for createdByUserId and isDeleted on teams/matches
    this.version(5).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      playerTeams: `id, ${SCHEMA_INDEXES.playerTeams.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 6: Add createdByUserId / isDeleted indexes for seasons
    this.version(6).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      playerTeams: `id, ${SCHEMA_INDEXES.playerTeams.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 7: Add composite event indexes
    this.version(7).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      playerTeams: `id, ${SCHEMA_INDEXES.playerTeams.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`,
      matchNotes: `matchNoteId, ${SCHEMA_INDEXES.matchNotes.join(', ')}`,
      matchPeriods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      matchState: `matchId, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      defaultLineups: `id, ${SCHEMA_INDEXES.defaultLineups.join(', ')}`
    });

    // Version 8: Legacy version (outbox removed)
    this.version(8).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      player_teams: `id, player_id, team_id, start_date, is_active, created_at, updated_at`,
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
      sync_metadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`
    });

    // Version 12: camelCase store names - must match class property names
    // Bumping version auto-clears old snake_case stores since there are no active users
    this.version(12).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      playerTeams: `id, playerId, teamId, startDate, isActive, createdAt, updatedAt`,
      matchNotes: `matchNoteId, ${SCHEMA_INDEXES.matchNotes.join(', ')}`,
      matchPeriods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      matchState: `matchId, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      defaultLineups: `id, ${SCHEMA_INDEXES.defaultLineups.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`,
      // Explicitly delete old snake_case stores
      player_teams: null,
      match_notes: null,
      match_periods: null,
      match_state: null,
      default_lineups: null,
      sync_metadata: null
    });

    // Version 13: Sync state is tracked on entity tables via synced/syncedAt fields
    this.version(13).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      playerTeams: `id, playerId, teamId, startDate, isActive, createdAt, updatedAt`,
      matchNotes: `matchNoteId, ${SCHEMA_INDEXES.matchNotes.join(', ')}`,
      matchPeriods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      matchState: `matchId, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      defaultLineups: `id, ${SCHEMA_INDEXES.defaultLineups.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`,
      // Legacy table cleanup
      outbox: null
    });

    // Version 14: Add per-record sync failure tracking for backoff/quarantine
    this.version(14).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      playerTeams: `id, playerId, teamId, startDate, isActive, createdAt, updatedAt`,
      matchNotes: `matchNoteId, ${SCHEMA_INDEXES.matchNotes.join(', ')}`,
      matchPeriods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      matchState: `matchId, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      defaultLineups: `id, ${SCHEMA_INDEXES.defaultLineups.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      syncFailures: '&[table+recordId], table, recordId, nextRetryAt, permanent, lastAttemptAt, reasonCode',
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`,
      // Legacy table cleanup
      outbox: null
    });

    // Version 15: Add global stats cache table (single row)
    this.version(15).stores({
      events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
      matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
      teams: `id, ${SCHEMA_INDEXES.teams.join(', ')}`,
      players: `id, ${SCHEMA_INDEXES.players.join(', ')}`,
      seasons: `id, ${SCHEMA_INDEXES.seasons.join(', ')}`,
      lineup: `id, ${SCHEMA_INDEXES.lineup.join(', ')}`,
      playerTeams: `id, playerId, teamId, startDate, isActive, createdAt, updatedAt`,
      matchNotes: `matchNoteId, ${SCHEMA_INDEXES.matchNotes.join(', ')}`,
      matchPeriods: `id, ${SCHEMA_INDEXES.matchPeriods.join(', ')}`,
      matchState: `matchId, ${SCHEMA_INDEXES.matchState.join(', ')}`,
      defaultLineups: `id, ${SCHEMA_INDEXES.defaultLineups.join(', ')}`,
      globalStats: `id, ${SCHEMA_INDEXES.globalStats.join(', ')}`,
      syncMetadata: `++id, ${SCHEMA_INDEXES.syncMetadata.join(', ')}`,
      syncFailures: '&[table+recordId], table, recordId, nextRetryAt, permanent, lastAttemptAt, reasonCode',
      settings: `key, ${SCHEMA_INDEXES.settings.join(', ')}`,
      // Legacy table cleanup
      outbox: null
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

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const eventId = globalThis.crypto?.randomUUID?.() ?? `event-${nowMs}-${Math.random().toString(36).substr(2, 9)}`;

      const event: DbEvent = {
        id: eventId,
        // Schema-required properties (camelCase)
        matchId: eventData.matchId,
        periodNumber: eventData.periodNumber,
        clockMs: eventData.clockMs,
        kind: eventData.kind as any, // EventKind
        teamId: eventData.teamId,
        playerId: eventData.playerId,
        sentiment: eventData.sentiment,
        notes: eventData.notes,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdByUserId: eventData.createdByUserId || (isGuest() ? getGuestId() : getCurrentUserId()),
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

      // Sort by clockMs (handle undefined values)
      events.sort((a, b) => (a.clockMs ?? 0) - (b.clockMs ?? 0));

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
    teamId: string;
    playerId?: string | null;
    minute?: number;
    second?: number;
    clockMs?: number;
    period?: number;
    periodNumber?: number;
    sentiment?: number;
    notes?: string;
    data?: any;
    createdAt?: string;
    createdByUserId?: string;
    isDeleted?: boolean;
  }): Promise<DatabaseResult<string>> {
    try {
      // Validate required fields
      if (!payload.kind || !payload.matchId) {
        return {
          success: false,
          error: 'Missing required fields: kind and matchId are required',
          affected_count: 0
        };
      }
      if (!payload.teamId) {
        return {
          success: false,
          error: 'Missing required field: teamId is required for events',
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

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const eventId = globalThis.crypto?.randomUUID?.() ?? `event-${nowMs}-${Math.random().toString(36).substr(2, 9)}`;

      // Calculate clockMs if not provided
      const clockMs = payload.clockMs ??
        ((payload.minute ?? 0) * 60000 + (payload.second ?? 0) * 1000);

      const event: DbEvent = {
        id: eventId,
        matchId: payload.matchId,
        periodNumber: payload.periodNumber ?? payload.period ?? 1,
        clockMs: clockMs,
        kind: payload.kind as any,
        teamId: payload.teamId,
        playerId: payload.playerId ?? '',
        sentiment: payload.sentiment ?? 0,
        notes: payload.notes || (payload.data?.notes as string) || '',
        createdAt: payload.createdAt || nowIso,
        updatedAt: nowIso,
        createdByUserId: payload.createdByUserId || (isGuest() ? getGuestId() : getCurrentUserId()),
        isDeleted: payload.isDeleted ?? false,
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
   * Add or update a team
   */
  async upsertTeam(team: Omit<DbTeam, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<string>> {
    try {
      const nowIso = new Date().toISOString();
      // Support both id and teamId for backward compatibility
      const teamId = team.id || team.teamId;
      if (!teamId) {
        return {
          success: false,
          error: 'Team ID is required',
          affected_count: 0
        };
      }
      const existingTeam = await this.teams.get(teamId);

      if (existingTeam) {
        await this.teams.update(teamId, {
          ...team,
          id: teamId,
          updatedAt: nowIso
        });
      } else {
        await this.teams.add({
          ...team,
          id: teamId,
          createdAt: nowIso,
          updatedAt: nowIso
        } as DbTeam);
      }

      return {
        success: true,
        data: teamId,
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
  async upsertPlayer(player: Omit<DbPlayer, 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<string>> {
    try {
      const nowIso = new Date().toISOString();
      const existingPlayer = await this.players.get(player.id);

      const dbPlayer: DbPlayer = {
        ...player,
        createdAt: existingPlayer?.createdAt ?? nowIso,
        updatedAt: nowIso,
        synced: player.synced ?? false,
      };

      if (existingPlayer) {
        await this.players.update(player.id, dbPlayer);
      } else {
        await this.players.add(dbPlayer);
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
      const dbTeams = await this.teams.orderBy('name').toArray();
      // DbTeam extends Team, so we can return directly (with legacy field fallbacks)
      const teams: Team[] = dbTeams.map(team => ({
        id: team.id,
        name: team.name,
        homeKitPrimary: team.homeKitPrimary || team.colorPrimary,
        homeKitSecondary: team.homeKitSecondary || team.colorSecondary,
        awayKitPrimary: team.awayKitPrimary || team.awayColorPrimary,
        awayKitSecondary: team.awayKitSecondary || team.awayColorSecondary,
        logoUrl: team.logoUrl,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
        createdByUserId: team.createdByUserId,
        deletedAt: team.deletedAt,
        deletedByUserId: team.deletedByUserId,
        isDeleted: team.isDeleted,
        isOpponent: team.isOpponent
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
      const playerTeamRelations = await this.playerTeams
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

      // DbPlayer extends Player, so we can return directly (with legacy field fallbacks)
      const players: Player[] = enhancedPlayers.map(player => ({
        id: player.id,
        name: player.name || player.fullName || '',
        squadNumber: player.squadNumber,
        preferredPosition: player.preferredPosition || player.preferredPos,
        dateOfBirth: player.dateOfBirth || player.dob,
        notes: player.notes,
        currentTeam: player.currentTeam,
        createdAt: player.createdAt,
        updatedAt: player.updatedAt,
        createdByUserId: player.createdByUserId,
        deletedAt: player.deletedAt,
        deletedByUserId: player.deletedByUserId,
        isDeleted: player.isDeleted
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
      // Read from events table - events are stored directly in the events table
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
  async createMatchPeriod(period: Partial<DbMatchPeriod>): Promise<DatabaseResult<string>> {
    try {
      if (!period.matchId || !period.periodNumber) {
        return {
          success: false,
          error: 'Missing required fields: matchId and periodNumber are required',
          affected_count: 0
        };
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const id = period.id || `period-${nowMs}-${Math.random().toString(36).substr(2, 9)}`;

      const matchPeriod: DbMatchPeriod = {
        id,
        matchId: period.matchId,
        periodNumber: period.periodNumber,
        periodType: period.periodType || 'REGULAR',
        startedAt: period.startedAt || nowMs,
        endedAt: period.endedAt,
        durationSeconds: period.durationSeconds,
        createdAt: nowIso,
        updatedAt: nowIso,
        createdByUserId: period.createdByUserId || (isGuest() ? getGuestId() : getCurrentUserId()),
        isDeleted: false,
        synced: false,
      };

      await this.matchPeriods.add(matchPeriod);

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
      const period = await this.matchPeriods.get(periodId);
      if (!period) {
        return {
          success: false,
          error: 'Period not found',
          affected_count: 0
        };
      }

      const endTime = endedAt || Date.now();
      const durationSeconds = Math.floor((endTime - period.startedAt) / 1000);
      const nowIso = new Date().toISOString();

      await this.matchPeriods.update(periodId, {
        endedAt: endTime,
        durationSeconds: durationSeconds,
        updatedAt: nowIso,
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
  async getMatchPeriods(matchId: string): Promise<DatabaseResult<DbMatchPeriod[]>> {
    try {
      const periods = await this.matchPeriods
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
  async updateMatchState(matchId: string, updates: Partial<DbMatchState>): Promise<DatabaseResult<void>> {
    try {
      if (!matchId) {
        return {
          success: false,
          error: 'matchId is required',
          affected_count: 0
        };
      }

      const existing = await this.matchState.get(matchId);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      if (existing) {
        await this.matchState.update(matchId, {
          ...updates,
          lastUpdatedAt: nowMs,
          updatedAt: nowIso,
          synced: false
        });
      } else {
        const newState: DbMatchState = {
          matchId: matchId,
          status: updates.status || 'SCHEDULED',
          currentPeriodId: updates.currentPeriodId,
          timerMs: updates.timerMs || 0,
          lastUpdatedAt: nowMs,
          createdAt: nowIso,
          updatedAt: nowIso,
          createdByUserId: updates.createdByUserId || (isGuest() ? getGuestId() : getCurrentUserId()),
          isDeleted: false,
          synced: false,
        };
        await this.matchState.add(newState);
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
  async getMatchState(matchId: string): Promise<DatabaseResult<DbMatchState | undefined>> {
    try {
      const state = await this.matchState.get(matchId);

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
        this.matches.clear(),
        this.teams.clear(),
        this.players.clear(),
        this.seasons.clear(),
        this.lineup.clear(),
        this.playerTeams.clear(),
        this.matchNotes.clear(),
        this.matchPeriods.clear(),
        this.matchState.clear(),
        this.defaultLineups.clear(),
        this.settings.clear(),
        this.syncMetadata.clear(),
        this.syncFailures.clear()
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
    teams_count: number;
    players_count: number;
    matches_count: number;
    events_count: number;
    unsynced_events_count: number;
  }>> {
    try {
      const [teamsCount, playersCount, matchesCount, eventsCount, unsyncedEventsCount] = await Promise.all([
        this.teams.count(),
        this.players.count(),
        this.matches.count(),
        this.events.count(),
        this.events.filter(e => e.synced === false).count()
      ]);

      return {
        success: true,
        data: {
          teams_count: teamsCount,
          players_count: playersCount,
          matches_count: matchesCount,
          events_count: eventsCount,
          unsynced_events_count: unsyncedEventsCount
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stats'
      };
    }
  }

  /**
   * Get all unsynced records from a specific table
   * Generic method to query any syncable table for records where synced === false
   * 
   * @param tableName - Name of the table to query (must be a syncable table)
   * @returns DatabaseResult with array of unsynced records
   * 
   * _Requirements: 3.2, 4.2_
   */
  async getUnsyncedRecords<T extends { synced: boolean }>(
    tableName: 'events' | 'matches' | 'teams' | 'players' | 'seasons' | 'lineup' | 'playerTeams' | 'matchPeriods' | 'matchState' | 'defaultLineups'
  ): Promise<DatabaseResult<T[]>> {
    try {
      const table = this[tableName] as unknown as Table<T, string>;
      if (!table) {
        return {
          success: false,
          error: `Table '${tableName}' not found`,
          affected_count: 0,
          data: []
        };
      }

      // Query for records where synced === false
      const unsyncedRecords = await table
        .filter((record: T) => record.synced === false)
        .toArray();

      return {
        success: true,
        data: unsyncedRecords,
        affected_count: unsyncedRecords.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : `Failed to get unsynced records from ${tableName}`,
        affected_count: 0,
        data: []
      };
    }
  }

  /**
   * Mark a record as synced in a specific table
   * Generic method to set synced: true and syncedAt on any syncable table
   * 
   * @param tableName - Name of the table containing the record
   * @param id - ID of the record to mark as synced
   * @returns DatabaseResult indicating success/failure
   * 
   * _Requirements: 3.3, 4.3_
   */
  async markRecordSynced(
    tableName: 'events' | 'matches' | 'teams' | 'players' | 'seasons' | 'lineup' | 'playerTeams' | 'matchPeriods' | 'matchState' | 'defaultLineups',
    id: string
  ): Promise<DatabaseResult<void>> {
    try {
      const table = this[tableName] as Table<any, string>;
      if (!table) {
        return {
          success: false,
          error: `Table '${tableName}' not found`,
          affected_count: 0
        };
      }

      // Generate ISO timestamp for syncedAt
      const syncedAt = new Date().toISOString();

      // Update the record with synced: true and syncedAt
      const updateCount = await table.update(id, {
        synced: true,
        syncedAt: syncedAt
      });

      if (updateCount === 0) {
        return {
          success: false,
          error: `Record with id '${id}' not found in table '${tableName}'`,
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
        error: error instanceof Error ? error.message : `Failed to mark record as synced in ${tableName}`,
        affected_count: 0
      };
    }
  }
}

// Export singleton instance
export const db = new GrassrootsDB();

// Note: Database initialization is now handled by DatabaseContext
// to prevent blocking the app on module load

// Re-export types from schema for convenience
export type {
  DatabaseResult,
  DbTeam,
  DbPlayer,
  DbMatch,
  DbEvent,
  DbSeason,
  DbLineup,
  DbPlayerTeam,
  DbMatchPeriod,
  DbMatchState,
  DbDefaultLineup,
  DbGlobalStats
} from './schema';
