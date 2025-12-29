import { PrismaClient } from '@prisma/client';
// Import transformer functions directly
const transformMatchState = (prismaMatchState: any): any => ({
  id: prismaMatchState.id,
  matchId: prismaMatchState.match_id,
  status: prismaMatchState.status, // Now using enum values (SCHEDULED, LIVE, etc.)
  currentPeriod: prismaMatchState.current_period || undefined,
  currentPeriodType: prismaMatchState.current_period_type || undefined,
  matchStartedAt: prismaMatchState.match_started_at || undefined,
  matchEndedAt: prismaMatchState.match_ended_at || undefined,
  totalElapsedSeconds: prismaMatchState.total_elapsed_seconds,
  createdAt: prismaMatchState.created_at,
  updatedAt: prismaMatchState.updated_at || undefined,
  created_by_user_id: prismaMatchState.created_by_user_id,
  deleted_at: prismaMatchState.deleted_at || undefined,
  deleted_by_user_id: prismaMatchState.deleted_by_user_id || undefined,
  is_deleted: prismaMatchState.is_deleted,
});

const safeTransformMatchState = (prismaMatchState: any): any =>
  prismaMatchState ? transformMatchState(prismaMatchState) : null;
import type { MatchState } from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { cache, CacheKeys, CacheTTL } from '../utils/cache';

export interface MatchStateTransitionOptions {
  reason?: string;
}

export class MatchStateService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Valid state transitions mapping
   */
  private static readonly VALID_TRANSITIONS = {
    'SCHEDULED': ['LIVE', 'CANCELLED', 'POSTPONED'],
    'LIVE': ['PAUSED', 'COMPLETED'],
    'PAUSED': ['LIVE', 'COMPLETED', 'CANCELLED'],
    'COMPLETED': [], // Final state
    'CANCELLED': [], // Final state
    'POSTPONED': ['SCHEDULED'] // Can be rescheduled
  };

  /**
   * Validate if a state transition is allowed
   */
  private validateStateTransition(currentStatus: string, newStatus: string): boolean {
    const allowedTransitions = MatchStateService.VALID_TRANSITIONS[currentStatus as keyof typeof MatchStateService.VALID_TRANSITIONS] as readonly string[] | undefined;
    return allowedTransitions?.includes(newStatus) || false;
  }

  /**
   * Check if user has permission to modify match state
   */
  private async validateUserPermission(matchId: string, userId: string, userRole: string): Promise<boolean> {
    if (userRole === 'ADMIN') {
      return true;
    }

    // Check if user created the match
    const match = await this.prisma.match.findFirst({
      where: {
        match_id: matchId,
        is_deleted: false,
        created_by_user_id: userId
      }
    });

    if (!match) {
      return false;
    }

    return match.created_by_user_id === userId;
  }

  /**
   * Start a match - transition from scheduled to live
   */
  async startMatch(matchId: string, userId: string, userRole: string): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to start this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Perform state transition and initial period creation atomically
      const updatedState = await this.prisma.$transaction(async (tx) => {
        // Get or create match state
        let matchState = await tx.match_state.findFirst({
          where: { match_id: matchId, is_deleted: false }
        });

        if (!matchState) {
          // Create initial match state
          matchState = await tx.match_state.create({
            data: {
              match_id: matchId,
              status: 'SCHEDULED',
              created_by_user_id: userId
            }
          });
        }

        // Validate state transition
        if (!this.validateStateTransition(matchState.status, 'LIVE')) {
          const error = new Error(`Cannot start match: invalid transition from ${matchState.status} to LIVE`) as any;
          error.statusCode = 400;
          throw error;
        }

        // Update match state to LIVE
        let liveState = await tx.match_state.update({
          where: { id: matchState.id },
          data: {
            status: 'LIVE',
            match_started_at: new Date(),
            active_since: new Date(),
            updated_at: new Date()
          }
        });

        // If no periods exist yet for this match, create the first regular period
        const existingPeriodsCount = await tx.match_periods.count({
          where: { match_id: matchId, is_deleted: false }
        });

        if (existingPeriodsCount === 0) {
          // Create first regular period (period_number = 1)
          await tx.match_periods.create({
            data: {
              match_id: matchId,
              period_number: 1,
              period_type: 'REGULAR',
              started_at: new Date(),
              created_by_user_id: userId
            }
          });

          // Reflect current period on match_state
          liveState = await tx.match_state.update({
            where: { id: liveState.id },
            data: {
              current_period: 1,
              current_period_type: 'REGULAR',
              active_since: new Date(),
              updated_at: new Date()
            }
          });
        }

        return liveState;
      });

      // Invalidate cache for this match
      this.invalidateMatchCache(matchId, userId, userRole);

      const result = transformMatchState(updatedState);
      // Final score recompute/persist
      try {
        const { ScoreService } = await import('./ScoreService');
        await ScoreService.recomputeAndPersistScore(this.prisma as any, matchId);
      } catch {}
      // Broadcast SSE state change
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(matchId, 'state_changed', {
          status: result.status,
          currentPeriod: result.currentPeriod,
          currentPeriodType: result.currentPeriodType,
          matchStartedAt: result.matchStartedAt,
          totalElapsedSeconds: result.totalElapsedSeconds,
        });
        // Also broadcast period_started if there's an active period
        const active = await this.prisma.match_periods.findFirst({
          where: { match_id: matchId, started_at: { not: null }, ended_at: null, is_deleted: false },
          select: { id: true, period_number: true, period_type: true, started_at: true }
        });
        if (active) {
          sseHub.broadcast(matchId, 'period_started', { period: {
            id: active.id,
            periodNumber: active.period_number,
            periodType: active.period_type,
            startedAt: active.started_at?.toISOString?.() || null,
          }});
        }
      } catch {}
      return result;
    }, 'MatchState');
  }

  /**
   * Pause a live match
   */
  async pauseMatch(matchId: string, userId: string, userRole: string, _options?: MatchStateTransitionOptions): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission first
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to pause this match') as any;
        error.statusCode = 403;
        throw error;
      }

      const updatedMatchState = await this.prisma.$transaction(async (tx) => {
        // Get existing match state (don't create if it doesn't exist for pause operation)
        const matchState = await tx.match_state.findFirst({
          where: { match_id: matchId, is_deleted: false }
        });

        if (!matchState) {
          const error = new Error('Match state not found - cannot pause a match that has not been started') as any;
          error.statusCode = 404;
          throw error;
        }

        // Validate state transition
        if (!this.validateStateTransition(matchState.status, 'PAUSED')) {
          const error = new Error(`Cannot pause match: invalid transition from ${matchState.status} to PAUSED`) as any;
          error.statusCode = 400;
          throw error;
        }

        // Calculate delta since last active_since and add to existing total
        const now = Date.now();
        const currentState = await tx.match_state.findFirst({ where: { id: matchState.id } });
        const baseTotal = currentState?.total_elapsed_seconds || 0;
        const lastActive = currentState?.active_since ? currentState.active_since.getTime() : null;
        const delta = lastActive ? Math.max(0, Math.ceil((now - lastActive) / 1000)) : 0;

        // Update match state to paused and persist total, clear active_since
        return await tx.match_state.update({
          where: { id: matchState.id },
          data: {
            status: 'PAUSED',
            total_elapsed_seconds: baseTotal + delta,
            active_since: null,
            updated_at: new Date()
          }
        });
      });

      // Invalidate cache for this match
      this.invalidateMatchCache(matchId, userId, userRole);

      const result = transformMatchState(updatedMatchState);
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(matchId, 'state_changed', {
          status: result.status,
          currentPeriod: result.currentPeriod,
          currentPeriodType: result.currentPeriodType,
          totalElapsedSeconds: result.totalElapsedSeconds,
        });
      } catch {}
      return result;
    }, 'MatchState');
  }

  /**
   * Resume a paused match
   */
  async resumeMatch(matchId: string, userId: string, userRole: string): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission first
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to resume this match') as any;
        error.statusCode = 403;
        throw error;
      }

      const updatedMatchState = await this.prisma.$transaction(async (tx) => {
        // Get or create match state (resume can start a match if it's scheduled)
        let matchState = await tx.match_state.findFirst({
          where: { match_id: matchId, is_deleted: false }
        });

        if (!matchState) {
          // Create initial match state as scheduled (resume can act like start)
          matchState = await tx.match_state.create({
            data: {
              match_id: matchId,
              status: 'SCHEDULED',
              created_by_user_id: userId
            }
          });
        }

        // Validate state transition
        if (!this.validateStateTransition(matchState.status, 'LIVE')) {
          const error = new Error(`Cannot resume match: invalid transition from ${matchState.status} to LIVE`) as any;
          error.statusCode = 400;
          throw error;
        }

        // Update match state to live and set active_since
        let liveState = await tx.match_state.update({
          where: { id: matchState.id },
          data: {
            status: 'LIVE',
            active_since: new Date(),
            updated_at: new Date()
          }
        });

        // If there are no periods yet, create the first regular period
        const periodsCount = await tx.match_periods.count({
          where: { match_id: matchId, is_deleted: false }
        });

        if (periodsCount === 0) {
          await tx.match_periods.create({
            data: {
              match_id: matchId,
              period_number: 1,
              period_type: 'REGULAR',
              started_at: new Date(),
              created_by_user_id: userId
            }
          });

          // Reflect current period on match_state
          liveState = await tx.match_state.update({
            where: { id: liveState.id },
            data: {
              current_period: 1,
              current_period_type: 'REGULAR',
              updated_at: new Date()
            }
          });
        }

        return liveState;
      });

      // Invalidate cache for this match
      this.invalidateMatchCache(matchId, userId, userRole);

      const result = transformMatchState(updatedMatchState);
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(matchId, 'state_changed', {
          status: result.status,
          currentPeriod: result.currentPeriod,
          currentPeriodType: result.currentPeriodType,
          totalElapsedSeconds: result.totalElapsedSeconds,
        });
      } catch {}
      return result;
    }, 'MatchState');
  }

  /**
   * Complete a match - transition to completed
   */
  async completeMatch(matchId: string, userId: string, userRole: string): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to complete this match') as any;
        error.statusCode = 403;
        throw error;
      }

      const updatedState = await this.prisma.$transaction(async (tx) => {
        // Get current match state
        const matchState = await tx.match_state.findFirst({
          where: { match_id: matchId, is_deleted: false }
        });

        if (!matchState) {
          const error = new Error('Match state not found') as any;
          error.statusCode = 404;
          throw error;
        }

        // Validate state transition
        if (!this.validateStateTransition(matchState.status, 'COMPLETED')) {
          const error = new Error(`Cannot complete match: invalid transition from ${matchState.status} to COMPLETED`) as any;
          error.statusCode = 400;
          throw error;
        }

        // If a period is currently active, end it before completing the match
        const activePeriod = await tx.match_periods.findFirst({
          where: {
            match_id: matchId,
            started_at: { not: null },
            ended_at: null,
            is_deleted: false
          }
        });

        if (activePeriod && activePeriod.started_at) {
          const endTime = new Date();
          const durationMs = endTime.getTime() - activePeriod.started_at.getTime();
          const durationSeconds = Math.ceil(durationMs / 1000);

          await tx.match_periods.update({
            where: { id: activePeriod.id },
            data: {
              ended_at: endTime,
              duration_seconds: durationSeconds,
              updated_at: new Date()
            }
          });
        }

        // Recalculate final total from completed periods
        const completed = await tx.match_periods.findMany({
          where: { match_id: matchId, ended_at: { not: null }, is_deleted: false },
          select: { duration_seconds: true }
        });
        const finalTotal = completed.reduce((sum, p) => sum + (p.duration_seconds || 0), 0);

        // Update match state to completed and persist total
        const updatedMatchState = await tx.match_state.update({
          where: { id: matchState.id },
          data: {
            status: 'COMPLETED',
            match_ended_at: new Date(),
            total_elapsed_seconds: finalTotal,
            updated_at: new Date()
          }
        });

        return updatedMatchState;
      });

      // Invalidate cache for this match
      this.invalidateMatchCache(matchId, userId, userRole);

      const result = transformMatchState(updatedState);
      // Final score recompute/persist
      try {
        const { ScoreService } = await import('./ScoreService');
        await ScoreService.recomputeAndPersistScore(this.prisma as any, matchId);
      } catch {}
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(matchId, 'state_changed', {
          status: result.status,
          currentPeriod: result.currentPeriod,
          currentPeriodType: result.currentPeriodType,
          matchEndedAt: result.matchEndedAt,
          totalElapsedSeconds: result.totalElapsedSeconds,
        });
      } catch {}
      return result;
    }, 'MatchState');
  }

  /**
   * Cancel a match
   */
  async cancelMatch(matchId: string, _reason: string, userId: string, userRole: string): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission first
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to cancel this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get or create match state (cancel can work on any match)
      let matchState = await this.prisma.match_state.findFirst({
        where: { match_id: matchId, is_deleted: false }
      });

      if (!matchState) {
        // Create initial match state for cancellation
        matchState = await this.prisma.match_state.create({
          data: {
            match_id: matchId,
            status: 'SCHEDULED',
            created_by_user_id: userId
          }
        });
      }

      // Validate state transition
      if (!this.validateStateTransition(matchState.status, 'CANCELLED')) {
        const error = new Error(`Cannot cancel match: invalid transition from ${matchState.status} to CANCELLED`) as any;
        error.statusCode = 400;
        throw error;
      }

      // Update match state to cancelled
      const updatedMatchState = await this.prisma.match_state.update({
        where: { id: matchState.id },
        data: {
          status: 'CANCELLED',
          match_ended_at: new Date(),
          updated_at: new Date()
        }
      });

      // Invalidate cache for this match
      this.invalidateMatchCache(matchId, userId, userRole);

      const result = transformMatchState(updatedMatchState);
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(matchId, 'state_changed', {
          status: result.status,
          currentPeriod: result.currentPeriod,
          currentPeriodType: result.currentPeriodType,
          matchEndedAt: result.matchEndedAt,
          totalElapsedSeconds: result.totalElapsedSeconds,
        });
      } catch {}
      return result;
    }, 'MatchState');
  }

  /**
   * Get current match state
   */
  async getCurrentState(matchId: string, userId: string, userRole: string): Promise<MatchState | null> {
    return withPrismaErrorHandling(async () => {
      // Check cache first
      const cacheKey = CacheKeys.matchState(matchId);
      const cachedState = cache.get<MatchState>(cacheKey);
      if (cachedState) {
        // Still need to validate permission for cached data
        const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
        if (!hasPermission) {
          const error = new Error('Access denied: You do not have permission to view this match state') as any;
          error.statusCode = 403;
          throw error;
        }
        return cachedState;
      }

      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to view this match state') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get match state with soft delete filtering
      const matchState = await this.prisma.match_state.findFirst({
        where: { 
          match_id: matchId, 
          is_deleted: false 
        }
      });

      const transformedState = safeTransformMatchState(matchState);
      
      // Cache the result if it exists
      if (transformedState) {
        cache.set(cacheKey, transformedState, CacheTTL.MATCH_STATE);
      }

      return transformedState;
    }, 'MatchState');
  }

  /**
   * Get match status for display (includes basic match info)
   */
  async getMatchStatus(matchId: string, userId: string, userRole: string): Promise<any> {
    return withPrismaErrorHandling(async () => {
      // Check cache first
      const cacheKey = CacheKeys.matchStatus(matchId);
      const cachedStatus = cache.get<any>(cacheKey);
      if (cachedStatus) {
        // Still need to validate permission for cached data
        const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
        if (!hasPermission) {
          const error = new Error('Access denied: You do not have permission to view this match status') as any;
          error.statusCode = 403;
          throw error;
        }
        return cachedStatus;
      }

      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to view this match status') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get match with state information
      const match = await this.prisma.match.findFirst({
        where: { 
          match_id: matchId, 
          is_deleted: false 
        },
        include: {
          match_state: {
            where: { is_deleted: false }
          },
          homeTeam: {
            select: {
              id: true,
              name: true,
              logo_url: true
            }
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
              logo_url: true
            }
          }
        }
      });

      if (!match) {
        return null;
      }

      const matchStatus = {
        matchId: match.match_id,
        kickoffTime: match.kickoff_ts,
        competition: match.competition,
        venue: match.venue,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeScore: (match as any).home_score,
        awayScore: (match as any).away_score,
        state: match.match_state ? transformMatchState(match.match_state) : null
      };

      // Cache the result
      cache.set(cacheKey, matchStatus, CacheTTL.MATCH_STATUS);

      return matchStatus;
    }, 'MatchStatus');
  }

  /**
   * Get all live matches (for admin or user's matches)
   */
  async getLiveMatches(userId: string, userRole: string): Promise<MatchState[]> {
    return withPrismaErrorHandling(async () => {
      // Check cache first
      const cacheKey = CacheKeys.liveMatches(userId, userRole);
      const cachedMatches = cache.get<MatchState[]>(cacheKey);
      if (cachedMatches) {
        return cachedMatches;
      }

      const where: any = {
        is_deleted: false,
        status: 'LIVE'
      };

      // Non-admin users can only see matches they have permission for
      if (userRole !== 'ADMIN') {
        const userTeamIds = await this.getUserTeamIds(userId);
        where.match = {
          is_deleted: false,
          OR: [
            { created_by_user_id: userId },
            { home_team_id: { in: userTeamIds } },
            { away_team_id: { in: userTeamIds } }
          ]
        };
      } else {
        where.match = {
          is_deleted: false
        };
      }

      const liveMatchStates = await this.prisma.match_state.findMany({
        where,
        orderBy: { match_started_at: 'desc' }
      });

      const transformedMatches = liveMatchStates.map(transformMatchState);
      
      // Cache the result with shorter TTL for live data
      cache.set(cacheKey, transformedMatches, CacheTTL.LIVE_MATCHES);

      return transformedMatches;
    }, 'MatchState');
  }

  /**
   * Get paginated match statuses for matches the user can access
   */
  async getMatchStatuses(
    userId: string,
    userRole: string,
    options: { page: number; limit: number; matchIds?: string[] }
  ): Promise<{ data: any[]; pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } }> {
    return withPrismaErrorHandling(async () => {
      const { page, limit } = options;
      const skip = (page - 1) * limit;

      const whereMatch: any = { is_deleted: false };

      if (options.matchIds && options.matchIds.length) {
        whereMatch.match_id = { in: options.matchIds };
      } else if (userRole !== 'ADMIN') {
        const userTeamIds = await this.getUserTeamIds(userId);
        whereMatch.OR = [
          { created_by_user_id: userId },
          { home_team_id: { in: userTeamIds } },
          { away_team_id: { in: userTeamIds } },
        ];
      }

      const [matches, total] = await Promise.all([
        this.prisma.match.findMany({
          where: whereMatch,
          orderBy: { kickoff_ts: 'desc' },
          skip,
          take: limit,
          include: {
            match_state: { where: { is_deleted: false } },
            homeTeam: { select: { id: true, name: true } },
            awayTeam: { select: { id: true, name: true } },
          }
        }),
        this.prisma.match.count({ where: whereMatch })
      ]);

      const items = matches.map(m => ({
        matchId: m.match_id,
        kickoffTime: m.kickoff_ts,
        competition: m.competition,
        venue: m.venue,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeScore: (m as any).home_score,
        awayScore: (m as any).away_score,
        status: m.match_state?.status || 'SCHEDULED',
        currentPeriod: m.match_state?.current_period || undefined,
        currentPeriodType: (m.match_state?.current_period_type || undefined) as any,
        totalElapsedSeconds: m.match_state?.total_elapsed_seconds || 0,
        isLive: m.match_state?.status === 'LIVE',
      }));

      const totalPages = Math.ceil(total / limit);
      return {
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        }
      };
    }, 'MatchState');
  }

  /**
   * Get all team IDs that belong to a user
   */
  private async getUserTeamIds(userId: string): Promise<string[]> {
    // Check cache first
    const cacheKey = CacheKeys.userTeams(userId);
    const cachedTeamIds = cache.get<string[]>(cacheKey);
    if (cachedTeamIds) {
      return cachedTeamIds;
    }

    const teams = await this.prisma.team.findMany({
      where: { 
        created_by_user_id: userId,
        is_deleted: false 
      },
      select: { id: true }
    });

    const teamIds = teams.map(team => team.id);
    
    // Cache team IDs with longer TTL since they don't change frequently
    cache.set(cacheKey, teamIds, CacheTTL.USER_TEAMS);

    return teamIds;
  }

  /**
   * Invalidate cache entries for a match
   */
  private invalidateMatchCache(matchId: string, userId: string, userRole: string): void {
    // Invalidate specific match caches
    cache.delete(CacheKeys.matchState(matchId));
    cache.delete(CacheKeys.matchStatus(matchId));
    
    // Invalidate live matches cache for this user
    cache.delete(CacheKeys.liveMatches(userId, userRole));
    
    // If admin, also invalidate admin live matches cache
    if (userRole === 'ADMIN') {
      cache.delete(CacheKeys.liveMatches('admin', 'ADMIN'));
    }
  }
}
