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

export class AwardsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  // Season Awards (awards table)
  async getAwards(options: GetAwardsOptions): Promise<PaginatedAwards> {
    const { page, limit, search, seasonId, playerId, category } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    
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

  async getAwardById(id: string): Promise<Award | null> {
    const award = await this.prisma.awards.findUnique({
      where: { award_id: id }
    });

    return award ? transformAward(award) : null;
  }

  async createAward(data: AwardCreateRequest): Promise<Award> {
    const prismaInput = transformAwardCreateRequest(data);
    const award = await this.prisma.awards.create({
      data: prismaInput
    });

    return transformAward(award);
  }

  async updateAward(id: string, data: AwardUpdateRequest): Promise<Award | null> {
    try {
      const prismaInput = transformAwardUpdateRequest(data);
      const award = await this.prisma.awards.update({
        where: { award_id: id },
        data: prismaInput
      });

      return transformAward(award);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Award not found
      }
      throw error;
    }
  }

  async deleteAward(id: string): Promise<boolean> {
    try {
      await this.prisma.awards.delete({
        where: { award_id: id }
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
  async getMatchAwards(options: GetAwardsOptions): Promise<PaginatedMatchAwards> {
    const { page, limit, search, playerId, category } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    
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

  async getMatchAwardById(id: string): Promise<MatchAward | null> {
    const matchAward = await this.prisma.match_awards.findUnique({
      where: { match_award_id: id }
    });

    return matchAward ? transformMatchAward(matchAward) : null;
  }

  async createMatchAward(data: MatchAwardCreateRequest): Promise<MatchAward> {
    const prismaInput = transformMatchAwardCreateRequest(data);
    const matchAward = await this.prisma.match_awards.create({
      data: prismaInput
    });

    return transformMatchAward(matchAward);
  }

  async updateMatchAward(id: string, data: MatchAwardUpdateRequest): Promise<MatchAward | null> {
    try {
      const prismaInput = transformMatchAwardUpdateRequest(data);
      const matchAward = await this.prisma.match_awards.update({
        where: { match_award_id: id },
        data: prismaInput
      });

      return transformMatchAward(matchAward);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Match award not found
      }
      throw error;
    }
  }

  async deleteMatchAward(id: string): Promise<boolean> {
    try {
      await this.prisma.match_awards.delete({
        where: { match_award_id: id }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Match award not found
      }
      throw error;
    }
  }

  async getAwardsByPlayer(playerId: string): Promise<Award[]> {
    const awards = await this.prisma.awards.findMany({
      where: { player_id: playerId },
      orderBy: { created_at: 'desc' }
    });

    return transformAwards(awards);
  }

  async getMatchAwardsByPlayer(playerId: string): Promise<MatchAward[]> {
    const matchAwards = await this.prisma.match_awards.findMany({
      where: { player_id: playerId },
      orderBy: { created_at: 'desc' }
    });

    return transformMatchAwards(matchAwards);
  }

  async getAwardsBySeason(seasonId: string): Promise<Award[]> {
    const awards = await this.prisma.awards.findMany({
      where: { season_id: seasonId },
      orderBy: { created_at: 'desc' }
    });

    return transformAwards(awards);
  }

  async getMatchAwardsByMatch(matchId: string): Promise<MatchAward[]> {
    const matchAwards = await this.prisma.match_awards.findMany({
      where: { match_id: matchId },
      orderBy: { created_at: 'desc' }
    });

    return transformMatchAwards(matchAwards);
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}