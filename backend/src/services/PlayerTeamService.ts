import { PrismaClient } from '@prisma/client';
import { 
  transformPlayerTeam, 
  transformPlayerTeamCreateRequest, 
  transformPlayerTeamUpdateRequest
} from '@shared/types';
import type { 
  PlayerTeam, 
  PlayerTeamCreateRequest as SharedPlayerTeamCreateRequest, 
  PlayerTeamUpdateRequest as SharedPlayerTeamUpdateRequest 
} from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted, SoftDeletePatterns } from '../utils/softDeleteUtils';
import { NaturalKeyResolver } from '../utils/naturalKeyResolver';

// Extend shared interfaces to include service-specific fields
export interface PlayerTeamCreateRequest extends SharedPlayerTeamCreateRequest {
  isActive?: boolean;
  // Natural key support
  playerName?: string;
  teamName?: string;
}

export interface PlayerTeamUpdateRequest extends SharedPlayerTeamUpdateRequest {
  isActive?: boolean;
}

export interface GetPlayerTeamsOptions {
  page: number;
  limit: number;
  playerId?: string;
  teamId?: string;
  isActive?: boolean;
}

export interface PaginatedPlayerTeams {
  data: PlayerTeam[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface BatchPlayerTeamRequest {
  create?: PlayerTeamCreateRequest[];
  update?: { id: string; data: PlayerTeamUpdateRequest }[];
  delete?: string[];
}

export interface BatchPlayerTeamResult {
  created: { success: number; failed: number; errors: Array<{ data: PlayerTeamCreateRequest; error: string }> };
  updated: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
  deleted: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
}

export class PlayerTeamService {
  private prisma: PrismaClient;
  private naturalKeyResolver: NaturalKeyResolver;

  constructor() {
    this.prisma = new PrismaClient();
    this.naturalKeyResolver = new NaturalKeyResolver(this.prisma);
  }

  async getPlayerTeams(userId: string, userRole: string, options: GetPlayerTeamsOptions): Promise<PaginatedPlayerTeams> {
    const { page, limit, playerId, teamId, isActive } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted relationships
    };
    
    if (playerId) {
      where.player_id = playerId;
    }
    
    if (teamId) {
      where.team_id = teamId;
    }
    
    if (isActive !== undefined) {
      where.is_active = isActive;
    }

    // Non-admin users can only see player-team relationships they created or involving their teams/players
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      const userPlayerIds = await this.getUserPlayerIds(userId);
      
      where.OR = [
        { created_by_user_id: userId }, // Relationships they created
        { team_id: { in: userTeamIds } }, // Teams they own
        { player_id: { in: userPlayerIds } } // Players they created
      ];
    }

    // Get player teams and total count
    const [playerTeams, total] = await Promise.all([
      this.prisma.player_teams.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { start_date: 'desc' },
          { created_at: 'desc' }
        ],
        include: {
          player: {
            select: {
              id: true,
              name: true,
              squad_number: true
            }
          },
          team: {
            select: {
              id: true,
              name: true
            }
          },
          created_by: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        }
      }),
      this.prisma.player_teams.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: playerTeams.map(pt => this.transformPlayerTeamWithServiceFields(pt)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  async getPlayerTeamById(id: string, userId: string, userRole: string): Promise<PlayerTeam | null> {
    const where: any = { 
      id,
      is_deleted: false 
    };

    // Non-admin users can only see relationships they have access to
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      const userPlayerIds = await this.getUserPlayerIds(userId);
      
      where.OR = [
        { created_by_user_id: userId },
        { team_id: { in: userTeamIds } },
        { player_id: { in: userPlayerIds } }
      ];
    }

    const playerTeam = await this.prisma.player_teams.findFirst({
      where,
      include: {
        player: {
          select: {
            id: true,
            name: true,
            squad_number: true
          }
        },
        team: {
          select: {
            id: true,
            name: true
          }
        },
        created_by: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    return playerTeam ? this.transformPlayerTeamWithServiceFields(playerTeam) : null;
  }

  async createPlayerTeam(data: PlayerTeamCreateRequest, userId: string, userRole: string): Promise<PlayerTeam> {
    return withPrismaErrorHandling(async () => {
      // Resolve natural keys if provided
      const resolvedInput = await this.resolveNaturalKeysForSingleRequest(data, userId, userRole);
      const playerId = resolvedInput.playerId!;
      const teamId = resolvedInput.teamId!;

      // Check if user can create relationship for this team and player
      if (userRole !== 'ADMIN') {
        const userTeamIds = await this.getUserTeamIds(userId);
        const userPlayerIds = await this.getUserPlayerIds(userId);
        
        if (!userTeamIds.includes(teamId) && !userPlayerIds.includes(playerId)) {
          const error = new Error('Access denied: You can only create relationships for teams you own or players you created') as any;
          error.statusCode = 403;
          throw error;
        }
      }

      // Check if player and team exist
      const [player, team] = await Promise.all([
        this.prisma.player.findFirst({
          where: { id: playerId, is_deleted: false }
        }),
        this.prisma.team.findFirst({
          where: { id: teamId, is_deleted: false }
        })
      ]);

      if (!player) {
        const error = new Error('Player not found') as any;
        error.statusCode = 404;
        throw error;
      }
      if (!team) {
        const error = new Error('Team not found') as any;
        error.statusCode = 404;
        throw error;
      }

      // Check for overlapping active relationships before creating/restoring
      const startDateObj = new Date(resolvedInput.startDate);
      const existingActiveRelationship = await this.prisma.player_teams.findFirst({
        where: {
          player_id: playerId,
          team_id: teamId,
          is_active: true,
          is_deleted: false,
          OR: [
            { end_date: null }, // No end date (currently active)
            { end_date: { gte: startDateObj } } // End date after start date
          ]
        }
      });

      if (existingActiveRelationship) {
        const error = new Error('Player already has an active relationship with this team during the specified period') as any;
        error.statusCode = 409;
        throw error;
      }

      // Transform the request using shared transformer
      const baseCreateData = transformPlayerTeamCreateRequest({
        ...resolvedInput,
        playerId,
        teamId
      }, userId);
      
      const playerTeam = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'player_teams',
        uniqueConstraints: SoftDeletePatterns.playerTeamConstraint(
          playerId,
          teamId,
          startDateObj
        ),
        createData: {
          ...baseCreateData,
          is_active: resolvedInput.isActive ?? true
        },
        userId,
        transformer: this.transformPlayerTeamWithServiceFields.bind(this)
      });

      return playerTeam;
    });
  }

  async updatePlayerTeam(id: string, data: PlayerTeamUpdateRequest, userId: string, userRole: string): Promise<PlayerTeam | null> {
    return withPrismaErrorHandling(async () => {
      // Check if relationship exists and user has access
      const where: any = {
        id,
        is_deleted: false
      };

      if (userRole !== 'ADMIN') {
        const userTeamIds = await this.getUserTeamIds(userId);
        const userPlayerIds = await this.getUserPlayerIds(userId);
        
        where.OR = [
          { created_by_user_id: userId },
          { team_id: { in: userTeamIds } },
          { player_id: { in: userPlayerIds } }
        ];
      }

      const existingPlayerTeam = await this.prisma.player_teams.findFirst({ where });
      if (!existingPlayerTeam) {
        return null; // Not found or no permission
      }

      // Transform the request using shared transformer
      const baseUpdateData = transformPlayerTeamUpdateRequest(data);
      
      const updateData: any = {
        ...baseUpdateData,
        updated_at: new Date()
      };
      
      if (data.isActive !== undefined) {
        updateData.is_active = data.isActive;
      }

      const playerTeam = await this.prisma.player_teams.update({
        where: { id },
        data: updateData,
        include: {
          player: {
            select: {
              id: true,
              name: true,
              squad_number: true
            }
          },
          team: {
            select: {
              id: true,
              name: true
            }
          },
          created_by: {
            select: {
              id: true,
              email: true,
              first_name: true,
              last_name: true
            }
          }
        }
      });

      return this.transformPlayerTeamWithServiceFields(playerTeam);
    });
  }

  async deletePlayerTeam(id: string, userId: string, userRole: string): Promise<boolean> {
    return withPrismaErrorHandling(async () => {
      // Check if relationship exists and user has access
      const where: any = {
        id,
        is_deleted: false
      };

      if (userRole !== 'ADMIN') {
        const userTeamIds = await this.getUserTeamIds(userId);
        const userPlayerIds = await this.getUserPlayerIds(userId);
        
        where.OR = [
          { created_by_user_id: userId },
          { team_id: { in: userTeamIds } },
          { player_id: { in: userPlayerIds } }
        ];
      }

      const existingPlayerTeam = await this.prisma.player_teams.findFirst({ where });
      if (!existingPlayerTeam) {
        return false; // Not found or no permission
      }

      // Soft delete the relationship
      await this.prisma.player_teams.update({
        where: { id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });

      return true;
    });
  }

  async getTeamPlayers(teamId: string, userId: string, userRole: string): Promise<any[]> {
    // Check if user can access this team
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      if (!userTeamIds.includes(teamId)) {
        return []; // Return empty array if no access
      }
    }

    const playerTeams = await this.prisma.player_teams.findMany({
      where: { 
        team_id: teamId,
        is_active: true,
        is_deleted: false 
      },
      orderBy: [
        { start_date: 'desc' }
      ],
      include: {
        player: {
          select: {
            id: true,
            name: true,
            squad_number: true,
            preferred_pos: true
          }
        }
      }
    });

    return playerTeams.map(pt => ({
      ...this.transformPlayerTeamWithServiceFields(pt),
      player: pt.player
    }));
  }

  async getActiveTeamPlayers(teamId: string, userId: string, userRole: string): Promise<any[]> {
    // Check if user can access this team
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      if (!userTeamIds.includes(teamId)) {
        return []; // Return empty array if no access
      }
    }

    const playerTeams = await this.prisma.player_teams.findMany({
      where: { 
        team_id: teamId,
        is_active: true,
        is_deleted: false 
      },
      orderBy: [
        { 
          player: {
            squad_number: 'asc'
          }
        },
        { 
          player: {
            name: 'asc'
          }
        }
      ],
      include: {
        player: {
          select: {
            id: true,
            name: true,
            squad_number: true,
            preferred_pos: true,
            dob: true,
            notes: true
          }
        }
      }
    });

    return playerTeams.map(pt => ({
      relationshipId: pt.id,
      playerId: pt.player.id,
      playerName: pt.player.name,
      squadNumber: pt.player.squad_number,
      preferredPosition: pt.player.preferred_pos,
      dateOfBirth: pt.player.dob ? pt.player.dob.toISOString().split('T')[0] : null,
      notes: pt.player.notes,
      startDate: pt.start_date.toISOString().split('T')[0],
      joinedAt: pt.created_at.toISOString()
    }));
  }

  async getPlayerTeamsByPlayer(playerId: string, userId: string, userRole: string): Promise<any[]> {
    // Check if user can access this player
    if (userRole !== 'ADMIN') {
      const userPlayerIds = await this.getUserPlayerIds(userId);
      if (!userPlayerIds.includes(playerId)) {
        return []; // Return empty array if no access
      }
    }

    const playerTeams = await this.prisma.player_teams.findMany({
      where: { 
        player_id: playerId,
        is_deleted: false 
      },
      orderBy: [
        { start_date: 'desc' }
      ],
      include: {
        team: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return playerTeams.map(pt => ({
      ...this.transformPlayerTeamWithServiceFields(pt),
      team: pt.team
    }));
  }

  /**
   * Transform PlayerTeam with service-specific fields
   */
  private transformPlayerTeamWithServiceFields(prismaPlayerTeam: any): any {
    const baseTransform = transformPlayerTeam(prismaPlayerTeam);
    return {
      ...baseTransform,
      isActive: prismaPlayerTeam.is_active,
      endDate: prismaPlayerTeam.end_date ? prismaPlayerTeam.end_date.toISOString().split('T')[0] : null,
    };
  }

  /**
   * Get all team IDs that belong to a user
   */
  private async getUserTeamIds(userId: string): Promise<string[]> {
    const teams = await this.prisma.team.findMany({
      where: { 
        created_by_user_id: userId,
        is_deleted: false 
      },
      select: { id: true }
    });

    return teams.map(team => team.id);
  }

  /**
   * Get all player IDs that belong to a user
   */
  private async getUserPlayerIds(userId: string): Promise<string[]> {
    const players = await this.prisma.player.findMany({
      where: { 
        created_by_user_id: userId,
        is_deleted: false 
      },
      select: { id: true }
    });

    return players.map(player => player.id);
  }

  async batchPlayerTeams(operations: BatchPlayerTeamRequest, userId: string, userRole: string): Promise<BatchPlayerTeamResult> {
    const result: BatchPlayerTeamResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const originalData of operations.create) {
        try {
          // Resolve natural keys for this individual request
          const resolvedData = await this.resolveNaturalKeysForSingleRequest(originalData, userId, userRole);
          await this.createPlayerTeam(resolvedData, userId, userRole);
          result.created.success++;
        } catch (error: any) {
          result.created.failed++;
          result.created.errors.push({
            data: originalData,
            error: error.message || 'Unknown error during creation'
          });
        }
      }
    }

    // Process updates
    if (operations.update && operations.update.length > 0) {
      for (const updateOp of operations.update) {
        try {
          const updated = await this.updatePlayerTeam(updateOp.id, updateOp.data, userId, userRole);
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              id: updateOp.id,
              error: 'Player-team relationship not found or access denied'
            });
          }
        } catch (error: any) {
          result.updated.failed++;
          result.updated.errors.push({
            id: updateOp.id,
            error: error.message || 'Unknown error during update'
          });
        }
      }
    }

    // Process deletes
    if (operations.delete && operations.delete.length > 0) {
      for (const deleteId of operations.delete) {
        try {
          const deleted = await this.deletePlayerTeam(deleteId, userId, userRole);
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              id: deleteId,
              error: 'Player-team relationship not found or access denied'
            });
          }
        } catch (error: any) {
          result.deleted.failed++;
          result.deleted.errors.push({
            id: deleteId,
            error: error.message || 'Unknown error during deletion'
          });
        }
      }
    }

    return result;
  }

  /**
   * Resolve natural keys to UUIDs for a single request
   */
  private async resolveNaturalKeysForSingleRequest(request: PlayerTeamCreateRequest, userId: string, userRole: string): Promise<PlayerTeamCreateRequest> {
    if (NaturalKeyResolver.hasNaturalKeys(request)) {
      // Validate that we have both playerName and teamName
      if (!request.playerName || !request.teamName) {
        throw new Error('Natural key resolution requires both playerName and teamName.');
      }
      
      // Resolve natural keys to UUIDs
      const resolved = await this.naturalKeyResolver.resolvePlayerTeamKeys(
        request.playerName,
        request.teamName,
        userId,
        userRole
      );
      
      const { playerName, teamName, ...rest } = request;
      return {
        ...rest,
        playerId: resolved.playerId,
        teamId: resolved.teamId
      } as PlayerTeamCreateRequest;
    } else {
      // Validate that we have both playerId and teamId for UUID-based requests
      if (!request.playerId || !request.teamId) {
        throw new Error('UUID-based request requires both playerId and teamId.');
      }
      return request;
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    await this.naturalKeyResolver.disconnect();
  }
}
