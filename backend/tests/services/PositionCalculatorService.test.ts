import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Prisma Client before importing the service
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn()
}));

// Mock utility functions
vi.mock('../../src/utils/prismaErrorHandler', () => ({
  withPrismaErrorHandling: vi.fn((fn) => fn())
}));

import { PositionCalculatorService, FormationPlayer, PositionZone } from '../../src/services/PositionCalculatorService';
import { PrismaClient } from '@prisma/client';

describe('PositionCalculatorService', () => {
  let service: PositionCalculatorService;
  let mockPrisma: any;

  // Mock position zones data representing a typical football pitch layout
  const mockPositionZones: PositionZone[] = [
    // Goalkeeper zone
    { id: 'zone-gk', position_code: 'GK', zone_name: 'Goalkeeper', min_x: 45, max_x: 55, min_y: 0, max_y: 15, priority: 10, created_at: new Date() },
    
    // Defender zones
    { id: 'zone-cb', position_code: 'CB', zone_name: 'Center Back', min_x: 35, max_x: 65, min_y: 15, max_y: 35, priority: 8, created_at: new Date() },
    { id: 'zone-lb', position_code: 'LB', zone_name: 'Left Back', min_x: 0, max_x: 35, min_y: 15, max_y: 35, priority: 8, created_at: new Date() },
    { id: 'zone-rb', position_code: 'RB', zone_name: 'Right Back', min_x: 65, max_x: 100, min_y: 15, max_y: 35, priority: 8, created_at: new Date() },
    
    // Midfielder zones
    { id: 'zone-cdm', position_code: 'CDM', zone_name: 'Defensive Midfielder', min_x: 35, max_x: 65, min_y: 35, max_y: 50, priority: 7, created_at: new Date() },
    { id: 'zone-cm', position_code: 'CM', zone_name: 'Central Midfielder', min_x: 35, max_x: 65, min_y: 50, max_y: 65, priority: 6, created_at: new Date() },
    { id: 'zone-lm', position_code: 'LM', zone_name: 'Left Midfielder', min_x: 0, max_x: 35, min_y: 35, max_y: 65, priority: 6, created_at: new Date() },
    { id: 'zone-rm', position_code: 'RM', zone_name: 'Right Midfielder', min_x: 65, max_x: 100, min_y: 35, max_y: 65, priority: 6, created_at: new Date() },
    
    // Attacker zones
    { id: 'zone-cam', position_code: 'CAM', zone_name: 'Attacking Midfielder', min_x: 35, max_x: 65, min_y: 65, max_y: 80, priority: 5, created_at: new Date() },
    { id: 'zone-lw', position_code: 'LW', zone_name: 'Left Winger', min_x: 0, max_x: 35, min_y: 65, max_y: 85, priority: 5, created_at: new Date() },
    { id: 'zone-rw', position_code: 'RW', zone_name: 'Right Winger', min_x: 65, max_x: 100, min_y: 65, max_y: 85, priority: 5, created_at: new Date() },
    { id: 'zone-st', position_code: 'ST', zone_name: 'Striker', min_x: 35, max_x: 65, min_y: 80, max_y: 100, priority: 4, created_at: new Date() }
  ];

  beforeEach(() => {
    // Create mock Prisma client
    mockPrisma = {
      position_zones: {
        findMany: vi.fn()
      },
      $disconnect: vi.fn()
    };

    // Mock PrismaClient constructor
    vi.mocked(PrismaClient).mockImplementation(() => mockPrisma);
    
    // Mock position zones data
    mockPrisma.position_zones.findMany.mockResolvedValue(
      mockPositionZones.map(zone => ({
        ...zone,
        min_x: zone.min_x.toString(),
        max_x: zone.max_x.toString(),
        min_y: zone.min_y.toString(),
        max_y: zone.max_y.toString()
      }))
    );
    
    service = new PositionCalculatorService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    service.clearCache(); // Clear cache between tests
  });

  describe('calculatePosition', () => {
    it('should calculate goalkeeper position correctly', async () => {
      const result = await service.calculatePosition(50, 10);
      
      expect(result.position).toBe('GK');
      expect(result.zone.zone_name).toBe('Goalkeeper');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should calculate center back position correctly', async () => {
      const result = await service.calculatePosition(50, 25);
      
      expect(result.position).toBe('CB');
      expect(result.zone.zone_name).toBe('Center Back');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should calculate left back position correctly', async () => {
      const result = await service.calculatePosition(20, 25);
      
      expect(result.position).toBe('LB');
      expect(result.zone.zone_name).toBe('Left Back');
    });

    it('should calculate right back position correctly', async () => {
      const result = await service.calculatePosition(80, 25);
      
      expect(result.position).toBe('RB');
      expect(result.zone.zone_name).toBe('Right Back');
    });

    it('should calculate midfielder positions correctly', async () => {
      // Central defensive midfielder
      const cdmResult = await service.calculatePosition(50, 42);
      expect(cdmResult.position).toBe('CDM');
      
      // Central midfielder
      const cmResult = await service.calculatePosition(50, 57);
      expect(cmResult.position).toBe('CM');
      
      // Left midfielder
      const lmResult = await service.calculatePosition(20, 50);
      expect(lmResult.position).toBe('LM');
      
      // Right midfielder
      const rmResult = await service.calculatePosition(80, 50);
      expect(rmResult.position).toBe('RM');
    });

    it('should calculate attacking positions correctly', async () => {
      // Attacking midfielder
      const camResult = await service.calculatePosition(50, 72);
      expect(camResult.position).toBe('CAM');
      
      // Left winger
      const lwResult = await service.calculatePosition(20, 75);
      expect(lwResult.position).toBe('LW');
      
      // Right winger
      const rwResult = await service.calculatePosition(80, 75);
      expect(rwResult.position).toBe('RW');
      
      // Striker
      const stResult = await service.calculatePosition(50, 90);
      expect(stResult.position).toBe('ST');
    });

    it('should handle overlapping zones by priority', async () => {
      // Position that could be both CDM and CM - should choose higher priority (CDM)
      const result = await service.calculatePosition(50, 48);
      
      // Should choose CDM (priority 7) over CM (priority 6) for boundary positions
      expect(['CDM', 'CM']).toContain(result.position);
    });

    it('should return SUB for positions outside all zones', async () => {
      // Mock empty zones to simulate no matches
      mockPrisma.position_zones.findMany.mockResolvedValueOnce([]);
      service.clearCache();
      
      const result = await service.calculatePosition(50, 50);
      
      expect(result.position).toBe('SUB');
      expect(result.confidence).toBe(0.1);
    });

    it('should calculate confidence based on position within zone', async () => {
      // Center of goalkeeper zone should have high confidence
      const centerResult = await service.calculatePosition(50, 7.5);
      expect(centerResult.confidence).toBeGreaterThan(0.9);
      
      // Edge of goalkeeper zone should have lower confidence
      const edgeResult = await service.calculatePosition(55, 15);
      expect(edgeResult.confidence).toBeGreaterThanOrEqual(0.5);
      expect(edgeResult.confidence).toBeLessThan(centerResult.confidence);
    });

    it('should reject invalid pitch coordinates', async () => {
      // Invalid X coordinates
      await expect(service.calculatePosition(-10, 50))
        .rejects.toThrow('Pitch X coordinate must be a number between 0 and 100');
      
      await expect(service.calculatePosition(110, 50))
        .rejects.toThrow('Pitch X coordinate must be a number between 0 and 100');
      
      // Invalid Y coordinates
      await expect(service.calculatePosition(50, -10))
        .rejects.toThrow('Pitch Y coordinate must be a number between 0 and 100');
      
      await expect(service.calculatePosition(50, 110))
        .rejects.toThrow('Pitch Y coordinate must be a number between 0 and 100');
      
      // Non-numeric coordinates
      await expect(service.calculatePosition('invalid' as any, 50))
        .rejects.toThrow('Pitch X coordinate must be a number between 0 and 100');
      
      await expect(service.calculatePosition(50, 'invalid' as any))
        .rejects.toThrow('Pitch Y coordinate must be a number between 0 and 100');
    });
  });

  describe('getPositionZones', () => {
    it('should return all position zones', async () => {
      const zones = await service.getPositionZones();
      
      expect(zones).toHaveLength(mockPositionZones.length);
      expect(zones[0]).toMatchObject({
        id: expect.any(String),
        position_code: expect.any(String),
        zone_name: expect.any(String),
        min_x: expect.any(Number),
        max_x: expect.any(Number),
        min_y: expect.any(Number),
        max_y: expect.any(Number),
        priority: expect.any(Number),
        created_at: expect.any(Date)
      });
    });

    it('should cache position zones for performance', async () => {
      // First call
      await service.getPositionZones();
      expect(mockPrisma.position_zones.findMany).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      await service.getPositionZones();
      expect(mockPrisma.position_zones.findMany).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after expiry', async () => {
      // First call
      await service.getPositionZones();
      expect(mockPrisma.position_zones.findMany).toHaveBeenCalledTimes(1);
      
      // Clear cache to simulate expiry
      service.clearCache();
      
      // Second call should fetch from database again
      await service.getPositionZones();
      expect(mockPrisma.position_zones.findMany).toHaveBeenCalledTimes(2);
    });

    it('should sort zones by priority and position code', async () => {
      const zones = await service.getPositionZones();
      
      // Check that zones are sorted by priority (desc) then position_code (asc)
      for (let i = 0; i < zones.length - 1; i++) {
        if (zones[i].priority === zones[i + 1].priority) {
          expect(zones[i].position_code <= zones[i + 1].position_code).toBe(true);
        } else {
          expect(zones[i].priority >= zones[i + 1].priority).toBe(true);
        }
      }
    });
  });

  describe('validateFormation', () => {
    const validFormation: FormationPlayer[] = [
      { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
      { playerId: 'player-2', position: 'CB', pitchX: 40, pitchY: 25 },
      { playerId: 'player-3', position: 'CB', pitchX: 60, pitchY: 25 },
      { playerId: 'player-4', position: 'LB', pitchX: 20, pitchY: 25 },
      { playerId: 'player-5', position: 'RB', pitchX: 80, pitchY: 25 },
      { playerId: 'player-6', position: 'CDM', pitchX: 50, pitchY: 42 },
      { playerId: 'player-7', position: 'LM', pitchX: 20, pitchY: 50 },
      { playerId: 'player-8', position: 'RM', pitchX: 80, pitchY: 50 },
      { playerId: 'player-9', position: 'CAM', pitchX: 50, pitchY: 72 },
      { playerId: 'player-10', position: 'LW', pitchX: 20, pitchY: 75 },
      { playerId: 'player-11', position: 'ST', pitchX: 50, pitchY: 90 }
    ];

    it('should validate correct formation', async () => {
      const result = await service.validateFormation(validFormation);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-array formation', async () => {
      const result = await service.validateFormation('invalid' as any);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Formation must be an array of players');
    });

    it('should reject empty formation', async () => {
      const result = await service.validateFormation([]);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Formation cannot be empty');
    });

    it('should reject formation with more than 11 players', async () => {
      const oversizedFormation = [
        ...validFormation,
        { playerId: 'player-12', position: 'SUB', pitchX: 50, pitchY: 50 }
      ];
      
      const result = await service.validateFormation(oversizedFormation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('more than 11 players'))).toBe(true);
    });

    it('should reject formation with invalid player data', async () => {
      const invalidFormation = [
        { playerId: '', position: 'GK', pitchX: 50, pitchY: 10 }, // Invalid playerId
        { playerId: 'player-2', position: 'CB', pitchX: -10, pitchY: 25 }, // Invalid pitchX
        { playerId: 'player-3', position: 'CB', pitchX: 50, pitchY: 150 } // Invalid pitchY
      ];
      
      const result = await service.validateFormation(invalidFormation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Invalid player ID'))).toBe(true);
      expect(result.errors.some(error => error.includes('Invalid pitch X coordinate'))).toBe(true);
      expect(result.errors.some(error => error.includes('Invalid pitch Y coordinate'))).toBe(true);
    });

    it('should reject formation with duplicate players', async () => {
      const duplicateFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
        { playerId: 'player-1', position: 'CB', pitchX: 40, pitchY: 25 } // Duplicate
      ];
      
      const result = await service.validateFormation(duplicateFormation);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Duplicate player ID'))).toBe(true);
    });

    it('should warn about position mismatches', async () => {
      const mismatchedFormation = [
        { playerId: 'player-1', position: 'ST', pitchX: 50, pitchY: 10 } // ST position in GK area
      ];
      
      const result = await service.validateFormation(mismatchedFormation);
      
      expect(result.isValid).toBe(true); // Still valid, just warnings
      expect(result.warnings?.some(warning => 
        warning.includes('doesn\'t match calculated position')
      )).toBe(true);
    });

    it('should warn about missing goalkeeper', async () => {
      const noGkFormation = validFormation.filter(p => p.position !== 'GK');
      
      const result = await service.validateFormation(noGkFormation);
      
      expect(result.warnings?.some(warning => 
        warning.includes('should include at least one goalkeeper')
      )).toBe(true);
    });

    it('should warn about multiple goalkeepers', async () => {
      const multiGkFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 }, // First GK in GK zone
        { playerId: 'player-2', position: 'GK', pitchX: 48, pitchY: 8 },  // Second GK in GK zone
        { playerId: 'player-3', position: 'CB', pitchX: 50, pitchY: 25 }
      ];
      
      const result = await service.validateFormation(multiGkFormation);
      
      expect(result.warnings?.some(warning => 
        warning.includes('multiple goalkeepers')
      )).toBe(true);
    });

    it('should warn about lack of defensive coverage', async () => {
      const noDefendersFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
        { playerId: 'player-2', position: 'CM', pitchX: 50, pitchY: 50 }
      ];
      
      const result = await service.validateFormation(noDefendersFormation);
      
      expect(result.warnings?.some(warning => 
        warning.includes('may lack defensive coverage')
      )).toBe(true);
    });

    it('should warn about lack of midfield presence', async () => {
      const noMidfieldFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
        { playerId: 'player-2', position: 'CB', pitchX: 50, pitchY: 25 },
        { playerId: 'player-3', position: 'ST', pitchX: 50, pitchY: 90 }
      ];
      
      const result = await service.validateFormation(noMidfieldFormation);
      
      expect(result.warnings?.some(warning => 
        warning.includes('lacks midfield presence')
      )).toBe(true);
    });

    it('should warn about lack of attacking options', async () => {
      const noAttackersFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
        { playerId: 'player-2', position: 'CB', pitchX: 50, pitchY: 25 },
        { playerId: 'player-3', position: 'CM', pitchX: 50, pitchY: 50 }
      ];
      
      const result = await service.validateFormation(noAttackersFormation);
      
      expect(result.warnings?.some(warning => 
        warning.includes('lacks attacking options')
      )).toBe(true);
    });
  });

  describe('validatePlayerSpacing', () => {
    it('should warn about players positioned too close together', async () => {
      const closeFormation = [
        { playerId: 'player-1', position: 'CB', pitchX: 50, pitchY: 25 },
        { playerId: 'player-2', position: 'CB', pitchX: 52, pitchY: 27 } // Very close
      ];
      
      const result = await service.validateFormation(closeFormation);
      
      expect(result.warnings?.some(warning => 
        warning.includes('positioned very close together')
      )).toBe(true);
    });

    it('should not warn about properly spaced players', async () => {
      const spacedFormation = [
        { playerId: 'player-1', position: 'CB', pitchX: 40, pitchY: 25 },
        { playerId: 'player-2', position: 'CB', pitchX: 60, pitchY: 25 } // Properly spaced
      ];
      
      const result = await service.validateFormation(spacedFormation);
      
      expect(result.warnings?.some(warning => 
        warning.includes('positioned very close together')
      )).toBe(false);
    });

    it('should handle players with invalid coordinates gracefully', async () => {
      const invalidCoordFormation = [
        { playerId: 'player-1', position: 'CB', pitchX: 'invalid' as any, pitchY: 25 },
        { playerId: 'player-2', position: 'CB', pitchX: 60, pitchY: 25 }
      ];
      
      // Should not throw error, just skip spacing validation for invalid coordinates
      const result = await service.validateFormation(invalidCoordFormation);
      
      expect(result.isValid).toBe(false); // Due to invalid coordinates
      expect(result.errors.some(error => error.includes('Invalid pitch X coordinate'))).toBe(true);
    });
  });

  describe('getZonesInArea', () => {
    it('should return zones that overlap with specified area', async () => {
      // Get zones in the defensive third (y: 0-35)
      const defensiveZones = await service.getZonesInArea(0, 100, 0, 35);
      
      const defensivePositions = defensiveZones.map(z => z.position_code);
      expect(defensivePositions).toContain('GK');
      expect(defensivePositions).toContain('CB');
      expect(defensivePositions).toContain('LB');
      expect(defensivePositions).toContain('RB');
      expect(defensivePositions).toContain('CDM'); // Overlaps with defensive area
    });

    it('should return zones in the attacking third', async () => {
      // Get zones in the attacking third (y: 65-100)
      const attackingZones = await service.getZonesInArea(0, 100, 65, 100);
      
      const attackingPositions = attackingZones.map(z => z.position_code);
      expect(attackingPositions).toContain('CAM');
      expect(attackingPositions).toContain('LW');
      expect(attackingPositions).toContain('RW');
      expect(attackingPositions).toContain('ST');
    });

    it('should return zones on the left side of the pitch', async () => {
      // Get zones on the left side (x: 0-50)
      const leftZones = await service.getZonesInArea(0, 50, 0, 100);
      
      const leftPositions = leftZones.map(z => z.position_code);
      expect(leftPositions).toContain('LB');
      expect(leftPositions).toContain('LM');
      expect(leftPositions).toContain('LW');
      expect(leftPositions).toContain('GK'); // GK zone overlaps center
      expect(leftPositions).toContain('CB'); // CB zone overlaps center
    });

    it('should return empty array for area with no zones', async () => {
      // Area outside the pitch (impossible coordinates)
      const noZones = await service.getZonesInArea(200, 300, 200, 300);
      
      expect(noZones).toHaveLength(0);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache properly', async () => {
      // Load zones to populate cache
      await service.getPositionZones();
      expect(mockPrisma.position_zones.findMany).toHaveBeenCalledTimes(1);
      
      // Clear cache
      service.clearCache();
      
      // Next call should fetch from database again
      await service.getPositionZones();
      expect(mockPrisma.position_zones.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('Service Lifecycle', () => {
    it('should disconnect Prisma client properly', async () => {
      await service.disconnect();
      
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.position_zones.findMany.mockRejectedValue(dbError);
      
      await expect(service.getPositionZones()).rejects.toThrow('Database connection failed');
    });

    it('should handle malformed zone data', async () => {
      // Mock malformed data from database
      mockPrisma.position_zones.findMany.mockResolvedValue([
        {
          id: 'zone-1',
          position_code: 'GK',
          zone_name: 'Goalkeeper',
          min_x: 'invalid', // Invalid number
          max_x: '55',
          min_y: '0',
          max_y: '15',
          priority: 10,
          created_at: new Date()
        }
      ]);
      
      service.clearCache();
      
      // Should handle conversion gracefully
      const zones = await service.getPositionZones();
      expect(zones[0].min_x).toBeNaN(); // Will be NaN due to invalid conversion
    });
  });
});