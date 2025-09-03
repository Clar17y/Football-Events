import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ActivityItem {
  id: string;
  type: 'team' | 'player' | 'season' | 'match' | 'award' | 'event' | 'lineup';
  action: string;
  description: string;
  title?: string;
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
      const title = `New club: ${team.name}.`;
      activities.push({
        id: `team-${team.id}`,
        type: 'team',
        action: 'created',
        description: title,
        title,
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
      const title = teamName
        ? `${teamName} signs ${player.name}.`
        : `New player ${player.name} looking for a team.`;

      activities.push({
        id: `player-${player.id}`,
        type: 'player',
        action: 'created',
        description: title,
        title,
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
      const title = `Season ${season.label} kicks off.`;
      activities.push({
        id: `season-${season.season_id}`,
        type: 'season',
        action: 'created',
        description: title,
        title,
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
      const title = `Fixture set: ${match.homeTeam.name} vs ${match.awayTeam.name}.`;
      activities.push({
        id: `match-${match.match_id}`,
        type: 'match',
        action: 'created',
        description: title,
        title,
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
      const title = `${award.players.name} earns ${award.category}.`;
      activities.push({
        id: `award-${award.award_id}`,
        type: 'award',
        action: 'created',
        description: title,
        title,
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

    // Period-based grouping: one highlight item per finished period
    const finishedPeriods = await prisma.match_periods.findMany({
      where: {
        is_deleted: false,
        ended_at: { not: null, gte: cutoffDate }
      },
      include: {
        match: {
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } }
          }
        }
      },
      orderBy: { ended_at: 'desc' },
      take: Math.max(limit * 3, 30)
    });

    for (const period of finishedPeriods) {
      // Only include periods for matches owned by the user
      const matchOwner = await prisma.match.findFirst({
        where: { match_id: period.match_id, created_by_user_id: userId, is_deleted: false },
        select: { match_id: true }
      });
      if (!matchOwner) continue;

      // Collect events for this period
      const periodEvents = await prisma.event.findMany({
        where: {
          match_id: period.match_id,
          period_number: period.period_number,
          is_deleted: false,
          created_by_user_id: userId
        },
        include: { teams: { select: { name: true } } },
        orderBy: { created_at: 'asc' }
      });
      if (periodEvents.length === 0) continue;

      // Suppress penalty if followed by goal within 60s inside this period
      const suppressSet = new Set<string>();
      for (let i = 0; i < periodEvents.length; i++) {
        const ev = periodEvents[i];
        if (ev.kind !== 'penalty') continue;
        for (let j = i + 1; j < periodEvents.length; j++) {
          const next = periodEvents[j];
          const dt = next.created_at.getTime() - ev.created_at.getTime();
          if (dt > 60 * 1000) break;
          if (next.kind === 'goal') { suppressSet.add(ev.id); break; }
        }
      }

      const allowedKinds = new Set([
        'goal', 'own_goal', 'assist', 'save', 'interception', 'tackle', 'foul', 'penalty', 'free_kick', 'key_pass',
        'shot_on', 'shot_off', 'yellow_card', 'red_card'
      ]);

      const included = periodEvents.filter(e => allowedKinds.has(e.kind) && !suppressSet.has(e.id));
      if (included.length === 0) continue;

      const home = period.match.homeTeam.name;
      const away = period.match.awayTeam.name;
      const matchName = `${home} vs ${away}`;
      // Determine friendly period label (Q1/Q2... or 1st/2nd Half)
      let periodLabel = `Period ${period.period_number}`;
      let maxReg = 0;
      try {
        const allRegular = await prisma.match_periods.findMany({
          where: { match_id: period.match_id, period_type: 'REGULAR', is_deleted: false },
          select: { period_number: true }
        });
        maxReg = allRegular.length ? Math.max(...allRegular.map(p => p.period_number)) : 0;
        if (period.period_type === 'REGULAR') {
          if (maxReg >= 4) periodLabel = `Q${period.period_number}`;
          else if (maxReg >= 2) periodLabel = period.period_number === 1 ? '1st Half' : (period.period_number === 2 ? '2nd Half' : `Half ${period.period_number}`);
        } else if (period.period_type === 'EXTRA_TIME') {
          periodLabel = `Extra Time ${period.period_number}`;
        } else if (period.period_type === 'PENALTY_SHOOTOUT') {
          periodLabel = `Penalty Shootout`;
        }
      } catch {}
      const title = `${periodLabel} highlights: ${matchName} — ${included.length} moments`;

      // Build children (clickable moments) titles with safe fallbacks
      const childPlayerIds = Array.from(new Set(included.map(e => e.player_id).filter(Boolean))) as string[];
      const childPlayersMap: Record<string, string> = {};
      if (childPlayerIds.length) {
        const p2 = await prisma.player.findMany({ where: { id: { in: childPlayerIds } }, select: { id: true, name: true } });
        for (const pl of p2) childPlayersMap[pl.id] = pl.name;
      }
      const formatTime = (ev: any): string => {
        const ms = Math.max(0, ev.clock_ms || 0);
        const minute = Math.floor(ms / 60000);
        if (period.period_type === 'PENALTY_SHOOTOUT') return 'PK';
        let base = minute;
        let regLen = 0;
        if (period.period_type === 'EXTRA_TIME') {
          regLen = 15;
        } else if (period.period_type === 'REGULAR') {
          if (maxReg >= 4) regLen = 15; // quarters
          else if (maxReg >= 2) regLen = 45; // halves
        }
        if (regLen > 0 && minute > regLen) {
          const added = minute - regLen;
          return `${regLen}'+${added}`;
        }
        return `${base}'`;
      };
      const children = included.map(ev => {
        const teamName = ev.teams?.name || undefined;
        const opponent = teamName ? (teamName === home ? away : home) : undefined;
        const playerName = ev.player_id ? (childPlayersMap[ev.player_id] || undefined) : undefined;
        const senti = ev.sentiment || 0;
        const high = senti >= 3;
        let t: string;
        switch (ev.kind) {
          case 'goal':
            if (playerName && teamName && opponent) t = `${high ? 'Great goal' : 'Goal'}! ${playerName} for ${teamName} vs ${opponent}.`;
            else if (teamName && opponent) t = `${high ? 'Great goal' : 'Goal'}! ${teamName} vs ${opponent}.`;
            else t = `${high ? 'Great goal' : 'Goal'}!`;
            break;
          case 'own_goal':
            if (playerName && opponent) t = `Own goal! ${playerName} into ${opponent}'s net.`;
            else if (teamName) t = `Own goal by ${teamName}.`;
            else t = `Own goal!`;
            break;
          case 'assist':
            if (playerName && teamName) t = `Assist: ${playerName} for ${teamName}.`;
            else if (teamName) t = `Assist for ${teamName}.`;
            else t = `Assist recorded.`;
            break;
          case 'save':
            if (playerName && teamName) t = `Big save by ${playerName} for ${teamName}.`;
            else if (teamName) t = `Big save for ${teamName}.`;
            else t = `Big save.`;
            break;
          case 'penalty':
            t = teamName ? `Penalty to ${teamName}.` : `Penalty awarded.`;
            break;
          case 'free_kick':
            t = teamName ? `Free kick to ${teamName}.` : `Free kick awarded.`;
            break;
          case 'key_pass':
            if (playerName && teamName) t = `Key pass by ${playerName} for ${teamName}.`;
            else if (teamName) t = `Key pass for ${teamName}.`;
            else t = `Key pass.`;
            break;
          case 'interception':
            if (playerName && teamName) t = `${playerName} breaks up play for ${teamName}.`;
            else if (teamName) t = `Interception for ${teamName}.`;
            else t = `Interception.`;
            break;
          case 'tackle':
            if (playerName && teamName) t = `${playerName} with a strong tackle for ${teamName}.`;
            else if (teamName) t = `Strong tackle for ${teamName}.`;
            else t = `Strong tackle.`;
            break;
          case 'foul':
            t = playerName ? `Foul by ${playerName}.` : (teamName ? `Foul by ${teamName}.` : `Foul committed.`);
            break;
          case 'shot_on':
            t = playerName && teamName ? `${playerName} tests the keeper for ${teamName}.` : (teamName ? `Shot on target for ${teamName}.` : `Shot on target.`);
            break;
          case 'shot_off':
            t = playerName && teamName ? `${playerName} fires wide for ${teamName}.` : (teamName ? `Shot off target for ${teamName}.` : `Shot off target.`);
            break;
          case 'yellow_card':
            t = playerName ? `Yellow card for ${playerName}.` : (teamName ? `Yellow card to ${teamName}.` : `Yellow card shown.`);
            break;
          case 'red_card':
            t = playerName ? `Red card for ${playerName}.` : (teamName ? `Red card to ${teamName}.` : `Red card shown.`);
            break;
          default:
            t = `${ev.kind.replace('_', ' ')}.`;
        }
        return {
          id: ev.id,
          kind: ev.kind,
          title: t,
          createdAt: ev.created_at,
          teamId: ev.team_id,
          playerId: ev.player_id,
          timeLabel: formatTime(ev)
        };
      });

      activities.push({
        id: `period-${period.id}`,
        type: 'event',
        action: 'period_summary',
        description: title,
        title,
        entityId: period.match_id,
        entityName: matchName,
        createdAt: period.ended_at || period.created_at,
        metadata: {
          matchId: period.match_id,
          matchName,
          homeTeam: home,
          awayTeam: away,
          periodNumber: period.period_number,
          periodType: period.period_type,
          count: included.length,
          children
        }
      });
    }

    // Include default lineup updates/creations
    const defaultLineups = await prisma.default_lineups.findMany({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        OR: [
          { updated_at: { gte: cutoffDate } },
          { created_at: { gte: cutoffDate } }
        ]
      },
      include: {
        team: { select: { name: true } }
      },
      orderBy: [
        { updated_at: 'desc' },
        { created_at: 'desc' }
      ],
      take: limit
    });

    defaultLineups.forEach(dl => {
      const ts = dl.updated_at || dl.created_at;
      const action = dl.updated_at ? 'updated' : 'created';
      const teamName = dl.team?.name || 'Unknown Team';
      activities.push({
        id: `lineup-${dl.id}`,
        type: 'lineup',
        action,
        description: `Default lineup ${action} for ${teamName}.`,
        title: `Default lineup ${action} for ${teamName}.`,
        entityId: dl.team_id,
        entityName: teamName,
        createdAt: ts,
        metadata: {
          teamId: dl.team_id,
          teamName
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
