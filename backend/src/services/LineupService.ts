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

  async getLineups(options: GetLineupsOptions): Promise<PaginatedLineups> {
    const { page, limit, search, matchId, playerId, position } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    
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
        ]
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

  async getLineupByKey(matchId: string, playerId: string, startMinute: number): Promise<Lineup | null> {
    const lineup = await this.prisma.lineup.findUnique({
      where: { 
        match_id_player_id_start_min: {
          match_id: matchId,
          player_id: playerId,
          start_min: startMinute
        }
      }
    });

    return safeTransformLineup(lineup);
  }

  async createLineup(data: LineupCreateRequest): Promise<Lineup> {
    return withPrismaErrorHandling(async () => {
      const prismaInput = transformLineupCreateRequest(data);
      const lineup = await this.prisma.lineup.create({
        data: prismaInput
      });

      return transformLineup(lineup);
    }, 'Lineup');
  }

  async updateLineup(matchId: string, playerId: string, startMinute: number, data: LineupUpdateRequest): Promise<Lineup | null> {
    try {
      // Handle upsert logic - if lineup doesn't exist, create it
      const existingLineup = await this.prisma.lineup.findUnique({
        where: { 
          match_id_player_id_start_min: {
            match_id: matchId,
            player_id: playerId,
            start_min: startMinute
          }
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
          return await this.createLineup(createData);
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

  async deleteLineup(matchId: string, playerId: string, startMinute: number): Promise<boolean> {
    try {
      await this.prisma.lineup.delete({
        where: { 
          match_id_player_id_start_min: {
            match_id: matchId,
            player_id: playerId,
            start_min: startMinute
          }
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

  async getLineupsByMatch(matchId: string): Promise<Lineup[]> {
    const lineups = await this.prisma.lineup.findMany({
      where: { match_id: matchId },
      orderBy: [
        { start_min: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformLineups(lineups);
  }

  async getLineupsByPlayer(playerId: string): Promise<Lineup[]> {
    const lineups = await this.prisma.lineup.findMany({
      where: { player_id: playerId },
      orderBy: [
        { match_id: 'desc' },
        { start_min: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformLineups(lineups);
  }

  async getLineupsByPosition(position: string): Promise<Lineup[]> {
    const lineups = await this.prisma.lineup.findMany({
      where: { position },
      orderBy: [
        { match_id: 'desc' },
        { start_min: 'asc' },
        { created_at: 'asc' }
      ]
    });

    return transformLineups(lineups);
  }

  async batchLineups(operations: BatchLineupRequest): Promise<BatchLineupResult> {
    const result: BatchLineupResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const createData of operations.create) {
        try {
          await this.createLineup(createData);
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
            updateOp.data
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
            deleteOp.startMinute
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