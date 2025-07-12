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

  async getSeasons(options: GetSeasonsOptions): Promise<PaginatedSeasons> {
    const { page, limit, search } = options;
    const skip = (page - 1) * limit;

    // Build where clause for search
    const where = search ? {
      label: {
        contains: search,
        mode: 'insensitive' as const
      }
    } : {};

    // Get seasons and total count
    const [seasons, total] = await Promise.all([
      this.prisma.seasons.findMany({
        where,
        skip,
        take: limit,
        orderBy: { label: 'desc' } // Most recent seasons first
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

  async getSeasonById(id: string): Promise<Season | null> {
    const season = await this.prisma.seasons.findUnique({
      where: { season_id: id }
    });

    return season ? transformSeason(season) : null;
  }

  async createSeason(data: SeasonCreateRequest): Promise<Season> {
    return withPrismaErrorHandling(async () => {
      const prismaInput = transformSeasonCreateRequest(data);
      const season = await this.prisma.seasons.create({
        data: prismaInput
      });

      return transformSeason(season);
    }, 'Season');
  }

  async updateSeason(id: string, data: SeasonUpdateRequest): Promise<Season | null> {
    try {
      const prismaInput = transformSeasonUpdateRequest(data);
      const season = await this.prisma.seasons.update({
        where: { season_id: id },
        data: prismaInput
      });

      return transformSeason(season);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Season not found
      }
      throw error;
    }
  }

  async deleteSeason(id: string): Promise<boolean> {
    try {
      await this.prisma.seasons.delete({
        where: { season_id: id }
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