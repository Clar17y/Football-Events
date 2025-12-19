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
  includeOpponents?: boolean;
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

  async getOpponentTeams(userId: string, _userRole: string, search?: string): Promise<Team[]> {
    const where: any = {
      is_deleted: false,
      is_opponent: true,
      created_by_user_id: userId,
    };
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const teams = await this.prisma.team.findMany({
      where,
      orderBy: { name: 'asc' }
    });

    return teams.map(transformTeam);
  }

  async getTeams(userId: string, userRole: string, options: GetTeamsOptions): Promise<PaginatedTeams> {
    const { page, limit, search, includeOpponents } = options;
    const skip = (page - 1) * limit;

    // Build where clause for search and ownership
    const where: any = {
      is_deleted: false, // Exclude soft-deleted teams
      // Only filter out opponents if includeOpponents is not true
      ...(includeOpponents ? {} : { is_opponent: false })
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
      const transformedData = transformTeamCreateRequest(data, userId);

      const team = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'team',
        uniqueConstraints: UniqueConstraintBuilders.userScoped('name', data.name, userId),
        createData: transformedData,
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
      const error = new Error('Team not found or access denied') as any;
      error.statusCode = 404;
      throw error;
    }

    // Resolve players via player_teams relation (active memberships)
    const playerTeams = await this.prisma.player_teams.findMany({
      where: {
        team_id: teamId,
        is_deleted: false,
        is_active: true,
        player: { is_deleted: false },
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            squad_number: true,
            preferred_pos: true,
          }
        }
      },
      orderBy: [
        { player: { squad_number: 'asc' } },
        { player: { name: 'asc' } }
      ]
    });

    // Map to a lightweight roster shape used by the frontend
    const roster = playerTeams
      .filter(pt => !!pt.player)
      .map(pt => ({
        id: pt.player!.id,
        name: pt.player!.name,
        squadNumber: pt.player!.squad_number ?? undefined,
        preferredPosition: pt.player!.preferred_pos ?? undefined,
        isActive: pt.is_active,
      }));

    return roster;
  }

  async getTeamSquad(teamId: string, userId: string, userRole: string, seasonId?: string): Promise<any | null> {
    // First check if user has access to this team
    const teamWhere: any = {
      id: teamId,
      is_deleted: false
    };

    // Non-admin users can only access their own teams
    if (userRole !== 'ADMIN') {
      teamWhere.created_by_user_id = userId;
    }

    const team = await this.prisma.team.findFirst({
      where: teamWhere,
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

    if (!team) {
      return null; // Team not found or access denied
    }

    // Get active players for this team
    const playerTeamsWhere: any = {
      team_id: teamId,
      is_active: true,
      is_deleted: false
    };

    // If seasonId is provided, filter by season through matches
    if (seasonId) {
      playerTeamsWhere.OR = [
        {
          // Players who played in matches for this season
          player: {
            lineup: {
              some: {
                matches: {
                  season_id: seasonId
                },
                is_deleted: false
              }
            }
          }
        },
        {
          // Or players who are currently active (fallback)
          is_active: true
        }
      ];
    }

    const playerTeams = await this.prisma.player_teams.findMany({
      where: playerTeamsWhere,
      include: {
        player: {
          select: {
            id: true,
            name: true,
            squad_number: true,
            preferred_pos: true,
            dob: true,
            created_at: true
          }
        }
      },
      orderBy: [
        { player: { squad_number: 'asc' } },
        { player: { name: 'asc' } }
      ]
    });

    // Get match statistics for the season if provided
    let seasonStats = null;
    if (seasonId) {
      const matches = await this.prisma.match.findMany({
        where: {
          season_id: seasonId,
          OR: [
            { home_team_id: teamId },
            { away_team_id: teamId }
          ],
          is_deleted: false
        },
        select: { match_id: true }
      });

      const matchIds = matches.map(m => m.match_id);

      if (matchIds.length > 0) {
        const [totalGoals, totalEvents, totalLineups] = await Promise.all([
          this.prisma.event.count({
            where: {
              match_id: { in: matchIds },
              team_id: teamId,
              kind: 'goal',
              is_deleted: false
            }
          }),
          this.prisma.event.count({
            where: {
              match_id: { in: matchIds },
              team_id: teamId,
              is_deleted: false
            }
          }),
          this.prisma.lineup.count({
            where: {
              match_id: { in: matchIds },
              is_deleted: false
            }
          })
        ]);

        seasonStats = {
          matchesPlayed: matches.length,
          totalGoals,
          totalEvents,
          totalLineups
        };
      }
    }

    return {
      team: transformTeam(team),
      players: playerTeams.map((pt: any) => ({
        playerId: pt.player_id,
        teamId: pt.team_id,
        startDate: pt.start_date,
        isActive: pt.is_active,
        player: pt.player
      })),
      seasonStats,
      totalPlayers: playerTeams.length,
      seasonId
    };
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
