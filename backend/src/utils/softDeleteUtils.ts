import { PrismaClient } from '@prisma/client';

/**
 * Generic utility functions for soft delete restoration
 */

export interface SoftDeleteRestoreOptions<T> {
  prisma: PrismaClient;
  model: string;
  uniqueConstraints: Record<string, any>;
  createData: T;
  userId: string;
  transformer?: (data: any) => any;
  preserveOriginalOwnership?: boolean;
  primaryKeyField?: string; // Allow custom primary key field (defaults to 'id')
}

export interface SoftDeleteRestoreResult<T> {
  wasRestored: boolean;
  entity: T;
}

/**
 * Generic function to find and restore soft-deleted records
 * @param options Configuration for the restore operation
 * @returns Object indicating if restoration occurred and the resulting entity
 */
export async function findAndRestoreSoftDeleted<T>(
  options: SoftDeleteRestoreOptions<T>
): Promise<SoftDeleteRestoreResult<T>> {
  const { 
    prisma, 
    model, 
    uniqueConstraints, 
    createData, 
    userId, 
    transformer,
    preserveOriginalOwnership = false,
    primaryKeyField = 'id'
  } = options;

  // Build where clause for finding soft-deleted records
  const whereClause = {
    ...uniqueConstraints,
    is_deleted: true
  };

  // Find existing soft-deleted record
  const existingSoftDeleted = await (prisma as any)[model].findFirst({
    where: whereClause
  });

  if (existingSoftDeleted) {
    // Restore the soft-deleted record
    const updateData = {
      ...createData,
      is_deleted: false,
      deleted_at: null,
      deleted_by_user_id: null,
      updated_at: new Date()
    };

    // Preserve or update ownership based on configuration
    if (!preserveOriginalOwnership) {
      (updateData as any).created_by_user_id = userId;
    }

    // Handle composite keys for lineup table
    let whereClause: any;
    if (model === 'lineup') {
      whereClause = {
        match_id_player_id_start_min: {
          match_id: existingSoftDeleted.match_id,
          player_id: existingSoftDeleted.player_id,
          start_min: existingSoftDeleted.start_min
        }
      };
    } else {
      whereClause = { [primaryKeyField]: existingSoftDeleted[primaryKeyField] };
    }

    const restored = await (prisma as any)[model].update({
      where: whereClause,
      data: updateData
    });

    return {
      wasRestored: true,
      entity: transformer ? transformer(restored) : restored
    };
  }

  return {
    wasRestored: false,
    entity: null as any
  };
}

/**
 * Helper function to check if a unique constraint violation is due to soft-deleted records
 * @param error Prisma error object
 * @param constraintFields Array of field names that form the unique constraint
 * @returns Boolean indicating if this is a soft-delete related constraint violation
 */
export function isSoftDeleteConstraintViolation(
  error: any, 
  constraintFields: string[]
): boolean {
  // Check if it's a Prisma unique constraint violation
  if (error.code !== 'P2002') {
    return false;
  }

  // Check if the constraint involves the expected fields
  const errorFields = error.meta?.target || [];
  return constraintFields.every(field => errorFields.includes(field));
}

/**
 * Wrapper function that combines soft delete restoration with normal creation
 * @param options Configuration for the operation
 * @returns The created or restored entity
 */
export async function createOrRestoreSoftDeleted<T>(
  options: SoftDeleteRestoreOptions<T>
): Promise<T> {
  const { prisma, model, createData, userId, transformer } = options;

  // First try to restore soft-deleted record
  const restoreResult = await findAndRestoreSoftDeleted(options);
  
  if (restoreResult.wasRestored) {
    return restoreResult.entity;
  }

  // If no soft-deleted record found, create new one
  const newEntity = await (prisma as any)[model].create({
    data: {
      ...createData,
      created_by_user_id: userId
    }
  });

  return transformer ? transformer(newEntity) : newEntity;
}

/**
 * Build unique constraint object for common patterns
 */
export const UniqueConstraintBuilders = {
  /**
   * Single field constraint (e.g., email, name)
   */
  singleField: (fieldName: string, value: any) => ({
    [fieldName]: value
  }),

  /**
   * Multi-field constraint
   */
  multiField: (constraints: Record<string, any>) => constraints,

  /**
   * User-scoped constraint (field must be unique per user)
   */
  userScoped: (fieldName: string, value: any, userId: string) => ({
    [fieldName]: value,
    created_by_user_id: userId
  }),

  /**
   * Team-scoped constraint (field must be unique per team)
   */
  teamScoped: (fieldName: string, value: any, teamId: string) => ({
    [fieldName]: value,
    team_id: teamId
  }),

  /**
   * Season-scoped constraint (field must be unique per season)
   */
  seasonScoped: (fieldName: string, value: any, seasonId: string) => ({
    [fieldName]: value,
    season_id: seasonId
  })
};

/**
 * Common soft delete restoration patterns for specific services
 */
export const SoftDeletePatterns = {
  /**
   * User email restoration pattern
   */
  userEmail: (email: string) => 
    UniqueConstraintBuilders.singleField('email', email),

  /**
   * Team name restoration pattern (scoped to user)
   */
  teamName: (name: string, userId: string) => 
    UniqueConstraintBuilders.userScoped('name', name, userId),

  /**
   * Season label restoration pattern
   */
  seasonLabel: (label: string) => 
    UniqueConstraintBuilders.singleField('label', label),

  /**
   * Player unique constraint pattern
   */
  playerConstraint: (name: string, squadNumber?: number, currentTeam?: string) => {
    const constraints: Record<string, any> = { name };
    if (squadNumber !== undefined) constraints.squad_number = squadNumber;
    if (currentTeam) constraints.current_team = currentTeam;
    return constraints;
  },

  /**
   * Award constraint pattern (player + season + category)
   */
  awardConstraint: (playerId: string, seasonId: string, category: string) => ({
    player_id: playerId,
    season_id: seasonId,
    category: category
  }),

  /**
   * Match award constraint pattern (player + match + category)
   */
  matchAwardConstraint: (playerId: string, matchId: string, category: string) => ({
    player_id: playerId,
    match_id: matchId,
    category: category
  }),

  /**
   * Event constraint pattern (match + team + player + kind + clock)
   */
  eventConstraint: (matchId: string, teamId?: string, playerId?: string, kind?: string, clockMs?: number) => {
    const constraints: any = { match_id: matchId };
    if (teamId) constraints.team_id = teamId;
    if (playerId) constraints.player_id = playerId;
    if (kind) constraints.kind = kind;
    if (clockMs !== undefined) constraints.clock_ms = clockMs;
    return constraints;
  },

  /**
   * Match constraint pattern (home team + away team + kickoff time)
   */
  matchConstraint: (homeTeamId: string, awayTeamId: string, kickoffTime: Date) => ({
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    kickoff_ts: kickoffTime
  }),

  /**
   * Player team constraint pattern (player + team + start date)
   */
  playerTeamConstraint: (playerId: string, teamId: string, startDate: Date) => ({
    player_id: playerId,
    team_id: teamId,
    start_date: startDate
  }),

  /**
   * Lineup constraint pattern (match + player + start minute)
   */
  lineup: (matchId: string, playerId: string, startMinute: number) => ({
    match_id: matchId,
    player_id: playerId,
    start_min: startMinute
  })
};

/**
 * Validation helper to ensure required soft delete fields exist
 * @param model Prisma model name
 * @param prisma Prisma client instance
 * @returns Boolean indicating if model supports soft delete
 */
export async function validateSoftDeleteSupport(
  model: string, 
  prisma: PrismaClient
): Promise<boolean> {
  try {
    // Try to query with soft delete fields to verify they exist
    await (prisma as any)[model].findFirst({
      where: {
        is_deleted: false
      },
      take: 1
    });
    return true;
  } catch (error) {
    console.warn(`Model ${model} does not support soft delete:`, error);
    return false;
  }
}