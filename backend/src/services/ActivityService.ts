import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ActivityItem {
  id: string;
  type: 'team' | 'player' | 'season' | 'match' | 'award' | 'event';
  action: string;
  description: string;
  entityId: string;
  entityName: string;
  createdAt: Date;
  metadata?: Record<string, any>;
}

export interface ActivityOptions {
  limit?: number;
  days?: number;
  page?: number;
}

export interface PaginatedActivityResponse {
  data: ActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class ActivityService {
  static async getRecentActivity(userId: string, options: ActivityOptions = {}): Promise<PaginatedActivityResponse> {
    const { limit = 20, days = 30, page = 1 } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const activities: ActivityItem[] = [];

    // Get recent teams
    const teams = await prisma.team.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        is_opponent: false, 
        created_at: {
          gte: cutoffDate
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    teams.forEach(team => {
      activities.push({
        id: `team-${team.id}`,
        type: 'team',
        action: 'created',
        description: `You created a team called "${team.name}"`,
        entityId: team.id,
        entityName: team.name,
        createdAt: team.created_at,
        metadata: {
          teamId: team.id,
          teamName: team.name
        }
      });
    });

    // Get recent players
    const players = await prisma.player.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        created_at: {
          gte: cutoffDate
        }
      },
      include: {
        player_teams: {
          where: {
            is_active: true,
            is_deleted: false
          },
          include: {
            team: {
              select: {
                name: true
              }
            }
          },
          take: 1
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    players.forEach(player => {
      const currentTeam = player.player_teams[0];
      const teamName = currentTeam?.team?.name;
      const description = teamName
        ? `You added player "${player.name}" to ${teamName}`
        : `You created player "${player.name}"`;

      activities.push({
        id: `player-${player.id}`,
        type: 'player',
        action: 'created',
        description,
        entityId: player.id,
        entityName: player.name,
        createdAt: player.created_at,
        metadata: {
          playerId: player.id,
          playerName: player.name,
          teamId: currentTeam?.team_id,
          teamName
        }
      });
    });

    // Get recent seasons
    const seasons = await prisma.seasons.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        created_at: {
          gte: cutoffDate
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    seasons.forEach(season => {
      activities.push({
        id: `season-${season.season_id}`,
        type: 'season',
        action: 'created',
        description: `You created a season called "${season.label}"`,
        entityId: season.season_id,
        entityName: season.label,
        createdAt: season.created_at,
        metadata: {
          seasonId: season.season_id,
          seasonLabel: season.label,
          startDate: season.start_date,
          endDate: season.end_date,
          isCurrent: season.is_current
        }
      });
    });

    // Get recent matches
    const matches = await prisma.match.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        created_at: {
          gte: cutoffDate
        }
      },
      include: {
        homeTeam: {
          select: { name: true }
        },
        awayTeam: {
          select: { name: true }
        },
        seasons: {
          select: { label: true }
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    matches.forEach(match => {
      const description = `You scheduled a match: ${match.homeTeam.name} vs ${match.awayTeam.name}`;

      activities.push({
        id: `match-${match.match_id}`,
        type: 'match',
        action: 'created',
        description,
        entityId: match.match_id,
        entityName: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
        createdAt: match.created_at,
        metadata: {
          matchId: match.match_id,
          homeTeam: match.homeTeam.name,
          awayTeam: match.awayTeam.name,
          kickoffTime: match.kickoff_ts,
          seasonLabel: match.seasons.label,
          homeScore: (match as any).home_score,
          awayScore: (match as any).away_score
        }
      });
    });

    // Get recent awards
    const awards = await prisma.awards.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        created_at: {
          gte: cutoffDate
        }
      },
      include: {
        players: {
          select: { name: true }
        },
        seasons: {
          select: { label: true }
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    awards.forEach(award => {
      const description = `You gave "${award.category}" award to ${award.players.name}`;

      activities.push({
        id: `award-${award.award_id}`,
        type: 'award',
        action: 'created',
        description,
        entityId: award.award_id,
        entityName: `${award.category} - ${award.players.name}`,
        createdAt: award.created_at,
        metadata: {
          awardId: award.award_id,
          category: award.category,
          playerId: award.player_id,
          playerName: award.players.name,
          seasonLabel: award.seasons.label,
          notes: award.notes
        }
      });
    });

    // Get recent match events (goals, assists, etc.)
    const events = await prisma.event.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        created_at: {
          gte: cutoffDate
        }
      },
      include: {
        matches: {
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } }
          }
        },
        teams: {
          select: { name: true }
        }
      },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    events.forEach(event => {
      const teamName = event.teams?.name || 'Unknown Team';
      const matchName = `${event.matches.homeTeam.name} vs ${event.matches.awayTeam.name}`;

      let actionText: string = event.kind;
      switch (event.kind) {
        case 'goal':
          actionText = 'scored a goal';
          break;
        case 'assist':
          actionText = 'made an assist';
          break;
        case 'save':
          actionText = 'made a save';
          break;
        case 'foul':
          actionText = 'committed a foul';
          break;
        default:
          actionText = event.kind.replace('_', ' ');
      }

      const description = `A ${event.kind} occurred in ${matchName}`;

      activities.push({
        id: `event-${event.id}`,
        type: 'event',
        action: event.kind,
        description,
        entityId: event.id,
        entityName: `${event.kind} - ${matchName}`,
        createdAt: event.created_at,
        metadata: {
          eventId: event.id,
          eventKind: event.kind,
          playerId: event.player_id,
          teamId: event.team_id,
          teamName,
          matchId: event.match_id,
          matchName,
          periodNumber: event.period_number,
          clockMs: event.clock_ms,
          sentiment: event.sentiment,
          notes: event.notes
        }
      });
    });

    // Sort all activities by creation date (most recent first)
    const sortedActivities = activities
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const total = sortedActivities.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedActivities = sortedActivities.slice(offset, offset + limit);

    return {
      data: paginatedActivities,
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
}
