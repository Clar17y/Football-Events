/**
 * Common transform utilities for IndexedDB ↔ Frontend type conversions
 * 
 * With shared types now using ISO strings and camelCase everywhere,
 * most transforms are pass-through. These utilities handle edge cases
 * like null/undefined normalization.
 */

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

/**
 * Ensure a value is an ISO date-time string
 * Handles Date objects, timestamps, and existing ISO strings
 */
export function toIsoString(value: Date | string | number | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value; // Already ISO string
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

/**
 * Get current ISO timestamp
 */
export function nowIso(): string {
  return new Date().toISOString();
}
