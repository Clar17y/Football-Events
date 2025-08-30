import { PrismaClient } from '@prisma/client';
import { withPrismaErrorHandling } from '../utils/prismaErrorHandler';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface PitchPosition {
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
}

export interface PositionZone {
  id: string;
  position_code: string;
  zone_name: string;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  priority: number;
  created_at: Date;
}

export interface FormationPlayer {
  playerId: string;
  position: string;
  pitchX: number;
  pitchY: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface PositionCalculationResult {
  position: string;
  zone: PositionZone;
  confidence: number; // 0-1 scale
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class PositionCalculatorService {
  private prisma: PrismaClient;
  private positionZonesCache: PositionZone[] | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Calculate the most appropriate position based on pitch coordinates
   * Requirements: 2.3, 2.4
   */
  async calculatePosition(pitchX: number, pitchY: number): Promise<PositionCalculationResult> {
    return withPrismaErrorHandling(async () => {
      // Validate input coordinates
      if (typeof pitchX !== 'number' || pitchX < 0 || pitchX > 100) {
        const error = new Error('Pitch X coordinate must be a number between 0 and 100');
        (error as any).code = 'INVALID_PITCH_COORDINATES';
        (error as any).statusCode = 400;
        throw error;
      }

      if (typeof pitchY !== 'number' || pitchY < 0 || pitchY > 100) {
        const error = new Error('Pitch Y coordinate must be a number between 0 and 100');
        (error as any).code = 'INVALID_PITCH_COORDINATES';
        (error as any).statusCode = 400;
        throw error;
      }

      const zones = await this.getPositionZones();
      
      // Find all zones that contain this position
      const matchingZones = zones.filter(zone => 
        pitchX >= zone.min_x && pitchX <= zone.max_x &&
        pitchY >= zone.min_y && pitchY <= zone.max_y
      );

      if (matchingZones.length === 0) {
        // Default to SUB if no zone matches (shouldn't happen with proper zone setup)
        const defaultZone: PositionZone = {
          id: 'default',
          position_code: 'SUB',
          zone_name: 'Substitute',
          min_x: 0,
          max_x: 100,
          min_y: 0,
          max_y: 100,
          priority: 0,
          created_at: new Date()
        };

        return {
          position: 'SUB',
          zone: defaultZone,
          confidence: 0.1
        };
      }

      // Sort by priority (higher priority first) and select the best match
      const bestZone = matchingZones.sort((a, b) => b.priority - a.priority)[0];
      
      // Calculate confidence based on how centered the position is within the zone
      const confidence = this.calculatePositionConfidence(pitchX, pitchY, bestZone);

      return {
        position: bestZone.position_code,
        zone: bestZone,
        confidence
      };
    }, 'PositionCalculation');
  }

  /**
   * Get all available position zones
   * Requirements: 2.3
   */
  async getPositionZones(): Promise<PositionZone[]> {
    // Check cache first
    if (this.positionZonesCache && Date.now() < this.cacheExpiry) {
      return this.positionZonesCache;
    }

    const zones = await this.prisma.position_zones.findMany({
      orderBy: [
        { priority: 'desc' },
        { position_code: 'asc' }
      ]
    });

    // Transform to our interface
    this.positionZonesCache = zones.map(zone => ({
      id: zone.id,
      position_code: zone.position_code,
      zone_name: zone.zone_name,
      min_x: Number(zone.min_x),
      max_x: Number(zone.max_x),
      min_y: Number(zone.min_y),
      max_y: Number(zone.max_y),
      priority: zone.priority,
      created_at: zone.created_at
    }));

    this.cacheExpiry = Date.now() + this.CACHE_DURATION;
    return this.positionZonesCache;
  }

  /**
   * Validate player positions and formation structure
   * Requirements: 2.4, 2.5
   */
  async validateFormation(players: FormationPlayer[]): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic structure validation
    if (!Array.isArray(players)) {
      return {
        isValid: false,
        errors: ['Formation must be an array of players']
      };
    }

    if (players.length === 0) {
      return {
        isValid: false,
        errors: ['Formation cannot be empty']
      };
    }

    if (players.length > 11) {
      errors.push('Formation cannot have more than 11 players');
    }

    // Validate each player's position
    const positionCounts: Record<string, number> = {};
    const playerIds = new Set<string>();

    for (let i = 0; i < players.length; i++) {
      const player = players[i];
      
      // Validate player structure
      if (!player.playerId || typeof player.playerId !== 'string') {
        errors.push(`Player ${i + 1}: Invalid player ID`);
        continue;
      }

      // Check for duplicate players
      if (playerIds.has(player.playerId)) {
        errors.push(`Player ${i + 1}: Duplicate player ID ${player.playerId}`);
        continue;
      }
      playerIds.add(player.playerId);

      // Validate coordinates
      if (typeof player.pitchX !== 'number' || player.pitchX < 0 || player.pitchX > 100) {
        errors.push(`Player ${i + 1}: Invalid pitch X coordinate (${player.pitchX})`);
      }

      if (typeof player.pitchY !== 'number' || player.pitchY < 0 || player.pitchY > 100) {
        errors.push(`Player ${i + 1}: Invalid pitch Y coordinate (${player.pitchY})`);
      }

      // Calculate position if coordinates are valid
      if (typeof player.pitchX === 'number' && typeof player.pitchY === 'number' &&
          player.pitchX >= 0 && player.pitchX <= 100 && 
          player.pitchY >= 0 && player.pitchY <= 100) {
        
        try {
          const calculatedPosition = await this.calculatePosition(player.pitchX, player.pitchY);
          
          // Check if provided position matches calculated position
          if (player.position !== calculatedPosition.position) {
            warnings.push(`Player ${i + 1}: Position "${player.position}" doesn't match calculated position "${calculatedPosition.position}" for coordinates (${player.pitchX}, ${player.pitchY})`);
          }

          // Count positions for formation analysis
          positionCounts[calculatedPosition.position] = (positionCounts[calculatedPosition.position] || 0) + 1;
        } catch (error) {
          errors.push(`Player ${i + 1}: Failed to calculate position for coordinates (${player.pitchX}, ${player.pitchY})`);
        }
      }
    }

    // Formation-specific validations
    this.validateFormationStructure(positionCounts, warnings);

    // Check for overlapping positions (players too close together)
    this.validatePlayerSpacing(players, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate that players are not positioned too close to each other
   * Requirements: 2.4, 2.5
   */
  validatePlayerSpacing(players: FormationPlayer[], warnings: string[]): void {
    const MIN_DISTANCE = 8; // Minimum distance between players (in percentage points)

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const player1 = players[i];
        const player2 = players[j];

        // Skip if either player has invalid coordinates
        if (typeof player1.pitchX !== 'number' || typeof player1.pitchY !== 'number' ||
            typeof player2.pitchX !== 'number' || typeof player2.pitchY !== 'number') {
          continue;
        }

        const distance = Math.sqrt(
          Math.pow(player1.pitchX - player2.pitchX, 2) + 
          Math.pow(player1.pitchY - player2.pitchY, 2)
        );

        if (distance < MIN_DISTANCE) {
          warnings.push(`Players ${i + 1} and ${j + 1} are positioned very close together (distance: ${distance.toFixed(1)})`);
        }
      }
    }
  }

  /**
   * Validate formation structure and provide tactical feedback
   * Requirements: 2.5
   */
  private validateFormationStructure(positionCounts: Record<string, number>, warnings: string[]): void {
    // Check for goalkeeper
    if (!positionCounts['GK'] || positionCounts['GK'] === 0) {
      warnings.push('Formation should include at least one goalkeeper (GK)');
    } else if (positionCounts['GK'] > 1) {
      warnings.push('Formation has multiple goalkeepers - only one should be on the pitch');
    }

    // Check for basic defensive coverage
    const defenders = ['CB', 'RCB', 'LCB', 'RB', 'LB', 'RWB', 'LWB', 'SW', 'FB', 'WB'];
    const defenderCount = defenders.reduce((sum, pos) => sum + (positionCounts[pos] || 0), 0);
    
    if (defenderCount < 2) {
      warnings.push('Formation may lack defensive coverage (consider adding more defenders)');
    }

    // Check for midfield presence
    const midfielders = ['CDM', 'RDM', 'LDM', 'CM', 'RCM', 'LCM', 'CAM', 'RAM', 'LAM', 'RM', 'LM', 'AM', 'DM', 'WM'];
    const midfielderCount = midfielders.reduce((sum, pos) => sum + (positionCounts[pos] || 0), 0);
    
    if (midfielderCount === 0) {
      warnings.push('Formation lacks midfield presence');
    }

    // Check for attacking options
    const attackers = ['RW', 'LW', 'RF', 'LF', 'CF', 'ST', 'SS'];
    const attackerCount = attackers.reduce((sum, pos) => sum + (positionCounts[pos] || 0), 0);
    
    if (attackerCount === 0) {
      warnings.push('Formation lacks attacking options');
    }
  }

  /**
   * Calculate confidence score for position assignment
   * Requirements: 2.4
   */
  private calculatePositionConfidence(pitchX: number, pitchY: number, zone: PositionZone): number {
    // Calculate how centered the position is within the zone
    const zoneCenterX = (zone.min_x + zone.max_x) / 2;
    const zoneCenterY = (zone.min_y + zone.max_y) / 2;
    const zoneWidth = zone.max_x - zone.min_x;
    const zoneHeight = zone.max_y - zone.min_y;

    // Distance from center as percentage of zone size
    const distanceFromCenterX = Math.abs(pitchX - zoneCenterX) / (zoneWidth / 2);
    const distanceFromCenterY = Math.abs(pitchY - zoneCenterY) / (zoneHeight / 2);
    
    // Average distance (0 = center, 1 = edge)
    const avgDistance = (distanceFromCenterX + distanceFromCenterY) / 2;
    
    // Convert to confidence (1 = center, 0.5 = edge)
    return Math.max(0.5, 1 - (avgDistance * 0.5));
  }

  /**
   * Get position zones for a specific area of the pitch
   * Requirements: 2.3
   */
  async getZonesInArea(minX: number, maxX: number, minY: number, maxY: number): Promise<PositionZone[]> {
    const allZones = await this.getPositionZones();
    
    return allZones.filter(zone => 
      // Check if zones overlap with the specified area
      !(zone.max_x < minX || zone.min_x > maxX || zone.max_y < minY || zone.min_y > maxY)
    );
  }

  /**
   * Clear the position zones cache (useful for testing or when zones are updated)
   */
  clearCache(): void {
    this.positionZonesCache = null;
    this.cacheExpiry = 0;
  }

  /**
   * Disconnect Prisma client
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}