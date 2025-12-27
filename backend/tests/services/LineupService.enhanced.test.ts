import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Prisma Client before importing the service
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn()
}));

// Mock utility functions
vi.mock('../../src/utils/prismaErrorHandler', () => ({
  withPrismaErrorHandling: vi.fn((fn) => fn())
}));

vi.mock('../../src/utils/softDeleteUtils', () => ({
  createOrRestoreSoftDeleted: vi.fn(),
  SoftDeletePatterns: {
    lineup: vi.fn()
  }
}));

import { LineupService } from '../../src/services/LineupService';
import { PrismaClient } from '@prisma/client';
import type { LineupWithDetails, PlayerWithPosition, SubstitutionResult } from '@shared/types';

describe('LineupService - Enhanced Functionality', () => {
  let lineupService: LineupService;
  let mockPrisma: any;

  const mockUserId = 'user-123';
  const mockMatchId = 'match-456';
  const mockPlayerOffId = 'player-off-789';
  const mockPlayerOnId = 'player-on-101';

  const mockMatch = {
    match_id: mockMatchId,
    created_by_user_id: mockUserId,
    home_team_id: 'team-home-123',
    away_team_id: 'team-away-456',
    is_deleted: false
  };

  const mockPlayer = {
    id: 'player-123',
    name: 'Test Player',
    squad_number: 10,
    preferred_pos: 'ST',
    dob: new Date('2000-01-01'),
    notes: 'Test notes',
    created_at: new Date(),
    updated_at: new Date(),
    created_by_user_id: mockUserId,
    deleted_at: null,
    deleted_by_user_id: null,
    is_deleted: false
  };

  const mockLineup = {
    id: 'lineup-123',
    match_id: mockMatchId,
    player_id: 'player-123',
    start_min: 0,
    end_min: null,
    position: 'ST',
    pitch_x: 50.0,
    pitch_y: 80.0,
    substitution_reason: null,
    created_at: new Date(),
    updated_at: new Date(),
    created_by_user_id: mockUserId,
    deleted_at: null,
    deleted_by_user_id: null,
    is_deleted: false,
    players: mockPlayer
  };

  beforeEach(() => {
    mockPrisma = {
      match: {
        findFirst: vi.fn()
      },
      player_teams: {
        findFirst: vi.fn()
      },
      lineup: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        create: vi.fn()
      },
      event: {
        create: vi.fn()
      },
      $transaction: vi.fn(),
      $disconnect: vi.fn()
    };

    // Mock the PrismaClient constructor
    (PrismaClient as any).mockImplementation(() => mockPrisma);
    
    lineupService = new LineupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getCurrentLineup', () => {
    it('should return current lineup for a match at specific time', async () => {
      const currentTime = 45; // 45 minutes into the match
      
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.lineup.findMany.mockResolvedValue([mockLineup]);

      const result = await lineupService.getCurrentLineup(mockMatchId, currentTime, mockUserId, 'USER');

      expect(mockPrisma.match.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            match_id: mockMatchId,
            is_deleted: false,
            created_by_user_id: mockUserId
          }
        })
      );

      expect(mockPrisma.lineup.findMany).toHaveBeenCalledWith({
        where: {
          match_id: mockMatchId,
          is_deleted: false,
          start_min: { lte: currentTime },
          OR: [
            { end_min: null },
            { end_min: { gt: currentTime } }
          ]
        },
        include: {
          players: {
            select: {
              id: true,
              name: true,
              squad_number: true,
              preferred_pos: true,
              dob: true,
              notes: true,
              created_at: true,
              updated_at: true,
              created_by_user_id: true,
              deleted_at: true,
              deleted_by_user_id: true,
              is_deleted: true
            }
          }
        },
        orderBy: [{ start_min: 'desc' }]
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('player');
      expect(result[0].player.name).toBe('Test Player');
    });

    it('should return empty array when user has no access to match', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(null);

      const result = await lineupService.getCurrentLineup(mockMatchId, 45, mockUserId, 'USER');

      expect(result).toEqual([]);
    });

    it('should allow admin access to any match', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.lineup.findMany.mockResolvedValue([mockLineup]);

      await lineupService.getCurrentLineup(mockMatchId, 45, 'admin-user', 'ADMIN');

      expect(mockPrisma.match.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            match_id: mockMatchId,
            is_deleted: false
          }
        })
      );
    });
  });

  describe('getActivePlayersAtTime', () => {
    it('should return active players at specific time', async () => {
      const timeMinutes = 30;
      
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.lineup.findMany.mockResolvedValue([mockLineup]);

      const result = await lineupService.getActivePlayersAtTime(mockMatchId, timeMinutes, mockUserId, 'USER');

      expect(mockPrisma.lineup.findMany).toHaveBeenCalledWith({
        where: {
          match_id: mockMatchId,
          is_deleted: false,
          start_min: { lte: timeMinutes },
          OR: [
            { end_min: null },
            { end_min: { gt: timeMinutes } }
          ]
        },
        include: {
          players: {
            select: {
              id: true,
              name: true,
              squad_number: true,
              preferred_pos: true,
              dob: true,
              notes: true,
              created_at: true,
              updated_at: true,
              created_by_user_id: true,
              deleted_at: true,
              deleted_by_user_id: true,
              is_deleted: true
            }
          }
        },
        orderBy: [{ start_min: 'desc' }]
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('position');
      expect(result[0].name).toBe('Test Player');
    });

    it('should deduplicate players and keep most recent lineup entry', async () => {
      const duplicateLineup = {
        ...mockLineup,
        id: 'lineup-456',
        start_min: 10,
        players: mockPlayer
      };

      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.lineup.findMany.mockResolvedValue([mockLineup, duplicateLineup]);

      const result = await lineupService.getActivePlayersAtTime(mockMatchId, 30, mockUserId, 'USER');

      // Should only return one player despite two lineup entries
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Player');
    });

    it('should return empty array when user has no access to match', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(null);

      const result = await lineupService.getActivePlayersAtTime(mockMatchId, 30, mockUserId, 'USER');

      expect(result).toEqual([]);
    });
  });

  describe('makeSubstitution', () => {
    const currentTime = 60;
    const position = 'ST';
    const substitutionReason = 'Tactical change';

    const mockCurrentLineup = {
      id: 'current-lineup-123',
      match_id: mockMatchId,
      player_id: mockPlayerOffId,
      start_min: 0,
      end_min: null,
      position: 'ST',
      created_at: new Date(),
      updated_at: new Date(),
      created_by_user_id: mockUserId,
      deleted_at: null,
      deleted_by_user_id: null,
      is_deleted: false,
      players: {
        ...mockPlayer,
        id: mockPlayerOffId,
        name: 'Player Off'
      }
    };

    const mockNewLineup = {
      id: 'new-lineup-456',
      match_id: mockMatchId,
      player_id: mockPlayerOnId,
      start_min: currentTime,
      end_min: null,
      position: 'ST',
      created_at: new Date(),
      updated_at: new Date(),
      created_by_user_id: mockUserId,
      deleted_at: null,
      deleted_by_user_id: null,
      is_deleted: false,
      players: {
        ...mockPlayer,
        id: mockPlayerOnId,
        name: 'Player On'
      }
    };

    const mockEvent = {
      id: 'event-123',
      match_id: mockMatchId,
      kind: 'ball_out',
      player_id: mockPlayerOffId,
      team_id: mockMatch.home_team_id,
      notes: 'Player Off substituted off',
      clock_ms: currentTime * 60 * 1000,
      created_by_user_id: mockUserId,
      created_at: new Date(),
      period_number: null,
      sentiment: 0,
      updated_at: null,
      deleted_at: null,
      deleted_by_user_id: null,
      is_deleted: false
    };

    beforeEach(() => {
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          lineup: {
            findFirst: vi.fn().mockResolvedValue(mockCurrentLineup),
            update: vi.fn().mockResolvedValue({
              ...mockCurrentLineup,
              end_min: currentTime,
              substitution_reason: substitutionReason
            }),
            create: vi.fn().mockResolvedValue(mockNewLineup)
          },
          event: {
            create: vi.fn().mockResolvedValue(mockEvent)
          }
        };
        return callback(mockTx);
      });
    });

    it('should successfully make a substitution', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.player_teams.findFirst
        .mockResolvedValueOnce({ player_id: mockPlayerOffId })
        .mockResolvedValueOnce({ player_id: mockPlayerOnId });

      const result = await lineupService.makeSubstitution(
        mockMatchId,
        mockPlayerOffId,
        mockPlayerOnId,
        position,
        currentTime,
        mockUserId,
        'USER',
        substitutionReason
      );

      expect(mockPrisma.match.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            match_id: mockMatchId,
            is_deleted: false,
            created_by_user_id: mockUserId
          }
        })
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toHaveProperty('playerOff');
      expect(result).toHaveProperty('playerOn');
      expect(result).toHaveProperty('timelineEvents');
      expect(result.timelineEvents).toHaveLength(2);
    });

    it('should throw error when match not found or access denied', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(null);

      await expect(
        lineupService.makeSubstitution(
          mockMatchId,
          mockPlayerOffId,
          mockPlayerOnId,
          position,
          currentTime,
          mockUserId,
          'USER'
        )
      ).rejects.toThrow('Match not found or access denied');
    });

    it('should throw error when player is not currently on pitch', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.player_teams.findFirst
        .mockResolvedValueOnce({ player_id: mockPlayerOffId })
        .mockResolvedValueOnce({ player_id: mockPlayerOnId });
      
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        const mockTx = {
          lineup: {
            findFirst: vi.fn().mockResolvedValue(null), // Player not found on pitch
            update: vi.fn(),
            create: vi.fn()
          },
          event: {
            create: vi.fn()
          }
        };
        return callback(mockTx);
      });

      await expect(
        lineupService.makeSubstitution(
          mockMatchId,
          mockPlayerOffId,
          mockPlayerOnId,
          position,
          currentTime,
          mockUserId,
          'USER'
        )
      ).rejects.toThrow('Player is not currently on the pitch');
    });

    it('should allow admin to make substitutions for any match', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.player_teams.findFirst
        .mockResolvedValueOnce({ player_id: mockPlayerOffId })
        .mockResolvedValueOnce({ player_id: mockPlayerOnId });

      await lineupService.makeSubstitution(
        mockMatchId,
        mockPlayerOffId,
        mockPlayerOnId,
        position,
        currentTime,
        'admin-user',
        'ADMIN'
      );

      expect(mockPrisma.match.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            match_id: mockMatchId,
            is_deleted: false
          }
        })
      );
    });

    it('should handle substitution without reason', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.player_teams.findFirst
        .mockResolvedValueOnce({ player_id: mockPlayerOffId })
        .mockResolvedValueOnce({ player_id: mockPlayerOnId });

      const result = await lineupService.makeSubstitution(
        mockMatchId,
        mockPlayerOffId,
        mockPlayerOnId,
        position,
        currentTime,
        mockUserId,
        'USER'
      );

      expect(result).toHaveProperty('playerOff');
      expect(result).toHaveProperty('playerOn');
      expect(result).toHaveProperty('timelineEvents');
    });
  });

  describe('Integration with existing methods', () => {
    it('should maintain compatibility with existing lineup operations', async () => {
      // Test that new methods don't break existing functionality
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.lineup.findMany.mockResolvedValue([]);

      const lineups = await lineupService.getLineupsByMatch(mockMatchId, mockUserId, 'USER');
      
      expect(lineups).toEqual([]);
      expect(mockPrisma.match.findFirst).toHaveBeenCalled();
      expect(mockPrisma.lineup.findMany).toHaveBeenCalled();
    });
  });

  describe('Time-based calculations', () => {
    it('should correctly handle players who started at different times', async () => {
      const lineup1 = { ...mockLineup, start_min: 0, end_min: 30 };
      const lineup2 = { ...mockLineup, id: 'lineup-456', start_min: 30, end_min: null };
      
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.lineup.findMany.mockResolvedValue([lineup1, lineup2]);

      const result = await lineupService.getCurrentLineup(mockMatchId, 45, mockUserId, 'USER');

      expect(result).toHaveLength(2);
    });

    it('should exclude players who were substituted off before current time', async () => {
      const substitutedOffLineup = { 
        ...mockLineup, 
        start_min: 0, 
        end_min: 30 // Substituted off at 30 minutes
      };
      
      mockPrisma.match.findFirst.mockResolvedValue(mockMatch);
      mockPrisma.lineup.findMany.mockResolvedValue([substitutedOffLineup]);

      const result = await lineupService.getCurrentLineup(mockMatchId, 45, mockUserId, 'USER');

      // Should not include the substituted off player at 45 minutes
      expect(mockPrisma.lineup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { end_min: null },
              { end_min: { gt: 45 } }
            ]
          })
        })
      );
    });
  });
});
