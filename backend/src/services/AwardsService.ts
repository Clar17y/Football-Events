import { PrismaClient } from '@prisma/client';
import { 
  transformAward, 
  transformAwardCreateRequest, 
  transformAwardUpdateRequest,
  transformAwards,
  transformMatchAward,
  transformMatchAwardCreateRequest,
  transformMatchAwardUpdateRequest,
  transformMatchAwards
} from '@shared/types';
import type { 
  Award, 
  AwardCreateRequest, 
  AwardUpdateRequest,
  MatchAward,
  MatchAwardCreateRequest,
  MatchAwardUpdateRequest
} from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { NaturalKeyResolver } from '../utils/naturalKeyResolver';
import { createOrRestoreSoftDeleted, SoftDeletePatterns } from '../utils/softDeleteUtils';

export interface GetAwardsOptions {
  page: number;
  limit: number;
  search?: string;
  seasonId?: string;
  playerId?: string;
  category?: string;
}

export interface PaginatedAwards {
  data: Award[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface PaginatedMatchAwards {
  data: MatchAward[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface BatchAwardRequest {
  create?: AwardCreateRequest[];
  update?: { id: string; data: AwardUpdateRequest }[];
  delete?: string[];
}

export interface BatchAwardResult {
  created: { success: number; failed: number; errors: Array<{ data: AwardCreateRequest; error: string }> };
  updated: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
  deleted: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
}

export interface BatchMatchAwardRequest {
  create?: MatchAwardCreateRequest[];
  update?: { id: string; data: MatchAwardUpdateRequest }[];
  delete?: string[];
}

export interface BatchMatchAwardResult {
  created: { success: number; failed: number; errors: Array<{ data: MatchAwardCreateRequest; error: string }> };
  updated: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
  deleted: { success: number; failed: number; errors: Array<{ id: string; error: string }> };
}

export class AwardsService {
  private prisma: PrismaClient;
  private nkr: NaturalKeyResolver;

  constructor() {
    this.prisma = new PrismaClient();
    this.nkr = new NaturalKeyResolver(this.prisma);
  }

  // Season Awards (awards table)
  async getAwards(userId: string, userRole: string, options: GetAwardsOptions): Promise<PaginatedAwards> {
    const { page, limit, search, seasonId, playerId, category } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted awards
    };

    // Non-admin users can only see awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }
    
    if (search) {
      where.OR = [
        {
          category: {
            contains: search,
            mode: 'insensitive' as const
          }
        },
        {
          notes: {
            contains: search,
            mode: 'insensitive' as const
          }
        }
      ];
    }
    
    if (seasonId) {
      where.season_id = seasonId;
    }
    
    if (playerId) {
      where.player_id = playerId;
    }
    
    if (category) {
      where.category = {
        contains: category,
        mode: 'insensitive' as const
      };
    }

    // Get awards and total count
    const [awards, total] = await Promise.all([
      this.prisma.awards.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }
      }),
      this.prisma.awards.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformAwards(awards),
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

  async getAwardById(id: string, userId: string, userRole: string): Promise<Award | null> {
    const where: any = { 
      award_id: id,
      is_deleted: false 
    };

    // Non-admin users can only see awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const award = await this.prisma.awards.findFirst({
      where
    });

    return award ? transformAward(award) : null;
  }

  // Allow natural keys: seasonLabel, playerName
  async createAward(data: AwardCreateRequest & { seasonLabel?: string; playerName?: string }, userId: string, userRole?: string): Promise<Award> {
    return withPrismaErrorHandling(async () => {
      let seasonId = data.seasonId;
      let playerId = data.playerId;
      if (!seasonId && data.seasonLabel) {
        try {
          seasonId = await this.nkr.resolveSeasonByLabel(data.seasonLabel, userId, userRole || 'USER');
        } catch (err: any) {
          if (err && err.code) {
            const e: any = new Error(err.message);
            e.statusCode = err.code === 'NOT_FOUND' ? 404 : err.code === 'MULTIPLE_MATCHES' ? 409 : err.code === 'INVALID_INPUT' ? 400 : 400;
            e.code = err.code;
            throw e;
          }
          throw err;
        }
      }
      if (!playerId && data.playerName) {
        try {
          playerId = await this.nkr.resolvePlayerByName(data.playerName, userId, userRole || 'USER');
        } catch (err: any) {
          if (err && err.code) {
            const e: any = new Error(err.message);
            e.statusCode = err.code === 'NOT_FOUND' ? 404 : err.code === 'MULTIPLE_MATCHES' ? 409 : err.code === 'INVALID_INPUT' ? 400 : 400;
            e.code = err.code;
            throw e;
          }
          throw err;
        }
      }

      const award = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'awards',
        uniqueConstraints: SoftDeletePatterns.awardConstraint(playerId!, seasonId!, data.category),
        createData: transformAwardCreateRequest({
          ...data,
          seasonId: seasonId!,
          playerId: playerId!
        }),
        userId,
        transformer: transformAward,
        primaryKeyField: 'award_id'
      });
      return award;
    }, 'Award');
  }

  async updateAward(id: string, data: AwardUpdateRequest, userId: string, userRole: string): Promise<Award | null> {
    try {
      // First check if award exists and user has permission
      const where: any = { 
        award_id: id,
        is_deleted: false 
      };

      // Non-admin users can only update awards they created
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if award exists and user has access
      const existingAward = await this.prisma.awards.findFirst({ where });
      if (!existingAward) {
        return null; // Award not found or no permission
      }

      const prismaInput = transformAwardUpdateRequest(data);
      const award = await this.prisma.awards.update({
        where: { award_id: id },
        data: {
          ...prismaInput,
          updated_at: new Date()
        }
      });

      return transformAward(award);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Award not found
      }
      throw error;
    }
  }

  async deleteAward(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if award exists and user has permission
      const where: any = { 
        award_id: id,
        is_deleted: false 
      };

      // Non-admin users can only delete awards they created
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if award exists and user has access
      const existingAward = await this.prisma.awards.findFirst({ where });
      if (!existingAward) {
        return false; // Award not found or no permission
      }

      // Soft delete the award
      await this.prisma.awards.update({
        where: { award_id: id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });

      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Award not found
      }
      throw error;
    }
  }

  // Match Awards (match_awards table)
  async getMatchAwards(userId: string, userRole: string, options: GetAwardsOptions): Promise<PaginatedMatchAwards> {
    const { page, limit, search, playerId, category } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted match awards
    };

    // Non-admin users can only see match awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }
    
    if (search) {
      where.OR = [
        {
          category: {
            contains: search,
            mode: 'insensitive' as const
          }
        },
        {
          notes: {
            contains: search,
            mode: 'insensitive' as const
          }
        }
      ];
    }
    
    if (playerId) {
      where.player_id = playerId;
    }
    
    if (category) {
      where.category = {
        contains: category,
        mode: 'insensitive' as const
      };
    }

    // Get match awards and total count
    const [matchAwards, total] = await Promise.all([
      this.prisma.match_awards.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }
      }),
      this.prisma.match_awards.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformMatchAwards(matchAwards),
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

  async getMatchAwardById(id: string, userId: string, userRole: string): Promise<MatchAward | null> {
    const where: any = { 
      match_award_id: id,
      is_deleted: false 
    };

    // Non-admin users can only see match awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const matchAward = await this.prisma.match_awards.findFirst({
      where
    });

    return matchAward ? transformMatchAward(matchAward) : null;
  }

  // Allow natural keys: playerName or match triple (homeTeamName, awayTeamName, kickoffTime)
  async createMatchAward(data: MatchAwardCreateRequest & { playerName?: string; homeTeamName?: string; awayTeamName?: string; kickoffTime?: string }, userId: string, userRole?: string): Promise<MatchAward> {
    return withPrismaErrorHandling(async () => {
      let matchId = data.matchId;
      let playerId = data.playerId;
      if (!matchId && data.homeTeamName && data.awayTeamName && data.kickoffTime) {
        try {
          matchId = await this.nkr.resolveMatchByTeamsAndTime(data.homeTeamName, data.awayTeamName, data.kickoffTime, userId, userRole || 'USER');
        } catch (err: any) {
          if (err && err.code) {
            const e: any = new Error(err.message);
            e.statusCode = err.code === 'NOT_FOUND' ? 404 : err.code === 'MULTIPLE_MATCHES' ? 409 : err.code === 'INVALID_INPUT' ? 400 : 400;
            e.code = err.code;
            throw e;
          }
          throw err;
        }
      }
      if (!playerId && data.playerName) {
        try {
          playerId = await this.nkr.resolvePlayerByName(data.playerName, userId, userRole || 'USER');
        } catch (err: any) {
          if (err && err.code) {
            const e: any = new Error(err.message);
            e.statusCode = err.code === 'NOT_FOUND' ? 404 : err.code === 'MULTIPLE_MATCHES' ? 409 : err.code === 'INVALID_INPUT' ? 400 : 400;
            e.code = err.code;
            throw e;
          }
          throw err;
        }
      }
      const matchAward = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'match_awards',
        uniqueConstraints: SoftDeletePatterns.matchAwardConstraint(playerId!, matchId!, data.category),
        createData: transformMatchAwardCreateRequest({
          ...data,
          matchId: matchId!,
          playerId: playerId!
        }),
        userId,
        transformer: transformMatchAward,
        primaryKeyField: 'match_award_id'
      });
      return matchAward;
    }, 'MatchAward');
  }

  async updateMatchAward(id: string, data: MatchAwardUpdateRequest, userId: string, userRole: string): Promise<MatchAward | null> {
    try {
      // First check if match award exists and user has permission
      const where: any = { 
        match_award_id: id,
        is_deleted: false 
      };

      // Non-admin users can only update match awards they created
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if match award exists and user has access
      const existingMatchAward = await this.prisma.match_awards.findFirst({ where });
      if (!existingMatchAward) {
        return null; // Match award not found or no permission
      }

      const prismaInput = transformMatchAwardUpdateRequest(data);
      const matchAward = await this.prisma.match_awards.update({
        where: { match_award_id: id },
        data: {
          ...prismaInput,
          updated_at: new Date()
        }
      });

      return transformMatchAward(matchAward);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Match award not found
      }
      throw error;
    }
  }

  async deleteMatchAward(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if match award exists and user has permission
      const where: any = { 
        match_award_id: id,
        is_deleted: false 
      };

      // Non-admin users can only delete match awards they created
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if match award exists and user has access
      const existingMatchAward = await this.prisma.match_awards.findFirst({ where });
      if (!existingMatchAward) {
        return false; // Match award not found or no permission
      }

      // Soft delete the match award
      await this.prisma.match_awards.update({
        where: { match_award_id: id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });

      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Match award not found
      }
      throw error;
    }
  }

  async getAwardsByPlayer(playerId: string, userId: string, userRole: string): Promise<Award[]> {
    const where: any = { 
      player_id: playerId,
      is_deleted: false 
    };

    // Non-admin users can only see awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const awards = await this.prisma.awards.findMany({
      where,
      orderBy: { created_at: 'desc' }
    });

    return transformAwards(awards);
  }

  async getMatchAwardsByPlayer(playerId: string, userId: string, userRole: string): Promise<MatchAward[]> {
    const where: any = { 
      player_id: playerId,
      is_deleted: false 
    };

    // Non-admin users can only see match awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const matchAwards = await this.prisma.match_awards.findMany({
      where,
      orderBy: { created_at: 'desc' }
    });

    return transformMatchAwards(matchAwards);
  }

  async getAwardsBySeason(seasonId: string, userId: string, userRole: string): Promise<Award[]> {
    const where: any = { 
      season_id: seasonId,
      is_deleted: false 
    };

    // Non-admin users can only see awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const awards = await this.prisma.awards.findMany({
      where,
      orderBy: { created_at: 'desc' }
    });

    return transformAwards(awards);
  }

  async getMatchAwardsByMatch(matchId: string, userId: string, userRole: string): Promise<MatchAward[]> {
    const where: any = { 
      match_id: matchId,
      is_deleted: false 
    };

    // Non-admin users can only see match awards they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const matchAwards = await this.prisma.match_awards.findMany({
      where,
      orderBy: { created_at: 'desc' }
    });

    return transformMatchAwards(matchAwards);
  }

  // Batch operations for Awards
  async batchAwards(operations: BatchAwardRequest, userId: string, userRole: string): Promise<BatchAwardResult> {
    const result: BatchAwardResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const createData of operations.create) {
        try {
          await this.createAward(createData as any, userId, userRole);
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
          const updated = await this.updateAward(updateOp.id, updateOp.data, userId, userRole);
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              id: updateOp.id,
              error: 'Award not found or access denied'
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
          const deleted = await this.deleteAward(deleteId, userId, userRole);
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              id: deleteId,
              error: 'Award not found or access denied'
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

  // Batch operations for Match Awards
  async batchMatchAwards(operations: BatchMatchAwardRequest, userId: string, userRole: string): Promise<BatchMatchAwardResult> {
    const result: BatchMatchAwardResult = {
      created: { success: 0, failed: 0, errors: [] },
      updated: { success: 0, failed: 0, errors: [] },
      deleted: { success: 0, failed: 0, errors: [] }
    };

    // Process creates
    if (operations.create && operations.create.length > 0) {
      for (const createData of operations.create) {
        try {
          await this.createMatchAward(createData as any, userId, userRole);
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
          const updated = await this.updateMatchAward(updateOp.id, updateOp.data, userId, userRole);
          if (updated) {
            result.updated.success++;
          } else {
            result.updated.failed++;
            result.updated.errors.push({
              id: updateOp.id,
              error: 'Match award not found or access denied'
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
          const deleted = await this.deleteMatchAward(deleteId, userId, userRole);
          if (deleted) {
            result.deleted.success++;
          } else {
            result.deleted.failed++;
            result.deleted.errors.push({
              id: deleteId,
              error: 'Match award not found or access denied'
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

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
