/**
 * Common transform utilities for IndexedDB ↔ Frontend type conversions
 */

/**
 * Convert timestamp (number/string/Date) to Date object
 */
export function toDate(ts: number | string | Date | undefined | null): Date | undefined {
  if (ts === undefined || ts === null) return undefined;
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

/**
 * Convert Date/string/number to timestamp for storage
 */
export function toTimestamp(date: Date | string | number | undefined | null): number | undefined {
  if (date === undefined || date === null) return undefined;
  if (typeof date === 'number') return date;
  return new Date(date).getTime();
}

/**
 * Convert null to undefined (IndexedDB stores null, frontend prefers undefined)
 */
export function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Coerce falsy to boolean false
 */
export function toBool(value: unknown): boolean {
  return !!value;
}
