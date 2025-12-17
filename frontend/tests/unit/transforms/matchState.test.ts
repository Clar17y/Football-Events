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
      matchId: 'match-123',
      status: 'LIVE',
      currentPeriodId: 'period-1',
      timerMs: 1800000, // 30 minutes
      lastUpdatedAt: 1700000001000,
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
      createdByUserId: 'user-456',
      isDeleted: false,
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

    it('calculates totalElapsedSeconds from timerMs', () => {
      const states = [
        { timerMs: 0, expected: 0 },
        { timerMs: 1000, expected: 1 },
        { timerMs: 60000, expected: 60 },
        { timerMs: 2700000, expected: 2700 },
      ];

      for (const { timerMs, expected } of states) {
        const state = { ...mockDbState, timerMs };
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
        isDeleted: true,
        deletedAt: 1700000002000,
        deletedByUserId: 'user-admin',
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
      matchId: 'match-456',
      periodNumber: 1,
      periodType: 'REGULAR',
      startedAt: 1700000000000,
      endedAt: 1700000900000,
      durationSeconds: 900,
      createdAt: 1699999999000,
      updatedAt: 1700000900000,
      createdByUserId: 'user-789',
      isDeleted: false,
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
        endedAt: undefined,
        durationSeconds: undefined,
      };

      const result = dbToMatchPeriod(activePeriod);

      expect(result.endedAt).toBeUndefined();
      expect(result.durationSeconds).toBeUndefined();
    });

    it('handles different period types', () => {
      const types = ['REGULAR', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'] as const;
      for (const periodType of types) {
        const period = { ...mockDbPeriod, periodType };
        const result = dbToMatchPeriod(period);
        expect(result.periodType).toBe(periodType);
      }
    });

    it('handles soft delete fields', () => {
      const deletedPeriod: LocalMatchPeriod = {
        ...mockDbPeriod,
        isDeleted: true,
        deletedAt: 1700000002000,
        deletedByUserId: 'user-admin',
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
          matchId: 'match-1',
          periodNumber: 1,
          periodType: 'REGULAR',
          startedAt: 1700000000000,
          endedAt: 1700000900000,
          createdAt: 1700000000000,
          updatedAt: 1700000900000,
          createdByUserId: 'user-1',
          isDeleted: false,
          synced: false,
        },
        {
          id: 'period-2',
          matchId: 'match-1',
          periodNumber: 2,
          periodType: 'REGULAR',
          startedAt: 1700001000000,
          createdAt: 1700001000000,
          updatedAt: 1700001000000,
          createdByUserId: 'user-1',
          isDeleted: false,
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

      expect(result.matchId).toBe('match-123');
      expect(result.status).toBe('LIVE');
      expect(result.currentPeriodId).toBe('period-1');
      expect(result.timerMs).toBe(60000);
      expect(result.lastUpdatedAt).toBeDefined();
    });

    it('handles minimal input with defaults', () => {
      const result = matchStateWriteToDb('match-123', {
        status: 'NOT_STARTED',
      });

      expect(result.matchId).toBe('match-123');
      expect(result.status).toBe('NOT_STARTED');
      expect(result.timerMs).toBe(0);
      expect(result.currentPeriodId).toBeUndefined();
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

      expect(result.matchId).toBe('match-123');
      expect(result.periodNumber).toBe(2);
      expect(result.periodType).toBe('EXTRA_TIME');
      expect(result.startedAt).toBe(now);
    });

    it('handles minimal input with defaults', () => {
      const before = Date.now();
      const result = matchPeriodWriteToDb({
        matchId: 'match-123',
        periodNumber: 1,
      });
      const after = Date.now();

      expect(result.matchId).toBe('match-123');
      expect(result.periodNumber).toBe(1);
      expect(result.periodType).toBe('REGULAR');
      expect(result.startedAt).toBeGreaterThanOrEqual(before);
      expect(result.startedAt).toBeLessThanOrEqual(after);
    });
  });
});
