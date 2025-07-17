import { PrismaClient } from '@prisma/client';
import { 
  transformLineup, 
  transformLineupCreateRequest, 
  transformLineupUpdateRequest,
  transformLineups,
  safeTransformLineup
} from '@shared/types';
import type { 
  Lineup, 
  LineupCreateRequest, 
  LineupUpdateRequest 
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
  update?: { matchId: string; playerId: string; startMinute: number; data: LineupUpdateRequest }[];
  delete?: { matchId: string; playerId: string; startMinute: number }[];
}

export interface BatchLineupResult {
  created: { success: number; failed: number; errors: Array<{ data: LineupCreateRequest; error: string }> };
  updated: { success: number; failed: number; errors: Array<{ key: string; error: string }> };
  deleted: { success: number; failed: number; errors: Array<{ key: string; error: string }> };
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

      const match = await this.prisma.match.findFirst({ where: matchWhere });
      if (!match) {
        const error = new Error('Match not found or access denied');
        (error as any).code = 'MATCH_ACCESS_DENIED';
        (error as any).statusCode = 400;
        throw error;
      }

      const lineup = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'lineup',
        uniqueConstraints: SoftDeletePatterns.lineup(data.matchId, data.playerId, data.startMinute),
        createData: transformLineupCreateRequest(data),
        userId,
        transformer: transformLineup
      });

      return lineup;
    }, 'Lineup');
  }

  async updateLineup(matchId: string, playerId: string, startMinute: number, data: LineupUpdateRequest, userId: string, userRole: string): Promise<Lineup | null> {
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

      // Update existing lineup
      const prismaInput = transformLineupUpdateRequest(data);
      
      // Always update the updated_at timestamp
      (prismaInput as any).updated_at = new Date();

      const lineup = await this.prisma.lineup.update({
        where: { 
          match_id_player_id_start_min: {
            match_id: matchId,
            player_id: playerId,
            start_min: startMinute
          }
        },
        data: prismaInput
      });

      return transformLineup(lineup);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Lineup not found
      }
      throw error;
    }
  }

  async deleteLineup(matchId: string, playerId: string, startMinute: number, userId: string, userRole: string): Promise<boolean> {
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

      // Soft delete the lineup
      await this.prisma.lineup.update({
        where: { 
          match_id_player_id_start_min: {
            match_id: matchId,
            player_id: playerId,
            start_min: startMinute
          }
        },
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
            updateOp.matchId, 
            updateOp.playerId, 
            updateOp.startMinute, 
            updateOp.data,
            userId,
            userRole
          );
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              key: `${updateOp.matchId}:${updateOp.playerId}:${updateOp.startMinute}`,
              error: 'Lineup not found'
            });
          }
        } catch (error: any) {
          result.updated.failed++;
          result.updated.errors.push({
            key: `${updateOp.matchId}:${updateOp.playerId}:${updateOp.startMinute}`,
            error: error.message || 'Unknown error during update'
          });
        }
      }
    }

    // Process deletes
    if (operations.delete && operations.delete.length > 0) {
      for (const deleteOp of operations.delete) {
        try {
          const deleted = await this.deleteLineup(
            deleteOp.matchId, 
            deleteOp.playerId, 
            deleteOp.startMinute,
            userId,
            userRole
          );
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              key: `${deleteOp.matchId}:${deleteOp.playerId}:${deleteOp.startMinute}`,
              error: 'Lineup not found'
            });
          }
        } catch (error: any) {
          result.deleted.failed++;
          result.deleted.errors.push({
            key: `${deleteOp.matchId}:${deleteOp.playerId}:${deleteOp.startMinute}`,
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

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}