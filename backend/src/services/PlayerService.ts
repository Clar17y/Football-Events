import { PrismaClient } from '@prisma/client';
import { 
  transformPlayer, 
  transformPlayerCreateRequest, 
  transformPlayerUpdateRequest,
  transformPlayers 
} from '@shared/types';
import type { 
  Player, 
  PlayerCreateRequest, 
  PlayerUpdateRequest 
} from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted, UniqueConstraintBuilders } from '../utils/softDeleteUtils';

export interface GetPlayersOptions {
  page: number;
  limit: number;
  search?: string;
  teamId?: string;
  position?: string;
}

export interface PaginatedPlayers {
  data: Player[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class PlayerService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getPlayers(userId: string, userRole: string, options: GetPlayersOptions): Promise<PaginatedPlayers> {
    const { page, limit, search, teamId, position } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted players
    };
    
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive' as const
      };
    }
    
    if (teamId) {
      where.player_teams = {
        some: {
          team_id: teamId,
          is_active: true,
          is_deleted: false
        }
      };
    }
    
    if (position) {
      where.preferred_pos = position;
    }

    // Non-admin users can only see players they created
    // TODO: Extend this to include team-based access via player_teams when that API is implemented
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    // Get players and total count
    const [players, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { squad_number: 'asc' },
          { name: 'asc' }
        ],
        include: {
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
      this.prisma.player.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformPlayers(players),
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

  async getPlayerById(id: string, userId: string, userRole: string): Promise<Player | null> {
    const where: any = { 
      id,
      is_deleted: false 
    };

    // Non-admin users can only see players they created
    // TODO: Extend this to include team-based access via player_teams when that API is implemented
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const player = await this.prisma.player.findFirst({
      where,
      include: {
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

    return player ? transformPlayer(player) : null;
  }

  async createPlayer(data: PlayerCreateRequest, userId: string, userRole: string): Promise<Player> {
    return withPrismaErrorHandling(async () => {
      // Build unique constraints for soft delete restoration
      const constraints: Record<string, any> = {
        name: data.name,
        created_by_user_id: userId
      };
      
      if (data.squadNumber !== undefined) {
        constraints.squad_number = data.squadNumber;
      }

      const player = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'player',
        uniqueConstraints: constraints,
        createData: transformPlayerCreateRequest(data),
        userId,
        transformer: transformPlayer
      });

      return player;
    }, 'Player');
  }

  async updatePlayer(id: string, data: PlayerUpdateRequest, userId: string, userRole: string): Promise<Player | null> {
    try {
      // First check if player exists and user has permission
      const where: any = { 
        id,
        is_deleted: false 
      };

      // Non-admin users can only update players they created
      // TODO: Extend this to include team-based access via player_teams when that API is implemented
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if player exists and user has access
      const existingPlayer = await this.prisma.player.findFirst({ where });
      if (!existingPlayer) {
        return null; // Player not found or no permission
      }

      // Note: Team assignment changes will be handled separately via player_teams API

      return await withPrismaErrorHandling(async () => {
        const prismaInput = transformPlayerUpdateRequest(data);
        const player = await this.prisma.player.update({
          where: { id },
          data: {
            ...prismaInput,
            updated_at: new Date()
          },
          include: {
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

        return transformPlayer(player);
      }, 'Player');
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null; // Player not found
      }
      throw error;
    }
  }

  async deletePlayer(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if player exists and user has permission
      const where: any = { 
        id,
        is_deleted: false 
      };

      // Non-admin users can only delete players they created
      // TODO: Extend this to include team-based access via player_teams when that API is implemented
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if player exists and user has access
      const existingPlayer = await this.prisma.player.findFirst({ where });
      if (!existingPlayer) {
        return false; // Player not found or no permission
      }

      // Soft delete the player
      await this.prisma.player.update({
        where: { id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });

      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Player not found
      }
      throw error;
    }
  }

  async getPlayersByTeam(teamId: string): Promise<Player[]> {
    const players = await this.prisma.player.findMany({
      where: { 
        is_deleted: false,
        player_teams: {
          some: {
            team_id: teamId,
            is_active: true,
            is_deleted: false
          }
        }
      },
      orderBy: [
        { squad_number: 'asc' },
        { name: 'asc' }
      ],
      include: {
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

    return transformPlayers(players);
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

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}