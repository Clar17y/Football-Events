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

export interface BatchPlayerRequest {
  create?: PlayerCreateRequest[];
  update?: { id: string; data: PlayerUpdateRequest }[];
  delete?: string[];
}

export interface BatchPlayerResult {
  created: { success: number; failed: number; errors: Array<{ data: PlayerCreateRequest; error: string }> };
  updated: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
  deleted: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
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

  async batchPlayers(operations: BatchPlayerRequest, userId: string, userRole: string): Promise<BatchPlayerResult> {
    const result: BatchPlayerResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const createData of operations.create) {
        try {
          await this.createPlayer(createData, userId, userRole);
          result.created.success++;
        } catch (error: any) {
          result.created.failed++;
          result.created.errors.push({
            data: createData,
            error: error.message || 'Unknown error during creation'
          });
        }
      }
    }

    // Process updates
    if (operations.update && operations.update.length > 0) {
      for (const updateOp of operations.update) {
        try {
          const updated = await this.updatePlayer(updateOp.id, updateOp.data, userId, userRole);
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              id: updateOp.id,
              error: 'Player not found or access denied'
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
          const deleted = await this.deletePlayer(deleteId, userId, userRole);
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              id: deleteId,
              error: 'Player not found or access denied'
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

  async getPlayerSeasonStats(playerId: string, seasonId: string, userId: string, userRole: string): Promise<any | null> {
    // First check if user has access to this player
    const playerWhere: any = { 
      id: playerId,
      is_deleted: false 
    };

    // Non-admin users can only access players they created or from their teams
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      playerWhere.OR = [
        { created_by_user_id: userId },
        {
          player_teams: {
            some: {
              team_id: { in: userTeamIds },
              is_active: true,
              is_deleted: false
            }
          }
        }
      ];
    }

    const player = await this.prisma.player.findFirst({ 
      where: playerWhere,
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
    
    if (!player) {
      return null; // Player not found or access denied
    }

    // Get matches for this season that the player was involved in
    const matches = await this.prisma.match.findMany({
      where: {
        season_id: seasonId,
        is_deleted: false,
        OR: [
          {
            lineup: {
              some: {
                player_id: playerId,
                is_deleted: false
              }
            }
          },
          {
            events: {
              some: {
                player_id: playerId,
                is_deleted: false
              }
            }
          }
        ]
      },
      select: { 
        match_id: true,
        kickoff_ts: true,
        home_team_id: true,
        away_team_id: true
      }
    });

    const matchIds = matches.map(m => m.match_id);

    if (matchIds.length === 0) {
      return {
        player: transformPlayer(player),
        seasonId,
        stats: {
          matchesPlayed: 0,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
          totalEvents: 0,
          appearances: 0
        },
        events: [],
        lineups: []
      };
    }

    // Get all events for this player in this season
    const [events, lineups, goalCount, assistCount, fouls] = await Promise.all([
      this.prisma.event.findMany({
        where: {
          match_id: { in: matchIds },
          player_id: playerId,
          is_deleted: false
        },
        orderBy: [
          { matches: { kickoff_ts: 'desc' } },
          { clock_ms: 'asc' }
        ],
        include: {
          matches: {
            select: {
              match_id: true,
              kickoff_ts: true,
              competition: true
            }
          },
          teams: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      this.prisma.lineup.findMany({
        where: {
          match_id: { in: matchIds },
          player_id: playerId,
          is_deleted: false
        },
        include: {
          matches: {
            select: {
              match_id: true,
              kickoff_ts: true,
              competition: true
            }
          }
        }
      }),
      this.prisma.event.count({
        where: {
          match_id: { in: matchIds },
          player_id: playerId,
          kind: 'goal',
          is_deleted: false
        }
      }),
      this.prisma.event.count({
        where: {
          match_id: { in: matchIds },
          player_id: playerId,
          kind: 'assist',
          is_deleted: false
        }
      }),
      this.prisma.event.count({
        where: {
          match_id: { in: matchIds },
          player_id: playerId,
          kind: 'foul',
          is_deleted: false
        }
      })
    ]);

    return {
      player: transformPlayer(player),
      seasonId,
      stats: {
        matchesPlayed: matches.length,
        goals: goalCount,
        assists: assistCount,
        fouls: fouls,
        totalEvents: events.length,
        appearances: lineups.length
      },
      events: events.map(e => ({
        id: e.id,
        kind: e.kind,
        periodNumber: e.period_number,
        clockMs: e.clock_ms,
        notes: e.notes,
        sentiment: e.sentiment,
        match: e.matches,
        createdAt: e.created_at
      })),
      lineups: lineups.map(l => ({
        id: l.id,
        position: l.position,
        match: l.matches
      })),
      matches: matches.map(m => ({
        matchId: m.match_id,
        kickoffTime: m.kickoff_ts,
        homeTeamId: m.home_team_id,
        awayTeamId: m.away_team_id
      }))
    };
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}