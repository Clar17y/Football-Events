/**
 * Unit tests for calendar utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import dayjs, { Dayjs } from 'dayjs';
import {
  calculateCalendarDateRange,
  generateCalendarCells,
  createCalendarGrid,
  formatCalendarDate,
  formatCalendarDateAccessible,
  formatMatchTime,
  formatDateRange,
  isToday,
  isPastDate,
  isFutureDate,
  getWeekNumber,
  getDayOfWeekIndex,
  getMatchesForDate,
  sortMatchesChronologically,
  filterMatchesByDateRange,
  type CalendarCell,
  type CalendarGrid,
  type CalendarDateRange
} from '../../src/utils/calendarUtils';
import type { Match, Team } from '@shared/types';

// Mock data using shared types structure
const mockTeam1: Team = {
  id: 'team1',
  name: 'Home Team',
  homeKitPrimary: '#ff0000',
  homeKitSecondary: '#ffffff',
  awayKitPrimary: '#0000ff',
  awayKitSecondary: '#ffffff',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  created_by_user_id: 'user1',
  is_deleted: false,
  is_opponent: false
};

const mockTeam2: Team = {
  id: 'team2',
  name: 'Away Team',
  homeKitPrimary: '#00ff00',
  homeKitSecondary: '#000000',
  awayKitPrimary: '#ffff00',
  awayKitSecondary: '#000000',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  created_by_user_id: 'user1',
  is_deleted: false,
  is_opponent: true
};

const createMockMatch = (
  id: string,
  date: Dayjs
): Match => ({
  id,
  seasonId: 'season1',
  kickoffTime: date.toDate(),
  homeTeamId: mockTeam1.id,
  awayTeamId: mockTeam2.id,
  competition: 'Test League',
  venue: 'Test Stadium',
  durationMinutes: 90,
  periodFormat: 'half',
  ourScore: 0,
  opponentScore: 0,
  notes: 'Test match',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  created_by_user_id: 'user1',
  is_deleted: false
});

describe('calendarUtils', () => {
  let referenceDate: Dayjs;
  let mockMatches: Match[];

  beforeEach(() => {
    // Use a fixed reference date for consistent testing
    referenceDate = dayjs('2024-01-15T10:00:00Z');
    
    mockMatches = [
      createMockMatch('match1', referenceDate.add(1, 'day').hour(15)),
      createMockMatch('match2', referenceDate.add(3, 'day').hour(14)),
      createMockMatch('match3', referenceDate.add(7, 'day').hour(16)),
      createMockMatch('match4', referenceDate.add(1, 'day').hour(18)), // Same day as match1
    ];
  });

  describe('calculateCalendarDateRange', () => {
    it('should calculate basic 14-day range', () => {
      const range = calculateCalendarDateRange(referenceDate, 14);
      
      expect(range.startDate.isSame(referenceDate.startOf('day'))).toBe(true);
      expect(range.totalDays).toBe(14);
      expect(range.endDate.diff(range.startDate, 'day')).toBe(13);
    });

    it('should extend to month boundary when close to end of month', () => {
      // Test with a date where 14 days will end very close to month end
      const nearEndOfMonth = dayjs('2024-01-18T10:00:00Z'); // 18 + 13 = 31, so ends on Jan 31
      const range = calculateCalendarDateRange(nearEndOfMonth, 14);
      
      // Should extend to January 31st (end of month) since we're within 2 days
      expect(range.endDate.date()).toBe(31);
      expect(range.endDate.month()).toBe(0); // January
      expect(range.totalDays).toBe(14); // Should be exactly 14 since it naturally ends on month boundary
    });

    it('should not extend when far from month boundary', () => {
      const earlyInMonth = dayjs('2024-01-05T10:00:00Z');
      const range = calculateCalendarDateRange(earlyInMonth, 14);
      
      expect(range.totalDays).toBe(14);
    });

    it('should handle custom minimum days', () => {
      const range = calculateCalendarDateRange(referenceDate, 21);
      
      expect(range.totalDays).toBe(21);
    });

    it('should use today as default reference date', () => {
      const today = dayjs().startOf('day');
      const range = calculateCalendarDateRange();
      
      expect(range.startDate.isSame(today)).toBe(true);
    });
  });

  describe('generateCalendarCells', () => {
    it('should generate correct number of cells', () => {
      const dateRange: CalendarDateRange = {
        startDate: referenceDate,
        endDate: referenceDate.add(13, 'day'),
        totalDays: 14
      };
      
      const cells = generateCalendarCells(dateRange, mockMatches, 'team1');
      
      expect(cells).toHaveLength(14);
    });

    it('should mark today correctly', () => {
      const today = dayjs().startOf('day');
      const dateRange: CalendarDateRange = {
        startDate: today.subtract(1, 'day'),
        endDate: today.add(1, 'day'),
        totalDays: 3
      };
      
      const cells = generateCalendarCells(dateRange);
      
      expect(cells[1].isToday).toBe(true);
      expect(cells[0].isToday).toBe(false);
      expect(cells[2].isToday).toBe(false);
    });

    it('should position matches correctly', () => {
      const dateRange: CalendarDateRange = {
        startDate: referenceDate,
        endDate: referenceDate.add(13, 'day'),
        totalDays: 14
      };
      
      const cells = generateCalendarCells(dateRange, mockMatches, 'team1');
      
      // Day 1 should have 2 matches (match1 and match4)
      expect(cells[1].matches).toHaveLength(2);
      expect(cells[1].matches[0].matchId).toBe('match1');
      expect(cells[1].matches[1].matchId).toBe('match4');
      
      // Day 3 should have 1 match (match2)
      expect(cells[3].matches).toHaveLength(1);
      expect(cells[3].matches[0].matchId).toBe('match2');
      
      // Day 7 should have 1 match (match3)
      expect(cells[7].matches).toHaveLength(1);
      expect(cells[7].matches[0].matchId).toBe('match3');
    });

    it('should determine home/away status correctly', () => {
      const dateRange: CalendarDateRange = {
        startDate: referenceDate,
        endDate: referenceDate.add(13, 'day'),
        totalDays: 14
      };
      
      const cells = generateCalendarCells(dateRange, mockMatches, 'team1');
      
      // team1 is home team in mockMatches, so isHome should be true
      expect(cells[1].matches[0].isHome).toBe(true);
    });

    it('should sort matches by time within each date', () => {
      const dateRange: CalendarDateRange = {
        startDate: referenceDate,
        endDate: referenceDate.add(13, 'day'),
        totalDays: 14
      };
      
      const cells = generateCalendarCells(dateRange, mockMatches, 'team1');
      
      // Day 1 has match1 (15:00) and match4 (18:00)
      const dayOneMatches = cells[1].matches;
      expect(dayOneMatches[0].time).toBe('3:00 PM'); // match1
      expect(dayOneMatches[1].time).toBe('6:00 PM'); // match4
    });
  });

  describe('createCalendarGrid', () => {
    it('should create complete calendar grid structure', () => {
      const grid = createCalendarGrid(referenceDate, mockMatches, 'team1', 14);
      
      expect(grid.dateRange.totalDays).toBe(14);
      expect(grid.cells).toHaveLength(14);
      expect(grid.weekCount).toBe(2); // 14 days = 2 weeks
      expect(grid.today.isSame(dayjs().startOf('day'))).toBe(true);
    });

    it('should calculate week count correctly', () => {
      const grid21Days = createCalendarGrid(referenceDate, [], undefined, 21);
      expect(grid21Days.weekCount).toBe(3); // 21 days = 3 weeks
      
      const grid10Days = createCalendarGrid(referenceDate, [], undefined, 10);
      expect(grid10Days.weekCount).toBe(2); // 10 days = 2 weeks (rounded up)
    });
  });

  describe('date formatting functions', () => {
    it('should format calendar date correctly', () => {
      const date = dayjs('2024-01-15T10:00:00Z');
      expect(formatCalendarDate(date)).toBe('15');
    });

    it('should format accessible date correctly', () => {
      const date = dayjs('2024-01-15T10:00:00Z');
      const formatted = formatCalendarDateAccessible(date);
      expect(formatted).toContain('Monday');
      expect(formatted).toContain('January');
      expect(formatted).toContain('15');
      expect(formatted).toContain('2024');
    });

    it('should format match time correctly', () => {
      const date = dayjs('2024-01-15T15:30:00Z');
      expect(formatMatchTime(date)).toBe('3:30 PM');
    });

    it('should format date range correctly', () => {
      const start = dayjs('2024-01-15T00:00:00Z');
      const end = dayjs('2024-01-29T00:00:00Z');
      expect(formatDateRange(start, end)).toBe('Jan 15 - 29, 2024');
      
      const crossMonth = dayjs('2024-02-15T00:00:00Z');
      expect(formatDateRange(start, crossMonth)).toBe('Jan 15 - Feb 15, 2024');
      
      const crossYear = dayjs('2025-01-15T00:00:00Z');
      expect(formatDateRange(start, crossYear)).toBe('Jan 15, 2024 - Jan 15, 2025');
    });
  });

  describe('date checking functions', () => {
    it('should identify today correctly', () => {
      const today = dayjs();
      const yesterday = dayjs().subtract(1, 'day');
      const tomorrow = dayjs().add(1, 'day');
      
      expect(isToday(today)).toBe(true);
      expect(isToday(yesterday)).toBe(false);
      expect(isToday(tomorrow)).toBe(false);
    });

    it('should identify past dates correctly', () => {
      const yesterday = dayjs().subtract(1, 'day');
      const today = dayjs();
      const tomorrow = dayjs().add(1, 'day');
      
      expect(isPastDate(yesterday)).toBe(true);
      expect(isPastDate(today)).toBe(false);
      expect(isPastDate(tomorrow)).toBe(false);
    });

    it('should identify future dates correctly', () => {
      const yesterday = dayjs().subtract(1, 'day');
      const today = dayjs();
      const tomorrow = dayjs().add(1, 'day');
      
      expect(isFutureDate(yesterday)).toBe(false);
      expect(isFutureDate(today)).toBe(false);
      expect(isFutureDate(tomorrow)).toBe(true);
    });
  });

  describe('calendar navigation functions', () => {
    it('should calculate week number correctly', () => {
      const startDate = dayjs('2024-01-15T00:00:00Z');
      
      expect(getWeekNumber(startDate, startDate)).toBe(0); // Same day
      expect(getWeekNumber(startDate.add(6, 'day'), startDate)).toBe(0); // Same week
      expect(getWeekNumber(startDate.add(7, 'day'), startDate)).toBe(1); // Next week
      expect(getWeekNumber(startDate.add(14, 'day'), startDate)).toBe(2); // Two weeks later
    });

    it('should get day of week index correctly', () => {
      // January 15, 2024 is a Monday
      const monday = dayjs('2024-01-15T00:00:00Z');
      expect(getDayOfWeekIndex(monday)).toBe(1); // Monday = 1
      
      const sunday = monday.subtract(1, 'day');
      expect(getDayOfWeekIndex(sunday)).toBe(0); // Sunday = 0
      
      const saturday = monday.add(5, 'day');
      expect(getDayOfWeekIndex(saturday)).toBe(6); // Saturday = 6
    });
  });

  describe('match filtering and sorting functions', () => {
    it('should get matches for specific date', () => {
      const targetDate = referenceDate.add(1, 'day');
      const matches = getMatchesForDate(mockMatches, targetDate);
      
      expect(matches).toHaveLength(2); // match1 and match4
      expect(matches[0].id).toBe('match1');
      expect(matches[1].id).toBe('match4');
    });

    it('should sort matches chronologically', () => {
      // Create matches in random order
      const unsortedMatches = [
        createMockMatch('late', referenceDate.add(10, 'day')),
        createMockMatch('early', referenceDate.add(1, 'day')),
        createMockMatch('middle', referenceDate.add(5, 'day'))
      ];
      
      const sorted = sortMatchesChronologically(unsortedMatches);
      
      expect(sorted[0].id).toBe('early');
      expect(sorted[1].id).toBe('middle');
      expect(sorted[2].id).toBe('late');
    });

    it('should filter matches by date range', () => {
      const startDate = referenceDate.add(2, 'day');
      const endDate = referenceDate.add(8, 'day');
      
      const filtered = filterMatchesByDateRange(mockMatches, startDate, endDate);
      
      expect(filtered).toHaveLength(2); // match2 and match3
      expect(filtered[0].id).toBe('match2');
      expect(filtered[1].id).toBe('match3');
    });

    it('should handle empty match arrays', () => {
      expect(getMatchesForDate([], referenceDate)).toHaveLength(0);
      expect(sortMatchesChronologically([])).toHaveLength(0);
      expect(filterMatchesByDateRange([], referenceDate, referenceDate.add(1, 'day'))).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle matches without team colors', () => {
      const teamWithoutColors: Team = {
        id: 'team3',
        name: 'No Colors Team',
        created_at: '2024-01-01T00:00:00Z'
      };
      
      const matchWithoutColors = createMockMatch('no-colors', referenceDate.add(1, 'day'), teamWithoutColors);
      
      const dateRange: CalendarDateRange = {
        startDate: referenceDate,
        endDate: referenceDate.add(5, 'day'),
        totalDays: 6
      };
      
      const cells = generateCalendarCells(dateRange, [matchWithoutColors], 'team3');
      
      expect(cells[1].matches[0].colors.primary).toBe('#2dd4bf'); // Default home color
    });

    it('should handle month boundaries correctly', () => {
      // Test crossing from January to February
      const endOfJanuary = dayjs('2024-01-31T00:00:00Z');
      const range = calculateCalendarDateRange(endOfJanuary, 5);
      
      expect(range.startDate.month()).toBe(0); // January
      expect(range.endDate.month()).toBe(1); // February
    });

    it('should handle leap years correctly', () => {
      // Test February 29, 2024 (leap year)
      const leapDay = dayjs('2024-02-29T00:00:00Z');
      const range = calculateCalendarDateRange(leapDay, 5);
      
      expect(range.startDate.isValid()).toBe(true);
      expect(range.endDate.isValid()).toBe(true);
    });

    it('should handle timezone changes gracefully', () => {
      // Test with different timezone
      const utcDate = dayjs('2024-01-15T23:00:00Z');
      const range = calculateCalendarDateRange(utcDate, 14);
      
      expect(range.totalDays).toBe(14);
      expect(range.startDate.isValid()).toBe(true);
    });
  });
});