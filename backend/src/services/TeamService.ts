import { PrismaClient } from '@prisma/client';
import { 
  transformTeam, 
  transformTeamCreateRequest, 
  transformTeamUpdateRequest,
  transformTeams 
} from '@shared/types';
import type { 
  Team, 
  TeamCreateRequest, 
  TeamUpdateRequest 
} from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted, UniqueConstraintBuilders } from '../utils/softDeleteUtils';

export interface GetTeamsOptions {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginatedTeams {
  data: Team[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class TeamService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getTeams(userId: string, userRole: string, options: GetTeamsOptions): Promise<PaginatedTeams> {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    // Build where clause for search and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted teams
    };

    // Non-admin users can only see their own teams
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive' as const
      };
    }

    // Get teams and total count
    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
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
      this.prisma.team.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformTeams(teams),
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

  async getTeamById(id: string, userId: string, userRole: string): Promise<Team | null> {
    const where: any = { 
      id,
      is_deleted: false 
    };

    // Non-admin users can only see their own teams
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const team = await this.prisma.team.findFirst({
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

    return team ? transformTeam(team) : null;
  }

  async createTeam(data: TeamCreateRequest, userId: string): Promise<Team> {
    return withPrismaErrorHandling(async () => {
      const team = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'team',
        uniqueConstraints: UniqueConstraintBuilders.userScoped('name', data.name, userId),
        createData: transformTeamCreateRequest(data),
        userId,
        transformer: transformTeam
      });
      return team;
    }, 'Team');
  }

  async updateTeam(id: string, data: TeamUpdateRequest, userId: string, userRole: string): Promise<Team | null> {
    try {
      // First check if team exists and user has permission
      const where: any = { 
        id,
        is_deleted: false 
      };

      // Non-admin users can only update their own teams
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if team exists and user has access
      const existingTeam = await this.prisma.team.findFirst({ where });
      if (!existingTeam) {
        return null; // Team not found or no permission
      }

      const prismaInput = transformTeamUpdateRequest(data);
      const team = await this.prisma.team.update({
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

      return transformTeam(team);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Team not found
      }
      throw error;
    }
  }

  async deleteTeam(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if team exists and user has permission
      const where: any = { 
        id,
        is_deleted: false 
      };

      // Non-admin users can only delete their own teams
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if team exists and user has access
      const existingTeam = await this.prisma.team.findFirst({ where });
      if (!existingTeam) {
        return false; // Team not found or no permission
      }

      // Soft delete the team
      await this.prisma.team.update({
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
        return false; // Team not found
      }
      throw error;
    }
  }

  async getTeamPlayers(teamId: string, userId: string, userRole: string): Promise<any[]> {
    // First check if user has access to this team
    const teamWhere: any = { 
      id: teamId,
      is_deleted: false 
    };

    // Non-admin users can only access their own teams
    if (userRole !== 'ADMIN') {
      teamWhere.created_by_user_id = userId;
    }

    const team = await this.prisma.team.findFirst({ where: teamWhere });
    if (!team) {
      throw new Error('Team not found or access denied');
    }

    const players = await this.prisma.player.findMany({
      where: { 
        current_team: teamId,
        is_deleted: false // Exclude soft-deleted players
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

    // TODO: Transform players when PlayerService is implemented
    return players;
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}