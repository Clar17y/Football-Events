/**
 * Calendar utilities for the Matches page
 * 
 * This module provides date calculation, formatting, and calendar grid
 * utilities for displaying matches in a 14+ day calendar view.
 */

import dayjs, { Dayjs } from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import utc from 'dayjs/plugin/utc';
import type { Match, Team } from '@shared/types';

// Extend dayjs with required plugins
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(utc);

/**
 * Represents a single cell in the calendar grid
 */
export interface CalendarCell {
  /** The date for this cell */
  date: Dayjs;
  /** Whether this date is today */
  isToday: boolean;
  /** Whether this date is in the current month */
  isCurrentMonth: boolean;
  /** Whether this cell represents an empty/disabled date */
  isEmpty: boolean;
  /** Matches scheduled on this date */
  matches: CalendarMatchIndicator[];
}

/**
 * Match indicator for calendar display
 */
export interface CalendarMatchIndicator {
  /** Match ID */
  matchId: string;
  /** Match date */
  date: Dayjs;
  /** Home team */
  homeTeam: Team;
  /** Away team */
  awayTeam: Team;
  /** Whether this is a home match for the primary team */
  isHome: boolean;
  /** Match time (formatted) */
  time: string;
  /** Colors to use for the indicator */
  colors: {
    primary: string;
    secondary: string;
  };
}

/**
 * Calendar date range configuration
 */
export interface CalendarDateRange {
  /** Start date of the calendar */
  startDate: Dayjs;
  /** End date of the calendar */
  endDate: Dayjs;
  /** Total number of days to display */
  totalDays: number;
}

/**
 * Calendar grid structure
 */
export interface CalendarGrid {
  /** Date range for this calendar */
  dateRange: CalendarDateRange;
  /** Calendar cells organized in a 7-column grid */
  cells: CalendarCell[];
  /** Number of weeks (rows) in the grid */
  weekCount: number;
  /** Today's date for reference */
  today: Dayjs;
}

/**
 * Get team data from team cache or create placeholder
 */
function getTeamData(teamId: string | undefined, teamsCache: Map<string, Team>): { id: string; name: string; colors: { homeKitPrimary?: string; homeKitSecondary?: string; awayKitPrimary?: string; awayKitSecondary?: string } } {
  if (!teamId) {
    return {
      id: 'unknown',
      name: 'Unknown Team',
      colors: {}
    };
  }
  
  const team = teamsCache.get(teamId);
  if (team) {
    return {
      id: team.id,
      name: team.name,
      colors: {
        homeKitPrimary: team.homeKitPrimary,
        homeKitSecondary: team.homeKitSecondary,
        awayKitPrimary: team.awayKitPrimary,
        awayKitSecondary: team.awayKitSecondary
      }
    };
  }
  
  // Fallback for teams not in cache (newly created matches)
  return {
    id: teamId,
    name: `Team ${teamId.slice(0, 8)}`,
    colors: {}
  };
}

/**
 * Calculate the date range for the calendar view
 * Shows current date + next 14 days minimum, extending to month boundaries if needed
 * 
 * @param referenceDate - The reference date (defaults to today)
 * @param minDays - Minimum number of days to show (defaults to 14)
 * @returns Calendar date range configuration
 */
export function calculateCalendarDateRange(
  referenceDate: Dayjs = dayjs(),
  minDays: number = 14
): CalendarDateRange {
  const startDate = referenceDate.startOf('day');
  let endDate = startDate.add(minDays - 1, 'day'); // minDays - 1 because we include the start date
  
  // Extend to month boundary if we're very close to the end of the month
  const daysUntilMonthEnd = endDate.endOf('month').diff(endDate, 'day');
  if (daysUntilMonthEnd <= 2) {
    endDate = endDate.endOf('month');
  }
  
  const totalDays = endDate.diff(startDate, 'day') + 1;
  
  return {
    startDate,
    endDate,
    totalDays
  };
}

/**
 * Generate calendar cells for the date range
 * Creates a grid structure suitable for 7-column calendar display
 * 
 * @param dateRange - The date range to generate cells for
 * @param matches - Matches to position in the calendar
 * @param primaryTeamId - ID of the primary team (for home/away determination)
 * @param teamsCache - Cache of team data for efficient lookups
 * @returns Array of calendar cells
 */
export function generateCalendarCells(
  dateRange: CalendarDateRange,
  matches: Match[] = [],
  primaryTeamId?: string,
  teamsCache: Map<string, Team> = new Map()
): CalendarCell[] {
  const { startDate, endDate } = dateRange;
  const today = dayjs().startOf('day');
  const cells: CalendarCell[] = [];
  
  // Create match indicators map for quick lookup
  const matchesByDate = createMatchesByDateMap(matches, primaryTeamId, teamsCache);
  
  // Generate cells for each day in the range
  let currentDate = startDate;
  while (currentDate.isSameOrBefore(endDate)) {
    const dateKey = currentDate.format('YYYY-MM-DD');
    const matchesForDate = matchesByDate.get(dateKey) || [];
    
    cells.push({
      date: currentDate,
      isToday: currentDate.isSame(today, 'day'),
      isCurrentMonth: currentDate.isSame(startDate, 'month'),
      isEmpty: false,
      matches: matchesForDate
    });
    
    currentDate = currentDate.add(1, 'day');
  }
  
  return cells;
}

/**
 * Create a complete calendar grid structure
 * 
 * @param referenceDate - The reference date (defaults to today)
 * @param matches - Matches to display in the calendar
 * @param primaryTeamId - ID of the primary team (for home/away determination)
 * @param minDays - Minimum number of days to show (defaults to 14)
 * @param teamsCache - Cache of team data for efficient lookups
 * @returns Complete calendar grid structure
 */
export function createCalendarGrid(
  referenceDate: Dayjs = dayjs(),
  matches: Match[] = [],
  primaryTeamId?: string,
  minDays: number = 14,
  teamsCache: Map<string, Team> = new Map()
): CalendarGrid {
  const dateRange = calculateCalendarDateRange(referenceDate, minDays);
  const cells = generateCalendarCells(dateRange, matches, primaryTeamId, teamsCache);
  const weekCount = Math.ceil(cells.length / 7);
  
  return {
    dateRange,
    cells,
    weekCount,
    today: dayjs().startOf('day')
  };
}

/**
 * Create a map of matches organized by date for quick lookup
 * 
 * @param matches - Array of matches
 * @param primaryTeamId - ID of the primary team (for home/away determination)
 * @param teamsCache - Cache of team data for efficient lookups
 * @returns Map of date strings to match indicators
 */
function createMatchesByDateMap(
  matches: Match[],
  primaryTeamId?: string,
  teamsCache: Map<string, Team> = new Map()
): Map<string, CalendarMatchIndicator[]> {
  const matchesByDate = new Map<string, CalendarMatchIndicator[]>();
  
  matches.forEach(match => {
    const matchDate = dayjs(match.kickoffTime);
    const dateKey = matchDate.format('YYYY-MM-DD');
    
    const indicator = createMatchIndicator(match, primaryTeamId, teamsCache);
    
    if (!matchesByDate.has(dateKey)) {
      matchesByDate.set(dateKey, []);
    }
    matchesByDate.get(dateKey)!.push(indicator);
  });
  
  // Sort matches within each date by time
  matchesByDate.forEach(indicators => {
    indicators.sort((a, b) => a.date.diff(b.date));
  });
  
  return matchesByDate;
}

/**
 * Create a match indicator for calendar display
 * 
 * @param match - The match to create an indicator for
 * @param primaryTeamId - ID of the primary team (for home/away determination)
 * @param teamsCache - Cache of team data for efficient lookups
 * @returns Calendar match indicator
 */
function createMatchIndicator(
  match: Match,
  primaryTeamId?: string,
  teamsCache: Map<string, Team> = new Map()
): CalendarMatchIndicator {
  const matchDate = dayjs(match.kickoffTime);

  // Prefer embedded team objects from the match; then try cache; then placeholder
  const homeSource = match.homeTeam || teamsCache.get(match.homeTeamId);
  const awaySource = match.awayTeam || teamsCache.get(match.awayTeamId);

  const homeTeam: Team = {
    id: homeSource?.id || match.homeTeamId,
    name: homeSource?.name || (match.homeTeamId ? `Team ${match.homeTeamId.slice(0, 8)}` : 'Unknown Team'),
    homeKitPrimary: homeSource?.homeKitPrimary || '#2dd4bf',
    homeKitSecondary: homeSource?.homeKitSecondary || '#0d9488',
    awayKitPrimary: homeSource?.awayKitPrimary || '#f59e0b',
    awayKitSecondary: homeSource?.awayKitSecondary || '#d97706',
    createdAt: match.createdAt,
    createdByUserId: match.createdByUserId,
    isDeleted: match.isDeleted,
    isOpponent: typeof homeSource?.isOpponent === 'boolean' ? homeSource.isOpponent : false
  };

  const awayTeam: Team = {
    id: awaySource?.id || match.awayTeamId,
    name: awaySource?.name || (match.awayTeamId ? `Team ${match.awayTeamId.slice(0, 8)}` : 'Unknown Team'),
    homeKitPrimary: awaySource?.homeKitPrimary || '#f59e0b',
    homeKitSecondary: awaySource?.homeKitSecondary || '#d97706',
    awayKitPrimary: awaySource?.awayKitPrimary || '#2dd4bf',
    awayKitSecondary: awaySource?.awayKitSecondary || '#0d9488',
    createdAt: match.createdAt,
    createdByUserId: match.createdByUserId,
    isDeleted: match.isDeleted,
    isOpponent: typeof awaySource?.isOpponent === 'boolean' ? awaySource.isOpponent : true
  };

  // Determine whether this is a home game for YOUR TEAM.
  // Prefer isOpponent flags; fallback to primaryTeamId compare when flags are unknown.
  let isHome: boolean;
  if (homeSource?.isOpponent === true) {
    isHome = false; // home is opponent -> our team is away
  } else if (awaySource?.isOpponent === true) {
    isHome = true; // away is opponent -> our team is home
  } else if (homeSource?.isOpponent === false) {
    isHome = true;
  } else if (awaySource?.isOpponent === false) {
    isHome = false;
  } else {
    isHome = primaryTeamId ? match.homeTeamId === primaryTeamId : true;
  }

  const relevantTeam = isHome ? homeTeam : awayTeam; // YOUR TEAM for colors

  const colors = getMatchIndicatorColors(relevantTeam, isHome);

  return {
    matchId: match.id,
    date: matchDate,
    homeTeam,
    awayTeam,
    isHome,
    time: formatMatchTime(matchDate),
    colors
  };
}

/**
 * Get colors for a match indicator based on team and home/away status
 * 
 * @param team - The team to get colors for
 * @param isHome - Whether this is a home match
 * @returns Primary and secondary colors for the indicator
 */
function getMatchIndicatorColors(
  team: Team,
  isHome: boolean
): { primary: string; secondary: string } {
  // Use team kit colors if available (shared types use different field names)
  const primaryColor = isHome ? team.homeKitPrimary : team.awayKitPrimary;
  const secondaryColor = isHome ? team.homeKitSecondary : team.awayKitSecondary;
  
  if (primaryColor && secondaryColor) {
    return {
      primary: ensureAccessibleColor(primaryColor),
      secondary: ensureAccessibleColor(secondaryColor)
    };
  }
  
  // If only primary color is available, use it with a darker variant for secondary
  if (primaryColor) {
    const accessiblePrimary = ensureAccessibleColor(primaryColor);
    return {
      primary: accessiblePrimary,
      secondary: darkenColor(accessiblePrimary, 0.2)
    };
  }
  
  // Fallback colors if team colors are not defined
  return {
    primary: isHome ? '#2dd4bf' : '#f59e0b', // teal for home, amber for away
    secondary: isHome ? '#0d9488' : '#d97706'
  };
}

/**
 * Darken a hex color by a given percentage
 * 
 * @param color - Hex color string (e.g., "#ff0000")
 * @param amount - Amount to darken (0-1, where 0.2 = 20% darker)
 * @returns Darkened hex color string
 */
function darkenColor(color: string, amount: number): string {
  // Remove # if present
  const hex = color.replace('#', '');
  
  // Parse RGB values
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Darken each component
  const darkenedR = Math.max(0, Math.floor(r * (1 - amount)));
  const darkenedG = Math.max(0, Math.floor(g * (1 - amount)));
  const darkenedB = Math.max(0, Math.floor(b * (1 - amount)));
  
  // Convert back to hex
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(darkenedR)}${toHex(darkenedG)}${toHex(darkenedB)}`;
}

/**
 * Ensure color has sufficient contrast for accessibility
 * 
 * @param color - Hex color string
 * @returns Color with sufficient contrast or fallback
 */
function ensureAccessibleColor(color: string): string {
  // Simple check for very light colors that might not be visible
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate relative luminance (simplified)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // If too light, darken it
  if (luminance > 0.8) {
    return darkenColor(color, 0.3);
  }
  
  return color;
}

/**
 * Format a date for display in calendar cells
 * 
 * @param date - The date to format
 * @returns Formatted date string (e.g., "15")
 */
export function formatCalendarDate(date: Dayjs): string {
  return date.format('D');
}

/**
 * Format a date for accessibility/screen readers
 * 
 * @param date - The date to format
 * @returns Formatted date string (e.g., "Monday, January 15, 2024")
 */
export function formatCalendarDateAccessible(date: Dayjs): string {
  return date.format('dddd, MMMM D, YYYY');
}

/**
 * Format match time for display
 * 
 * @param date - The match date/time
 * @returns Formatted time string (e.g., "3:00 PM")
 */
export function formatMatchTime(date: Dayjs): string {
  return date.format('h:mm A');
}

/**
 * Format a date range for display
 * 
 * @param startDate - Start of the range
 * @param endDate - End of the range
 * @returns Formatted date range string (e.g., "Jan 15 - Feb 1, 2024")
 */
export function formatDateRange(startDate: Dayjs, endDate: Dayjs): string {
  if (startDate.isSame(endDate, 'year')) {
    if (startDate.isSame(endDate, 'month')) {
      return `${startDate.format('MMM D')} - ${endDate.format('D, YYYY')}`;
    }
    return `${startDate.format('MMM D')} - ${endDate.format('MMM D, YYYY')}`;
  }
  return `${startDate.format('MMM D, YYYY')} - ${endDate.format('MMM D, YYYY')}`;
}

/**
 * Get matches for a specific date
 * 
 * @param matches - Array of matches to search
 * @param date - The date to find matches for
 * @returns Array of matches on the specified date
 */
export function getMatchesForDate(matches: Match[], date: Dayjs): Match[] {
  return matches.filter(match => {
    const matchDate = dayjs(match.kickoffTime);
    return matchDate.isSame(date, 'day');
  });
}

/**
 * Sort matches chronologically
 * 
 * @param matches - Array of matches to sort
 * @returns Sorted array of matches (earliest first)
 */
export function sortMatchesChronologically(matches: Match[]): Match[] {
  return [...matches].sort((a, b) => {
    const dateA = dayjs(a.kickoffTime).valueOf();
    const dateB = dayjs(b.kickoffTime).valueOf();
    return dateA - dateB;
  });
}

/**
 * Filter matches by date range
 * 
 * @param matches - Array of matches to filter
 * @param startDate - Start of the date range
 * @param endDate - End of the date range
 * @returns Filtered array of matches within the date range
 */
export function filterMatchesByDateRange(
  matches: Match[],
  startDate: Dayjs,
  endDate: Dayjs
): Match[] {
  return matches.filter(match => {
    const matchDate = dayjs(match.kickoffTime);
    return matchDate.isSameOrAfter(startDate, 'day') && 
           matchDate.isSameOrBefore(endDate, 'day');
  });
}
/**

 * Check if a date is today
 * 
 * @param date - The date to check
 * @returns True if the date is today
 */
export function isToday(date: Dayjs): boolean {
  return date.isSame(dayjs(), 'day');
}

/**
 * Check if a date is in the past
 * 
 * @param date - The date to check
 * @returns True if the date is before today
 */
export function isPastDate(date: Dayjs): boolean {
  return date.isBefore(dayjs(), 'day');
}

/**
 * Check if a date is in the future
 * 
 * @param date - The date to check
 * @returns True if the date is after today
 */
export function isFutureDate(date: Dayjs): boolean {
  return date.isAfter(dayjs(), 'day');
}

/**
 * Get the week number for a date within a calendar grid
 * 
 * @param date - The date to get the week for
 * @param startDate - The start date of the calendar
 * @returns Week number (0-based)
 */
export function getWeekNumber(date: Dayjs, startDate: Dayjs): number {
  const daysDiff = date.diff(startDate, 'day');
  return Math.floor(daysDiff / 7);
}

/**
 * Get the day of week index (0 = Sunday, 6 = Saturday)
 * 
 * @param date - The date to get the day of week for
 * @returns Day of week index
 */
export function getDayOfWeekIndex(date: Dayjs): number {
  return date.day();
}
