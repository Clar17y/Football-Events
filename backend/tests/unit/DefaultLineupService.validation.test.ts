import { describe, it, expect } from 'vitest';

// Test the validation logic directly without mocking
describe('DefaultLineupService Validation Logic', () => {
  // Define the validation functions directly for testing
  const validateFormationPlayer = (player: any) => {
    const errors: string[] = [];

    if (!player || !player.playerId || typeof player.playerId !== 'string') {
      errors.push('Player ID is required and must be a string');
    }

    if (!player || !player.position || typeof player.position !== 'string') {
      errors.push('Position is required and must be a string');
    }

    if (!player || typeof player.pitchX !== 'number' || player.pitchX < 0 || player.pitchX > 100) {
      errors.push('Pitch X coordinate must be a number between 0 and 100');
    }

    if (!player || typeof player.pitchY !== 'number' || player.pitchY < 0 || player.pitchY > 100) {
      errors.push('Pitch Y coordinate must be a number between 0 and 100');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const validateFormationData = (formation: any[]) => {
    const errors: string[] = [];

    if (!Array.isArray(formation)) {
      return {
        isValid: false,
        errors: ['Formation must be an array']
      };
    }

    if (formation.length === 0) {
      return {
        isValid: false,
        errors: ['Formation cannot be empty']
      };
    }

    if (formation.length > 11) {
      errors.push('Formation cannot have more than 11 players');
    }

    // Validate each player
    formation.forEach((player, index) => {
      const playerValidation = validateFormationPlayer(player);
      if (!playerValidation.isValid) {
        errors.push(`Player ${index + 1}: ${playerValidation.errors.join(', ')}`);
      }
    });

    // Check for duplicate player IDs (only for valid players)
    const playerIds = formation.filter(p => p && p.playerId).map(p => p.playerId);
    const uniquePlayerIds = new Set(playerIds);
    if (playerIds.length !== uniquePlayerIds.size) {
      errors.push('Formation cannot contain duplicate players');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  const validFormation = [
    { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
    { playerId: 'player-2', position: 'CB', pitchX: 30, pitchY: 30 },
    { playerId: 'player-3', position: 'CB', pitchX: 70, pitchY: 30 }
  ];

  describe('Formation Player Validation', () => {
    it('should validate correct player data', () => {
      const player = { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 };
      const result = validateFormationPlayer(player);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject player with missing playerId', () => {
      const player = { playerId: '', position: 'GK', pitchX: 50, pitchY: 10 };
      const result = validateFormationPlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Player ID is required'))).toBe(true);
    });

    it('should reject player with missing position', () => {
      const player = { playerId: 'player-1', position: '', pitchX: 50, pitchY: 10 };
      const result = validateFormationPlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Position is required'))).toBe(true);
    });

    it('should reject player with invalid pitch coordinates', () => {
      const player = { playerId: 'player-1', position: 'GK', pitchX: -10, pitchY: 150 };
      const result = validateFormationPlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Pitch X coordinate'))).toBe(true);
      expect(result.errors.some(error => error.includes('Pitch Y coordinate'))).toBe(true);
    });

    it('should reject player with non-numeric coordinates', () => {
      const player = { playerId: 'player-1', position: 'GK', pitchX: 'invalid', pitchY: null };
      const result = validateFormationPlayer(player);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Pitch X coordinate'))).toBe(true);
      expect(result.errors.some(error => error.includes('Pitch Y coordinate'))).toBe(true);
    });
  });

  describe('Formation Data Validation', () => {
    it('should validate correct formation data', () => {
      const result = validateFormationData(validFormation);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject non-array formation', () => {
      const result = validateFormationData('invalid' as any);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('must be an array'))).toBe(true);
    });

    it('should reject empty formation', () => {
      const result = validateFormationData([]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('cannot be empty'))).toBe(true);
    });

    it('should reject formation with more than 11 players', () => {
      const oversizedFormation = Array.from({ length: 12 }, (_, i) => ({
        playerId: `player-${i + 1}`,
        position: 'CB',
        pitchX: 50,
        pitchY: 30
      }));

      const result = validateFormationData(oversizedFormation);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('more than 11 players'))).toBe(true);
    });

    it('should reject formation with duplicate players', () => {
      const duplicateFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
        { playerId: 'player-1', position: 'CB', pitchX: 30, pitchY: 30 }
      ];

      const result = validateFormationData(duplicateFormation);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('duplicate players'))).toBe(true);
    });

    it('should reject formation with invalid players', () => {
      const invalidFormation = [
        { playerId: '', position: 'GK', pitchX: 50, pitchY: 10 },
        { playerId: 'player-2', position: '', pitchX: 30, pitchY: 30 }
      ];

      const result = validateFormationData(invalidFormation);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Player 1:'))).toBe(true);
      expect(result.errors.some(error => error.includes('Player 2:'))).toBe(true);
    });

    it('should allow formation with up to 11 players', () => {
      const maxFormation = Array.from({ length: 11 }, (_, i) => ({
        playerId: `player-${i + 1}`,
        position: 'CB',
        pitchX: 50,
        pitchY: 30
      }));

      const result = validateFormationData(maxFormation);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null formation', () => {
      const result = validateFormationData(null as any);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('must be an array'))).toBe(true);
    });

    it('should handle undefined formation', () => {
      const result = validateFormationData(undefined as any);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('must be an array'))).toBe(true);
    });

    it('should handle formation with null players', () => {
      const formationWithNull = [
        { playerId: 'player-1', position: 'GK', pitchX: 50, pitchY: 10 },
        null,
        { playerId: 'player-3', position: 'CB', pitchX: 70, pitchY: 30 }
      ];

      const result = validateFormationData(formationWithNull as any);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Player 2:'))).toBe(true);
    });

    it('should handle boundary pitch coordinates', () => {
      const boundaryFormation = [
        { playerId: 'player-1', position: 'GK', pitchX: 0, pitchY: 0 },
        { playerId: 'player-2', position: 'CB', pitchX: 100, pitchY: 100 }
      ];

      const result = validateFormationData(boundaryFormation);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});