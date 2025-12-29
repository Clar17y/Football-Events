import { PrismaClient } from '@prisma/client';
import { 
  transformLineup, 
  transformLineupCreateRequest, 
  transformLineupUpdateRequest,
  transformLineups,
  safeTransformLineup,
  transformPlayer,
  transformEvent
} from '@shared/types';
import type { 
  Lineup, 
  LineupCreateRequest, 
  LineupUpdateRequest,
  LineupWithDetails,
  PlayerWithPosition,
  SubstitutionResult
} from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted, SoftDeletePatterns } from '../utils/softDeleteUtils';

export interface GetLineupsOptions {
  page: number;
  limit: number;
  search?: string;
  matchId?: string;
  playerId?: string;
  position?: string;
}

export interface PaginatedLineups {
  data: Lineup[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface BatchLineupRequest {
  create?: LineupCreateRequest[];
  update?: { id: string; data: LineupUpdateRequest }[];
  delete?: string[];
}

export interface BatchLineupResult {
  created: { success: number; failed: number; errors: Array<{ data: LineupCreateRequest; error: string }> };
  updated: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
  deleted: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
}

export class LineupService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getLineups(userId: string, userRole: string, options: GetLineupsOptions): Promise<PaginatedLineups> {
    const { page, limit, search, matchId, playerId, position } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering and authorization
    const where: any = {
      is_deleted: false // Exclude soft-deleted lineups
    };

    // Authorization: Only show lineups from accessible matches
    if (userRole !== 'ADMIN') {
      where.matches = {
        created_by_user_id: userId,
        is_deleted: false
      };
    } else {
      where.matches = {
        is_deleted: false
      };
    }
    
    if (search) {
      where.OR = [
        {
          position: {
            contains: search,
            mode: 'insensitive' as const
          }
        },
        {
          players: {
            full_name: {
              contains: search,
              mode: 'insensitive' as const
            }
          }
        }
      ];
    }
    
    if (matchId) {
      where.match_id = matchId;
    }
    
    if (playerId) {
      where.player_id = playerId;
    }
    
    if (position) {
      where.position = {
        contains: position,
        mode: 'insensitive' as const
      };
    }

    // Get lineups and total count
    const [lineups, total] = await Promise.all([
      this.prisma.lineup.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { match_id: 'desc' },
          { start_min: 'asc' },
          { created_at: 'asc' }
        ],
        include: {
          matches: {
            select: {
              match_id: true,
              created_by_user_id: true
            }
          },
          players: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      this.prisma.lineup.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformLineups(lineups),
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

  async getLineupById(id: string, userId: string, userRole: string): Promise<Lineup | null> {
    const where: any = { 
      id,
      is_deleted: false 
    };

    // Authorization: Only show lineups from accessible matches
    if (userRole !== 'ADMIN') {
      where.matches = {
        created_by_user_id: userId,
        is_deleted: false
      };
    } else {
      where.matches = {
        is_deleted: false
      };
    }

    const lineup = await this.prisma.lineup.findFirst({
      where,
      include: {
        matches: {
          select: {
            match_id: true,
            created_by_user_id: true
          }
        },
        players: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return safeTransformLineup(lineup);
  }

  async getLineupByKey(matchId: string, playerId: string, startMinute: number, userId: string, userRole: string): Promise<Lineup | null> {
    // First check if user has access to the match
    const matchWhere: any = { 
      match_id: matchId,
      is_deleted: false 
    };

    // Non-admin users can only access their own matches
    if (userRole !== 'ADMIN') {
      matchWhere.created_by_user_id = userId;
    }

    const match = await this.prisma.match.findFirst({ where: matchWhere });
    if (!match) {
      return null; // Match not found or no permission
    }

    const lineup = await this.prisma.lineup.findFirst({
      where: { 
        match_id: matchId,
        player_id: playerId,
        start_min: startMinute,
        is_deleted: false
      }
    });

    return safeTransformLineup(lineup);
  }

  async createLineup(data: LineupCreateRequest, userId: string, userRole: string): Promise<Lineup> {
    return withPrismaErrorHandling(async () => {
      // First check if user has access to the match
      const matchWhere: any = { 
        match_id: data.matchId,
        is_deleted: false 
      };

      // Non-admin users can only create lineups for their own matches
      if (userRole !== 'ADMIN') {
        matchWhere.created_by_user_id = userId;
      }

      const match = await this.prisma.match.findFirst({
        where: matchWhere,
        select: { match_id: true, home_team_id: true, away_team_id: true }
      });
      if (!match) {
        const error = new Error('Match not found or access denied');
        (error as any).code = 'MATCH_ACCESS_DENIED';
        (error as any).statusCode = 403;
        throw error;
      }

      const playerTeam = await this.prisma.player_teams.findFirst({
        where: {
          player_id: data.playerId,
          team_id: { in: [match.home_team_id, match.away_team_id] },
          is_active: true,
          is_deleted: false,
          player: { is_deleted: false }
        }
      });

      if (!playerTeam) {
        const error = new Error('Player does not belong to this match') as any;
        (error as any).code = 'INVALID_MATCH_PLAYER';
        (error as any).statusCode = 400;
        throw error;
      }

      const lineup = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'lineup',
        uniqueConstraints: SoftDeletePatterns.lineup(data.matchId, data.playerId, data.startMinute ?? 0),
        createData: transformLineupCreateRequest(data, userId),
        userId,
        transformer: transformLineup
      });

      return lineup;
    }, 'Lineup');
  }

  async updateLineup(id: string, data: LineupUpdateRequest, userId: string, userRole: string): Promise<Lineup | null> {
    try {
      // Check if lineup exists and user has access
      const where: any = {
        id,
        is_deleted: false
      };

      // Authorization: Only update lineups from accessible matches
      if (userRole !== 'ADMIN') {
        where.matches = {
          created_by_user_id: userId,
          is_deleted: false
        };
      } else {
        where.matches = {
          is_deleted: false
        };
      }

      const existingLineup = await this.prisma.lineup.findFirst({ where });
      if (!existingLineup) {
        return null; // Not found or no permission
      }

      // Update existing lineup
      const prismaInput = transformLineupUpdateRequest(data);
      
      // Always update the updated_at timestamp
      (prismaInput as any).updated_at = new Date();

      const lineup = await this.prisma.lineup.update({
        where: { id },
        data: prismaInput as any // Cast to bypass exactOptionalPropertyTypes for position enum
      });

      return transformLineup(lineup);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Lineup not found
      }
      throw error;
    }
  }

  async updateLineupByKey(matchId: string, playerId: string, startMinute: number, data: LineupUpdateRequest, userId: string, userRole: string): Promise<Lineup | null> {
    try {
      // First check if user has access to the match
      const matchWhere: any = { 
        match_id: matchId,
        is_deleted: false 
      };

      // Non-admin users can only update lineups for their own matches
      if (userRole !== 'ADMIN') {
        matchWhere.created_by_user_id = userId;
      }

      const match = await this.prisma.match.findFirst({ where: matchWhere });
      if (!match) {
        return null; // Match not found or no permission
      }

      // Handle upsert logic - if lineup doesn't exist, create it
      const existingLineup = await this.prisma.lineup.findFirst({
        where: { 
          match_id: matchId,
          player_id: playerId,
          start_min: startMinute,
          is_deleted: false
        }
      });

      if (!existingLineup) {
        // For upsert, we need the full data to create
        if (this.isCompleteLineupData(data)) {
          const createData = { 
            matchId, 
            playerId, 
            startMinute, 
            ...data 
          } as LineupCreateRequest;
          return await this.createLineup(createData, userId, userRole);
        } else {
          return null; // Cannot create with partial data
        }
      }

      // Update existing lineup using the new method
      return await this.updateLineup(existingLineup.id, data, userId, userRole);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Lineup not found
      }
      throw error;
    }
  }

  async deleteLineup(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // Check if lineup exists and user has access
      const where: any = {
        id,
        is_deleted: false
      };

      // Authorization: Only delete lineups from accessible matches
      if (userRole !== 'ADMIN') {
        where.matches = {
          created_by_user_id: userId,
          is_deleted: false
        };
      } else {
        where.matches = {
          is_deleted: false
        };
      }

      const existingLineup = await this.prisma.lineup.findFirst({ where });
      if (!existingLineup) {
        return false; // Not found or no permission
      }

      // Soft delete the lineup
      await this.prisma.lineup.update({
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
        return false; // Lineup not found
      }
      throw error;
    }
  }

  async deleteLineupByKey(matchId: string, playerId: string, startMinute: number, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if user has access to the match
      const matchWhere: any = { 
        match_id: matchId,
        is_deleted: false 
      };

      // Non-admin users can only delete lineups for their own matches
      if (userRole !== 'ADMIN') {
        matchWhere.created_by_user_id = userId;
      }

      const match = await this.prisma.match.findFirst({ where: matchWhere });
      if (!match) {
        return false; // Match not found or no permission
      }

      // Check if lineup exists and is not already deleted
      const existingLineup = await this.prisma.lineup.findFirst({
        where: { 
          match_id: matchId,
          player_id: playerId,
          start_min: startMinute,
          is_deleted: false
        }
      });

      if (!existingLineup) {
        return false; // Lineup not found
      }

      // Use the new delete method
      return await this.deleteLineup(existingLineup.id, userId, userRole);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Lineup not found
      }
      throw error;
    }
  }

  async getLineupsByMatch(matchId: string, userId: string, userRole: string): Promise<Lineup[]> {
    // First check if user has access to the match
    const matchWhere: any = { 
      match_id: matchId,
      is_deleted: false 
    };

    // Non-admin users can only access their own matches
    if (userRole !== 'ADMIN') {
      matchWhere.created_by_user_id = userId;
    }

    const match = await this.prisma.match.findFirst({ where: matchWhere });
    if (!match) {
      return []; // Match not found or no permission - return empty array
    }

    const lineups = await this.prisma.lineup.findMany({
      where: { 
        match_id: matchId,
        is_deleted: false
      },
      orderBy: [
        { start_min: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformLineups(lineups);
  }

  async getLineupsByPlayer(playerId: string, userId: string, userRole: string): Promise<Lineup[]> {
    // Build where clause with authorization
    const where: any = {
      player_id: playerId,
      is_deleted: false
    };

    // Authorization: Only show lineups from accessible matches
    if (userRole !== 'ADMIN') {
      where.matches = {
        created_by_user_id: userId,
        is_deleted: false
      };
    } else {
      where.matches = {
        is_deleted: false
      };
    }

    const lineups = await this.prisma.lineup.findMany({
      where,
      orderBy: [
        { match_id: 'desc' },
        { start_min: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformLineups(lineups);
  }

  async getLineupsByPosition(position: string, userId: string, userRole: string): Promise<Lineup[]> {
    // Build where clause with authorization
    const where: any = {
      position,
      is_deleted: false
    };

    // Authorization: Only show lineups from accessible matches
    if (userRole !== 'ADMIN') {
      where.matches = {
        created_by_user_id: userId,
        is_deleted: false
      };
    } else {
      where.matches = {
        is_deleted: false
      };
    }

    const lineups = await this.prisma.lineup.findMany({
      where,
      orderBy: [
        { match_id: 'desc' },
        { start_min: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformLineups(lineups);
  }

  async batchLineups(operations: BatchLineupRequest, userId: string, userRole: string): Promise<BatchLineupResult> {
    const result: BatchLineupResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const createData of operations.create) {
        try {
          await this.createLineup(createData, userId, userRole);
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
          const updated = await this.updateLineup(
            updateOp.id, 
            updateOp.data,
            userId,
            userRole
          );
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              id: updateOp.id,
              error: 'Lineup not found or access denied'
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
          const deleted = await this.deleteLineup(
            deleteId,
            userId,
            userRole
          );
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              id: deleteId,
              error: 'Lineup not found or access denied'
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

  private isCompleteLineupData(data: LineupUpdateRequest): boolean {
    // Check if we have the minimum required fields to create a lineup
    return !!(data.position);
  }

  /**
   * Get the current lineup for a match at a specific time
   * Returns players who are currently on the pitch based on start_min and end_min
   */
  async getCurrentLineup(matchId: string, currentTime: number, userId: string, userRole: string): Promise<LineupWithDetails[]> {
    // First check if user has access to the match
    const matchWhere: any = { 
      match_id: matchId,
      is_deleted: false 
    };

    // Non-admin users can only access their own matches
    if (userRole !== 'ADMIN') {
      matchWhere.created_by_user_id = userId;
    }

    const match = await this.prisma.match.findFirst({ where: matchWhere });
    if (!match) {
      return []; // Match not found or no permission - return empty array
    }

    const lineups = await this.prisma.lineup.findMany({
      where: {
        match_id: matchId,
        is_deleted: false,
        start_min: { lte: currentTime },
        OR: [
          { end_min: null }, // Still on pitch
          { end_min: { gt: currentTime } } // End time is after current time
        ]
      },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            squad_number: true,
            preferred_pos: true,
            dob: true,
            notes: true,
            created_at: true,
            updated_at: true,
            created_by_user_id: true,
            deleted_at: true,
            deleted_by_user_id: true,
            is_deleted: true
          }
        }
      },
      orderBy: [
        { start_min: 'desc' } // Get most recent lineup entry for each player
      ]
    });

    // Transform to LineupWithDetails
    return lineups.map(lineup => ({
      ...transformLineup(lineup),
      player: transformPlayer(lineup.players)
    }));
  }

  /**
   * Get all players who were active at a specific time in the match
   */
  async getActivePlayersAtTime(matchId: string, timeMinutes: number, userId: string, userRole: string): Promise<PlayerWithPosition[]> {
    // First check if user has access to the match
    const matchWhere: any = { 
      match_id: matchId,
      is_deleted: false 
    };

    // Non-admin users can only access their own matches
    if (userRole !== 'ADMIN') {
      matchWhere.created_by_user_id = userId;
    }

    const match = await this.prisma.match.findFirst({ where: matchWhere });
    if (!match) {
      return []; // Match not found or no permission - return empty array
    }

    const lineups = await this.prisma.lineup.findMany({
      where: {
        match_id: matchId,
        is_deleted: false,
        start_min: { lte: timeMinutes },
        OR: [
          { end_min: null }, // Still on pitch
          { end_min: { gt: timeMinutes } } // End time is after specified time
        ]
      },
      include: {
        players: {
          select: {
            id: true,
            name: true,
            squad_number: true,
            preferred_pos: true,
            dob: true,
            notes: true,
            created_at: true,
            updated_at: true,
            created_by_user_id: true,
            deleted_at: true,
            deleted_by_user_id: true,
            is_deleted: true
          }
        }
      },
      orderBy: [
        { start_min: 'desc' }
      ]
    });

    // Transform to PlayerWithPosition, removing duplicates (keep most recent lineup entry per player)
    const playerMap = new Map<string, PlayerWithPosition>();
    
    lineups.forEach(lineup => {
      if (!playerMap.has(lineup.player_id)) {
        const player = transformPlayer(lineup.players);
        playerMap.set(lineup.player_id, {
          ...player,
          position: {
            code: lineup.position,
            longName: lineup.position // Using position code as longName for now
          }
        } as PlayerWithPosition);
      }
    });

    return Array.from(playerMap.values());
  }

  /**
   * Make a substitution by taking a player off and putting another player on
   * Creates timeline events and updates lineup records with precise timing
   */
  async makeSubstitution(
    matchId: string, 
    playerOffId: string, 
    playerOnId: string, 
    position: string, 
    currentTime: number, 
    userId: string, 
    userRole: string,
    substitutionReason?: string
  ): Promise<SubstitutionResult> {
    return withPrismaErrorHandling(async () => {
      // First check if user has access to the match
      const matchWhere: any = { 
        match_id: matchId,
        is_deleted: false 
      };

      // Non-admin users can only make substitutions for their own matches
      if (userRole !== 'ADMIN') {
        matchWhere.created_by_user_id = userId;
      }

      const match = await this.prisma.match.findFirst({
        where: matchWhere,
        select: { match_id: true, home_team_id: true, away_team_id: true }
      });
      if (!match) {
        const error = new Error('Match not found or access denied');
        (error as any).code = 'MATCH_ACCESS_DENIED';
        (error as any).statusCode = 403;
        throw error;
      }

      const [playerOffTeam, playerOnTeam] = await Promise.all([
        this.prisma.player_teams.findFirst({
          where: {
            player_id: playerOffId,
            team_id: { in: [match.home_team_id, match.away_team_id] },
            is_active: true,
            is_deleted: false,
            player: { is_deleted: false }
          }
        }),
        this.prisma.player_teams.findFirst({
          where: {
            player_id: playerOnId,
            team_id: { in: [match.home_team_id, match.away_team_id] },
            is_active: true,
            is_deleted: false,
            player: { is_deleted: false }
          }
        })
      ]);

      if (!playerOffTeam || !playerOnTeam) {
        const error = new Error('Players must belong to this match') as any;
        (error as any).code = 'INVALID_MATCH_PLAYER';
        (error as any).statusCode = 400;
        throw error;
      }

      // Use a transaction to ensure data consistency
      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Find the current lineup record for the player being substituted off
        const currentLineup = await tx.lineup.findFirst({
          where: {
            match_id: matchId,
            player_id: playerOffId,
            is_deleted: false,
            start_min: { lte: currentTime },
            end_min: null // Player is currently on pitch
          },
          include: {
            players: {
              select: {
                id: true,
                name: true,
                squad_number: true,
                preferred_pos: true,
                dob: true,
                notes: true,
                created_at: true,
                updated_at: true,
                created_by_user_id: true,
                deleted_at: true,
                deleted_by_user_id: true,
                is_deleted: true
              }
            }
          }
        });

        if (!currentLineup) {
          const error = new Error('Player is not currently on the pitch');
          (error as any).code = 'PLAYER_NOT_ON_PITCH';
          (error as any).statusCode = 400;
          throw error;
        }

        // 2. Update the current lineup record to set end_min (player off)
        const updatedLineupOff = await tx.lineup.update({
          where: { id: currentLineup.id },
          data: {
            end_min: currentTime,
            updated_at: new Date(),
            substitution_reason: substitutionReason ?? null
          },
          include: {
            players: {
              select: {
                id: true,
                name: true,
                squad_number: true,
                preferred_pos: true,
                dob: true,
                notes: true,
                created_at: true,
                updated_at: true,
                created_by_user_id: true,
                deleted_at: true,
                deleted_by_user_id: true,
                is_deleted: true
              }
            }
          }
        });

        // 3. Create new lineup record for the player coming on
        const newLineup = await tx.lineup.create({
          data: {
            match_id: matchId,
            player_id: playerOnId,
            start_min: currentTime,
            end_min: null,
            position: position as any, // Cast to position_code enum
            created_by_user_id: userId,
            substitution_reason: substitutionReason ?? null
          },
          include: {
            players: {
              select: {
                id: true,
                name: true,
                squad_number: true,
                preferred_pos: true,
                dob: true,
                notes: true,
                created_at: true,
                updated_at: true,
                created_by_user_id: true,
                deleted_at: true,
                deleted_by_user_id: true,
                is_deleted: true
              }
            }
          }
        });

        // 4. Create timeline events for the substitution
        const playerOffEvent = await tx.event.create({
          data: {
            match_id: matchId,
            kind: 'ball_out', // Using ball_out as closest available event type for substitution
            player_id: playerOffId,
            team_id: match.home_team_id, // Assuming home team for now - this should be determined properly
            notes: `${(updatedLineupOff as any).players.name} substituted off`,
            clock_ms: Math.round(currentTime * 60 * 1000), // Convert minutes to milliseconds
            created_by_user_id: userId
          }
        });

        const playerOnEvent = await tx.event.create({
          data: {
            match_id: matchId,
            kind: 'ball_out', // Using ball_out as closest available event type for substitution
            player_id: playerOnId,
            team_id: match.home_team_id, // Assuming home team for now - this should be determined properly
            notes: `${(newLineup as any).players.name} substituted on`,
            clock_ms: Math.round(currentTime * 60 * 1000), // Convert minutes to milliseconds
            created_by_user_id: userId
          }
        });

        return {
          updatedLineupOff,
          newLineup,
          events: [playerOffEvent, playerOnEvent]
        };
      });

      // Transform the results to the expected format using transformers
      const playerOffLineup: LineupWithDetails = {
        ...transformLineup(result.updatedLineupOff),
        player: transformPlayer((result.updatedLineupOff as any).players)
      };

      const playerOnLineup: LineupWithDetails = {
        ...transformLineup(result.newLineup),
        player: transformPlayer((result.newLineup as any).players)
      };

      return {
        playerOff: playerOffLineup,
        playerOn: playerOnLineup,
        timelineEvents: result.events.map(event => transformEvent(event))
      };
    }, 'Substitution');
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
