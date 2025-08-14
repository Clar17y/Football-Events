import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import {
  createCalendarGrid,
  formatCalendarDate,
  formatCalendarDateAccessible,
  formatDateRange,
  type CalendarCell,
  type CalendarGrid,
  type CalendarMatchIndicator
} from '../utils/calendarUtils';
import type { Match, Team } from '@shared/types';
import './MatchesCalendar.css';

interface MatchesCalendarProps {
  /** Matches to display in the calendar */
  matches: Match[];
  /** Currently selected date */
  selectedDate: Date | null;
  /** Callback when an empty date is clicked */
  onDateClick: (date: Date) => void;
  /** Callback when a match indicator is clicked */
  onMatchClick: (matchId: string) => void;
  /** Loading state */
  loading?: boolean;
  /** Primary team ID for home/away determination */
  primaryTeamId?: string;
  /** Reference date for calendar (defaults to today) */
  referenceDate?: Date;
  /** Minimum days to show (defaults to 14) */
  minDays?: number;
  /** Teams cache for efficient team data lookups */
  teamsCache?: Map<string, Team>;
}

const MatchesCalendar: React.FC<MatchesCalendarProps> = ({
  matches = [],
  selectedDate,
  onDateClick,
  onMatchClick,
  loading = false,
  primaryTeamId,
  referenceDate,
  minDays = 14,
  teamsCache = new Map()
}) => {
  // Generate calendar grid
  const calendarGrid: CalendarGrid = useMemo(() => {
    const refDate = referenceDate ? dayjs(referenceDate) : dayjs();
    return createCalendarGrid(refDate, matches, primaryTeamId, minDays, teamsCache);
  }, [matches, primaryTeamId, referenceDate, minDays, teamsCache]);

  // Handle cell click - only for date clicks (match clicks are handled separately)
  const handleCellClick = (cell: CalendarCell, event: React.MouseEvent) => {
    const target = event.target as HTMLElement;

    // Don't handle date click if the click was on a match indicator
    if (target.closest('.match-indicator')) {
      return;
    }

    // Treat as date click
    onDateClick(cell.date.toDate());
  };

  // Handle keyboard navigation
  const handleCellKeyDown = (cell: CalendarCell, event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onDateClick(cell.date.toDate());
    }
  };

  // Handle match indicator click
  const handleMatchIndicatorClick = (matches: CalendarMatchIndicator[], event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering the cell click

    if (matches.length === 1) {
      // Single match - navigate directly
      onMatchClick(matches[0].matchId);
    } else {
      // Multiple matches - show selection mechanism
      handleMultipleMatchesClick(matches, event);
    }
  };

  // Handle multiple matches on same date
  const handleMultipleMatchesClick = (matches: CalendarMatchIndicator[], event: React.MouseEvent) => {
    // Create a simple selection menu
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();

    // For now, we'll use a simple prompt-based selection
    // In a real implementation, this would be a proper dropdown/popover
    const matchOptions = matches.map((match, index) =>
      `${index + 1}. ${match.homeTeam.name} vs ${match.awayTeam.name} at ${match.time}`
    ).join('\n');

    const selection = prompt(
      `Multiple matches on this date:\n\n${matchOptions}\n\nEnter the number of the match you want to view (1-${matches.length}):`
    );

    if (selection) {
      const selectedIndex = parseInt(selection) - 1;
      if (selectedIndex >= 0 && selectedIndex < matches.length) {
        onMatchClick(matches[selectedIndex].matchId);
      }
    }
  };

  // Handle match indicator keyboard interaction
  const handleMatchIndicatorKeyDown = (matches: CalendarMatchIndicator[], event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();

      if (matches.length === 1) {
        onMatchClick(matches[0].matchId);
      } else {
        // For keyboard users, just select the first match
        // In a real implementation, this would open a proper accessible menu
        onMatchClick(matches[0].matchId);
      }
    }
  };

  // Render match indicators for a cell
  const renderMatchIndicators = (matches: CalendarMatchIndicator[]) => {
    if (matches.length === 0) return null;
    const hasMultipleMatches = matches.length > 1;
    const displayMatches = matches.slice(0, 3);

    return (
      <div className="match-indicators">
        <button
          className={`match-indicators-button ${hasMultipleMatches ? 'multiple-matches' : 'single-match'}`}
          onClick={(e) => handleMatchIndicatorClick(matches, e)}
          onKeyDown={(e) => handleMatchIndicatorKeyDown(matches, e)}
          title={
            hasMultipleMatches
              ? `${matches.length} matches on this date. Click to select which match to view.`
              : `${matches[0].isHome ? 'Home' : 'Away'} match: ${matches[0].homeTeam.name} vs ${matches[0].awayTeam.name} at ${matches[0].time}`
          }
          aria-label={
            hasMultipleMatches
              ? `${matches.length} matches on this date. Click to select which match to view.`
              : `${matches[0].isHome ? 'Home' : 'Away'} match: ${matches[0].homeTeam.name} vs ${matches[0].awayTeam.name} at ${matches[0].time}. Click to view details.`
          }
        >
          {displayMatches.map((match, index) => {
            const homeAwayClass = match.isHome ? 'home-match' : 'away-match';

            return (
              <span
                key={match.matchId}
                className={`match-indicator ${homeAwayClass}`}
                data-match-id={match.matchId}
                style={{
                  backgroundColor: match.colors.primary,
                  borderColor: match.colors.secondary,
                }}
              />
            );
          })}
          {matches.length > 3 && (
            <span className="match-indicator-overflow">
              +{matches.length - 3}
            </span>
          )}
        </button>
      </div>
    );
  };

  // Render calendar cell
  const renderCalendarCell = (cell: CalendarCell, index: number) => {
    const isSelected = selectedDate && cell.date.isSame(dayjs(selectedDate), 'day');
    const hasMatches = cell.matches.length > 0;

    return (
      <div
        key={cell.date.format('YYYY-MM-DD')}
        className={`calendar-cell ${cell.isToday ? 'today' : ''} ${isSelected ? 'selected' : ''} ${hasMatches ? 'has-matches' : ''} ${!cell.isCurrentMonth ? 'other-month' : ''}`}
        onClick={(e) => handleCellClick(cell, e)}
        onKeyDown={(e) => handleCellKeyDown(cell, e)}
        tabIndex={0}
        role="button"
        aria-label={`${formatCalendarDateAccessible(cell.date)}${hasMatches ? `, ${cell.matches.length} match${cell.matches.length > 1 ? 'es' : ''}` : ', click to create match'}`}
      >
        <div className="calendar-cell-content">
          <span className="calendar-date">
            {formatCalendarDate(cell.date)}
          </span>
          {renderMatchIndicators(cell.matches)}
        </div>
      </div>
    );
  };

  // Render day headers for loading state
  const renderLoadingDayHeaders = () => {
    const refDate = referenceDate ? dayjs(referenceDate) : dayjs();
    const firstWeekDates = Array.from({ length: 7 }, (_, i) => refDate.add(i, 'day'));
    
    return (
      <div className="calendar-day-headers">
        {firstWeekDates.map((date, index) => (
          <div key={index} className="calendar-day-header">
            {date.format('ddd')} {/* Short day name (Mon, Tue, etc.) */}
          </div>
        ))}
      </div>
    );
  };

  // Render day headers based on the actual dates being displayed
  const renderDayHeaders = () => {
    // Get the first 7 days from the calendar grid to generate headers
    const firstWeekDates = calendarGrid.cells.slice(0, 7);
    
    return (
      <div className="calendar-day-headers">
        {firstWeekDates.map((cell, index) => (
          <div key={index} className="calendar-day-header">
            {cell.date.format('ddd')} {/* Short day name (Mon, Tue, etc.) */}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="matches-calendar loading">
        <div className="calendar-header">
          <div className="calendar-title">Loading calendar...</div>
        </div>
        <div className="calendar-skeleton">
          {renderLoadingDayHeaders()}
          <div className="calendar-grid">
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} className="calendar-cell skeleton">
                <div className="calendar-cell-content">
                  <span className="calendar-date skeleton-text"></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="matches-calendar">
      <div className="calendar-header">
        <div className="calendar-title">
          {formatDateRange(calendarGrid.dateRange.startDate, calendarGrid.dateRange.endDate)}
        </div>
        <div className="calendar-subtitle">
          {calendarGrid.dateRange.totalDays} days • Click any date to schedule a match
        </div>
      </div>

      <div className="calendar-container">
        {renderDayHeaders()}
        <div className="calendar-grid">
          {calendarGrid.cells.map((cell, index) => renderCalendarCell(cell, index))}
        </div>
      </div>
    </div>
  );
};

export default MatchesCalendar;