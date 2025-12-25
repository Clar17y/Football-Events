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
import { NaturalKeyResolver, NaturalKeyResolverError } from '../utils/naturalKeyResolver';
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
  // Quick-start create flow payload type placeholder for documentation
  public static QuickStartShape: any = {};

  private prisma: PrismaClient;
  private nkr: NaturalKeyResolver;

  constructor() {
    this.prisma = new PrismaClient();
    this.nkr = new NaturalKeyResolver(this.prisma);
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

    // Non-admin users can only see matches they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
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
          },
          homeTeam: {
            select: {
              id: true,
              name: true,
              home_kit_primary: true,
              home_kit_secondary: true,
              away_kit_primary: true,
              away_kit_secondary: true,
              logo_url: true,
              is_opponent: true
            }
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
              home_kit_primary: true,
              home_kit_secondary: true,
              away_kit_primary: true,
              away_kit_secondary: true,
              logo_url: true,
              is_opponent: true
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

    // Non-admin users can only see matches they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
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
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
          }
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
          }
        }
      }
    });

    return match ? transformMatch(match) : null;
  }

  async createMatch(data: MatchCreateRequest, userId: string, userRole: string): Promise<Match> {
    return withPrismaErrorHandling(async () => {
      // Validate ownership of season and teams (unless admin)
      if (userRole !== 'ADMIN') {
        const [homeTeam, awayTeam, season] = await Promise.all([
          this.prisma.team.findFirst({
            where: { id: data.homeTeamId, created_by_user_id: userId, is_deleted: false },
            select: { id: true }
          }),
          this.prisma.team.findFirst({
            where: { id: data.awayTeamId, created_by_user_id: userId, is_deleted: false },
            select: { id: true }
          }),
          this.prisma.seasons.findFirst({
            where: { season_id: data.seasonId, created_by_user_id: userId, is_deleted: false },
            select: { season_id: true }
          })
        ]);

        if (!homeTeam || !awayTeam) {
          const error = new Error('Access denied: You can only create matches using your own teams') as any;
          error.statusCode = 403;
          throw error;
        }

        if (!season) {
          const error = new Error('Access denied: You can only create matches in your own seasons') as any;
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
        createData: transformMatchCreateRequest(data, userId),
        userId,
        transformer: transformMatch,
        primaryKeyField: 'match_id'
      });

      // Ensure initial match state record exists (handles restored/soft-deleted records)
      await this.prisma.match_state.upsert({
        where: { match_id: match.id },
        update: {
          status: 'SCHEDULED',
          is_deleted: false,
          deleted_at: null,
          deleted_by_user_id: null,
          updated_at: new Date(),
        },
        create: {
          match_id: match.id,
          status: 'SCHEDULED',
          created_by_user_id: userId
        }
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

      if (userRole !== 'ADMIN') {
        const seasonId = data.seasonId ?? existingMatch.season_id;
        const homeTeamId = data.homeTeamId ?? existingMatch.home_team_id;
        const awayTeamId = data.awayTeamId ?? existingMatch.away_team_id;

        const [homeTeam, awayTeam, season] = await Promise.all([
          this.prisma.team.findFirst({
            where: { id: homeTeamId, created_by_user_id: userId, is_deleted: false },
            select: { id: true }
          }),
          this.prisma.team.findFirst({
            where: { id: awayTeamId, created_by_user_id: userId, is_deleted: false },
            select: { id: true }
          }),
          this.prisma.seasons.findFirst({
            where: { season_id: seasonId, created_by_user_id: userId, is_deleted: false },
            select: { season_id: true }
          })
        ]);

        if (!homeTeam || !awayTeam) {
          const error = new Error('Access denied: You can only use teams you own') as any;
          error.statusCode = 403;
          throw error;
        }

        if (!season) {
          const error = new Error('Access denied: You can only use seasons you own') as any;
          error.statusCode = 403;
          throw error;
        }
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
          },
          homeTeam: {
            select: {
              id: true,
              name: true,
              home_kit_primary: true,
              home_kit_secondary: true,
              away_kit_primary: true,
              away_kit_secondary: true,
              logo_url: true,
              is_opponent: true
            }
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
              home_kit_primary: true,
              home_kit_secondary: true,
              away_kit_primary: true,
              away_kit_secondary: true,
              logo_url: true,
              is_opponent: true
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

      // Soft delete the match and its match state
      await this.prisma.$transaction([
        this.prisma.match.update({
          where: { match_id: id },
          data: {
            is_deleted: true,
            deleted_at: new Date(),
            deleted_by_user_id: userId
          }
        }),
        this.prisma.match_state.updateMany({
          where: { match_id: id, is_deleted: false },
          data: {
            is_deleted: true,
            deleted_at: new Date(),
            deleted_by_user_id: userId
          }
        })
      ]);

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

    // Non-admin users can only see matches they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
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
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
          }
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
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

    // Non-admin users can only see matches they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
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
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
          }
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
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

    // Non-admin users can only see matches they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
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
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
          }
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
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

    // Non-admin users can only see matches they created
    if (userRole !== 'ADMIN') {
      where.created_by_user_id = userId;
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
        },
        homeTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
          }
        },
        awayTeam: {
          select: {
            id: true,
            name: true,
            home_kit_primary: true,
            home_kit_secondary: true,
            away_kit_primary: true,
            away_kit_secondary: true,
            logo_url: true,
              is_opponent: true
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
          logo_url: true,
              is_opponent: true
        }
      }),
      this.prisma.team.findUnique({
        where: { id: match.awayTeamId },
        select: {
          id: true,
          name: true,
          away_kit_primary: true,
          away_kit_secondary: true,
          logo_url: true,
              is_opponent: true
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

    if (!eventData?.teamId) {
      const error = new Error('Team ID is required for all events') as any;
      error.statusCode = 400;
      throw error;
    }

    if (eventData.teamId !== match.homeTeamId && eventData.teamId !== match.awayTeamId) {
      const error = new Error('Team does not belong to this match') as any;
      error.statusCode = 400;
      throw error;
    }

    if (eventData.playerId) {
      const playerTeam = await this.prisma.player_teams.findFirst({
        where: {
          team_id: eventData.teamId,
          player_id: eventData.playerId,
          is_active: true,
          is_deleted: false,
          player: { is_deleted: false }
        }
      });

      if (!playerTeam) {
        const error = new Error('Player does not belong to the specified team') as any;
        error.statusCode = 400;
        throw error;
      }
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

  async createQuickStartMatch(payload: any, userId: string, userRole: string): Promise<Match> {
    const {
      myTeamId,
      myTeamName,
      opponentName,
      isHome,
      kickoffTime,
      seasonId,
      seasonLabel,
      competition,
      venue,
      notes
    } = payload || {};

    if (userRole !== 'ADMIN' && !myTeamId && !myTeamName) {
      const err: any = new Error('Provide myTeamId or myTeamName');
      err.statusCode = 400;
      throw err;
    }

    // Resolve my team via NaturalKeyResolver (fallback to create)
    let resolvedMyTeamId: string | null = myTeamId || null;
    if (!resolvedMyTeamId && myTeamName) {
      try {
        resolvedMyTeamId = await this.nkr.resolveTeamByName(myTeamName, userId, userRole, { isOpponent: false });
      } catch (err: any) {
        if (err instanceof NaturalKeyResolverError && err.code === 'NOT_FOUND') {
          const created = await this.prisma.team.create({
            data: {
              name: String(myTeamName).trim(),
              is_opponent: false,
              created_by_user_id: userId
            }
          });
          resolvedMyTeamId = created.id;
        } else if (err instanceof NaturalKeyResolverError && err.code === 'MULTIPLE_MATCHES') {
          const e: any = new Error(`Multiple teams found for name: ${String(myTeamName).trim()}. Please use a unique team name.`);
          e.statusCode = 409;
          e.code = 'MULTIPLE_MATCHES';
          throw e;
        } else {
          throw err;
        }
      }
    }

    // Verify ownership of myTeamId for non-admin users
    if (userRole !== 'ADMIN' && resolvedMyTeamId) {
      const owned = await this.prisma.team.findFirst({
        where: {
          id: resolvedMyTeamId,
          created_by_user_id: userId,
          is_deleted: false
        }
      });
      if (!owned) {
        const err: any = new Error('Access denied: team ownership required');
        err.statusCode = 403;
        throw err;
      }
    }

    // Resolve opponent team via NaturalKeyResolver (scoped to user, fallback to create)
    const oppName = (opponentName && String(opponentName).trim()) || 'Unknown Opponent';
    let resolvedOpponentTeamId: string | null = null;
    try {
      resolvedOpponentTeamId = await this.nkr.resolveTeamByName(oppName, userId, userRole, { isOpponent: true });
    } catch (err: any) {
      if (err instanceof NaturalKeyResolverError && err.code === 'NOT_FOUND') {
        const createdOpp = await this.prisma.team.create({
          data: {
            name: oppName,
            is_opponent: true,
            created_by_user_id: userId
          }
        });
        resolvedOpponentTeamId = createdOpp.id;
      } else if (err instanceof NaturalKeyResolverError && err.code === 'MULTIPLE_MATCHES') {
        const e: any = new Error(`Multiple opponent teams found for name: ${oppName}. Please use a unique team name.`);
        e.statusCode = 409;
        e.code = 'MULTIPLE_MATCHES';
        throw e;
      } else {
        throw err;
      }
    }

    if (!resolvedMyTeamId || !resolvedOpponentTeamId) {
      const err: any = new Error('Failed to resolve teams for quick start');
      err.statusCode = 400;
      throw err;
    }

    // Determine home/away using isHome flag
    const homeId = isHome ? resolvedMyTeamId : resolvedOpponentTeamId;
    const awayId = isHome ? resolvedOpponentTeamId : resolvedMyTeamId;

    // Determine seasonId (support seasonLabel, fallback to current)
    let finalSeasonId: string | undefined = seasonId as string | undefined;
    if (!finalSeasonId) {
      if (seasonLabel && String(seasonLabel).trim()) {
        try {
          finalSeasonId = await this.nkr.resolveSeasonByLabel(String(seasonLabel).trim(), userId, userRole);
        } catch (err: any) {
          if (err.code === 'NOT_FOUND') {
            const e: any = new Error(`Season with label '${String(seasonLabel).trim()}' not found`);
            e.statusCode = 404;
            e.code = 'NOT_FOUND';
            throw e;
          }
          if (err.code === 'MULTIPLE_MATCHES') {
            const e: any = new Error(`Multiple seasons found for label '${String(seasonLabel).trim()}'`);
            e.statusCode = 409;
            e.code = 'MULTIPLE_MATCHES';
            throw e;
          }
          throw err;
        }
      } else {
        // Try to find current season for this user, else auto-create default
        const current = await this.prisma.seasons.findFirst({
          where: { is_current: true, is_deleted: false, created_by_user_id: userId },
          orderBy: { start_date: 'desc' }
        });
        if (current) {
          finalSeasonId = current.season_id;
        } else {
          // Auto-create based on current date (Aug 1 -> Jun 30 next year)
          const now = new Date();
          const m = now.getMonth();
          const startYear = m >= 7 ? now.getFullYear() : now.getFullYear() - 1;
          const endYear = startYear + 1;
          const startDate = new Date(startYear, 7, 1);
          const endDate = new Date(endYear, 5, 30);
          const label = `${startYear}-${endYear} Season`;

          let season = await this.prisma.seasons.findFirst({
            where: { label, created_by_user_id: userId, is_deleted: false }
          });
          if (!season) {
            season = await this.prisma.seasons.create({
              data: {
                label,
                start_date: startDate,
                end_date: endDate,
                is_current: true,
                description: 'Auto-created by Quick Start',
                created_by_user_id: userId
              }
            });
          } else if (!season.is_current) {
            season = await this.prisma.seasons.update({
              where: { season_id: season.season_id },
              data: { is_current: true }
            });
          }
          finalSeasonId = season.season_id;
        }
      }
    }

    // Create match (restore if soft-deleted with same unique constraint)
    const match = await createOrRestoreSoftDeleted({
      prisma: this.prisma,
      model: 'match',
      uniqueConstraints: SoftDeletePatterns.matchConstraint(homeId!, awayId!, new Date(kickoffTime || Date.now())),
      createData: {
        season_id: finalSeasonId!,
        kickoff_ts: new Date(kickoffTime || Date.now()),
        competition: competition ?? null,
        home_team_id: homeId!,
        away_team_id: awayId!,
        venue: venue ?? null,
        duration_mins: payload?.durationMinutes ?? 50,
        period_format: (payload?.periodFormat === 'half' ? 'half' : payload?.periodFormat === 'whole' ? 'whole' : 'quarter'),
        home_score: 0,
        away_score: 0,
        notes: notes ?? null,
        created_by_user_id: userId
      },
      userId,
      transformer: transformMatch,
      primaryKeyField: 'match_id'
    });

    // Ensure initial match_state exists (SCHEDULED) for the new/restored match
    try {
      await this.prisma.match_state.upsert({
        where: { match_id: match.id },
        update: {
          status: 'SCHEDULED',
          is_deleted: false,
          deleted_at: null,
          deleted_by_user_id: null,
          updated_at: new Date(),
        },
        create: {
          match_id: match.id,
          status: 'SCHEDULED',
          created_by_user_id: userId,
        }
      });
    } catch (err) {
      // Log and proceed; state can be created later by start/resume actions
      console.warn('createQuickStartMatch: failed to ensure match_state for', match.id, err);
    }

    return match;
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
