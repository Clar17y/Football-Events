import { PrismaClient } from '@prisma/client';
import { 
  transformMatch, 
  transformMatchCreateRequest, 
  transformMatchUpdateRequest,
  transformMatches 
} from '@shared/types';
import type { 
  Match, 
  MatchCreateRequest, 
  MatchUpdateRequest 
} from '@shared/types';

export interface GetMatchesOptions {
  page: number;
  limit: number;
  search?: string;
  seasonId?: string;
  teamId?: string;
  competition?: string;
}

export interface PaginatedMatches {
  data: Match[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class MatchService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async getMatches(options: GetMatchesOptions): Promise<PaginatedMatches> {
    const { page, limit, search, seasonId, teamId, competition } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    
    if (search) {
      where.OR = [
        {
          competition: {
            contains: search,
            mode: 'insensitive' as const
          }
        },
        {
          venue: {
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
    
    if (teamId) {
      where.OR = [
        { home_team_id: teamId },
        { away_team_id: teamId }
      ];
    }
    
    if (competition) {
      where.competition = {
        contains: competition,
        mode: 'insensitive' as const
      };
    }

    // Get matches and total count
    const [matches, total] = await Promise.all([
      this.prisma.match.findMany({
        where,
        skip,
        take: limit,
        orderBy: { kickoff_ts: 'desc' } // Most recent matches first
      }),
      this.prisma.match.count({ where })
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: transformMatches(matches),
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

  async getMatchById(id: string): Promise<Match | null> {
    const match = await this.prisma.match.findUnique({
      where: { match_id: id }
    });

    return match ? transformMatch(match) : null;
  }

  async createMatch(data: MatchCreateRequest): Promise<Match> {
    const prismaInput = transformMatchCreateRequest(data);
    const match = await this.prisma.match.create({
      data: prismaInput
    });

    return transformMatch(match);
  }

  async updateMatch(id: string, data: MatchUpdateRequest): Promise<Match | null> {
    try {
      const prismaInput = transformMatchUpdateRequest(data);
      const match = await this.prisma.match.update({
        where: { match_id: id },
        data: prismaInput
      });

      return transformMatch(match);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Match not found
      }
      throw error;
    }
  }

  async deleteMatch(id: string): Promise<boolean> {
    try {
      await this.prisma.match.delete({
        where: { match_id: id }
      });
      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Match not found
      }
      throw error;
    }
  }

  async getMatchesByTeam(teamId: string): Promise<Match[]> {
    const matches = await this.prisma.match.findMany({
      where: {
        OR: [
          { home_team_id: teamId },
          { away_team_id: teamId }
        ]
      },
      orderBy: { kickoff_ts: 'desc' }
    });

    return transformMatches(matches);
  }

  async getMatchesBySeason(seasonId: string): Promise<Match[]> {
    const matches = await this.prisma.match.findMany({
      where: { season_id: seasonId },
      orderBy: { kickoff_ts: 'desc' }
    });

    return transformMatches(matches);
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}