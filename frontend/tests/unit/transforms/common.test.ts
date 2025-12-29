import { describe, it, expect } from 'vitest';
import { nullToUndefined, toBool, toIsoString, nowIso } from '../../../src/db/transforms/common';

describe('common transform utilities', () => {
  describe('nullToUndefined', () => {
    it('converts null to undefined', () => {
      expect(nullToUndefined(null)).toBeUndefined();
    });

    it('passes through undefined', () => {
      expect(nullToUndefined(undefined)).toBeUndefined();
    });

    it('passes through non-null values', () => {
      expect(nullToUndefined('hello')).toBe('hello');
      expect(nullToUndefined(42)).toBe(42);
      expect(nullToUndefined(false)).toBe(false);
      expect(nullToUndefined(0)).toBe(0);
      expect(nullToUndefined('')).toBe('');
    });

    it('passes through objects', () => {
      const obj = { foo: 'bar' };
      expect(nullToUndefined(obj)).toBe(obj);
    });
  });

  describe('toBool', () => {
    it('converts falsy values to false', () => {
      expect(toBool(undefined)).toBe(false);
      expect(toBool(null)).toBe(false);
      expect(toBool(0)).toBe(false);
      expect(toBool('')).toBe(false);
      expect(toBool(false)).toBe(false);
    });

    it('converts truthy values to true', () => {
      expect(toBool(true)).toBe(true);
      expect(toBool(1)).toBe(true);
      expect(toBool('hello')).toBe(true);
      expect(toBool({})).toBe(true);
      expect(toBool([])).toBe(true);
    });
  });

  describe('toIsoString', () => {
    it('returns undefined for undefined input', () => {
      expect(toIsoString(undefined)).toBeUndefined();
    });

    it('returns undefined for null input', () => {
      expect(toIsoString(null)).toBeUndefined();
    });

    it('returns same string if already an ISO string', () => {
      const isoString = '2024-01-15T10:30:00.000Z';
      expect(toIsoString(isoString)).toBe(isoString);
    });

    it('converts timestamp number to ISO string', () => {
      const timestamp = 1705315800000; // 2024-01-15T10:30:00Z
      const result = toIsoString(timestamp);
      expect(typeof result).toBe('string');
      expect(result).toBe(new Date(timestamp).toISOString());
    });

    it('converts Date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const result = toIsoString(date);
      expect(typeof result).toBe('string');
      expect(result).toBe(date.toISOString());
    });
  });

  describe('nowIso', () => {
    it('returns a valid ISO string', () => {
      const result = nowIso();
      expect(typeof result).toBe('string');
      // Should be parseable as a date
      expect(new Date(result).toISOString()).toBe(result);
    });

    it('returns current time (within 1 second)', () => {
      const before = Date.now();
      const result = nowIso();
      const after = Date.now();
      const resultTime = new Date(result).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(before);
      expect(resultTime).toBeLessThanOrEqual(after);
    });
  });
});
