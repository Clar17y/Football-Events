import type { PrismaClient } from '@prisma/client';
import { createApiError } from '../utils/apiError';
import { CORE_EVENT_KINDS, ALL_EVENT_KINDS } from '@shared/types/limits';

export type PlanType = 'free' | 'premium';

export type Limits = {
  ownedTeams: number;
  totalPlayers: number;
  playersPerOwnedTeam: number;
  seasons: number | null;
  matchesPerSeason: number | null;
  /** Non-scoring events per match (goals/own goals excluded) */
  eventsPerMatch: number;
  formationChangesPerMatch: number;
  /** Active (non-expired) viewer links */
  activeShareLinks: number | null;
};

export type Features = {
  analyticsDashboard: boolean;
  csvExport: boolean;
};

export type Usage = {
  ownedTeams: number;
  opponentTeams: number;
  seasons: number;
  activeShareLinks: number;
  playersByTeam: Record<string, number>;
};

const HARD_CAPS = {
  ownedTeams: 100,
  opponentTeams: 5000,
  totalTeams: 6000,
  totalPlayers: 1000,
  seasons: 200,
  matchesPerSeason: 2000,
  activeShareLinks: 10000,
  totalEventsPerMatch: 10000,
  formationChangesPerMatch: 500,
  playersPerTeam: 500,
} as const;

const PLAN_QUOTAS_ENABLED = process.env['ENABLE_QUOTAS'] !== 'false';

const LIMITS_BY_PLAN: Record<PlanType, Limits> = {
  free: {
    ownedTeams: 1,
    totalPlayers: 30,
    playersPerOwnedTeam: 20,
    seasons: 5,
    matchesPerSeason: 30,
    eventsPerMatch: 40,
    formationChangesPerMatch: 5,
    activeShareLinks: 1,
  },
  premium: {
    ownedTeams: 5,
    totalPlayers: 200,
    playersPerOwnedTeam: 40,
    seasons: null,
    matchesPerSeason: null,
    eventsPerMatch: 150,
    formationChangesPerMatch: 20,
    activeShareLinks: null,
  },
};

const FEATURES_BY_PLAN: Record<PlanType, Features> = {
  free: { analyticsDashboard: false, csvExport: false },
  premium: { analyticsDashboard: true, csvExport: true },
};

const isScoringEventKind = (kind: string): boolean => kind === 'goal' || kind === 'own_goal';

export class QuotaService {
  constructor(private prisma: PrismaClient) { }

  async getPlanType(userId: string, userRole?: string): Promise<PlanType> {
    if (userRole === 'ADMIN') return 'premium';
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { subscription_tier: true },
    });
    const tier = (user?.subscription_tier as string | undefined) ?? 'free';
    return tier === 'premium' ? 'premium' : 'free';
  }

  getLimits(planType: PlanType): Limits {
    return LIMITS_BY_PLAN[planType];
  }

  getAllowedEventKinds(planType: PlanType): string[] {
    return (planType === 'premium' ? ALL_EVENT_KINDS : CORE_EVENT_KINDS) as unknown as string[];
  }

  getFeatures(planType: PlanType): Features {
    return FEATURES_BY_PLAN[planType];
  }

  async getUsage(userId: string, userRole?: string): Promise<Usage> {
    const [ownedTeams, opponentTeams, seasons, activeShareLinks, ownedTeamIds] = await Promise.all([
      this.prisma.team.count({
        where: { created_by_user_id: userId, is_deleted: false, is_opponent: false }
      }),
      this.prisma.team.count({
        where: { created_by_user_id: userId, is_deleted: false, is_opponent: true }
      }),
      this.prisma.seasons.count({
        where: { created_by_user_id: userId, is_deleted: false }
      }),
      this.prisma.viewer_links.count({
        where: {
          created_by_user_id: userId,
          is_deleted: false,
          expires_at: { gt: new Date() }
        }
      }),
      this.prisma.team.findMany({
        where: { created_by_user_id: userId, is_deleted: false, is_opponent: false },
        select: { id: true }
      }),
    ]);

    const ownedTeamIdList = ownedTeamIds.map((t) => t.id);
    const playersByTeam: Record<string, number> = {};
    if (ownedTeamIdList.length > 0) {
      // Avoid N+1 queries by grouping counts per team.
      const grouped = await (this.prisma as any).player_teams.groupBy({
        by: ['team_id'],
        _count: { _all: true },
        where: {
          team_id: { in: ownedTeamIdList },
          is_deleted: false,
          is_active: true,
          player: { is_deleted: false }
        }
      });

      for (const row of grouped as any[]) {
        const teamId = row.team_id as string;
        const count =
          typeof row?._count === 'number'
            ? (row._count as number)
            : typeof row?._count?._all === 'number'
              ? (row._count._all as number)
              : 0;
        playersByTeam[teamId] = count;
      }
    }

    for (const teamId of ownedTeamIdList) {
      if (playersByTeam[teamId] == null) playersByTeam[teamId] = 0;
    }

    // userRole currently only affects plan resolution; usage is user-scoped.
    void userRole;

    return { ownedTeams, opponentTeams, seasons, activeShareLinks, playersByTeam };
  }

  async assertCanCreateTeam(params: { userId: string; userRole: string; isOpponent: boolean }): Promise<void> {
    const { userId, userRole, isOpponent } = params;
    const [ownedTeams, opponentTeams] = await Promise.all([
      this.prisma.team.count({ where: { created_by_user_id: userId, is_deleted: false, is_opponent: false } }),
      this.prisma.team.count({ where: { created_by_user_id: userId, is_deleted: false, is_opponent: true } }),
    ]);
    const totalTeams = ownedTeams + opponentTeams;

    if (totalTeams >= HARD_CAPS.totalTeams) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Team limit reached (safety cap)',
        details: { entity: 'teams', limit: HARD_CAPS.totalTeams, current: totalTeams, planType: await this.getPlanType(userId, userRole) }
      });
    }

    if (isOpponent) {
      if (opponentTeams >= HARD_CAPS.opponentTeams) {
        throw createApiError({
          statusCode: 402,
          code: 'QUOTA_EXCEEDED',
          message: 'Opponent team limit reached (safety cap)',
          details: { entity: 'opponentTeams', limit: HARD_CAPS.opponentTeams, current: opponentTeams, planType: await this.getPlanType(userId, userRole) }
        });
      }
      return;
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    const planType = await this.getPlanType(userId, userRole);
    const limits = this.getLimits(planType);

    if (ownedTeams >= HARD_CAPS.ownedTeams) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Team limit reached (safety cap)',
        details: { entity: 'ownedTeams', limit: HARD_CAPS.ownedTeams, current: ownedTeams, planType }
      });
    }

    if (ownedTeams >= limits.ownedTeams) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Owned team limit reached for your plan',
        details: { entity: 'ownedTeams', limit: limits.ownedTeams, current: ownedTeams, planType }
      });
    }
  }

  async assertCanCreateSeason(params: { userId: string; userRole: string }): Promise<void> {
    const { userId, userRole } = params;
    const planType = await this.getPlanType(userId, userRole);
    const limits = this.getLimits(planType);

    const seasons = await this.prisma.seasons.count({ where: { created_by_user_id: userId, is_deleted: false } });

    if (seasons >= HARD_CAPS.seasons) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Season limit reached (safety cap)',
        details: { entity: 'seasons', limit: HARD_CAPS.seasons, current: seasons, planType }
      });
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    if (limits.seasons != null && seasons >= limits.seasons) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Season limit reached for your plan',
        details: { entity: 'seasons', limit: limits.seasons, current: seasons, planType }
      });
    }
  }

  async assertCanCreateMatch(params: { userId: string; userRole: string; seasonId: string }): Promise<void> {
    const { userId, userRole, seasonId } = params;
    const planType = await this.getPlanType(userId, userRole);
    const limits = this.getLimits(planType);

    const matchesInSeason = await this.prisma.match.count({
      where: { created_by_user_id: userId, season_id: seasonId, is_deleted: false }
    });

    if (matchesInSeason >= HARD_CAPS.matchesPerSeason) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Match limit reached (safety cap)',
        details: { entity: 'matchesPerSeason', limit: HARD_CAPS.matchesPerSeason, current: matchesInSeason, planType }
      });
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    if (limits.matchesPerSeason != null && matchesInSeason >= limits.matchesPerSeason) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Match limit reached for your plan',
        details: { entity: 'matchesPerSeason', limit: limits.matchesPerSeason, current: matchesInSeason, planType }
      });
    }
  }

  async assertCanCreateEvent(params: { userId: string; userRole: string; matchId: string; kind: string }): Promise<void> {
    const { userId, userRole, matchId, kind } = params;
    const planType = await this.getPlanType(userId, userRole);

    const totalEvents = await this.prisma.event.count({ where: { match_id: matchId, is_deleted: false } });
    if (totalEvents >= HARD_CAPS.totalEventsPerMatch) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Event limit reached (safety cap)',
        details: { entity: 'eventsPerMatchHardCap', limit: HARD_CAPS.totalEventsPerMatch, current: totalEvents, planType }
      });
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    const limits = this.getLimits(planType);
    const allowed = new Set(this.getAllowedEventKinds(planType));

    if (!allowed.has(kind)) {
      throw createApiError({
        statusCode: 402,
        code: 'FEATURE_LOCKED',
        message: 'This event type is not available on your plan',
        details: { entity: 'eventKind', kind, planType }
      });
    }

    // Goals/own goals are always allowed and are excluded from the per-match capped event count.
    if (isScoringEventKind(kind)) return;

    // formation_change events are capped separately.
    if (kind === 'formation_change') {
      await this.assertCanApplyFormationChange({ userId, userRole, matchId });
      return;
    }

    const countedEvents = await this.prisma.event.count({
      where: {
        match_id: matchId,
        is_deleted: false,
        kind: { notIn: ['goal' as any, 'own_goal' as any, 'formation_change' as any] }
      }
    });

    if (countedEvents >= limits.eventsPerMatch) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Event limit reached for this match on your plan',
        details: { entity: 'eventsPerMatch', limit: limits.eventsPerMatch, current: countedEvents, planType }
      });
    }
  }

  async assertCanUpdateEventKind(params: { userId: string; userRole: string; matchId: string; existingKind: string; nextKind: string }): Promise<void> {
    if (!PLAN_QUOTAS_ENABLED) return;
    const { userId, userRole, matchId, existingKind, nextKind } = params;

    // If kind isn't changing in a way that affects quotas, defer to create checks.
    if (existingKind === nextKind) return;

    // Allowed kind check (plan upgrade gate)
    const planType = await this.getPlanType(userId, userRole);
    const allowed = new Set(this.getAllowedEventKinds(planType));
    if (!allowed.has(nextKind)) {
      throw createApiError({
        statusCode: 402,
        code: 'FEATURE_LOCKED',
        message: 'This event type is not available on your plan',
        details: { entity: 'eventKind', kind: nextKind, planType }
      });
    }

    if (nextKind === 'formation_change') {
      await this.assertCanApplyFormationChange({ userId, userRole, matchId });
      return;
    }

    // If we moved from scoring/formation_change -> non-scoring, we need to ensure the cap still holds.
    const existingCounted = !(isScoringEventKind(existingKind) || existingKind === 'formation_change');
    const nextCounted = !(isScoringEventKind(nextKind) || nextKind === 'formation_change');
    if (existingCounted || !nextCounted) return;

    const limits = this.getLimits(planType);

    // Count current capped events excluding the event being updated (it was not counted before, but will be now).
    const countedEvents = await this.prisma.event.count({
      where: {
        match_id: matchId,
        is_deleted: false,
        kind: { notIn: ['goal' as any, 'own_goal' as any, 'formation_change' as any] }
      }
    });

    if (countedEvents >= limits.eventsPerMatch) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Event limit reached for this match on your plan',
        details: { entity: 'eventsPerMatch', limit: limits.eventsPerMatch, current: countedEvents, planType }
      });
    }
  }

  async assertCanApplyFormationChange(params: { userId: string; userRole: string; matchId: string }): Promise<void> {
    const { userId, userRole, matchId } = params;
    const planType = await this.getPlanType(userId, userRole);
    const limits = this.getLimits(planType);

    const formationChanges = await this.prisma.event.count({
      where: { match_id: matchId, is_deleted: false, kind: 'formation_change' as any }
    });

    if (formationChanges >= HARD_CAPS.formationChangesPerMatch) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Formation change limit reached (safety cap)',
        details: { entity: 'formationChangesPerMatch', limit: HARD_CAPS.formationChangesPerMatch, current: formationChanges, planType }
      });
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    if (formationChanges >= limits.formationChangesPerMatch) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Formation change limit reached for this match on your plan',
        details: { entity: 'formationChangesPerMatch', limit: limits.formationChangesPerMatch, current: formationChanges, planType }
      });
    }
  }

  async assertCanCreateViewerLink(params: { userId: string; userRole: string }): Promise<void> {
    const { userId, userRole } = params;
    const planType = await this.getPlanType(userId, userRole);
    const limits = this.getLimits(planType);

    const activeLinks = await this.prisma.viewer_links.count({
      where: {
        created_by_user_id: userId,
        is_deleted: false,
        expires_at: { gt: new Date() }
      }
    });

    if (activeLinks >= HARD_CAPS.activeShareLinks) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Share link limit reached (safety cap)',
        details: { entity: 'activeShareLinks', limit: HARD_CAPS.activeShareLinks, current: activeLinks, planType }
      });
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    if (limits.activeShareLinks != null && activeLinks >= limits.activeShareLinks) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Share link limit reached for your plan',
        details: { entity: 'activeShareLinks', limit: limits.activeShareLinks, current: activeLinks, planType }
      });
    }
  }

  async assertCanCreatePlayer(params: { userId: string; userRole: string }): Promise<void> {
    const { userId, userRole } = params;
    const planType = await this.getPlanType(userId, userRole);
    const limits = this.getLimits(planType);

    const totalPlayers = await this.prisma.player.count({
      where: { created_by_user_id: userId, is_deleted: false }
    });

    if (totalPlayers >= HARD_CAPS.totalPlayers) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Player limit reached (safety cap)',
        details: { entity: 'totalPlayers', limit: HARD_CAPS.totalPlayers, current: totalPlayers, planType }
      });
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    if (totalPlayers >= limits.totalPlayers) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Player limit reached for your plan',
        details: { entity: 'totalPlayers', limit: limits.totalPlayers, current: totalPlayers, planType }
      });
    }
  }

  async assertCanAddPlayerToTeam(params: { userId: string; userRole: string; teamId: string; teamIsOpponent: boolean }): Promise<void> {
    const { userId, userRole, teamId, teamIsOpponent } = params;
    const planType = await this.getPlanType(userId, userRole);
    const limits = this.getLimits(planType);

    const players = await this.prisma.player_teams.count({
      where: {
        team_id: teamId,
        is_deleted: false,
        is_active: true,
        player: { is_deleted: false }
      }
    });

    if (players >= HARD_CAPS.playersPerTeam) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Player limit reached (safety cap)',
        details: { entity: 'playersPerTeam', limit: HARD_CAPS.playersPerTeam, current: players, planType }
      });
    }

    if (!PLAN_QUOTAS_ENABLED) return;

    // Plan limit applies to owned teams; opponent rosters are limited only by hard cap.
    if (teamIsOpponent) return;

    if (players >= limits.playersPerOwnedTeam) {
      throw createApiError({
        statusCode: 402,
        code: 'QUOTA_EXCEEDED',
        message: 'Player limit reached for this team on your plan',
        details: { entity: 'playersPerOwnedTeam', limit: limits.playersPerOwnedTeam, current: players, planType }
      });
    }
  }
}
