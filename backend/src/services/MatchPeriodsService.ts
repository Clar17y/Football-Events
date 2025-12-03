import { PrismaClient } from '@prisma/client';
import { transformMatchPeriod, safeTransformMatchPeriod, transformMatchPeriods } from '@shared/types';
import type { MatchPeriod } from '@shared/types';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';
import { createOrRestoreSoftDeleted } from '../utils/softDeleteUtils';

export interface PeriodTransitionOptions {
  reason?: string;
}

export class MatchPeriodsService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Valid period types (matching Prisma enum values)
   */
  private static readonly VALID_PERIOD_TYPES = ['REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'] as const;
  
  /**
   * Map frontend period types to database enum values
   */
  private static readonly PERIOD_TYPE_MAP = {
    'regular': 'REGULAR',
    'extra_time': 'EXTRA_TIME', 
    'penalty_shootout': 'PENALTY_SHOOTOUT'
  } as const;

  /**
   * Check if user has permission to modify match periods
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
   * Validate period type and convert to database enum value
   */
  private validateAndConvertPeriodType(periodType: string): string | null {
    const dbPeriodType = MatchPeriodsService.PERIOD_TYPE_MAP[periodType as keyof typeof MatchPeriodsService.PERIOD_TYPE_MAP];
    return dbPeriodType || null;
  }

  /**
   * Get the next period number for a given match and period type
   */
  private async getNextPeriodNumber(matchId: string, periodType: string): Promise<number> {
    const lastPeriod = await this.prisma.match_periods.findFirst({
      where: {
        match_id: matchId,
        period_type: periodType,
        is_deleted: false
      },
      orderBy: { period_number: 'desc' }
    });

    return lastPeriod ? lastPeriod.period_number + 1 : 1;
  }

  /**
   * Check if there's an active period (started but not ended)
   */
  private async getActivePeriod(matchId: string): Promise<any | null> {
    return await this.prisma.match_periods.findFirst({
      where: {
        match_id: matchId,
        started_at: { not: null },
        ended_at: null,
        is_deleted: false
      }
    });
  }

  /**
   * Start a new period
   */
  async startPeriod(
    matchId: string, 
    periodType: string = 'regular', 
    userId: string, 
    userRole: string
  ): Promise<MatchPeriod> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to manage periods for this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Validate and convert period type
      const dbPeriodType = this.validateAndConvertPeriodType(periodType);
      if (!dbPeriodType) {
        const error = new Error(`Invalid period type: ${periodType}. Valid types are: regular, extra_time, penalty_shootout`) as any;
        error.statusCode = 400;
        throw error;
      }

      // Check if there's already an active period
      const activePeriod = await this.getActivePeriod(matchId);
      if (activePeriod) {
        const error = new Error('Cannot start new period: another period is already active') as any;
        error.statusCode = 400;
        throw error;
      }

      // Get next period number
      const periodNumber = await this.getNextPeriodNumber(matchId, dbPeriodType);

      // Create new period using soft delete restoration
      const uniqueConstraints = {
        match_id: matchId,
        period_number: periodNumber,
        period_type: dbPeriodType
      };

      const createData = {
        match_id: matchId,
        period_number: periodNumber,
        period_type: dbPeriodType,
        started_at: new Date(),
        ended_at: null,
        duration_seconds: null,
        created_by_user_id: userId
      };

      const newPeriod = await createOrRestoreSoftDeleted({
        prisma: this.prisma,
        model: 'match_periods',
        uniqueConstraints,
        createData,
        userId,
        transformer: transformMatchPeriod
      });

      // Update match state current period if this is a regular period
      if (dbPeriodType === 'REGULAR') {
        await this.prisma.match_state.updateMany({
          where: { 
            match_id: matchId, 
            is_deleted: false 
          },
          data: {
            current_period: periodNumber,
            current_period_type: dbPeriodType,
            updated_at: new Date()
          }
        });
      }

      // Broadcast SSE
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(matchId, 'period_started', { period: {
          id: (newPeriod as any).id,
          periodNumber: (newPeriod as any).periodNumber,
          periodType: (newPeriod as any).periodType,
          startedAt: (newPeriod as any).startedAt,
        }});
      } catch {}
      return newPeriod;
    }, 'MatchPeriod');
  }

  /**
   * End a period
   */
  async endPeriod(
    matchId: string, 
    periodId: string, 
    userId: string, 
    userRole: string
  ): Promise<MatchPeriod> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to manage periods for this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get the period to end
      const period = await this.prisma.match_periods.findFirst({
        where: {
          id: periodId,
          match_id: matchId,
          is_deleted: false
        }
      });

      if (!period) {
        const error = new Error('Period not found') as any;
        error.statusCode = 404;
        throw error;
      }

      // Check if period is already ended
      if (period.ended_at) {
        const error = new Error('Period is already ended') as any;
        error.statusCode = 400;
        throw error;
      }

      // Check if period was started
      if (!period.started_at) {
        const error = new Error('Cannot end period that was never started') as any;
        error.statusCode = 400;
        throw error;
      }

      // Calculate duration
      const endTime = new Date();
      const durationMs = endTime.getTime() - period.started_at.getTime();
      const durationSeconds = Math.ceil(durationMs / 1000);

      // Update period with end time and duration
      const updatedPeriod = await this.prisma.match_periods.update({
        where: { id: periodId },
        data: {
          ended_at: endTime,
          duration_seconds: durationSeconds,
          updated_at: new Date()
        }
      });

      // Persist the cumulative total on match_state for fast reads
      // Also set status to PAUSED since no period is now active
      const completed = await this.prisma.match_periods.findMany({
        where: { match_id: matchId, ended_at: { not: null }, is_deleted: false },
        select: { duration_seconds: true }
      });
      const sum = completed.reduce((acc, p) => acc + (p.duration_seconds || 0), 0);
      await this.prisma.match_state.updateMany({
        where: { match_id: matchId, is_deleted: false },
        data: {
          total_elapsed_seconds: sum,
          status: 'PAUSED',  // No active period, so pause the match
          updated_at: new Date()
        }
      });

      const transformed = transformMatchPeriod(updatedPeriod);
      // Broadcast SSE with updated status and total elapsed time
      try {
        const { sseHub } = await import('../utils/sse');
        sseHub.broadcast(matchId, 'period_ended', {
          period: {
            id: transformed.id,
            periodNumber: transformed.periodNumber,
            periodType: transformed.periodType,
            endedAt: transformed.endedAt,
            durationSeconds: transformed.durationSeconds,
          },
          matchState: {
            status: 'PAUSED',
            totalElapsedSeconds: sum,
          }
        });
      } catch {}
      return transformed;
    }, 'MatchPeriod');
  }

  /**
   * Get all periods for a match
   */
  async getMatchPeriods(matchId: string, userId: string, userRole: string): Promise<MatchPeriod[]> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to view periods for this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get all periods for the match with soft delete filtering
      const periods = await this.prisma.match_periods.findMany({
        where: {
          match_id: matchId,
          is_deleted: false
        },
        orderBy: [
          { period_type: 'asc' },
          { period_number: 'asc' }
        ]
      });

      return transformMatchPeriods(periods);
    }, 'MatchPeriod');
  }

  /**
   * Calculate total elapsed time for a match
   */
  async calculateElapsedTime(matchId: string, userId: string, userRole: string): Promise<number> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to view timing for this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Get all completed periods
      const completedPeriods = await this.prisma.match_periods.findMany({
        where: {
          match_id: matchId,
          started_at: { not: null },
          ended_at: { not: null },
          is_deleted: false
        }
      });

      // Calculate total from completed periods
      let totalElapsed = completedPeriods.reduce((total, period) => {
        return total + (period.duration_seconds || 0);
      }, 0);

      // Add time from active period if any
      const activePeriod = await this.getActivePeriod(matchId);
      if (activePeriod && activePeriod.started_at) {
        const currentTime = new Date();
        const activeElapsed = Math.floor((currentTime.getTime() - activePeriod.started_at.getTime()) / 1000);
        totalElapsed += activeElapsed;
      }

      return totalElapsed;
    }, 'ElapsedTime');
  }

  /**
   * Get current active period
   */
  async getCurrentPeriod(matchId: string, userId: string, userRole: string): Promise<MatchPeriod | null> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to view periods for this match') as any;
        error.statusCode = 403;
        throw error;
      }

      const activePeriod = await this.getActivePeriod(matchId);
      return safeTransformMatchPeriod(activePeriod);
    }, 'MatchPeriod');
  }

  /**
   * Get periods by type
   */
  async getPeriodsByType(
    matchId: string, 
    periodType: string, 
    userId: string, 
    userRole: string
  ): Promise<MatchPeriod[]> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to view periods for this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Validate and convert period type
      const dbPeriodType = this.validateAndConvertPeriodType(periodType);
      if (!dbPeriodType) {
        const error = new Error(`Invalid period type: ${periodType}. Valid types are: regular, extra_time, penalty_shootout`) as any;
        error.statusCode = 400;
        throw error;
      }

      const periods = await this.prisma.match_periods.findMany({
        where: {
          match_id: matchId,
          period_type: dbPeriodType,
          is_deleted: false
        },
        orderBy: { period_number: 'asc' }
      });

      return transformMatchPeriods(periods);
    }, 'MatchPeriod');
  }

  /**
   * Soft delete a period
   */
  async deletePeriod(
    matchId: string, 
    periodId: string, 
    userId: string, 
    userRole: string
  ): Promise<void> {
    return withPrismaErrorHandling(async () => {
      // Validate user permission
      const hasPermission = await this.validateUserPermission(matchId, userId, userRole);
      if (!hasPermission) {
        const error = new Error('Access denied: You do not have permission to delete periods for this match') as any;
        error.statusCode = 403;
        throw error;
      }

      // Check if period exists and belongs to the match
      const period = await this.prisma.match_periods.findFirst({
        where: {
          id: periodId,
          match_id: matchId,
          is_deleted: false
        }
      });

      if (!period) {
        const error = new Error('Period not found') as any;
        error.statusCode = 404;
        throw error;
      }

      // Soft delete the period
      await this.prisma.match_periods.update({
        where: { id: periodId },
        data: {
          is_deleted: true,
          deleted_at: new Date(),
          deleted_by_user_id: userId,
          updated_at: new Date()
        }
      });
    }, 'MatchPeriod');
  }
}
