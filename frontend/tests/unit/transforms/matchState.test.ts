import { describe, it, expect } from 'vitest';
import {
  dbToMatchState,
  dbToMatchPeriod,
  dbToMatchPeriods,
  matchStateWriteToDb,
  matchPeriodWriteToDb,
} from '../../../src/db/transforms/matchState';
import type { LocalMatchState, LocalMatchPeriod } from '../../../src/db/schema';

describe('matchState transforms', () => {
  describe('dbToMatchState', () => {
    const mockDbState: LocalMatchState = {
      match_id: 'match-123',
      status: 'LIVE',
      current_period_id: 'period-1',
      timer_ms: 1800000, // 30 minutes
      last_updated_at: 1700000001000,
      created_at: 1700000000000,
      updated_at: 1700000001000,
      created_by_user_id: 'user-456',
      is_deleted: false,
      synced: true,
    };

    it('transforms all fields correctly', () => {
      const result = dbToMatchState(mockDbState);

      expect(result.id).toBe('match-123');
      expect(result.matchId).toBe('match-123');
      expect(result.status).toBe('LIVE');
      expect(result.totalElapsedSeconds).toBe(1800);
      expect(result.createdAt).toEqual(new Date(1700000000000));
      expect(result.updatedAt).toEqual(new Date(1700000001000));
      expect(result.created_by_user_id).toBe('user-456');
      expect(result.is_deleted).toBe(false);
    });

    it('maps NOT_STARTED to SCHEDULED', () => {
      const notStartedState = { ...mockDbState, status: 'NOT_STARTED' as const };
      const result = dbToMatchState(notStartedState);
      expect(result.status).toBe('SCHEDULED');
    });

    it('preserves other status values', () => {
      const statuses = ['LIVE', 'PAUSED', 'COMPLETED'] as const;
      for (const status of statuses) {
        const state = { ...mockDbState, status };
        const result = dbToMatchState(state);
        expect(result.status).toBe(status);
      }
    });

    it('calculates totalElapsedSeconds from timer_ms', () => {
      const states = [
        { timer_ms: 0, expected: 0 },
        { timer_ms: 1000, expected: 1 },
        { timer_ms: 60000, expected: 60 },
        { timer_ms: 2700000, expected: 2700 },
      ];

      for (const { timer_ms, expected } of states) {
        const state = { ...mockDbState, timer_ms };
        const result = dbToMatchState(state);
        expect(result.totalElapsedSeconds).toBe(expected);
      }
    });

    it('sets matchStartedAt for non-NOT_STARTED states', () => {
      const liveState = { ...mockDbState, status: 'LIVE' as const };
      expect(dbToMatchState(liveState).matchStartedAt).toBeDefined();

      const notStartedState = { ...mockDbState, status: 'NOT_STARTED' as const };
      expect(dbToMatchState(notStartedState).matchStartedAt).toBeUndefined();
    });

    it('sets matchEndedAt for COMPLETED state', () => {
      const completedState = { ...mockDbState, status: 'COMPLETED' as const };
      expect(dbToMatchState(completedState).matchEndedAt).toBeDefined();

      const liveState = { ...mockDbState, status: 'LIVE' as const };
      expect(dbToMatchState(liveState).matchEndedAt).toBeUndefined();
    });

    it('handles soft delete fields', () => {
      const deletedState: LocalMatchState = {
        ...mockDbState,
        is_deleted: true,
        deleted_at: 1700000002000,
        deleted_by_user_id: 'user-admin',
      };

      const result = dbToMatchState(deletedState);

      expect(result.is_deleted).toBe(true);
      expect(result.deleted_at).toEqual(new Date(1700000002000));
      expect(result.deleted_by_user_id).toBe('user-admin');
    });
  });

  describe('dbToMatchPeriod', () => {
    const mockDbPeriod: LocalMatchPeriod = {
      id: 'period-123',
      match_id: 'match-456',
      period_number: 1,
      period_type: 'REGULAR',
      started_at: 1700000000000,
      ended_at: 1700000900000,
      duration_seconds: 900,
      created_at: 1699999999000,
      updated_at: 1700000900000,
      created_by_user_id: 'user-789',
      is_deleted: false,
      synced: true,
    };

    it('transforms all fields correctly', () => {
      const result = dbToMatchPeriod(mockDbPeriod);

      expect(result.id).toBe('period-123');
      expect(result.matchId).toBe('match-456');
      expect(result.periodNumber).toBe(1);
      expect(result.periodType).toBe('REGULAR');
      expect(result.startedAt).toEqual(new Date(1700000000000));
      expect(result.endedAt).toEqual(new Date(1700000900000));
      expect(result.durationSeconds).toBe(900);
      expect(result.createdAt).toEqual(new Date(1699999999000));
      expect(result.updatedAt).toEqual(new Date(1700000900000));
      expect(result.created_by_user_id).toBe('user-789');
      expect(result.is_deleted).toBe(false);
    });

    it('handles active period (no endedAt)', () => {
      const activePeriod: LocalMatchPeriod = {
        ...mockDbPeriod,
        ended_at: undefined,
        duration_seconds: undefined,
      };

      const result = dbToMatchPeriod(activePeriod);

      expect(result.endedAt).toBeUndefined();
      expect(result.durationSeconds).toBeUndefined();
    });

    it('handles different period types', () => {
      const types = ['REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'] as const;
      for (const periodType of types) {
        const period = { ...mockDbPeriod, period_type: periodType };
        const result = dbToMatchPeriod(period);
        expect(result.periodType).toBe(periodType);
      }
    });

    it('handles soft delete fields', () => {
      const deletedPeriod: LocalMatchPeriod = {
        ...mockDbPeriod,
        is_deleted: true,
        deleted_at: 1700000002000,
        deleted_by_user_id: 'user-admin',
      };

      const result = dbToMatchPeriod(deletedPeriod);

      expect(result.is_deleted).toBe(true);
      expect(result.deleted_at).toEqual(new Date(1700000002000));
      expect(result.deleted_by_user_id).toBe('user-admin');
    });
  });

  describe('dbToMatchPeriods', () => {
    it('transforms array of periods', () => {
      const periods: LocalMatchPeriod[] = [
        {
          id: 'period-1',
          match_id: 'match-1',
          period_number: 1,
          period_type: 'REGULAR',
          started_at: 1700000000000,
          ended_at: 1700000900000,
          created_at: 1700000000000,
          updated_at: 1700000900000,
          created_by_user_id: 'user-1',
          is_deleted: false,
          synced: false,
        },
        {
          id: 'period-2',
          match_id: 'match-1',
          period_number: 2,
          period_type: 'REGULAR',
          started_at: 1700001000000,
          created_at: 1700001000000,
          updated_at: 1700001000000,
          created_by_user_id: 'user-1',
          is_deleted: false,
          synced: false,
        },
      ];

      const result = dbToMatchPeriods(periods);

      expect(result).toHaveLength(2);
      expect(result[0].periodNumber).toBe(1);
      expect(result[1].periodNumber).toBe(2);
    });

    it('handles empty array', () => {
      expect(dbToMatchPeriods([])).toEqual([]);
    });
  });

  describe('matchStateWriteToDb', () => {
    it('transforms write input to db format', () => {
      const result = matchStateWriteToDb('match-123', {
        status: 'LIVE',
        currentPeriodId: 'period-1',
        timerMs: 60000,
      });

      expect(result.match_id).toBe('match-123');
      expect(result.status).toBe('LIVE');
      expect(result.current_period_id).toBe('period-1');
      expect(result.timer_ms).toBe(60000);
      expect(result.last_updated_at).toBeDefined();
    });

    it('handles minimal input with defaults', () => {
      const result = matchStateWriteToDb('match-123', {
        status: 'NOT_STARTED',
      });

      expect(result.match_id).toBe('match-123');
      expect(result.status).toBe('NOT_STARTED');
      expect(result.timer_ms).toBe(0);
      expect(result.current_period_id).toBeUndefined();
    });
  });

  describe('matchPeriodWriteToDb', () => {
    it('transforms write input to db format', () => {
      const now = Date.now();
      const result = matchPeriodWriteToDb({
        matchId: 'match-123',
        periodNumber: 2,
        periodType: 'EXTRA_TIME',
        startedAt: now,
      });

      expect(result.match_id).toBe('match-123');
      expect(result.period_number).toBe(2);
      expect(result.period_type).toBe('EXTRA_TIME');
      expect(result.started_at).toBe(now);
    });

    it('handles minimal input with defaults', () => {
      const before = Date.now();
      const result = matchPeriodWriteToDb({
        matchId: 'match-123',
        periodNumber: 1,
      });
      const after = Date.now();

      expect(result.match_id).toBe('match-123');
      expect(result.period_number).toBe(1);
      expect(result.period_type).toBe('REGULAR');
      expect(result.started_at).toBeGreaterThanOrEqual(before);
      expect(result.started_at).toBeLessThanOrEqual(after);
    });
  });
});
