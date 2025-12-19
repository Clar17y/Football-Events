import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock all dependencies before importing the service
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn()
}));

vi.mock('../../src/utils/prismaErrorHandler', () => ({
  withPrismaErrorHandling: vi.fn()
}));

vi.mock('../../src/utils/softDeleteUtils', () => ({
  createOrRestoreSoftDeleted: vi.fn()
}));

vi.mock('@shared/types', () => ({
  transformMatchPeriod: vi.fn(),
  safeTransformMatchPeriod: vi.fn(),
  transformMatchPeriods: vi.fn()
}));

// Now import the service after mocking
import { MatchPeriodsService } from '../../src/services/MatchPeriodsService';

const mockPrismaClient = {
  match: {
    findFirst: vi.fn(),
  },
  match_periods: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  match_state: {
    updateMany: vi.fn(),
  },
};

describe('MatchPeriodsService', () => {
  let service: MatchPeriodsService;
  const mockUserId = 'user-123';
  const mockMatchId = 'match-456';
  const mockPeriodId = 'period-789';
  const mockAdminRole = 'ADMIN';
  const mockUserRole = 'USER';

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup mocks
    const { PrismaClient } = await import('@prisma/client');
    const { withPrismaErrorHandling } = await import('../../src/utils/prismaErrorHandler');
    const { createOrRestoreSoftDeleted } = await import('../../src/utils/softDeleteUtils');
    const { transformMatchPeriod, safeTransformMatchPeriod, transformMatchPeriods } = await import('@shared/types');
    
    vi.mocked(PrismaClient).mockImplementation(() => mockPrismaClient as any);
    
    // Mock the withPrismaErrorHandling to just execute the function
    vi.mocked(withPrismaErrorHandling).mockImplementation(async (fn: Function) => await fn());

    // Mock createOrRestoreSoftDeleted
    vi.mocked(createOrRestoreSoftDeleted).mockImplementation(async ({ createData, transformer }: any) => {
      const mockPeriod = {
        id: 'period-123',
        ...createData,
        created_at: new Date(),
        updated_at: null,
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false,
      };
      return transformer ? transformer(mockPeriod) : mockPeriod;
    });

    // Mock transformers
    vi.mocked(transformMatchPeriod).mockImplementation((period: any) => ({
      id: period.id,
      matchId: period.match_id,
      periodNumber: period.period_number,
      periodType: period.period_type,
      startedAt: period.started_at,
      endedAt: period.ended_at,
      durationSeconds: period.duration_seconds,
      createdAt: period.created_at,
      updatedAt: period.updated_at,
      createdByUserId: period.created_by_user_id,
      deletedAt: period.deleted_at,
      deletedByUserId: period.deleted_by_user_id,
      isDeleted: period.is_deleted,
    }));

    vi.mocked(safeTransformMatchPeriod).mockImplementation((period: any) => 
      period ? vi.mocked(transformMatchPeriod)(period) : null
    );

    vi.mocked(transformMatchPeriods).mockImplementation((periods: any[]) => 
      periods.map(period => vi.mocked(transformMatchPeriod)(period))
    );
    
    service = new MatchPeriodsService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('User Permission Validation', () => {
    it('should allow admin users to access any match', async () => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: 'other-user',
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });

      mockPrismaClient.match_periods.findMany.mockResolvedValue([]);

      await expect(service.getMatchPeriods(mockMatchId, mockUserId, mockAdminRole))
        .resolves.toEqual([]);
    });

    it('should allow match creator to access periods', async () => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });

      mockPrismaClient.match_periods.findMany.mockResolvedValue([]);

      await expect(service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole))
        .resolves.toEqual([]);
    });

    it('should allow home team owner to access periods', async () => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: 'other-user',
        homeTeam: { created_by_user_id: mockUserId },
        awayTeam: { created_by_user_id: 'other-user' }
      });

      mockPrismaClient.match_periods.findMany.mockResolvedValue([]);

      await expect(service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole))
        .resolves.toEqual([]);
    });

    it('should allow away team owner to access periods', async () => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: 'other-user',
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: mockUserId }
      });

      mockPrismaClient.match_periods.findMany.mockResolvedValue([]);

      await expect(service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole))
        .resolves.toEqual([]);
    });

    it('should deny access to unauthorized users', async () => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: 'other-user',
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });

      await expect(service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole))
        .rejects.toThrow('Access denied: You do not have permission to view periods for this match');
    });

    it('should deny access when match not found', async () => {
      mockPrismaClient.match.findFirst.mockResolvedValue(null);

      await expect(service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole))
        .rejects.toThrow('Access denied: You do not have permission to view periods for this match');
    });
  });

  describe('startPeriod', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should start a new regular period successfully', async () => {
      mockPrismaClient.match_periods.findFirst
        .mockResolvedValueOnce(null) // No active period
        .mockResolvedValueOnce(null); // No previous periods

      const result = await service.startPeriod(mockMatchId, 'regular', mockUserId, mockUserRole);

      expect(result).toMatchObject({
        matchId: mockMatchId,
        periodNumber: 1,
        periodType: 'regular'
      });

      expect(mockPrismaClient.match_state.updateMany).toHaveBeenCalledWith({
        where: { match_id: mockMatchId, is_deleted: false },
        data: {
          current_period: 1,
          current_period_type: 'regular',
          updated_at: expect.any(Date)
        }
      });
    });

    it('should start extra time period without updating match state', async () => {
      mockPrismaClient.match_periods.findFirst
        .mockResolvedValueOnce(null) // No active period
        .mockResolvedValueOnce(null); // No previous extra time periods

      const result = await service.startPeriod(mockMatchId, 'extra_time', mockUserId, mockUserRole);

      expect(result).toMatchObject({
        matchId: mockMatchId,
        periodNumber: 1,
        periodType: 'extra_time'
      });

      expect(mockPrismaClient.match_state.updateMany).not.toHaveBeenCalled();
    });

    it('should calculate correct period number for subsequent periods', async () => {
      mockPrismaClient.match_periods.findFirst
        .mockResolvedValueOnce(null) // No active period
        .mockResolvedValueOnce({ period_number: 2 }); // Last period was number 2

      const result = await service.startPeriod(mockMatchId, 'regular', mockUserId, mockUserRole);

      expect(result).toMatchObject({
        periodNumber: 3
      });
    });

    it('should reject invalid period types', async () => {
      await expect(service.startPeriod(mockMatchId, 'invalid_type', mockUserId, mockUserRole))
        .rejects.toThrow('Invalid period type: invalid_type');
    });

    it('should prevent starting period when another is active', async () => {
      mockPrismaClient.match_periods.findFirst.mockResolvedValueOnce({
        id: 'active-period',
        started_at: new Date(),
        ended_at: null
      });

      await expect(service.startPeriod(mockMatchId, 'regular', mockUserId, mockUserRole))
        .rejects.toThrow('Cannot start new period: another period is already active');
    });
  });

  describe('endPeriod', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should end an active period successfully', async () => {
      const startTime = new Date(Date.now() - 60000); // 1 minute ago
      mockPrismaClient.match_periods.findFirst.mockResolvedValue({
        id: mockPeriodId,
        match_id: mockMatchId,
        started_at: startTime,
        ended_at: null,
        is_deleted: false
      });

      const updatedPeriod = {
        id: mockPeriodId,
        match_id: mockMatchId,
        period_number: 1,
        period_type: 'regular',
        started_at: startTime,
        ended_at: new Date(),
        duration_seconds: 60,
        created_at: new Date(),
        updated_at: new Date(),
        created_by_user_id: mockUserId,
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false
      };

      mockPrismaClient.match_periods.update.mockResolvedValue(updatedPeriod);

      const result = await service.endPeriod(mockMatchId, mockPeriodId, mockUserId, mockUserRole);

      expect(result).toMatchObject({
        id: mockPeriodId,
        matchId: mockMatchId
      });

      expect(mockPrismaClient.match_periods.update).toHaveBeenCalledWith({
        where: { id: mockPeriodId },
        data: {
          ended_at: expect.any(Date),
          duration_seconds: expect.any(Number),
          updated_at: expect.any(Date)
        }
      });
    });

    it('should reject ending non-existent period', async () => {
      mockPrismaClient.match_periods.findFirst.mockResolvedValue(null);

      await expect(service.endPeriod(mockMatchId, mockPeriodId, mockUserId, mockUserRole))
        .rejects.toThrow('Period not found');
    });

    it('should reject ending already ended period', async () => {
      mockPrismaClient.match_periods.findFirst.mockResolvedValue({
        id: mockPeriodId,
        match_id: mockMatchId,
        started_at: new Date(),
        ended_at: new Date(),
        is_deleted: false
      });

      await expect(service.endPeriod(mockMatchId, mockPeriodId, mockUserId, mockUserRole))
        .rejects.toThrow('Period is already ended');
    });

    it('should reject ending period that was never started', async () => {
      mockPrismaClient.match_periods.findFirst.mockResolvedValue({
        id: mockPeriodId,
        match_id: mockMatchId,
        started_at: null,
        ended_at: null,
        is_deleted: false
      });

      await expect(service.endPeriod(mockMatchId, mockPeriodId, mockUserId, mockUserRole))
        .rejects.toThrow('Cannot end period that was never started');
    });
  });

  describe('getMatchPeriods', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should return all periods for a match', async () => {
      const mockPeriods = [
        {
          id: 'period-1',
          match_id: mockMatchId,
          period_number: 1,
          period_type: 'regular',
          started_at: new Date(),
          ended_at: new Date(),
          duration_seconds: 900,
          created_at: new Date(),
          updated_at: null,
          created_by_user_id: mockUserId,
          deleted_at: null,
          deleted_by_user_id: null,
          is_deleted: false
        },
        {
          id: 'period-2',
          match_id: mockMatchId,
          period_number: 2,
          period_type: 'regular',
          started_at: new Date(),
          ended_at: null,
          duration_seconds: null,
          created_at: new Date(),
          updated_at: null,
          created_by_user_id: mockUserId,
          deleted_at: null,
          deleted_by_user_id: null,
          is_deleted: false
        }
      ];

      mockPrismaClient.match_periods.findMany.mockResolvedValue(mockPeriods);

      const result = await service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'period-1',
        matchId: mockMatchId,
        periodNumber: 1,
        periodType: 'regular'
      });

      expect(mockPrismaClient.match_periods.findMany).toHaveBeenCalledWith({
        where: {
          match_id: mockMatchId,
          is_deleted: false
        },
        orderBy: [
          { period_type: 'asc' },
          { period_number: 'asc' }
        ]
      });
    });

    it('should return empty array when no periods exist', async () => {
      mockPrismaClient.match_periods.findMany.mockResolvedValue([]);

      const result = await service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole);

      expect(result).toEqual([]);
    });
  });

  describe('calculateElapsedTime', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should calculate total elapsed time from completed periods', async () => {
      const completedPeriods = [
        { duration_seconds: 900 }, // 15 minutes
        { duration_seconds: 900 }  // 15 minutes
      ];

      mockPrismaClient.match_periods.findMany.mockResolvedValue(completedPeriods);
      mockPrismaClient.match_periods.findFirst.mockResolvedValue(null); // No active period

      const result = await service.calculateElapsedTime(mockMatchId, mockUserId, mockUserRole);

      expect(result).toBe(1800); // 30 minutes total
    });

    it('should include time from active period', async () => {
      const completedPeriods = [
        { duration_seconds: 900 } // 15 minutes
      ];

      const activePeriod = {
        started_at: new Date(Date.now() - 300000) // 5 minutes ago
      };

      mockPrismaClient.match_periods.findMany.mockResolvedValue(completedPeriods);
      mockPrismaClient.match_periods.findFirst.mockResolvedValue(activePeriod);

      const result = await service.calculateElapsedTime(mockMatchId, mockUserId, mockUserRole);

      expect(result).toBeGreaterThanOrEqual(1200); // At least 20 minutes (15 + 5)
      expect(result).toBeLessThan(1210); // Less than 20 minutes 10 seconds (accounting for test execution time)
    });

    it('should handle periods with null duration_seconds', async () => {
      const completedPeriods = [
        { duration_seconds: 900 },
        { duration_seconds: null }
      ];

      mockPrismaClient.match_periods.findMany.mockResolvedValue(completedPeriods);
      mockPrismaClient.match_periods.findFirst.mockResolvedValue(null);

      const result = await service.calculateElapsedTime(mockMatchId, mockUserId, mockUserRole);

      expect(result).toBe(900); // Only count the non-null duration
    });
  });

  describe('getCurrentPeriod', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should return active period when one exists', async () => {
      const activePeriod = {
        id: 'active-period',
        match_id: mockMatchId,
        period_number: 2,
        period_type: 'regular',
        started_at: new Date(),
        ended_at: null,
        duration_seconds: null,
        created_at: new Date(),
        updated_at: null,
        created_by_user_id: mockUserId,
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false
      };

      mockPrismaClient.match_periods.findFirst.mockResolvedValue(activePeriod);

      const result = await service.getCurrentPeriod(mockMatchId, mockUserId, mockUserRole);

      expect(result).toMatchObject({
        id: 'active-period',
        matchId: mockMatchId,
        periodNumber: 2,
        periodType: 'regular'
      });
    });

    it('should return null when no active period exists', async () => {
      mockPrismaClient.match_periods.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentPeriod(mockMatchId, mockUserId, mockUserRole);

      expect(result).toBeNull();
    });
  });

  describe('getPeriodsByType', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should return periods of specified type', async () => {
      const regularPeriods = [
        {
          id: 'period-1',
          match_id: mockMatchId,
          period_number: 1,
          period_type: 'regular',
          started_at: new Date(),
          ended_at: new Date(),
          duration_seconds: 900,
          created_at: new Date(),
          updated_at: null,
          created_by_user_id: mockUserId,
          deleted_at: null,
          deleted_by_user_id: null,
          is_deleted: false
        }
      ];

      mockPrismaClient.match_periods.findMany.mockResolvedValue(regularPeriods);

      const result = await service.getPeriodsByType(mockMatchId, 'regular', mockUserId, mockUserRole);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        periodType: 'regular'
      });

      expect(mockPrismaClient.match_periods.findMany).toHaveBeenCalledWith({
        where: {
          match_id: mockMatchId,
          period_type: 'regular',
          is_deleted: false
        },
        orderBy: { period_number: 'asc' }
      });
    });

    it('should reject invalid period types', async () => {
      await expect(service.getPeriodsByType(mockMatchId, 'invalid_type', mockUserId, mockUserRole))
        .rejects.toThrow('Invalid period type: invalid_type');
    });
  });

  describe('deletePeriod', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should soft delete a period successfully', async () => {
      mockPrismaClient.match_periods.findFirst.mockResolvedValue({
        id: mockPeriodId,
        match_id: mockMatchId,
        is_deleted: false
      });

      await service.deletePeriod(mockMatchId, mockPeriodId, mockUserId, mockUserRole);

      expect(mockPrismaClient.match_periods.update).toHaveBeenCalledWith({
        where: { id: mockPeriodId },
        data: {
          is_deleted: true,
          deleted_at: expect.any(Date),
          deleted_by_user_id: mockUserId,
          updated_at: expect.any(Date)
        }
      });
    });

    it('should reject deleting non-existent period', async () => {
      mockPrismaClient.match_periods.findFirst.mockResolvedValue(null);

      await expect(service.deletePeriod(mockMatchId, mockPeriodId, mockUserId, mockUserRole))
        .rejects.toThrow('Period not found');
    });
  });

  describe('Period Type Validation', () => {
    it('should accept valid period types', () => {
      const validTypes = ['regular', 'extra_time', 'penalty_shootout'];
      
      validTypes.forEach(type => {
        expect(() => {
          // Access private method through any cast for testing
          (service as any).validatePeriodType(type);
        }).not.toThrow();
      });
    });

    it('should reject invalid period types', () => {
      const invalidTypes = ['invalid', 'overtime', 'break'];
      
      invalidTypes.forEach(type => {
        const result = (service as any).validatePeriodType(type);
        expect(result).toBe(false);
      });
    });
  });

  describe('Soft Delete Functionality', () => {
    beforeEach(() => {
      mockPrismaClient.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId,
        homeTeam: { created_by_user_id: 'other-user' },
        awayTeam: { created_by_user_id: 'other-user' }
      });
    });

    it('should filter out soft deleted periods in queries', async () => {
      mockPrismaClient.match_periods.findMany.mockResolvedValue([]);

      await service.getMatchPeriods(mockMatchId, mockUserId, mockUserRole);

      expect(mockPrismaClient.match_periods.findMany).toHaveBeenCalledWith({
        where: {
          match_id: mockMatchId,
          is_deleted: false
        },
        orderBy: [
          { period_type: 'asc' },
          { period_number: 'asc' }
        ]
      });
    });

    it('should use soft delete restoration when creating periods', async () => {
      mockPrismaClient.match_periods.findFirst
        .mockResolvedValueOnce(null) // No active period
        .mockResolvedValueOnce(null); // No previous periods

      await service.startPeriod(mockMatchId, 'regular', mockUserId, mockUserRole);

      const { createOrRestoreSoftDeleted } = await import('../../src/utils/softDeleteUtils');
      expect(vi.mocked(createOrRestoreSoftDeleted)).toHaveBeenCalledWith({
        prisma: mockPrismaClient,
        model: 'match_periods',
        uniqueConstraints: {
          match_id: mockMatchId,
          period_number: 1,
          period_type: 'regular'
        },
        createData: expect.objectContaining({
          match_id: mockMatchId,
          period_number: 1,
          period_type: 'regular',
          started_at: expect.any(Date)
        }),
        userId: mockUserId,
        transformer: expect.any(Function)
      });
    });
  });
});