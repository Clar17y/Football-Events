import { describe, it, expect } from 'vitest';
import { toDate, toTimestamp, nullToUndefined, toBool } from '../../../src/db/transforms/common';

describe('common transform utilities', () => {
  describe('toDate', () => {
    it('returns undefined for undefined input', () => {
      expect(toDate(undefined)).toBeUndefined();
    });

    it('returns undefined for null input', () => {
      expect(toDate(null)).toBeUndefined();
    });

    it('returns same Date object if already a Date', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(toDate(date)).toBe(date);
    });

    it('converts timestamp number to Date', () => {
      const timestamp = 1705315800000; // 2024-01-15T10:30:00Z
      const result = toDate(timestamp);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(timestamp);
    });

    it('converts ISO string to Date', () => {
      const isoString = '2024-01-15T10:30:00Z';
      const result = toDate(isoString);
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(new Date(isoString).getTime());
    });
  });

  describe('toTimestamp', () => {
    it('returns undefined for undefined input', () => {
      expect(toTimestamp(undefined)).toBeUndefined();
    });

    it('returns undefined for null input', () => {
      expect(toTimestamp(null)).toBeUndefined();
    });

    it('returns same number if already a timestamp', () => {
      const timestamp = 1705315800000;
      expect(toTimestamp(timestamp)).toBe(timestamp);
    });

    it('converts Date to timestamp', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(toTimestamp(date)).toBe(date.getTime());
    });

    it('converts ISO string to timestamp', () => {
      const isoString = '2024-01-15T10:30:00Z';
      const expected = new Date(isoString).getTime();
      expect(toTimestamp(isoString)).toBe(expected);
    });
  });

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
});
