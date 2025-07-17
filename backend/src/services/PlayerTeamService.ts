import { PrismaClient } from '@prisma/client';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted, SoftDeletePatterns } from '../utils/softDeleteUtils';

export interface PlayerTeamCreateRequest {
  playerId: string;
  teamId: string;
  startDate: string; // ISO date string
  endDate?: string; // ISO date string
  isActive?: boolean;
}

export interface PlayerTeamUpdateRequest {
  endDate?: string; // ISO date string
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
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class PlayerTeamService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
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
      data: playerTeams.map(this.transformPlayerTeam),
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

  async getPlayerTeamById(id: string, userId: string, userRole: string): Promise<any | null> {
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

    return playerTeam ? this.transformPlayerTeam(playerTeam) : null;
  }

  async createPlayerTeam(data: PlayerTeamCreateRequest, userId: string, userRole: string): Promise<any> {
    return withPrismaErrorHandling(async () => {
      // Check if user can create relationship for this team and player
      if (userRole !== 'ADMIN') {
        const userTeamIds = await this.getUserTeamIds(userId);
        const userPlayerIds = await this.getUserPlayerIds(userId);
        
        if (!userTeamIds.includes(data.teamId) && !userPlayerIds.includes(data.playerId)) {
          throw new Error('Access denied: You can only create relationships for teams you own or players you created');
        }
      }

      // Check if player and team exist
      const [player, team] = await Promise.all([
        this.prisma.player.findFirst({
          where: { id: data.playerId, is_deleted: false }
        }),
        this.prisma.team.findFirst({
          where: { id: data.teamId, is_deleted: false }
        })
      ]);

      if (!player) {
        throw new Error('Player not found');
      }
      if (!team) {
        throw new Error('Team not found');
      }

      // Check for overlapping active relationships before creating/restoring
      const existingActiveRelationship = await this.prisma.player_teams.findFirst({
        where: {
          player_id: data.playerId,
          team_id: data.teamId,
          is_active: true,
          is_deleted: false,
          OR: [
            { end_date: null }, // No end date (currently active)
            { end_date: { gte: new Date(data.startDate) } } // End date after start date
          ]
        }
      });

      if (existingActiveRelationship) {
        throw new Error('Player already has an active relationship with this team during the specified period');
      }

      const playerTeam = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'player_teams',
        uniqueConstraints: SoftDeletePatterns.playerTeamConstraint(
          data.playerId,
          data.teamId,
          new Date(data.startDate)
        ),
        createData: {
          player_id: data.playerId,
          team_id: data.teamId,
          start_date: new Date(data.startDate),
          end_date: data.endDate ? new Date(data.endDate) : null,
          is_active: data.isActive ?? true
        },
        userId,
        transformer: this.transformPlayerTeam.bind(this)
      });

      return playerTeam;
    });
  }

  async updatePlayerTeam(id: string, data: PlayerTeamUpdateRequest, userId: string, userRole: string): Promise<any | null> {
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

      const updateData: any = {
        updated_at: new Date()
      };
      
      if (data.endDate !== undefined) {
        updateData.end_date = data.endDate ? new Date(data.endDate) : null;
      }
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

      return this.transformPlayerTeam(playerTeam);
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
      ...this.transformPlayerTeam(pt),
      player: pt.player
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
      ...this.transformPlayerTeam(pt),
      team: pt.team
    }));
  }

  private transformPlayerTeam(prismaPlayerTeam: any): any {
    return {
      id: prismaPlayerTeam.id,
      playerId: prismaPlayerTeam.player_id,
      teamId: prismaPlayerTeam.team_id,
      startDate: prismaPlayerTeam.start_date.toISOString().split('T')[0],
      endDate: prismaPlayerTeam.end_date ? prismaPlayerTeam.end_date.toISOString().split('T')[0] : null,
      isActive: prismaPlayerTeam.is_active,
      createdAt: prismaPlayerTeam.created_at,
      updatedAt: prismaPlayerTeam.updated_at ?? undefined,
      player: prismaPlayerTeam.player,
      team: prismaPlayerTeam.team,
      createdBy: prismaPlayerTeam.created_by
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

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}