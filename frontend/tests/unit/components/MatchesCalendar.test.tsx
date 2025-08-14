/**
 * Unit tests for MatchesCalendar component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import dayjs from 'dayjs';
import MatchesCalendar from '../../../src/components/MatchesCalendar';
import type { Match, Team } from '@shared/types';
import { beforeEach } from 'node:test';

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
  date: dayjs.Dayjs
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

describe('MatchesCalendar', () => {
  const mockOnDateClick = vi.fn();
  const mockOnMatchClick = vi.fn();
  
  const referenceDate = dayjs('2024-01-15T10:00:00Z');
  const mockMatches: Match[] = [
    createMockMatch('match1', referenceDate.add(1, 'day').hour(15)),
    createMockMatch('match2', referenceDate.add(3, 'day').hour(14)),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render calendar with correct title', () => {
    render(
      <MatchesCalendar
        matches={mockMatches}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={referenceDate.toDate()}
      />
    );

    // Should show the date range in the title
    expect(screen.getByText(/Jan 15 - 28, 2024/)).toBeInTheDocument();
  });

  it('should render day headers based on reference date', () => {
    render(
      <MatchesCalendar
        matches={mockMatches}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={referenceDate.toDate()}
      />
    );

    // Reference date is Jan 15, 2024 (Monday), so headers should start with Mon
    // and show the next 7 consecutive days: Mon, Tue, Wed, Thu, Fri, Sat, Sun
    expect(screen.getByText('Mon')).toBeInTheDocument(); // Jan 15
    expect(screen.getByText('Tue')).toBeInTheDocument(); // Jan 16
    expect(screen.getByText('Wed')).toBeInTheDocument(); // Jan 17
    expect(screen.getByText('Thu')).toBeInTheDocument(); // Jan 18
    expect(screen.getByText('Fri')).toBeInTheDocument(); // Jan 19
    expect(screen.getByText('Sat')).toBeInTheDocument(); // Jan 20
    expect(screen.getByText('Sun')).toBeInTheDocument(); // Jan 21
  });

  it('should render calendar cells', () => {
    render(
      <MatchesCalendar
        matches={mockMatches}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={referenceDate.toDate()}
      />
    );

    // Should render calendar cells with dates
    expect(screen.getByText('15')).toBeInTheDocument(); // Reference date
    expect(screen.getByText('16')).toBeInTheDocument(); // Day with match1
    expect(screen.getByText('18')).toBeInTheDocument(); // Day with match2
  });

  it('should call onDateClick when empty date is clicked', () => {
    render(
      <MatchesCalendar
        matches={mockMatches}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={referenceDate.toDate()}
      />
    );

    // Click on a date without matches (day 17)
    const dateCell = screen.getByText('17').closest('.calendar-cell');
    expect(dateCell).toBeInTheDocument();
    
    fireEvent.click(dateCell!);
    expect(mockOnDateClick).toHaveBeenCalledTimes(1);
  });

  it('should show loading state', () => {
    render(
      <MatchesCalendar
        matches={[]}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        loading={true}
      />
    );

    expect(screen.getByText('Loading calendar...')).toBeInTheDocument();
  });

  it('should highlight today', () => {
    const today = dayjs();
    render(
      <MatchesCalendar
        matches={[]}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={today.toDate()}
      />
    );

    // Find today's date cell
    const todayCell = screen.getByText(today.format('D')).closest('.calendar-cell');
    expect(todayCell).toHaveClass('today');
  });

  it('should render day headers starting from today when no reference date provided', () => {
    const today = dayjs();
    render(
      <MatchesCalendar
        matches={[]}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
      />
    );

    // Should show today's day name as the first header
    const todayDayName = today.format('ddd');
    expect(screen.getByText(todayDayName)).toBeInTheDocument();
  });

  it('should show selected date', () => {
    const selectedDate = referenceDate.add(2, 'day').toDate();
    
    render(
      <MatchesCalendar
        matches={mockMatches}
        selectedDate={selectedDate}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={referenceDate.toDate()}
      />
    );

    // Find selected date cell
    const selectedCell = screen.getByText('17').closest('.calendar-cell');
    expect(selectedCell).toHaveClass('selected');
  });

  it('should render match indicators as clickable buttons', () => {
    render(
      <MatchesCalendar
        matches={mockMatches}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={referenceDate.toDate()}
      />
    );

    // Should have match indicators as buttons with aria-labels
    const matchIndicators = screen.getAllByRole('button', { name: /match:.*Click to view details/ });
    expect(matchIndicators.length).toBe(2); // We have 2 mock matches
    
    // Check that the match indicators contain the correct match IDs in their child elements
    const matchIndicator1 = matchIndicators.find(button => 
      button.querySelector('[data-match-id="match1"]')
    );
    const matchIndicator2 = matchIndicators.find(button => 
      button.querySelector('[data-match-id="match2"]')
    );
    
    expect(matchIndicator1).toBeTruthy();
    expect(matchIndicator2).toBeTruthy();
  });

  it('should call onMatchClick when match indicator is clicked', () => {
    render(
      <MatchesCalendar
        matches={mockMatches}
        selectedDate={null}
        onDateClick={mockOnDateClick}
        onMatchClick={mockOnMatchClick}
        referenceDate={referenceDate.toDate()}
      />
    );

    // Click on the first match indicator
    const matchIndicators = screen.getAllByRole('button', { name: /match:.*Click to view details/ });
    fireEvent.click(matchIndicators[0]);
    
    expect(mockOnMatchClick).toHaveBeenCalledWith('match1');
    expect(mockOnDateClick).not.toHaveBeenCalled(); // Should not trigger date click
  });
});