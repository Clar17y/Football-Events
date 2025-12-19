import { PrismaClient } from '@prisma/client';
import { 
  transformSeason, 
  transformSeasonCreateRequest, 
  transformSeasonUpdateRequest,
  transformSeasons 
} from '@shared/types';
import type { 
  Season, 
  SeasonCreateRequest, 
  SeasonUpdateRequest 
} from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted, UniqueConstraintBuilders } from '../utils/softDeleteUtils';

export interface GetSeasonsOptions {
  page: number;
  limit: number;
  search?: string;
}

export interface PaginatedSeasons {
  data: Season[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class SeasonService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getSeasons(userId: string, userRole: string, options: GetSeasonsOptions): Promise<PaginatedSeasons> {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    // Build where clause for search and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted seasons
    };

    // Non-admin users can only see their own seasons
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    if (search) {
      where.label = {
        contains: search,
        mode: 'insensitive' as const
      };
    }

    // Get seasons and total count
    const [seasons, total] = await Promise.all([
      this.prisma.seasons.findMany({
        where,
        skip,
        take: limit,
        orderBy: { label: 'desc' }, // Most recent seasons first
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
      this.prisma.seasons.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformSeasons(seasons),
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

  async getSeasonById(id: string, userId: string, userRole: string): Promise<Season | null> {
    const where: any = { 
      season_id: id,
      is_deleted: false 
    };

    // Non-admin users can only see their own seasons
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
    }

    const season = await this.prisma.seasons.findFirst({
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

    return season ? transformSeason(season) : null;
  }

  async getCurrentSeason(): Promise<Season | null> {
    const currentDate = new Date();
    
    // First try to find a season explicitly marked as current
    let currentSeason = await this.prisma.seasons.findFirst({
      where: { is_current: true }
    });
    
    // If no season is marked current, find by date range
    if (!currentSeason) {
      currentSeason = await this.prisma.seasons.findFirst({
        where: {
          AND: [
            { start_date: { lte: currentDate } },
            { end_date: { gte: currentDate } }
          ]
        },
        orderBy: { start_date: 'desc' }
      });
    }
    
    return currentSeason ? transformSeason(currentSeason) : null;
  }

  async createSeason(data: SeasonCreateRequest, userId: string): Promise<Season> {
    return withPrismaErrorHandling(async () => {
      const season = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'seasons',
        uniqueConstraints: UniqueConstraintBuilders.userScoped('label', data.label, userId),
        createData: transformSeasonCreateRequest(data, userId),
        userId,
        transformer: transformSeason,
        primaryKeyField: 'season_id'
      });

      return season;
    }, 'Season');
  }

  async updateSeason(id: string, data: SeasonUpdateRequest, userId: string, userRole: string): Promise<Season | null> {
    try {
      // First check if season exists and user has permission
      const where: any = { 
        season_id: id,
        is_deleted: false 
      };

      // Non-admin users can only update their own seasons
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if season exists and user has access
      const existingSeason = await this.prisma.seasons.findFirst({ where });
      if (!existingSeason) {
        return null; // Season not found or no permission
      }

      const prismaInput = transformSeasonUpdateRequest(data);
      const season = await this.prisma.seasons.update({
        where: { season_id: id },
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

      return transformSeason(season);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Season not found
      }
      throw error;
    }
  }

  async deleteSeason(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if season exists and user has permission
      const where: any = { 
        season_id: id,
        is_deleted: false 
      };

      // Non-admin users can only delete their own seasons
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if season exists and user has access
      const existingSeason = await this.prisma.seasons.findFirst({ where });
      if (!existingSeason) {
        return false; // Season not found or no permission
      }

      // Soft delete the season
      await this.prisma.seasons.update({
        where: { season_id: id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Season not found
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}