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
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted, SoftDeletePatterns } from '../utils/softDeleteUtils';

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

  async getMatches(userId: string, userRole: string, options: GetMatchesOptions): Promise<PaginatedMatches> {
    const { page, limit, search, seasonId, teamId, competition } = options;
    const skip = (page - 1) * limit;

    // Build where clause for filtering and ownership
    const where: any = {
      is_deleted: false // Exclude soft-deleted matches
    };
    
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

    // Non-admin users can only see matches involving their teams OR matches they created
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      
      const ownershipFilter = {
        OR: [
          { created_by_user_id: userId }, // Matches they created
          { home_team_id: { in: userTeamIds } }, // Matches with their teams as home
          { away_team_id: { in: userTeamIds } }  // Matches with their teams as away
        ]
      };

      // Combine with existing where conditions
      if (where.OR) {
        where.AND = [{ OR: where.OR }, ownershipFilter];
        delete where.OR;
      } else {
        Object.assign(where, ownershipFilter);
      }
    }

    // Get matches and total count
    const [matches, total] = await Promise.all([
      this.prisma.match.findMany({
        where,
        skip,
        take: limit,
        orderBy: { kickoff_ts: 'desc' }, // Most recent matches first
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

  async getMatchById(id: string, userId: string, userRole: string): Promise<Match | null> {
    const where: any = { 
      match_id: id,
      is_deleted: false 
    };

    // Non-admin users can only see matches they created or involving their teams
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      where.OR = [
        { created_by_user_id: userId },
        { home_team_id: { in: userTeamIds } },
        { away_team_id: { in: userTeamIds } }
      ];
    }

    const match = await this.prisma.match.findFirst({
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

    return match ? transformMatch(match) : null;
  }

  async createMatch(data: MatchCreateRequest, userId: string, userRole: string): Promise<Match> {
    return withPrismaErrorHandling(async () => {
      // Validate that user owns at least one of the teams (unless admin)
      if (userRole !== 'ADMIN') {
        const userTeamIds = await this.getUserTeamIds(userId);
        const ownsHomeTeam = userTeamIds.includes(data.homeTeamId);
        const ownsAwayTeam = userTeamIds.includes(data.awayTeamId);
        
        if (!ownsHomeTeam && !ownsAwayTeam) {
          const error = new Error('Access denied: You must own at least one team to create a match') as any;
          error.statusCode = 403;
          throw error;
        }
      }

      const match = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'match',
        uniqueConstraints: SoftDeletePatterns.matchConstraint(
          data.homeTeamId, 
          data.awayTeamId, 
          new Date(data.kickoffTime)
        ),
        createData: transformMatchCreateRequest(data),
        userId,
        transformer: transformMatch,
        primaryKeyField: 'match_id'
      });

      return match;
    }, 'Match');
  }

  async updateMatch(id: string, data: MatchUpdateRequest, userId: string, userRole: string): Promise<Match | null> {
    try {
      // First check if match exists and user has permission (only creator or admin)
      const where: any = { 
        match_id: id,
        is_deleted: false 
      };

      // Non-admin users can only update matches they created
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if match exists and user has access
      const existingMatch = await this.prisma.match.findFirst({ where });
      if (!existingMatch) {
        return null; // Match not found or no permission
      }

      const prismaInput = transformMatchUpdateRequest(data);
      const match = await this.prisma.match.update({
        where: { match_id: id },
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

      return transformMatch(match);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return null; // Match not found
      }
      throw error;
    }
  }

  async deleteMatch(id: string, userId: string, userRole: string): Promise<boolean> {
    try {
      // First check if match exists and user has permission (only creator or admin)
      const where: any = { 
        match_id: id,
        is_deleted: false 
      };

      // Non-admin users can only delete matches they created
      if (userRole !== 'ADMIN') {
        where.created_by_user_id = userId;
      }

      // Check if match exists and user has access
      const existingMatch = await this.prisma.match.findFirst({ where });
      if (!existingMatch) {
        return false; // Match not found or no permission
      }

      // Soft delete the match
      await this.prisma.match.update({
        where: { match_id: id },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId
        }
      });

      return true;
    } catch (error: any) {
      if (error.code === 'P2025') {
        return false; // Match not found
      }
      throw error;
    }
  }

  async getMatchesByTeam(teamId: string, userId: string, userRole: string): Promise<Match[]> {
    const where: any = {
      is_deleted: false,
      OR: [
        { home_team_id: teamId },
        { away_team_id: teamId }
      ]
    };

    // Non-admin users can only see matches they created or involving their teams
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      
      // Check if user owns the requested team or if they created matches involving this team
      const ownershipFilter = {
        OR: [
          { created_by_user_id: userId },
          { 
            AND: [
              { OR: [{ home_team_id: teamId }, { away_team_id: teamId }] },
              { OR: [
                { home_team_id: { in: userTeamIds } },
                { away_team_id: { in: userTeamIds } }
              ]}
            ]
          }
        ]
      };

      where.AND = [ownershipFilter];
    }

    const matches = await this.prisma.match.findMany({
      where,
      orderBy: { kickoff_ts: 'desc' },
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

    return transformMatches(matches);
  }

  async getMatchesBySeason(seasonId: string, userId: string, userRole: string): Promise<Match[]> {
    const where: any = {
      season_id: seasonId,
      is_deleted: false
    };

    // Non-admin users can only see matches they created or involving their teams
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      where.OR = [
        { created_by_user_id: userId },
        { home_team_id: { in: userTeamIds } },
        { away_team_id: { in: userTeamIds } }
      ];
    }

    const matches = await this.prisma.match.findMany({
      where,
      orderBy: { kickoff_ts: 'desc' },
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

    return transformMatches(matches);
  }

  async getUpcomingMatches(userId: string, userRole: string, options: { limit: number; teamId?: string }): Promise<Match[]> {
    const { limit, teamId } = options;
    const now = new Date();

    const where: any = {
      is_deleted: false,
      kickoff_ts: { gte: now }
    };

    if (teamId) {
      where.OR = [
        { home_team_id: teamId },
        { away_team_id: teamId }
      ];
    }

    // Non-admin users can only see matches they created or involving their teams
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      const ownershipFilter = {
        OR: [
          { created_by_user_id: userId },
          { home_team_id: { in: userTeamIds } },
          { away_team_id: { in: userTeamIds } }
        ]
      };

      if (where.OR) {
        where.AND = [{ OR: where.OR }, ownershipFilter];
        delete where.OR;
      } else {
        Object.assign(where, ownershipFilter);
      }
    }

    const matches = await this.prisma.match.findMany({
      where,
      take: limit,
      orderBy: { kickoff_ts: 'asc' },
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

    return transformMatches(matches);
  }

  async getRecentMatches(userId: string, userRole: string, options: { limit: number; teamId?: string }): Promise<Match[]> {
    const { limit, teamId } = options;
    const now = new Date();

    const where: any = {
      is_deleted: false,
      kickoff_ts: { lt: now }
    };

    if (teamId) {
      where.OR = [
        { home_team_id: teamId },
        { away_team_id: teamId }
      ];
    }

    // Non-admin users can only see matches they created or involving their teams
    if (userRole !== 'ADMIN') {
      const userTeamIds = await this.getUserTeamIds(userId);
      const ownershipFilter = {
        OR: [
          { created_by_user_id: userId },
          { home_team_id: { in: userTeamIds } },
          { away_team_id: { in: userTeamIds } }
        ]
      };

      if (where.OR) {
        where.AND = [{ OR: where.OR }, ownershipFilter];
        delete where.OR;
      } else {
        Object.assign(where, ownershipFilter);
      }
    }

    const matches = await this.prisma.match.findMany({
      where,
      take: limit,
      orderBy: { kickoff_ts: 'desc' },
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

    return transformMatches(matches);
  }

  async getMatchFullDetails(id: string, userId: string, userRole: string): Promise<any | null> {
    const match = await this.getMatchById(id, userId, userRole);
    if (!match) return null;

    // Get all related data in parallel
    const [events, lineups, homeTeam, awayTeam] = await Promise.all([
      this.prisma.event.findMany({
        where: { match_id: id, is_deleted: false },
        orderBy: [{ clock_ms: 'asc' }, { created_at: 'asc' }]
      }),
      this.prisma.lineup.findMany({
        where: { match_id: id, is_deleted: false },
        include: {
          players: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      this.prisma.team.findUnique({
        where: { id: match.homeTeamId },
        select: {
          id: true,
          name: true,
          home_kit_primary: true,
          home_kit_secondary: true,
          logo_url: true
        }
      }),
      this.prisma.team.findUnique({
        where: { id: match.awayTeamId },
        select: {
          id: true,
          name: true,
          away_kit_primary: true,
          away_kit_secondary: true,
          logo_url: true
        }
      })
    ]);

    return {
      match,
      events: events.map(e => ({
        id: e.id,
        kind: e.kind,
        teamId: e.team_id,
        playerId: e.player_id,
        periodNumber: e.period_number,
        clockMs: e.clock_ms,
        notes: e.notes,
        sentiment: e.sentiment,
        createdAt: e.created_at
      })),
      lineups: lineups.map(l => ({
        id: l.id,
        playerId: l.player_id,
        position: l.position
      })),
      teams: {
        home: homeTeam,
        away: awayTeam
      }
    };
  }

  async getMatchTimeline(id: string, userId: string, userRole: string): Promise<any | null> {
    const match = await this.getMatchById(id, userId, userRole);
    if (!match) return null;

    const events = await this.prisma.event.findMany({
      where: { match_id: id, is_deleted: false },
      orderBy: [{ clock_ms: 'asc' }, { created_at: 'asc' }]
    });

    return {
      matchId: id,
      timeline: events.map(e => ({
        id: e.id,
        kind: e.kind,
        periodNumber: e.period_number,
        clockMs: e.clock_ms,
        notes: e.notes,
        playerId: e.player_id,
        sentiment: e.sentiment,
        timestamp: e.created_at
      }))
    };
  }

  async getMatchLiveState(id: string, userId: string, userRole: string): Promise<any | null> {
    const match = await this.getMatchById(id, userId, userRole);
    if (!match) return null;

    // Get current lineups and recent events
    const [lineups, recentEvents] = await Promise.all([
      this.prisma.lineup.findMany({
        where: { match_id: id, is_deleted: false },
        include: {
          players: {
            select: {
              id: true,
              name: true,
              player_teams: {
                select: {
                  team_id: true
                },
                where: {
                  is_deleted: false,
                  team: {
                    is_deleted: false
                  }
                }
            }
          }
        }
      }}),
      this.prisma.event.findMany({
        where: { match_id: id, is_deleted: false },
        orderBy: [{ clock_ms: 'desc' }, { created_at: 'desc' }],
        take: 10
      })
    ]);

    // Calculate basic match stats
    const goals = await this.prisma.event.count({
      where: { match_id: id, kind: 'goal', is_deleted: false }
    });

    return {
      match,
      currentLineups: lineups.map(l => ({
        playerId: l.player_id,
        teamId: l.players.player_teams[0]?.team_id || null,
        position: l.position
      })),
      recentEvents: recentEvents.map(e => ({
        id: e.id,
        kind: e.kind,
        teamId: e.team_id,
        playerId: e.player_id,
        clockMs: e.clock_ms,
        notes: e.notes,
        timestamp: e.created_at
      })),
      stats: {
        totalGoals: goals,
        lastUpdated: new Date()
      }
    };
  }

  async createQuickEvent(matchId: string, eventData: any, userId: string, userRole: string): Promise<any | null> {
    // Verify user can modify this match
    const match = await this.getMatchById(matchId, userId, userRole);
    if (!match) return null;

    if (userRole !== 'ADMIN') {
      const canModify = await this.prisma.match.findFirst({
        where: {
          match_id: matchId,
          created_by_user_id: userId,
          is_deleted: false
        }
      });
      if (!canModify) return null;
    }

    // Create the event
    const event = await this.prisma.event.create({
      data: {
        match_id: matchId,
        kind: eventData.kind,
        team_id: eventData.teamId,
        player_id: eventData.playerId,
        period_number: eventData.periodNumber || 1,
        clock_ms: eventData.clockMs || 0,
        notes: eventData.notes,
        sentiment: eventData.sentiment || 0,
        created_by_user_id: userId
      }
    });

    return {
      id: event.id,
      kind: event.kind,
      teamId: event.team_id,
      playerId: event.player_id,
      periodNumber: event.period_number,
      clockMs: event.clock_ms,
      notes: event.notes,
      sentiment: event.sentiment,
      createdAt: event.created_at
    };
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

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}