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

  async getTeams(options: GetTeamsOptions): Promise<PaginatedTeams> {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    // Build where clause for search
    const where = search ? {
      name: {
        contains: search,
        mode: 'insensitive' as const
      }
    } : {};

    // Get teams and total count
    const [teams, total] = await Promise.all([
      this.prisma.team.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' }
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

  async getTeamById(id: string): Promise<Team | null> {
    const team = await this.prisma.team.findUnique({
      where: { id }
    });

    return team ? transformTeam(team) : null;
  }

  async createTeam(data: TeamCreateRequest): Promise<Team> {
    const prismaInput = transformTeamCreateRequest(data);
    const team = await this.prisma.team.create({
      data: prismaInput
    });

    return transformTeam(team);
  }

  async updateTeam(id: string, data: TeamUpdateRequest): Promise<Team | null> {
    try {
      const prismaInput = transformTeamUpdateRequest(data);
      const team = await this.prisma.team.update({
        where: { id },
        data: prismaInput
      });

      return transformTeam(team);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Team not found
      }
      throw error;
    }
  }

  async deleteTeam(id: string): Promise<boolean> {
    try {
      await this.prisma.team.delete({
        where: { id }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Team not found
      }
      throw error;
    }
  }

  async getTeamPlayers(teamId: string): Promise<any[]> {
    const players = await this.prisma.player.findMany({
      where: { current_team: teamId },
      orderBy: [
        { squad_number: 'asc' },
        { name: 'asc' }
      ]
    });

    // TODO: Transform players when PlayerService is implemented
    return players;
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}