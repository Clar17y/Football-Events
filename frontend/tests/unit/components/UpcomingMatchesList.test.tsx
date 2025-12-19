import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UpcomingMatchesList from '../../../src/components/UpcomingMatchesList';
import type { Match, Team } from '@shared/types';
import { afterEach } from 'node:test';

// Mock Ionic components
vi.mock('@ionic/react', () => ({
  IonIcon: ({ icon, className }: any) => <div data-testid="ion-icon" data-icon={icon} className={className} />,
  IonChip: ({ children, color, className }: any) => (
    <div data-testid="ion-chip" data-color={color} className={className}>
      {children}
    </div>
  ),
  IonButton: ({ children, onClick, disabled, color, fill, size, expand, className }: any) => (
    <button
      data-testid="ion-button"
      onClick={onClick}
      disabled={disabled}
      data-color={color}
      data-fill={fill}
      data-size={size}
      data-expand={expand}
      className={className}
    >
      {children}
    </button>
  ),
  IonGrid: ({ children, className }: any) => <div data-testid="ion-grid" className={className}>{children}</div>,
  IonRow: ({ children, className }: any) => <div data-testid="ion-row" className={className}>{children}</div>,
  IonCol: ({ children, className, size, sizeMd }: any) => (
    <div data-testid="ion-col" className={className} data-size={size} data-size-md={sizeMd}>
      {children}
    </div>
  ),
}));

// Mock icons
vi.mock('ionicons/icons', () => ({
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  calendar: 'calendar',
  time: 'time',
  location: 'location',
  football: 'football',
  stopwatch: 'stopwatch',
  trophy: 'trophy',
  create: 'create',
}));

describe('UpcomingMatchesList', () => {
  const mockTeam1: Team = {
    id: 'team1',
    name: 'Home Team',
    homeKitPrimary: '#2563eb',
    awayKitPrimary: '#dc2626',
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
    isOpponent: false,
  };

  const mockTeam2: Team = {
    id: 'team2',
    name: 'Away Team',
    homeKitPrimary: '#16a34a',
    awayKitPrimary: '#ea580c',
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
    isOpponent: true,
  };

  const mockUpcomingMatch: Match = {
    id: 'match1',
    seasonId: 'season1',
    kickoffTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    homeTeamId: 'team1',
    awayTeamId: 'team2',
    homeTeam: mockTeam1,
    awayTeam: mockTeam2,
    venue: 'Test Stadium',
    competition: 'Test League',
    durationMinutes: 90,
    periodFormat: 'half',
    homeScore: 0,
    awayScore: 0,
    notes: 'Test match notes',
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
  };

  const mockPastMatch: Match = {
    ...mockUpcomingMatch,
    id: 'match2',
    kickoffTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
  };

  const defaultProps = {
    matches: [mockUpcomingMatch],
    expandedMatches: new Set<string>(),
    onToggleExpand: vi.fn(),
    onMatchSelect: vi.fn(),
    onEditMatch: vi.fn(),
    loading: false,
    teamsCache: new Map([
      ['team1', mockTeam1],
      ['team2', mockTeam2],
    ]),
    primaryTeamId: 'team1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any rendered components
    document.body.innerHTML = '';
  });

  it('renders upcoming matches correctly', () => {
    render(<UpcomingMatchesList {...defaultProps} />);

    expect(screen.getByText('Home Team')).toBeInTheDocument();
    expect(screen.getByText('Away Team')).toBeInTheDocument();
    expect(screen.getByText('vs')).toBeInTheDocument();
    expect(screen.getByText('(H)')).toBeInTheDocument(); // Home indicator
  });

  it('filters out past matches', () => {
    const props = {
      ...defaultProps,
      matches: [mockUpcomingMatch, mockPastMatch],
    };

    render(<UpcomingMatchesList {...props} />);

    // Should only show the upcoming match - use more specific selector
    const matchItems = document.querySelectorAll('.upcoming-match-item');
    expect(matchItems).toHaveLength(1);
  });

  it('sorts matches chronologically', () => {
    const match1 = {
      ...mockUpcomingMatch,
      id: 'match1',
      kickoffTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // Day after tomorrow
    };

    const match2 = {
      ...mockUpcomingMatch,
      id: 'match2',
      kickoffTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    };

    const props = {
      ...defaultProps,
      matches: [match1, match2], // Unsorted order
    };

    render(<UpcomingMatchesList {...props} />);

    const matchItems = screen.getAllByTestId('ion-chip');
    // First match should be tomorrow (earlier date)
    expect(matchItems[0]).toHaveTextContent('Tomorrow');
  });

  it('handles expand/collapse functionality', () => {
    const onToggleExpand = vi.fn();
    const props = {
      ...defaultProps,
      onToggleExpand,
    };

    render(<UpcomingMatchesList {...props} />);

    // Click on the match header to expand
    const matchHeader = screen.getByText('vs').closest('.match-header');
    fireEvent.click(matchHeader!);

    expect(onToggleExpand).toHaveBeenCalledWith('match1');
  });

  it('shows expanded details when match is expanded', () => {
    const props = {
      ...defaultProps,
      expandedMatches: new Set(['match1']),
    };

    render(<UpcomingMatchesList {...props} />);

    expect(screen.getByText('Test Stadium')).toBeInTheDocument();
    expect(screen.getByText('Test League')).toBeInTheDocument();
    expect(screen.getByText('90 minutes')).toBeInTheDocument();
    expect(screen.getByText('half')).toBeInTheDocument();
    expect(screen.getByText('Test match notes')).toBeInTheDocument();
  });

  it('calls onMatchSelect when match item is clicked', () => {
    const onMatchSelect = vi.fn();
    const props = {
      ...defaultProps,
      onMatchSelect,
    };

    const { container } = render(<UpcomingMatchesList {...props} />);

    const matchItem = container.querySelector('.upcoming-match-item');
    fireEvent.click(matchItem!);

    expect(onMatchSelect).toHaveBeenCalledWith('match1');
  });

  it('shows loading state', () => {
    const props = {
      ...defaultProps,
      loading: true,
    };

    render(<UpcomingMatchesList {...props} />);

    expect(screen.getByTestId('upcoming-matches-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-match-item')).toHaveLength(3);
  });

  it('shows empty state when no upcoming matches', () => {
    const props = {
      ...defaultProps,
      matches: [],
    };

    render(<UpcomingMatchesList {...props} />);

    expect(screen.getByText('No Upcoming Matches')).toBeInTheDocument();
    expect(screen.getByText('Schedule your next match to see it appear here.')).toBeInTheDocument();
  });

  it('shows empty state when only past matches exist', () => {
    const props = {
      ...defaultProps,
      matches: [mockPastMatch],
    };

    const { container } = render(<UpcomingMatchesList {...props} />);

    expect(container.querySelector('.upcoming-matches-empty')).toBeInTheDocument();
  });

  it('determines home/away correctly based on primaryTeamId', () => {
    const props = {
      ...defaultProps,
      primaryTeamId: 'team2', // Away team is now primary
    };

    render(<UpcomingMatchesList {...props} />);

    expect(screen.getByText('(A)')).toBeInTheDocument(); // Away indicator
  });

  it('handles missing team data gracefully', () => {
    const matchWithoutTeams: Match = {
      ...mockUpcomingMatch,
      homeTeam: undefined,
      awayTeam: undefined,
    };

    const props = {
      ...defaultProps,
      matches: [matchWithoutTeams],
    };

    const { container } = render(<UpcomingMatchesList {...props} />);

    // Check that fallback names are used
    const teamNames = container.querySelectorAll('.team-name');
    expect(teamNames[0]).toHaveTextContent('Home Team'); // Fallback name
    expect(teamNames[1]).toHaveTextContent('Away Team'); // Fallback name
  });

  it('shows transparent color indicator for opponent teams using default colors', () => {
    const opponentTeamWithDefaults: Team = {
      ...mockTeam2,
      isOpponent: true,
      homeKitPrimary: undefined, // No custom color
      awayKitPrimary: undefined, // No custom color
    };

    const matchWithDefaultOpponent: Match = {
      ...mockUpcomingMatch,
      awayTeam: opponentTeamWithDefaults,
    };

    const props = {
      ...defaultProps,
      matches: [matchWithDefaultOpponent],
      teamsCache: new Map([
        ['team1', mockTeam1],
        ['team2', opponentTeamWithDefaults],
      ]),
    };

    render(<UpcomingMatchesList {...props} />);

    const colorIndicators = document.querySelectorAll('.team-color-indicator');
    const opponentIndicator = colorIndicators[1]; // Second indicator is opponent

    expect(opponentIndicator).toHaveClass('transparent');
    expect(opponentIndicator).toHaveStyle('background-color: transparent');
  });

  it('shows edit match button when onEditMatch is provided and match is expanded', () => {
    const onEditMatch = vi.fn();
    const props = {
      ...defaultProps,
      expandedMatches: new Set(['match1']),
      onEditMatch,
    };

    const { container } = render(<UpcomingMatchesList {...props} />);

    const editButton = container.querySelector('.edit-match-button');
    expect(editButton).toBeInTheDocument();

    fireEvent.click(editButton!);
    expect(onEditMatch).toHaveBeenCalledWith(mockUpcomingMatch);
  });

  it('does not show edit match button when onEditMatch is not provided', () => {
    const props = {
      ...defaultProps,
      expandedMatches: new Set(['match1']),
      onEditMatch: undefined,
    };

    const { container } = render(<UpcomingMatchesList {...props} />);

    const editButton = container.querySelector('.edit-match-button');
    expect(editButton).not.toBeInTheDocument();
  });

  it('does not show edit match button when match is not expanded', () => {
    const props = {
      ...defaultProps,
      expandedMatches: new Set<string>(), // No expanded matches
      onEditMatch: vi.fn(),
    };

    const { container } = render(<UpcomingMatchesList {...props} />);

    const editButton = container.querySelector('.edit-match-button');
    expect(editButton).not.toBeInTheDocument();
  });
});