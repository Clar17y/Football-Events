/**
 * Database Migration System
 * 
 * Handles schema evolution and data transformations for IndexedDB.
 * Provides version-based migrations with rollback capabilities.
 */

import Dexie from 'dexie';
import type { GrassrootsDB } from './indexedDB';
import type { EnhancedEvent, EnhancedMatch, EnhancedPlayer, EnhancedTeam, EnhancedSeason } from './schema';
import { SCHEMA_INDEXES } from './schema';
import { retroactivelyLinkMatchEvents } from './eventLinking';

/**
 * Migration interface
 */
interface Migration {
  version: number;
  description: string;
  up: (db: GrassrootsDB) => Promise<void>;
  down?: (db: GrassrootsDB) => Promise<void>;
}

/**
 * Current database version
 */
export const CURRENT_VERSION = 4;

/**
 * All database migrations
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Initial schema with basic tables',
    up: async (db: GrassrootsDB) => {
      // Version 1 schema is handled by Dexie version definition
      console.log('Migration 1: Initial schema created');
    }
  },
  
  {
    version: 2,
    description: 'Add performance indexes',
    up: async (db: GrassrootsDB) => {
      // Version 2 schema is handled by Dexie version definition
      console.log('Migration 2: Performance indexes added');
    }
  },
  
  {
    version: 3,
    description: 'Enhanced schema with event linking and PostgreSQL alignment',
    up: async (db: GrassrootsDB) => {
      console.log('Migration 3: Starting enhanced schema migration...');
      
      try {
        // Migrate existing events to enhanced format
        await migrateEventsToEnhanced(db);
        
        // Migrate existing matches to enhanced format
        await migrateMatchesToEnhanced(db);
        
        // Migrate existing teams to enhanced format
        await migrateTeamsToEnhanced(db);
        
        // Migrate existing players to enhanced format
        await migratePlayersToEnhanced(db);
        
        // Create seasons if they don't exist
        await createDefaultSeason(db);
        
        // Retroactively link existing events
        await retroactivelyLinkExistingEvents(db);
        
        console.log('Migration 3: Enhanced schema migration completed successfully');
      } catch (error) {
        console.error('Migration 3: Error during migration:', error);
        throw error;
      }
    },
    
    down: async (db: GrassrootsDB) => {
      console.log('Migration 3: Rolling back enhanced schema...');
      
      // Remove linking fields from events
      const events = await db.events.toArray();
      for (const event of events) {
        await db.events.update(event.id, {
          linked_events: undefined,
          auto_linked_at: undefined
        });
      }
      
      console.log('Migration 3: Rollback completed');
    }
  }
];

/**
 * Migrate existing events to enhanced format
 */
async function migrateEventsToEnhanced(db: GrassrootsDB): Promise<void> {
  console.log('Migrating events to enhanced format...');
  
  const events = await db.events.toArray();
  const now = Date.now();
  
  for (const event of events) {
    const enhancedEvent: Partial<EnhancedEvent> = {
      // Ensure all required fields exist
      season_id: event.season_id || 'default-season',
      ts_server: event.ts_server || event.created_at || now,
      period_number: event.period_number || 1,
      sentiment: event.sentiment || 0,
      
      // Add new fields
      linked_events: undefined, // Will be populated by retroactive linking
      auto_linked_at: undefined,
      updated_at: event.updated_at || event.created_at || now,
      
      // Authentication and soft delete fields
      created_by_user_id: 'migration-system',
      deleted_at: undefined,
      deleted_by_user_id: undefined,
      is_deleted: false
    };
    
    await db.events.update(event.id, enhancedEvent);
  }
  
  console.log(`Migrated ${events.length} events to enhanced format`);
}

/**
 * Migrate existing matches to enhanced format
 */
async function migrateMatchesToEnhanced(db: GrassrootsDB): Promise<void> {
  console.log('Migrating matches to enhanced format...');
  
  const matches = await db.matches.toArray();
  const now = Date.now();
  
  for (const match of matches) {
    // Parse existing JSON fields if they exist
    let settings: any = {};
    let clockState: any = {};
    
    // Cast to any to access old format properties
    const oldMatch = match as any;
    
    try {
      if (typeof oldMatch.settings === 'string') {
        settings = JSON.parse(oldMatch.settings);
      }
      if (typeof oldMatch.clock_state === 'string') {
        clockState = JSON.parse(oldMatch.clock_state);
      }
    } catch (error) {
      console.warn('Error parsing match JSON fields:', error);
    }
    
    const enhancedMatch: Partial<EnhancedMatch> = {
      // Map old fields to new structure
      match_id: oldMatch.id,
      season_id: oldMatch.season_id || 'default-season',
      kickoff_ts: oldMatch.date || now,
      home_team_id: oldMatch.home_team_id,
      away_team_id: oldMatch.away_team_id,
      duration_mins: settings.duration_mins || 50,
      period_format: settings.period_format || 'quarter',
      our_score: 0, // Will be calculated from events
      opponent_score: 0, // Will be calculated from events
      updated_at: oldMatch.updated_at || oldMatch.created_at || now,
      
      // Authentication and soft delete fields
      created_by_user_id: 'migration-system',
      deleted_at: undefined,
      deleted_by_user_id: undefined,
      is_deleted: false
    };
    
    // Update with new structure
    await db.matches.update(oldMatch.id, enhancedMatch);
  }
  
  console.log(`Migrated ${matches.length} matches to enhanced format`);
}

/**
 * Migrate existing teams to enhanced format
 */
async function migrateTeamsToEnhanced(db: GrassrootsDB): Promise<void> {
  console.log('Migrating teams to enhanced format...');
  
  const teams = await db.teams.toArray();
  const now = Date.now();
  
  for (const team of teams) {
    // Cast to any to access old format properties
    const oldTeam = team as any;
    
    const enhancedTeam: Partial<EnhancedTeam> = {
      team_id: oldTeam.id,
      name: oldTeam.name,
      updated_at: oldTeam.updated_at || oldTeam.created_at || now,
      
      // Authentication and soft delete fields
      created_by_user_id: 'migration-system',
      deleted_at: undefined,
      deleted_by_user_id: undefined,
      is_deleted: false
    };
    
    await db.teams.update(oldTeam.id, enhancedTeam);
  }
  
  console.log(`Migrated ${teams.length} teams to enhanced format`);
}

/**
 * Migrate existing players to enhanced format
 */
async function migratePlayersToEnhanced(db: GrassrootsDB): Promise<void> {
  console.log('Migrating players to enhanced format...');
  
  const players = await db.players.toArray();
  const now = Date.now();
  
  for (const player of players) {
    // Cast to any to access old format properties
    const oldPlayer = player as any;
    
    const enhancedPlayer: Partial<EnhancedPlayer> = {
      id: oldPlayer.id,
      full_name: oldPlayer.full_name,
      squad_number: oldPlayer.jersey_number,
      current_team: oldPlayer.team_id,
      updated_at: oldPlayer.updated_at || oldPlayer.created_at || now,
      
      // Authentication and soft delete fields
      created_by_user_id: 'migration-system',
      deleted_at: undefined,
      deleted_by_user_id: undefined,
      is_deleted: false
    };
    
    await db.players.update(oldPlayer.id, enhancedPlayer);
  }
  
  console.log(`Migrated ${players.length} players to enhanced format`);
}

/**
 * Create default season if none exists
 */
async function createDefaultSeason(db: GrassrootsDB): Promise<void> {
  console.log('Creating default season...');
  
  try {
    const existingSeasons = await db.seasons.count();
    if (existingSeasons === 0) {
      const currentYear = new Date().getFullYear();
      const defaultSeason = {
        id: 'default-season', // For compatibility
        season_id: 'default-season',
        label: `${currentYear} Season`,
        start_date: undefined,
        end_date: undefined,
        is_current: true,
        description: undefined,
        created_at: Date.now(),
        updated_at: Date.now(),
        // Authentication and soft delete fields
        created_by_user_id: 'migration-system',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false
      };
      
      // Use put instead of add to handle potential duplicates
      await db.seasons.put(defaultSeason);
      console.log('Created default season');
    } else {
      console.log('Seasons already exist, skipping default creation');
    }
  } catch (error) {
    // Handle constraint errors gracefully in test environment
    if (error instanceof Error && error.message.includes('constraint')) {
      console.log('Default season already exists (constraint error handled)');
    } else {
      throw error;
    }
  }
}

/**
 * Retroactively link existing events
 */
async function retroactivelyLinkExistingEvents(db: GrassrootsDB): Promise<void> {
  console.log('Retroactively linking existing events...');
  
  const matches = await db.matches.toArray();
  let totalLinksCreated = 0;
  
  for (const match of matches) {
    try {
      const linksCreated = await retroactivelyLinkMatchEvents(match.id);
      totalLinksCreated += linksCreated;
    } catch (error) {
      console.warn(`Error linking events for match ${match.id}:`, error);
    }
  }
  
  console.log(`Retroactively created ${totalLinksCreated} event links across ${matches.length} matches`);
}

/**
 * Run all pending migrations
 */
export async function runMigrations(db: GrassrootsDB): Promise<void> {
  console.log('Checking for pending migrations...');
  
  try {
    // Get current database version
    const currentVersion = await getCurrentDatabaseVersion(db);
    console.log(`Current database version: ${currentVersion}`);
    
    // Find pending migrations
    const pendingMigrations = MIGRATIONS.filter(m => m.version > currentVersion);
    
    if (pendingMigrations.length === 0) {
      console.log('No pending migrations');
      return;
    }
    
    console.log(`Running ${pendingMigrations.length} pending migrations...`);
    
    // Run migrations in order
    for (const migration of pendingMigrations) {
      console.log(`Running migration ${migration.version}: ${migration.description}`);
      
      try {
        await migration.up(db);
        await setDatabaseVersion(db, migration.version);
        console.log(`Migration ${migration.version} completed successfully`);
      } catch (error) {
        console.error(`Migration ${migration.version} failed:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new Error(`Migration ${migration.version} failed: ${errorMessage}`);
      }
    }
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
}

/**
 * Get current database version
 */
async function getCurrentDatabaseVersion(db: GrassrootsDB): Promise<number> {
  try {
    const versionSetting = await db.settings.get('database_version');
    return versionSetting ? parseInt(versionSetting.value, 10) : 0;
  } catch (error) {
    console.warn('Error getting database version, assuming version 0:', error);
    return 0;
  }
}

/**
 * Set database version
 */
async function setDatabaseVersion(db: GrassrootsDB, version: number): Promise<void> {
  try {
    const now = Date.now();
    await db.settings.put({
      key: 'database_version',
      value: version.toString(),
      created_at: now,
      updated_at: now
    });
  } catch (error) {
    // Handle constraint errors gracefully in test environment
    if (error instanceof Error && error.message.includes('constraint')) {
      console.log(`Database version ${version} already set (constraint error handled)`);
    } else {
      throw error;
    }
  }
}

/**
 * Rollback to a specific version
 */
export async function rollbackToVersion(db: GrassrootsDB, targetVersion: number): Promise<void> {
  console.log(`Rolling back to version ${targetVersion}...`);
  
  try {
    const currentVersion = await getCurrentDatabaseVersion(db);
    
    if (targetVersion >= currentVersion) {
      console.log('Target version is not lower than current version');
      return;
    }
    
    // Find migrations to rollback (in reverse order)
    const migrationsToRollback = MIGRATIONS
      .filter(m => m.version > targetVersion && m.version <= currentVersion)
      .sort((a, b) => b.version - a.version); // Reverse order
    
    // Run rollbacks
    for (const migration of migrationsToRollback) {
      if (migration.down) {
        console.log(`Rolling back migration ${migration.version}: ${migration.description}`);
        await migration.down(db);
      } else {
        console.warn(`Migration ${migration.version} has no rollback function`);
      }
    }
    
    // Update version
    await setDatabaseVersion(db, targetVersion);
    console.log(`Rollback to version ${targetVersion} completed`);
  } catch (error) {
    console.error('Error during rollback:', error);
    throw error;
  }
}

/**
 * Get migration status
 */
export async function getMigrationStatus(db: GrassrootsDB): Promise<{
  currentVersion: number;
  latestVersion: number;
  pendingMigrations: number;
  appliedMigrations: Migration[];
  pendingMigrationsList: Migration[];
}> {
  const currentVersion = await getCurrentDatabaseVersion(db);
  const latestVersion = CURRENT_VERSION;
  const appliedMigrations = MIGRATIONS.filter(m => m.version <= currentVersion);
  const pendingMigrationsList = MIGRATIONS.filter(m => m.version > currentVersion);
  
  return {
    currentVersion,
    latestVersion,
    pendingMigrations: pendingMigrationsList.length,
    appliedMigrations,
    pendingMigrationsList
  };
}

/**
 * Validate database schema integrity
 */
export async function validateDatabaseIntegrity(db: GrassrootsDB): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
}> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Check if all required tables exist
    const requiredTables = ['events', 'matches', 'teams', 'players', 'seasons'];
    for (const tableName of requiredTables) {
      try {
        await db.table(tableName).limit(1).toArray();
      } catch (error) {
        errors.push(`Required table '${tableName}' is missing or inaccessible`);
      }
    }
    
    // Check for orphaned records
    const events = await db.events.toArray();
    const matchIds = new Set((await db.matches.toArray()).map(m => m.id));
    const teamIds = new Set((await db.teams.toArray()).map(t => t.id));
    const playerIds = new Set((await db.players.toArray()).map(p => p.id));
    
    for (const event of events) {
      if (!matchIds.has(event.match_id)) {
        warnings.push(`Event ${event.id} references non-existent match ${event.match_id}`);
      }
      if (event.team_id && !teamIds.has(event.team_id)) {
        warnings.push(`Event ${event.id} references non-existent team ${event.team_id}`);
      }
      if (event.player_id && !playerIds.has(event.player_id)) {
        warnings.push(`Event ${event.id} references non-existent player ${event.player_id}`);
      }
    }
    
    // Check event linking integrity
    for (const event of events) {
      if (event.linked_events) {
        for (const linkedId of event.linked_events) {
          const linkedEvent = events.find(e => e.id === linkedId);
          if (!linkedEvent) {
            warnings.push(`Event ${event.id} links to non-existent event ${linkedId}`);
          } else if (!linkedEvent.linked_events?.includes(event.id)) {
            warnings.push(`Event ${event.id} links to ${linkedId} but link is not bidirectional`);
          }
        }
      }
    }
    
    console.log(`Database integrity check: ${errors.length} errors, ${warnings.length} warnings`);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(`Error during integrity check: ${errorMessage}`);
    return {
      isValid: false,
      errors,
      warnings
    };
  }
}