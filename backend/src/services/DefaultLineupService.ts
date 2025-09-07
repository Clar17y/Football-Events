import { PrismaClient } from '@prisma/client';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface FormationPlayer {
  playerId: string;
  position: string;
  pitchX: number;
  pitchY: number;
}

export interface DefaultLineupData {
  id: string;
  teamId: string;
  formation: FormationPlayer[];
  createdAt: Date;
  updatedAt?: Date;
  created_by_user_id: string;
  deleted_at?: Date;
  deleted_by_user_id?: string;
  is_deleted: boolean;
}

export interface DefaultLineupCreateRequest {
  teamId: string;
  formation: FormationPlayer[];
}

export interface DefaultLineupUpdateRequest {
  formation?: FormationPlayer[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Validates formation player data structure
 */
const validateFormationPlayer = (player: any): ValidationResult => {
  const errors: string[] = [];

  if (!player || !player.playerId || typeof player.playerId !== 'string') {
    errors.push('Player ID is required and must be a string');
  }

  if (!player || !player.position || typeof player.position !== 'string') {
    errors.push('Position is required and must be a string');
  }

  if (!player || typeof player.pitchX !== 'number' || player.pitchX < 0 || player.pitchX > 100) {
    errors.push('Pitch X coordinate must be a number between 0 and 100');
  }

  if (!player || typeof player.pitchY !== 'number' || player.pitchY < 0 || player.pitchY > 100) {
    errors.push('Pitch Y coordinate must be a number between 0 and 100');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validates complete formation data
 */
const validateFormationData = (formation: any[]): ValidationResult => {
  const errors: string[] = [];

  if (!Array.isArray(formation)) {
    return {
      isValid: false,
      errors: ['Formation must be an array']
    };
  }

  if (formation.length === 0) {
    return {
      isValid: false,
      errors: ['Formation cannot be empty']
    };
  }

  if (formation.length > 11) {
    errors.push('Formation cannot have more than 11 players');
  }

  // Validate each player
  formation.forEach((player, index) => {
    const playerValidation = validateFormationPlayer(player);
    if (!playerValidation.isValid) {
      errors.push(`Player ${index + 1}: ${playerValidation.errors.join(', ')}`);
    }
  });

  // Check for duplicate player IDs (only for valid players)
  const playerIds = formation.filter(p => p && p.playerId).map(p => p.playerId);
  const uniquePlayerIds = new Set(playerIds);
  if (playerIds.length !== uniquePlayerIds.size) {
    errors.push('Formation cannot contain duplicate players');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class DefaultLineupService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Save or update a default lineup for a team
   */
  async saveDefaultLineup(
    teamId: string, 
    formation: FormationPlayer[], 
    userId: string
  ): Promise<any> {
    return withPrismaErrorHandling(async () => {
      // Validate formation data
      const validation = validateFormationData(formation);
      if (!validation.isValid) {
        const error = new Error(`Formation validation failed: ${validation.errors.join(', ')}`);
        (error as any).code = 'FORMATION_VALIDATION_ERROR';
        (error as any).statusCode = 400;
        throw error;
      }

      // Check if user has access to the team
      const team = await this.prisma.team.findFirst({
        where: {
          id: teamId,
          created_by_user_id: userId,
          is_deleted: false
        }
      });

      if (!team) {
        const error = new Error('Team not found or access denied');
        (error as any).code = 'TEAM_ACCESS_DENIED';
        (error as any).statusCode = 403;
        throw error;
      }

      // Validate that all players belong to the team
      const playerIds = formation.map(p => p.playerId);
      const teamPlayers = await this.prisma.player_teams.findMany({
        where: {
          team_id: teamId,
          player_id: { in: playerIds },
          is_active: true,
          is_deleted: false
        },
        select: { player_id: true }
      });

      const validPlayerIds = new Set(teamPlayers.map(pt => pt.player_id));
      const invalidPlayers = playerIds.filter(id => !validPlayerIds.has(id));
      
      if (invalidPlayers.length > 0) {
        const error = new Error(`Players not found in team: ${invalidPlayers.join(', ')}`);
        (error as any).code = 'INVALID_TEAM_PLAYERS';
        (error as any).statusCode = 400;
        throw error;
      }

      // Upsert semantics: update existing default lineup if present, otherwise create
      // 1) Try update existing (non-deleted)
      const existing = await this.prisma.default_lineups.findFirst({
        where: {
          team_id: teamId,
          created_by_user_id: userId,
          is_deleted: false
        }
      });

      if (existing) {
        const updated = await this.prisma.default_lineups.update({
          where: { id: existing.id },
          data: {
            formation_data: formation,
            updated_at: new Date()
          }
        });
        return this.transformDefaultLineup(updated);
      }

      // 2) If a soft-deleted record exists, restore it and update
      const softDeleted = await this.prisma.default_lineups.findFirst({
        where: {
          team_id: teamId,
          created_by_user_id: userId,
          is_deleted: true
        }
      });

      if (softDeleted) {
        const restored = await this.prisma.default_lineups.update({
          where: { id: softDeleted.id },
          data: {
            is_deleted: false,
            deleted_at: null,
            deleted_by_user_id: null,
            formation_data: formation,
            updated_at: new Date()
          }
        });
        return this.transformDefaultLineup(restored);
      }

      // 3) Create new default lineup
      const created = await this.prisma.default_lineups.create({
        data: {
          team_id: teamId,
          formation_data: formation,
          created_by_user_id: userId
        }
      });
      return this.transformDefaultLineup(created);
    }, 'DefaultLineup');
  }

  /**
   * Get default lineup for a team
   */
  async getDefaultLineup(teamId: string, userId: string): Promise<DefaultLineupData | null> {
    // Authorize: user must own the team
    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        created_by_user_id: userId,
        is_deleted: false
      }
    });

    if (!team) {
      return null; // Team not found or no access
    }

    // Retrieve the latest default lineup for this team, regardless of creator
    const defaultLineup = await this.prisma.default_lineups.findFirst({
      where: {
        team_id: teamId,
        is_deleted: false
      },
      orderBy: [
        { updated_at: 'desc' },
        { created_at: 'desc' }
      ]
    });

    return defaultLineup ? this.transformDefaultLineup(defaultLineup) : null;
  }

  /**
   * Delete default lineup for a team
   */
  async deleteDefaultLineup(teamId: string, userId: string): Promise<boolean> {
    try {
      // Check if user has access to the team
      const team = await this.prisma.team.findFirst({
        where: {
          id: teamId,
          created_by_user_id: userId,
          is_deleted: false
        }
      });

      if (!team) {
        return false; // Team not found or no access
      }

      // Find existing default lineup
      const existingLineup = await this.prisma.default_lineups.findFirst({
        where: {
          team_id: teamId,
          created_by_user_id: userId,
          is_deleted: false
        }
      });

      if (!existingLineup) {
        return false; // No default lineup found
      }

      // Soft delete the default lineup
      await this.prisma.default_lineups.update({
        where: { id: existingLineup.id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });

      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Record not found
      }
      throw error;
    }
  }

  /**
   * Apply default lineup to a match by creating lineup records
   */
  async applyDefaultToMatch(teamId: string, matchId: string, userId: string): Promise<any[]> {
    return withPrismaErrorHandling(async () => {
      // Get default lineup
      const defaultLineup = await this.getDefaultLineup(teamId, userId);
      if (!defaultLineup) {
        const error = new Error('No default lineup found for team');
        (error as any).code = 'DEFAULT_LINEUP_NOT_FOUND';
        (error as any).statusCode = 404;
        throw error;
      }

      // Verify user has access to the match
      const match = await this.prisma.match.findFirst({
        where: {
          match_id: matchId,
          created_by_user_id: userId,
          is_deleted: false
        }
      });

      if (!match) {
        const error = new Error('Match not found or access denied');
        (error as any).code = 'MATCH_ACCESS_DENIED';
        (error as any).statusCode = 403;
        throw error;
      }

      // Create initial lineups and live_formations snapshot atomically
      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch player details for formation snapshot
        const ids = defaultLineup.formation.map(p => p.playerId);
        const players = await tx.player.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, squad_number: true, preferred_pos: true }
        });

        const lineupRecords: any[] = [];
        for (const fp of defaultLineup.formation) {
          const lineupRecord = await tx.lineup.create({
            data: {
              match_id: matchId,
              player_id: fp.playerId,
              position: fp.position as any,
              start_min: 0,
              pitch_x: fp.pitchX,
              pitch_y: fp.pitchY,
              created_by_user_id: userId
            }
          });
          lineupRecords.push(lineupRecord);
        }

        // Create live_formations row at kickoff
        const formation_data = {
          players: defaultLineup.formation.map(fp => {
            const p = players.find(pp => pp.id === fp.playerId);
            return {
              id: fp.playerId,
              name: (p as any)?.name || '',
              squadNumber: p?.squad_number || undefined,
              preferredPosition: p?.preferred_pos || undefined,
              position: { x: fp.pitchX, y: fp.pitchY }
            };
          })
        } as any;

        await tx.live_formations.create({
          data: {
            match_id: matchId,
            start_min: 0 as any,
            formation_data,
            created_by_user_id: userId
          }
        });

        return lineupRecords;
      });

      return result;
    }, 'DefaultLineupApplication');
  }

  /**
   * Get all teams that have default lineups for a user
   */
  async getTeamsWithDefaultLineups(userId: string): Promise<Array<{ teamId: string; teamName: string; hasDefaultLineup: boolean }>> {
    const teams = await this.prisma.team.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false
      },
      select: {
        id: true,
        name: true
      }
    });

    const defaultLineups = await this.prisma.default_lineups.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false
      },
      select: {
        team_id: true
      }
    });

    const teamsWithDefaults = new Set(defaultLineups.map(dl => dl.team_id));

    return teams.map(team => ({
      teamId: team.id,
      teamName: team.name,
      hasDefaultLineup: teamsWithDefaults.has(team.id)
    }));
  }

  /**
   * Validate formation data without saving
   */
  validateFormation(formation: FormationPlayer[]): ValidationResult {
    return validateFormationData(formation);
  }

  /**
   * Transform Prisma default lineup to frontend format
   */
  private transformDefaultLineup(prismaDefaultLineup: any): DefaultLineupData {
    return {
      id: prismaDefaultLineup.id,
      teamId: prismaDefaultLineup.team_id,
      formation: Array.isArray(prismaDefaultLineup.formation_data) 
        ? prismaDefaultLineup.formation_data 
        : [],
      createdAt: prismaDefaultLineup.created_at,
      updatedAt: prismaDefaultLineup.updated_at || undefined,
      created_by_user_id: prismaDefaultLineup.created_by_user_id,
      deleted_at: prismaDefaultLineup.deleted_at || undefined,
      deleted_by_user_id: prismaDefaultLineup.deleted_by_user_id || undefined,
      is_deleted: prismaDefaultLineup.is_deleted
    };
  }

  /**
   * Disconnect Prisma client
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
