import { describe, it, expect } from 'vitest';
import {
  matchStartSchema,
  matchPauseSchema,
  matchResumeSchema,
  matchCompleteSchema,
  matchCancelSchema,
  matchPostponeSchema,
  periodStartSchema,
  periodEndSchema
} from '../../src/validation/schemas';

describe('Match State Validation Schemas', () => {
  describe('matchStartSchema', () => {
    it('should accept valid start data', () => {
      const validData = {
        notes: 'Match starting on time'
      };
      expect(() => matchStartSchema.parse(validData)).not.toThrow();
    });

    it('should accept empty body', () => {
      expect(() => matchStartSchema.parse({})).not.toThrow();
    });

    it('should reject notes that are too long', () => {
      const invalidData = {
        notes: 'a'.repeat(501)
      };
      expect(() => matchStartSchema.parse(invalidData)).toThrow();
    });
  });

  describe('matchPauseSchema', () => {
    it('should accept valid pause data', () => {
      const validData = {
        reason: 'Injury timeout'
      };
      expect(() => matchPauseSchema.parse(validData)).not.toThrow();
    });

    it('should accept empty body', () => {
      expect(() => matchPauseSchema.parse({})).not.toThrow();
    });

    it('should reject reason that is too long', () => {
      const invalidData = {
        reason: 'a'.repeat(501)
      };
      expect(() => matchPauseSchema.parse(invalidData)).toThrow();
    });
  });

  describe('matchResumeSchema', () => {
    it('should accept valid resume data', () => {
      const validData = {
        notes: 'Resuming after injury'
      };
      expect(() => matchResumeSchema.parse(validData)).not.toThrow();
    });
  });
});

describe('Match Complete Schema', () => {
  describe('matchCompleteSchema', () => {
    it('should accept valid complete data with final score', () => {
      const validData = {
        finalScore: {
          home: 2,
          away: 1
        },
        notes: 'Great match!'
      };
      expect(() => matchCompleteSchema.parse(validData)).not.toThrow();
    });

    it('should accept empty body', () => {
      expect(() => matchCompleteSchema.parse({})).not.toThrow();
    });

    it('should reject negative scores', () => {
      const invalidData = {
        finalScore: {
          home: -1,
          away: 2
        }
      };
      expect(() => matchCompleteSchema.parse(invalidData)).toThrow();
    });

    it('should reject non-integer scores', () => {
      const invalidData = {
        finalScore: {
          home: 1.5,
          away: 2
        }
      };
      expect(() => matchCompleteSchema.parse(invalidData)).toThrow();
    });
  });
});

describe('Match Cancel Schema', () => {
  describe('matchCancelSchema', () => {
    it('should accept valid cancel data', () => {
      const validData = {
        reason: 'Weather conditions'
      };
      expect(() => matchCancelSchema.parse(validData)).not.toThrow();
    });

    it('should use default reason when empty', () => {
      const result = matchCancelSchema.parse({});
      expect(result.reason).toBe('No reason provided');
    });
  });
});

describe('Period Schemas', () => {
  describe('periodStartSchema', () => {
    it('should accept valid period start data', () => {
      const validData = {
        periodType: 'regular' as const,
        notes: 'Starting first half'
      };
      expect(() => periodStartSchema.parse(validData)).not.toThrow();
    });

    it('should use default period type when not provided', () => {
      const result = periodStartSchema.parse({});
      expect(result.periodType).toBe('regular');
    });

    it('should accept all valid period types', () => {
      const periodTypes = ['regular', 'extra_time', 'penalty_shootout'] as const;
      
      periodTypes.forEach(periodType => {
        const validData = { periodType };
        expect(() => periodStartSchema.parse(validData)).not.toThrow();
      });
    });

    it('should reject invalid period type', () => {
      const invalidData = {
        periodType: 'invalid_type'
      };
      expect(() => periodStartSchema.parse(invalidData)).toThrow();
    });
  });

  describe('periodEndSchema', () => {
    it('should accept valid period end data', () => {
      const validData = {
        reason: 'End of regulation time',
        actualDurationSeconds: 2700
      };
      expect(() => periodEndSchema.parse(validData)).not.toThrow();
    });

    it('should accept empty body', () => {
      expect(() => periodEndSchema.parse({})).not.toThrow();
    });

    it('should reject negative duration', () => {
      const invalidData = {
        actualDurationSeconds: -100
      };
      expect(() => periodEndSchema.parse(invalidData)).toThrow();
    });

    it('should reject duration exceeding 2 hours', () => {
      const invalidData = {
        actualDurationSeconds: 7201
      };
      expect(() => periodEndSchema.parse(invalidData)).toThrow();
    });
  });
});