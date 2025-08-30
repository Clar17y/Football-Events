/**
 * Enhanced Lineup Validation Schema Tests
 * 
 * Tests for the enhanced lineup validation schemas including positioning data
 * and substitution reasons.
 */

import { describe, it, expect } from 'vitest';
import { lineupCreateSchema, lineupUpdateSchema } from '../../src/validation/schemas';

describe('Enhanced Lineup Validation Schemas', () => {
  describe('lineupCreateSchema with positioning data', () => {
    it('should validate lineup with pitch coordinates', () => {
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        pitchX: 50.0,
        pitchY: 5.0
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pitchX).toBe(50.0);
        expect(result.data.pitchY).toBe(5.0);
      }
    });

    it('should validate lineup with substitution reason', () => {
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 30,
        position: 'ST',
        substitutionReason: 'Tactical change'
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.substitutionReason).toBe('Tactical change');
      }
    });

    it('should validate lineup with all enhanced fields', () => {
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        endMinute: 90,
        position: 'CM',
        pitchX: 50.0,
        pitchY: 50.0,
        substitutionReason: 'Starting lineup'
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pitchX).toBe(50.0);
        expect(result.data.pitchY).toBe(50.0);
        expect(result.data.substitutionReason).toBe('Starting lineup');
      }
    });

    it('should reject invalid pitch X coordinate (over 100)', () => {
      const invalidData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        pitchX: 150.0,
        pitchY: 5.0
      };

      const result = lineupCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.path.includes('pitchX') && 
          issue.message.includes('must be between 0 and 100')
        )).toBe(true);
      }
    });

    it('should reject invalid pitch Y coordinate (under 0)', () => {
      const invalidData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        pitchX: 50.0,
        pitchY: -10.0
      };

      const result = lineupCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.path.includes('pitchY') && 
          issue.message.includes('must be between 0 and 100')
        )).toBe(true);
      }
    });

    it('should reject substitution reason that is too long', () => {
      const longReason = 'A'.repeat(101); // Over 100 characters
      const invalidData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        substitutionReason: longReason
      };

      const result = lineupCreateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.path.includes('substitutionReason') && 
          issue.message.includes('must be less than 100 characters')
        )).toBe(true);
      }
    });

    it('should allow optional enhanced fields to be omitted', () => {
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK'
        // pitchX, pitchY, substitutionReason omitted
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('lineupUpdateSchema with positioning data', () => {
    it('should validate update with pitch coordinates', () => {
      const validData = {
        pitchX: 60.0,
        pitchY: 40.0
      };

      const result = lineupUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pitchX).toBe(60.0);
        expect(result.data.pitchY).toBe(40.0);
      }
    });

    it('should validate update with substitution reason', () => {
      const validData = {
        substitutionReason: 'Position adjustment'
      };

      const result = lineupUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.substitutionReason).toBe('Position adjustment');
      }
    });

    it('should validate update with all enhanced fields', () => {
      const validData = {
        endMinute: 75,
        position: 'RW',
        pitchX: 80.0,
        pitchY: 70.0,
        substitutionReason: 'Formation change'
      };

      const result = lineupUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.endMinute).toBe(75);
        expect(result.data.position).toBe('RW');
        expect(result.data.pitchX).toBe(80.0);
        expect(result.data.pitchY).toBe(70.0);
        expect(result.data.substitutionReason).toBe('Formation change');
      }
    });

    it('should reject invalid pitch coordinates in update', () => {
      const invalidData = {
        pitchX: 101.0, // Over 100
        pitchY: -1.0   // Under 0
      };

      const result = lineupUpdateSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
        expect(result.error.issues.some(issue => issue.path.includes('pitchX'))).toBe(true);
        expect(result.error.issues.some(issue => issue.path.includes('pitchY'))).toBe(true);
      }
    });

    it('should allow empty update object', () => {
      const validData = {};

      const result = lineupUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should allow partial updates with only enhanced fields', () => {
      const validData = {
        pitchX: 25.0
      };

      const result = lineupUpdateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pitchX).toBe(25.0);
        expect(result.data.pitchY).toBeUndefined();
        expect(result.data.substitutionReason).toBeUndefined();
      }
    });
  });

  describe('Edge cases and boundary values', () => {
    it('should accept pitch coordinates at boundaries (0 and 100)', () => {
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        pitchX: 0.0,
        pitchY: 100.0
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept substitution reason at maximum length (100 characters)', () => {
      const maxLengthReason = 'A'.repeat(100); // Exactly 100 characters
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        substitutionReason: maxLengthReason
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should accept empty substitution reason', () => {
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        substitutionReason: ''
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should handle decimal pitch coordinates', () => {
      const validData = {
        matchId: '123e4567-e89b-12d3-a456-426614174000',
        playerId: '123e4567-e89b-12d3-a456-426614174001',
        startMinute: 0,
        position: 'GK',
        pitchX: 33.33,
        pitchY: 66.67
      };

      const result = lineupCreateSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pitchX).toBe(33.33);
        expect(result.data.pitchY).toBe(66.67);
      }
    });
  });
});