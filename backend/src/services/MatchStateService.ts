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
    const allowedTransitions = MatchStateService.VALID_TRANSITIONS[currentStatus as keyof typeof MatchStateService.VALID_TRANSITIONS];
    return allowedTransitions?.includes(newStatus as any) || false;
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

      // Get or create match state
      let matchState = await this.prisma.match_state.findFirst({
        where: { match_id: matchId, is_deleted: false }
      });

      if (!matchState) {
        // Create initial match state
        matchState = await this.prisma.match_state.create({
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

      // Update match state to live
      const updatedMatchState = await this.prisma.match_state.update({
        where: { id: matchState.id },
        data: {
          status: 'LIVE',
          match_started_at: new Date(),
          updated_at: new Date()
        }
      });

      return transformMatchState(updatedMatchState);
    }, 'MatchState');
  }

  /**
   * Pause a live match
   */
  async pauseMatch(matchId: string, userId: string, userRole: string, _options?: MatchStateTransitionOptions): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to pause this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get or create match state
      let matchState = await this.prisma.match_state.findFirst({
        where: { match_id: matchId, is_deleted: false }
      });

      if (!matchState) {
        // Create initial match state as scheduled
        matchState = await this.prisma.match_state.create({
          data: {
            match_id: matchId,
            status: 'SCHEDULED',
            created_by_user_id: userId
          }
        });
      }

      // Validate state transition
      if (!this.validateStateTransition(matchState.status, 'PAUSED')) {
        const error = new Error(`Cannot pause match: invalid transition from ${matchState.status} to PAUSED`) as any;
        error.statusCode = 400;
        throw error;
      }

      // Update match state to paused
      const updatedMatchState = await this.prisma.match_state.update({
        where: { id: matchState.id },
        data: {
          status: 'PAUSED',
          updated_at: new Date()
        }
      });

      return transformMatchState(updatedMatchState);
    }, 'MatchState');
  }

  /**
   * Resume a paused match
   */
  async resumeMatch(matchId: string, userId: string, userRole: string): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to resume this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get or create match state
      let matchState = await this.prisma.match_state.findFirst({
        where: { match_id: matchId, is_deleted: false }
      });

      if (!matchState) {
        // Create initial match state as scheduled
        matchState = await this.prisma.match_state.create({
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

      // Update match state to live
      const updatedMatchState = await this.prisma.match_state.update({
        where: { id: matchState.id },
        data: {
          status: 'LIVE',
          updated_at: new Date()
        }
      });

      return transformMatchState(updatedMatchState);
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

      // Get current match state
      const matchState = await this.prisma.match_state.findFirst({
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

      // Update match state to completed
      const updatedMatchState = await this.prisma.match_state.update({
        where: { id: matchState.id },
        data: {
          status: 'COMPLETED',
          match_ended_at: new Date(),
          updated_at: new Date()
        }
      });

      return transformMatchState(updatedMatchState);
    }, 'MatchState');
  }

  /**
   * Cancel a match
   */
  async cancelMatch(matchId: string, _reason: string, userId: string, userRole: string): Promise<MatchState> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to cancel this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get or create match state
      let matchState = await this.prisma.match_state.findFirst({
        where: { match_id: matchId, is_deleted: false }
      });

      if (!matchState) {
        // Create initial match state
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

      return transformMatchState(updatedMatchState);
    }, 'MatchState');
  }

  /**
   * Get current match state
   */
  async getCurrentState(matchId: string, userId: string, userRole: string): Promise<MatchState | null> {
    return withPrismaErrorHandling(async () => {
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

      return safeTransformMatchState(matchState);
    }, 'MatchState');
  }

  /**
   * Get match status for display (includes basic match info)
   */
  async getMatchStatus(matchId: string, userId: string, userRole: string): Promise<any> {
    return withPrismaErrorHandling(async () => {
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

      return {
        matchId: match.match_id,
        kickoffTime: match.kickoff_ts,
        competition: match.competition,
        venue: match.venue,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        ourScore: match.our_score,
        opponentScore: match.opponent_score,
        state: match.match_state ? transformMatchState(match.match_state) : null
      };
    }, 'MatchStatus');
  }

  /**
   * Get all live matches (for admin or user's matches)
   */
  async getLiveMatches(userId: string, userRole: string): Promise<MatchState[]> {
    return withPrismaErrorHandling(async () => {
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

      return liveMatchStates.map(transformMatchState);
    }, 'MatchState');
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
}