/**
 * ISO Date/Time Formatting Helpers (UI-only)
 * 
 * These helpers accept ISO strings (the format used throughout the app)
 * and format them for display in the UI. They should only be used in
 * components/pages for rendering - not in data layers.
 * 
 * All date/time fields in shared types use ISO strings (JSON-native).
 * These helpers convert ISO strings to human-readable formats.
 */

import type { IsoDateTimeString, IsoDateString } from '@shared/types';

/**
 * Format an ISO date-time string for display
 * @param isoString - ISO 8601 date-time string (e.g., "2025-12-17T12:34:56.789Z")
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date-time string (e.g., "Dec 17, 2025, 12:34 PM")
 */
export function formatDateTime(
  isoString: IsoDateTimeString | undefined | null,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }
): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleString(undefined, options);
  } catch {
    return '';
  }
}

/**
 * Format an ISO date string for display (date only, no time)
 * @param isoString - ISO 8601 date string (e.g., "2025-12-17" or "2025-12-17T12:34:56.789Z")
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted date string (e.g., "Dec 17, 2025")
 */
export function formatDate(
  isoString: IsoDateString | IsoDateTimeString | undefined | null,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }
): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleDateString(undefined, options);
  } catch {
    return '';
  }
}

/**
 * Format an ISO date-time string to show time only
 * @param isoString - ISO 8601 date-time string
 * @param options - Intl.DateTimeFormat options
 * @returns Formatted time string (e.g., "12:34 PM")
 */
export function formatTime(
  isoString: IsoDateTimeString | undefined | null,
  options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  }
): string {
  if (!isoString) return '';
  try {
    return new Date(isoString).toLocaleTimeString(undefined, options);
  } catch {
    return '';
  }
}

/**
 * Format an ISO date-time string as a relative time (e.g., "2 hours ago")
 * @param isoString - ISO 8601 date-time string
 * @returns Relative time string
 */
export function formatRelativeTime(isoString: IsoDateTimeString | undefined | null): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    
    // Fall back to formatted date for older dates
    return formatDate(isoString);
  } catch {
    return '';
  }
}

/**
 * Format an ISO date string for display with weekday
 * @param isoString - ISO 8601 date string
 * @returns Formatted date string with weekday (e.g., "Monday, Dec 17, 2025")
 */
export function formatDateWithWeekday(
  isoString: IsoDateString | IsoDateTimeString | undefined | null
): string {
  return formatDate(isoString, {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format an ISO date-time string for display in a short format
 * @param isoString - ISO 8601 date-time string
 * @returns Short formatted string (e.g., "12/17/25, 12:34 PM")
 */
export function formatDateTimeShort(
  isoString: IsoDateTimeString | undefined | null
): string {
  return formatDateTime(isoString, {
    year: '2-digit',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Check if an ISO date string represents today
 * @param isoString - ISO 8601 date string
 * @returns True if the date is today
 */
export function isToday(isoString: IsoDateString | IsoDateTimeString | undefined | null): boolean {
  if (!isoString) return false;
  try {
    const date = new Date(isoString);
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  } catch {
    return false;
  }
}

/**
 * Check if an ISO date string represents a date in the past
 * @param isoString - ISO 8601 date string
 * @returns True if the date is in the past
 */
export function isPast(isoString: IsoDateString | IsoDateTimeString | undefined | null): boolean {
  if (!isoString) return false;
  try {
    return new Date(isoString).getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * Check if an ISO date string represents a date in the future
 * @param isoString - ISO 8601 date string
 * @returns True if the date is in the future
 */
export function isFuture(isoString: IsoDateString | IsoDateTimeString | undefined | null): boolean {
  if (!isoString) return false;
  try {
    return new Date(isoString).getTime() > Date.now();
  } catch {
    return false;
  }
}
