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
    defaultLineup: vi.fn((teamId: string, userId: string) => ({
      team_id: teamId,
      created_by_user_id: userId
    }))
  }
}));

import { DefaultLineupService, FormationPlayer } from '../../src/services/DefaultLineupService';
import { PrismaClient } from '@prisma/client';

describe('DefaultLineupService', () => {
  let service: DefaultLineupService;
  let mockPrisma: any;
  
  const mockUserId = 'user-123';
  const mockTeamId = 'team-456';
  const mockMatchId = 'match-789';
  
  const validFormation: FormationPlayer[] = [
    { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
    { playerId: 'player-2', position: 'CB', pitchX: 30, pitchY: 30 },
    { playerId: 'player-3', position: 'CB', pitchX: 70, pitchY: 30 }
  ];

  beforeEach(() => {
    // Create mock Prisma client
    mockPrisma = {
      team: {
        findFirst: vi.fn(),
        findMany: vi.fn()
      },
      player: {
        findMany: vi.fn()
      },
      player_teams: {
        findMany: vi.fn()
      },
      default_lineups: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
        create: vi.fn()
      },
      lineup: {
        create: vi.fn()
      },
      live_formations: {
        create: vi.fn()
      },
      match: {
        findFirst: vi.fn()
      },
      $transaction: vi.fn(),
      $disconnect: vi.fn()
    };

    // Mock PrismaClient constructor
    vi.mocked(PrismaClient).mockImplementation(() => mockPrisma);
    
    service = new DefaultLineupService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Formation Validation', () => {
    it('should validate correct formation data', () => {
      const result = service.validateFormation(validFormation);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject formation with invalid player data', () => {
      const invalidFormation = [
        { playerId: '', position: 'GK', pitchX: 50, pitchY: 10 }, // Invalid playerId
        { playerId: 'player-2', position: '', pitchX: 30, pitchY: 30 }, // Invalid position
        { playerId: 'player-3', position: 'CB', pitchX: -10, pitchY: 30 }, // Invalid pitchX
        { playerId: 'player-4', position: 'CB', pitchX: 50, pitchY: 150 } // Invalid pitchY
      ];

      const result = service.validateFormation(invalidFormation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('Player ID is required'))).toBe(true);
      expect(result.errors.some(error => error.includes('Position is required'))).toBe(true);
      expect(result.errors.some(error => error.includes('Pitch X coordinate'))).toBe(true);
      expect(result.errors.some(error => error.includes('Pitch Y coordinate'))).toBe(true);
    });

    it('should reject formation with duplicate players', () => {
      const duplicateFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
        { playerId: 'player-1', position: 'CB', pitchX: 30, pitchY: 30 } // Duplicate player
      ];

      const result = service.validateFormation(duplicateFormation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('duplicate players'))).toBe(true);
    });

    it('should reject formation with more than 11 players', () => {
      const oversizedFormation = Array.from({ length: 12 }, (_, i) => ({
        playerId: `player-${i + 1}`,
        position: 'CB',
        pitchX: 50,
        pitchY: 30
      }));

      const result = service.validateFormation(oversizedFormation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('more than 11 players'))).toBe(true);
    });

    it('should reject empty formation', () => {
      const result = service.validateFormation([]);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('cannot be empty'))).toBe(true);
    });

    it('should reject non-array formation', () => {
      const result = service.validateFormation('invalid' as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('must be an array'))).toBe(true);
    });
  });

  describe('saveDefaultLineup', () => {
    beforeEach(() => {
      // Mock successful team access
      mockPrisma.team.findFirst.mockResolvedValue({
        id: mockTeamId,
        name: 'Test Team',
        created_by_user_id: mockUserId
      });

      // Mock successful player validation
      mockPrisma.player_teams.findMany.mockResolvedValue([
        { player_id: 'player-1' },
        { player_id: 'player-2' },
        { player_id: 'player-3' }
      ]);
    });

    it('should save valid default lineup successfully', async () => {
      const mockCreatedLineup = {
        id: 'lineup-123',
        team_id: mockTeamId,
        formation_data: validFormation as any,
        created_at: new Date(),
        updated_at: null,
        created_by_user_id: mockUserId,
        deleted_at: null,
        deleted_by_user_id: null,
        is_deleted: false
      };

      mockPrisma.default_lineups.findFirst
        .mockResolvedValueOnce(null) // No existing lineup
        .mockResolvedValueOnce(null); // No soft-deleted lineup
      mockPrisma.default_lineups.create.mockResolvedValue(mockCreatedLineup);

      const result = await service.saveDefaultLineup(mockTeamId, validFormation, mockUserId);

      expect(result).toEqual({
        id: mockCreatedLineup.id,
        teamId: mockCreatedLineup.team_id,
        formation: validFormation,
        createdAt: mockCreatedLineup.created_at.toISOString(),
        updatedAt: undefined,
        createdByUserId: mockCreatedLineup.created_by_user_id,
        deletedAt: undefined,
        deletedByUserId: undefined,
        isDeleted: mockCreatedLineup.is_deleted,
      });
      expect(mockPrisma.default_lineups.create).toHaveBeenCalledWith({
        data: {
          team_id: mockTeamId,
          formation_data: validFormation,
          created_by_user_id: mockUserId,
        },
      });
    });

    it('should reject invalid formation data', async () => {
      const invalidFormation = [
        { playerId: '', position: 'GK', pitchX: 50, pitchY: 10 }
      ];

      await expect(service.saveDefaultLineup(mockTeamId, invalidFormation, mockUserId))
        .rejects.toThrow('Formation validation failed');
    });

    it('should reject access to non-existent team', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      await expect(service.saveDefaultLineup(mockTeamId, validFormation, mockUserId))
        .rejects.toThrow('Team not found or access denied');
    });

    it('should reject players not in team', async () => {
      // Mock that only some players are in the team
      mockPrisma.player_teams.findMany.mockResolvedValue([
        { player_id: 'player-1' },
        { player_id: 'player-2' }
        // player-3 is missing
      ]);

      await expect(service.saveDefaultLineup(mockTeamId, validFormation, mockUserId))
        .rejects.toThrow('Players not found in team: player-3');
    });
  });

  describe('getDefaultLineup', () => {
    it('should return default lineup when found', async () => {
      const mockLineup = {
        id: 'lineup-123',
        team_id: mockTeamId,
        formation_data: validFormation,
        created_at: new Date(),
        created_by_user_id: mockUserId,
        is_deleted: false
      };

      mockPrisma.team.findFirst.mockResolvedValue({
        id: mockTeamId,
        created_by_user_id: mockUserId
      });
      mockPrisma.default_lineups.findFirst.mockResolvedValue(mockLineup);

      const result = await service.getDefaultLineup(mockTeamId, mockUserId);

      expect(result).toEqual({
        id: mockLineup.id,
        teamId: mockLineup.team_id,
        formation: mockLineup.formation_data,
        createdAt: mockLineup.created_at.toISOString(),
        updatedAt: undefined,
        createdByUserId: mockLineup.created_by_user_id,
        deletedAt: undefined,
        deletedByUserId: undefined,
        isDeleted: mockLineup.is_deleted
      });
    });

    it('should return null when team not found', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const result = await service.getDefaultLineup(mockTeamId, mockUserId);

      expect(result).toBeNull();
      expect(mockPrisma.default_lineups.findFirst).not.toHaveBeenCalled();
    });

    it('should return null when no default lineup exists', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: mockTeamId,
        created_by_user_id: mockUserId
      });
      mockPrisma.default_lineups.findFirst.mockResolvedValue(null);

      const result = await service.getDefaultLineup(mockTeamId, mockUserId);

      expect(result).toBeNull();
    });
  });

  describe('deleteDefaultLineup', () => {
    it('should delete existing default lineup successfully', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: mockTeamId,
        created_by_user_id: mockUserId
      });
      mockPrisma.default_lineups.findFirst.mockResolvedValue({
        id: 'lineup-123',
        team_id: mockTeamId
      });
      mockPrisma.default_lineups.update.mockResolvedValue({});

      const result = await service.deleteDefaultLineup(mockTeamId, mockUserId);

      expect(result).toBe(true);
      expect(mockPrisma.default_lineups.update).toHaveBeenCalledWith({
        where: { id: 'lineup-123' },
        data: {
          is_deleted: true,
          deleted_at: expect.any(Date),
          deleted_by_user_id: mockUserId
        }
      });
    });

    it('should return false when team not found', async () => {
      mockPrisma.team.findFirst.mockResolvedValue(null);

      const result = await service.deleteDefaultLineup(mockTeamId, mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when no default lineup exists', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: mockTeamId,
        created_by_user_id: mockUserId
      });
      mockPrisma.default_lineups.findFirst.mockResolvedValue(null);

      const result = await service.deleteDefaultLineup(mockTeamId, mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('applyDefaultToMatch', () => {
    const mockDefaultLineup = {
      id: 'lineup-123',
      teamId: mockTeamId,
      formation: validFormation,
      createdAt: new Date(),
      created_by_user_id: mockUserId,
      is_deleted: false
    };

    beforeEach(() => {
      // Mock getDefaultLineup to return valid lineup
      vi.spyOn(service, 'getDefaultLineup').mockResolvedValue(mockDefaultLineup);
      
      // Mock match access
      mockPrisma.match.findFirst.mockResolvedValue({
        match_id: mockMatchId,
        created_by_user_id: mockUserId
      });
    });

    it('should apply default lineup to match successfully', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));

      mockPrisma.player.findMany.mockResolvedValue(
        validFormation.map((fp) => ({
          id: fp.playerId,
          name: `Player ${fp.playerId}`,
          squad_number: null,
          preferred_pos: null,
        }))
      );
      mockPrisma.live_formations.create.mockResolvedValue({});

      const mockLineupRecords = validFormation.map((player, index) => ({
        id: `lineup-record-${index}`,
        match_id: mockMatchId,
        player_id: player.playerId,
        position: player.position,
        start_min: 0,
        pitch_x: player.pitchX,
        pitch_y: player.pitchY
      }));

      mockPrisma.lineup.create.mockImplementation((data: any) => 
        Promise.resolve(mockLineupRecords.find(record => 
          record.player_id === data.data.player_id
        ))
      );

      const result = await service.applyDefaultToMatch(mockTeamId, mockMatchId, mockUserId);

      expect(result).toHaveLength(validFormation.length);
      expect(mockPrisma.lineup.create).toHaveBeenCalledTimes(validFormation.length);
      
      validFormation.forEach((player) => {
        expect(mockPrisma.lineup.create).toHaveBeenCalledWith({
          data: {
            match_id: mockMatchId,
            player_id: player.playerId,
            position: player.position,
            start_min: 0,
            pitch_x: player.pitchX,
            pitch_y: player.pitchY,
            created_by_user_id: mockUserId
          }
        });
      });
      expect(mockPrisma.live_formations.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          match_id: mockMatchId,
          start_min: 0,
          created_by_user_id: mockUserId,
        }),
      });
    });

    it('should reject when no default lineup exists', async () => {
      vi.spyOn(service, 'getDefaultLineup').mockResolvedValue(null);

      await expect(service.applyDefaultToMatch(mockTeamId, mockMatchId, mockUserId))
        .rejects.toThrow('No default lineup found for team');
    });

    it('should reject when match not found', async () => {
      mockPrisma.match.findFirst.mockResolvedValue(null);

      await expect(service.applyDefaultToMatch(mockTeamId, mockMatchId, mockUserId))
        .rejects.toThrow('Match not found or access denied');
    });
  });

  describe('getTeamsWithDefaultLineups', () => {
    it('should return teams with default lineup status', async () => {
      const mockTeams = [
        { id: 'team-1', name: 'Team 1' },
        { id: 'team-2', name: 'Team 2' },
        { id: 'team-3', name: 'Team 3' }
      ];

      const mockDefaultLineups = [
        { team_id: 'team-1' },
        { team_id: 'team-3' }
      ];

      mockPrisma.team.findMany.mockResolvedValue(mockTeams);
      mockPrisma.default_lineups.findMany.mockResolvedValue(mockDefaultLineups);

      const result = await service.getTeamsWithDefaultLineups(mockUserId);

      expect(result).toEqual([
        { teamId: 'team-1', teamName: 'Team 1', hasDefaultLineup: true },
        { teamId: 'team-2', teamName: 'Team 2', hasDefaultLineup: false },
        { teamId: 'team-3', teamName: 'Team 3', hasDefaultLineup: true }
      ]);
    });

    it('should handle empty teams list', async () => {
      mockPrisma.team.findMany.mockResolvedValue([]);
      mockPrisma.default_lineups.findMany.mockResolvedValue([]);

      const result = await service.getTeamsWithDefaultLineups(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('Service Lifecycle', () => {
    it('should disconnect Prisma client properly', async () => {
      await service.disconnect();
      
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle Prisma errors in delete operation', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: mockTeamId,
        created_by_user_id: mockUserId
      });
      mockPrisma.default_lineups.findFirst.mockResolvedValue({
        id: 'lineup-123'
      });
      
      // Mock Prisma P2025 error (record not found)
      const prismaError = new Error('Record not found');
      (prismaError as any).code = 'P2025';
      mockPrisma.default_lineups.update.mockRejectedValue(prismaError);

      const result = await service.deleteDefaultLineup(mockTeamId, mockUserId);

      expect(result).toBe(false);
    });

    it('should propagate non-Prisma errors in delete operation', async () => {
      mockPrisma.team.findFirst.mockResolvedValue({
        id: mockTeamId,
        created_by_user_id: mockUserId
      });
      mockPrisma.default_lineups.findFirst.mockResolvedValue({
        id: 'lineup-123'
      });
      
      const genericError = new Error('Database connection failed');
      mockPrisma.default_lineups.update.mockRejectedValue(genericError);

      await expect(service.deleteDefaultLineup(mockTeamId, mockUserId))
        .rejects.toThrow('Database connection failed');
    });
  });
});
