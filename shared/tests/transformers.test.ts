import { describe, it, expect } from 'vitest';
import {
  transformMatchState,
  transformMatchPeriod,
  transformStartMatchRequest,
  transformStartPeriodRequest,
  transformMatchStateToResponse,
  transformMatchStateToStatusResponse,
  transformToLiveMatchesResponse,
  transformMatchStates,
  transformMatchPeriods,
  safeTransformMatchState,
  safeTransformMatchPeriod,
} from '../types/transformers';
import type {
  PrismaMatchState,
  PrismaMatchPeriod,
} from '../types/prisma';
import type {
  StartMatchRequest,
  StartPeriodRequest,
  MatchState,
  MatchPeriod,
} from '../types/frontend';

describe('Match State Transformers', () => {
  describe('transformMatchState', () => {
    it('should transform PrismaMatchState to MatchState', () => {
      const prismaMatchState: PrismaMatchState = {
        id: 'state-123',
        match_id: 'match-456',
        status: 'live',
        current_period: 1,
        current_period_type: 'regular',
        match_started_at: new Date('2025-01-15T10:00:00Z'),
        match_ended_at: null,
        total_elapsed_seconds: 1800,
        created_at: new Date('2025-01-15T09:55:00Z'),
        updated_at: new Date('2025-01-15T10:30:00Z'),
        created_by_user_id: 'user-789',
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false,
      };

      const result = transformMatchState(prismaMatchState);

      expect(result).toEqual({
        id: 'state-123',
        matchId: 'match-456',
        status: 'LIVE',
        currentPeriod: 1,
        currentPeriodType: 'REGULAR',
        matchStartedAt: new Date('2025-01-15T10:00:00Z'),
        matchEndedAt: undefined,
        totalElapsedSeconds: 1800,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: new Date('2025-01-15T10:30:00Z'),
        created_by_user_id: 'user-789',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      });
    });

    it('should handle null values correctly', () => {
      const prismaMatchState: PrismaMatchState = {
        id: 'state-123',
        match_id: 'match-456',
        status: 'scheduled',
        current_period: null,
        current_period_type: null,
        match_started_at: null,
        match_ended_at: null,
        total_elapsed_seconds: 0,
        created_at: new Date('2025-01-15T09:55:00Z'),
        updated_at: null,
        created_by_user_id: 'user-789',
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false,
      };

      const result = transformMatchState(prismaMatchState);

      expect(result.currentPeriod).toBeUndefined();
      expect(result.currentPeriodType).toBeUndefined();
      expect(result.matchStartedAt).toBeUndefined();
      expect(result.matchEndedAt).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });
  });

  describe('transformMatchPeriod', () => {
    it('should transform PrismaMatchPeriod to MatchPeriod', () => {
      const prismaMatchPeriod: PrismaMatchPeriod = {
        id: 'period-123',
        match_id: 'match-456',
        period_number: 1,
        period_type: 'regular',
        started_at: new Date('2025-01-15T10:00:00Z'),
        ended_at: new Date('2025-01-15T10:25:00Z'),
        duration_seconds: 1500,
        created_at: new Date('2025-01-15T09:55:00Z'),
        updated_at: new Date('2025-01-15T10:25:00Z'),
        created_by_user_id: 'user-789',
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false,
      };

      const result = transformMatchPeriod(prismaMatchPeriod);

      expect(result).toEqual({
        id: 'period-123',
        matchId: 'match-456',
        periodNumber: 1,
        periodType: 'REGULAR',
        startedAt: new Date('2025-01-15T10:00:00Z'),
        endedAt: new Date('2025-01-15T10:25:00Z'),
        durationSeconds: 1500,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: new Date('2025-01-15T10:25:00Z'),
        created_by_user_id: 'user-789',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      });
    });

    it('should handle active period (no end time)', () => {
      const prismaMatchPeriod: PrismaMatchPeriod = {
        id: 'period-123',
        match_id: 'match-456',
        period_number: 2,
        period_type: 'extra_time',
        started_at: new Date('2025-01-15T11:00:00Z'),
        ended_at: null,
        duration_seconds: null,
        created_at: new Date('2025-01-15T10:55:00Z'),
        updated_at: null,
        created_by_user_id: 'user-789',
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false,
      };

      const result = transformMatchPeriod(prismaMatchPeriod);

      expect(result.periodType).toBe('EXTRA_TIME');
      expect(result.endedAt).toBeUndefined();
      expect(result.durationSeconds).toBeUndefined();
    });
  });

  describe('transformStartMatchRequest', () => {
    it('should transform StartMatchRequest to PrismaMatchStateCreateInput', () => {
      const request: StartMatchRequest = {
        matchId: 'match-456',
      };
      const userId = 'user-789';

      const result = transformStartMatchRequest(request, userId);

      expect(result).toEqual({
        match_id: 'match-456',
        status: 'live',
        match_started_at: expect.any(Date),
        total_elapsed_seconds: 0,
        created_by_user_id: 'user-789',
      });

      // Check that the timestamp is recent (within last 5 seconds)
      const now = new Date();
      const startTime = result.match_started_at as Date;
      expect(now.getTime() - startTime.getTime()).toBeLessThan(5000);
    });
  });

  describe('transformStartPeriodRequest', () => {
    it('should transform StartPeriodRequest to PrismaMatchPeriodCreateInput', () => {
      const request: StartPeriodRequest = {
        matchId: 'match-456',
        periodNumber: 1,
        periodType: 'REGULAR',
      };
      const userId = 'user-789';

      const result = transformStartPeriodRequest(request, userId);

      expect(result).toEqual({
        match_id: 'match-456',
        period_number: 1,
        period_type: 'regular',
        started_at: expect.any(Date),
        created_by_user_id: 'user-789',
      });
    });

    it('should default to regular period type when not specified', () => {
      const request: StartPeriodRequest = {
        matchId: 'match-456',
        periodNumber: 1,
      };
      const userId = 'user-789';

      const result = transformStartPeriodRequest(request, userId);

      expect(result.period_type).toBe('regular');
    });

    it('should handle different period types', () => {
      const extraTimeRequest: StartPeriodRequest = {
        matchId: 'match-456',
        periodNumber: 3,
        periodType: 'EXTRA_TIME',
      };

      const penaltyRequest: StartPeriodRequest = {
        matchId: 'match-456',
        periodNumber: 1,
        periodType: 'PENALTY_SHOOTOUT',
      };

      expect(transformStartPeriodRequest(extraTimeRequest, 'user-1').period_type).toBe('extra_time');
      expect(transformStartPeriodRequest(penaltyRequest, 'user-1').period_type).toBe('penalty_shootout');
    });
  });

  describe('transformMatchStateToResponse', () => {
    it('should create MatchStateResponse with all data', () => {
      const matchState: MatchState = {
        id: 'state-123',
        matchId: 'match-456',
        status: 'LIVE',
        currentPeriod: 1,
        currentPeriodType: 'REGULAR',
        matchStartedAt: new Date('2025-01-15T10:00:00Z'),
        matchEndedAt: undefined,
        totalElapsedSeconds: 1800,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: new Date('2025-01-15T10:30:00Z'),
        created_by_user_id: 'user-789',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      };

      const currentPeriod: MatchPeriod = {
        id: 'period-123',
        matchId: 'match-456',
        periodNumber: 1,
        periodType: 'REGULAR',
        startedAt: new Date('2025-01-15T10:00:00Z'),
        endedAt: undefined,
        durationSeconds: undefined,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: undefined,
        created_by_user_id: 'user-789',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      };

      const allPeriods = [currentPeriod];

      const result = transformMatchStateToResponse(matchState, currentPeriod, allPeriods);

      expect(result).toEqual({
        matchState,
        currentPeriod,
        allPeriods,
      });
    });

    it('should handle missing current period', () => {
      const matchState: MatchState = {
        id: 'state-123',
        matchId: 'match-456',
        status: 'SCHEDULED',
        currentPeriod: undefined,
        currentPeriodType: undefined,
        matchStartedAt: undefined,
        matchEndedAt: undefined,
        totalElapsedSeconds: 0,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: undefined,
        created_by_user_id: 'user-789',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      };

      const result = transformMatchStateToResponse(matchState);

      expect(result).toEqual({
        matchState,
        currentPeriod: undefined,
        allPeriods: [],
      });
    });
  });

  describe('transformMatchStateToStatusResponse', () => {
    it('should create MatchStatusResponse', () => {
      const matchState: MatchState = {
        id: 'state-123',
        matchId: 'match-456',
        status: 'LIVE',
        currentPeriod: 2,
        currentPeriodType: 'REGULAR',
        matchStartedAt: new Date('2025-01-15T10:00:00Z'),
        matchEndedAt: undefined,
        totalElapsedSeconds: 2700,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: new Date('2025-01-15T10:45:00Z'),
        created_by_user_id: 'user-789',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      };

      const result = transformMatchStateToStatusResponse(matchState, 900);

      expect(result).toEqual({
        matchId: 'match-456',
        status: 'LIVE',
        currentPeriod: 2,
        currentPeriodType: 'REGULAR',
        totalElapsedSeconds: 2700,
        currentPeriodElapsedSeconds: 900,
        isLive: true,
      });
    });

    it('should correctly identify non-live matches', () => {
      const matchState: MatchState = {
        id: 'state-123',
        matchId: 'match-456',
        status: 'COMPLETED',
        currentPeriod: 4,
        currentPeriodType: 'REGULAR',
        matchStartedAt: new Date('2025-01-15T10:00:00Z'),
        matchEndedAt: new Date('2025-01-15T12:00:00Z'),
        totalElapsedSeconds: 3000,
        createdAt: new Date('2025-01-15T09:55:00Z'),
        updatedAt: new Date('2025-01-15T12:00:00Z'),
        created_by_user_id: 'user-789',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      };

      const result = transformMatchStateToStatusResponse(matchState);

      expect(result.isLive).toBe(false);
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('transformToLiveMatchesResponse', () => {
    it('should transform array of live matches', () => {
      const liveMatches = [
        {
          matchId: 'match-1',
          homeTeam: 'Team A',
          awayTeam: 'Team B',
          status: 'LIVE' as const,
          currentPeriod: 1,
          totalElapsedSeconds: 900,
        },
        {
          matchId: 'match-2',
          homeTeam: 'Team C',
          awayTeam: 'Team D',
          status: 'PAUSED' as const,
          currentPeriod: 2,
          totalElapsedSeconds: 1800,
        },
      ];

      const result = transformToLiveMatchesResponse(liveMatches);

      expect(result).toEqual({
        matches: liveMatches,
      });
    });

    it('should handle empty array', () => {
      const result = transformToLiveMatchesResponse([]);

      expect(result).toEqual({
        matches: [],
      });
    });
  });

  describe('Array transformers', () => {
    it('should transform array of match states', () => {
      const prismaMatchStates: PrismaMatchState[] = [
        {
          id: 'state-1',
          match_id: 'match-1',
          status: 'live',
          current_period: 1,
          current_period_type: 'regular',
          match_started_at: new Date('2025-01-15T10:00:00Z'),
          match_ended_at: null,
          total_elapsed_seconds: 900,
          created_at: new Date('2025-01-15T09:55:00Z'),
          updated_at: null,
          created_by_user_id: 'user-1',
          deleted_at: null,
          deleted_by_user_id: null,
          is_deleted: false,
        },
        {
          id: 'state-2',
          match_id: 'match-2',
          status: 'completed',
          current_period: 4,
          current_period_type: 'regular',
          match_started_at: new Date('2025-01-15T08:00:00Z'),
          match_ended_at: new Date('2025-01-15T10:00:00Z'),
          total_elapsed_seconds: 3000,
          created_at: new Date('2025-01-15T07:55:00Z'),
          updated_at: new Date('2025-01-15T10:00:00Z'),
          created_by_user_id: 'user-2',
          deleted_at: null,
          deleted_by_user_id: null,
          is_deleted: false,
        },
      ];

      const result = transformMatchStates(prismaMatchStates);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('LIVE');
      expect(result[1].status).toBe('COMPLETED');
    });

    it('should transform array of match periods', () => {
      const prismaMatchPeriods: PrismaMatchPeriod[] = [
        {
          id: 'period-1',
          match_id: 'match-1',
          period_number: 1,
          period_type: 'regular',
          started_at: new Date('2025-01-15T10:00:00Z'),
          ended_at: new Date('2025-01-15T10:25:00Z'),
          duration_seconds: 1500,
          created_at: new Date('2025-01-15T09:55:00Z'),
          updated_at: new Date('2025-01-15T10:25:00Z'),
          created_by_user_id: 'user-1',
          deleted_at: null,
          deleted_by_user_id: null,
          is_deleted: false,
        },
      ];

      const result = transformMatchPeriods(prismaMatchPeriods);

      expect(result).toHaveLength(1);
      expect(result[0].periodType).toBe('REGULAR');
      expect(result[0].durationSeconds).toBe(1500);
    });
  });

  describe('Safe transformers', () => {
    it('should safely transform match state', () => {
      const prismaMatchState: PrismaMatchState = {
        id: 'state-123',
        match_id: 'match-456',
        status: 'live',
        current_period: 1,
        current_period_type: 'regular',
        match_started_at: new Date('2025-01-15T10:00:00Z'),
        match_ended_at: null,
        total_elapsed_seconds: 1800,
        created_at: new Date('2025-01-15T09:55:00Z'),
        updated_at: null,
        created_by_user_id: 'user-789',
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false,
      };

      const result = safeTransformMatchState(prismaMatchState);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('LIVE');
    });

    it('should return null for null input', () => {
      expect(safeTransformMatchState(null)).toBeNull();
    });

    it('should safely transform match period', () => {
      const prismaMatchPeriod: PrismaMatchPeriod = {
        id: 'period-123',
        match_id: 'match-456',
        period_number: 1,
        period_type: 'regular',
        started_at: new Date('2025-01-15T10:00:00Z'),
        ended_at: null,
        duration_seconds: null,
        created_at: new Date('2025-01-15T09:55:00Z'),
        updated_at: null,
        created_by_user_id: 'user-789',
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false,
      };

      const result = safeTransformMatchPeriod(prismaMatchPeriod);
      expect(result).not.toBeNull();
      expect(result?.periodType).toBe('REGULAR');
    });

    it('should return null for null period input', () => {
      expect(safeTransformMatchPeriod(null)).toBeNull();
    });
  });
});