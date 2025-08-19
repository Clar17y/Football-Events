import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CompletedMatchesList from '../../../src/components/CompletedMatchesList';
import type { Match, Team } from '@shared/types';

// Mock Ionic React components
vi.mock('@ionic/react', () => ({
  IonIcon: ({ icon, className }: any) => <div data-testid="ion-icon" className={className} data-icon={icon} />,
  IonChip: ({ children, className }: any) => <div className={className}>{children}</div>,
  IonButton: ({ children, onClick, className, disabled }: any) => (
    <button onClick={onClick} className={className} disabled={disabled}>
      {children}
    </button>
  ),
  IonGrid: ({ children, className }: any) => <div className={className}>{children}</div>,
  IonRow: ({ children, className }: any) => <div className={className}>{children}</div>,
  IonCol: ({ children, className, size, sizeMd }: any) => (
    <div className={className} data-size={size} data-size-md={sizeMd}>
      {children}
    </div>
  ),
}));

// Mock ionicons
vi.mock('ionicons/icons', () => ({
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
  calendar: 'calendar',
  time: 'time',
  location: 'location',
  football: 'football',
  stopwatch: 'stopwatch',
  trophy: 'trophy',
  eye: 'eye',
}));

describe('CompletedMatchesList', () => {
  const mockTeam1: Team = {
    id: 'team1',
    name: 'Our Team',
    homeKitPrimary: '#2563eb',
    awayKitPrimary: '#dc2626',
    createdAt: new Date(),
    created_by_user_id: 'user1',
    is_deleted: false,
    is_opponent: false,
  };

  const mockTeam2: Team = {
    id: 'team2',
    name: 'Opponent Team',
    homeKitPrimary: '#16a34a',
    awayKitPrimary: '#ea580c',
    createdAt: new Date(),
    created_by_user_id: 'user1',
    is_deleted: false,
    is_opponent: true,
  };

  const mockCompletedMatch: Match = {
    id: 'match1',
    seasonId: 'season1',
    kickoffTime: new Date('2024-01-15T14:00:00Z'), // Past date
    competition: 'League Cup',
    homeTeamId: 'team1',
    awayTeamId: 'team2',
    homeTeam: mockTeam1,
    awayTeam: mockTeam2,
    venue: 'Home Ground',
    durationMinutes: 90,
    periodFormat: '2x45min',
    ourScore: 2,
    opponentScore: 1,
    notes: 'Great match!',
    createdAt: new Date(),
    created_by_user_id: 'user1',
    is_deleted: false,
  };

  const mockUpcomingMatch: Match = {
    ...mockCompletedMatch,
    id: 'match2',
    kickoffTime: new Date(Date.now() + 86400000), // Future date (tomorrow)
    ourScore: 0,
    opponentScore: 0,
  };

  const defaultProps = {
    matches: [mockCompletedMatch, mockUpcomingMatch],
    expandedMatches: new Set<string>(),
    onToggleExpand: vi.fn(),
    onMatchSelect: vi.fn(),
    onViewEvents: vi.fn(),
    loading: false,
    teamsCache: new Map([
      ['team1', mockTeam1],
      ['team2', mockTeam2],
    ]),
    primaryTeamId: 'team1',
  };

  it('renders completed matches only', () => {
    render(<CompletedMatchesList {...defaultProps} />);
    
    // Should show only the completed match (past date)
    expect(screen.getByText('Our Team')).toBeInTheDocument();
    expect(screen.getByText('Opponent Team')).toBeInTheDocument();
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
    
    // Should not show upcoming matches
    expect(screen.queryByText('0 - 0')).not.toBeInTheDocument();
  });

  it('displays win result with correct styling', () => {
    render(<CompletedMatchesList {...defaultProps} />);
    
    const scoreDisplay = screen.getByText('2 - 1');
    expect(scoreDisplay).toHaveClass('score-display', 'win');
    
    const resultIndicator = screen.getByText('W');
    expect(resultIndicator).toHaveClass('result-indicator', 'win');
  });

  it('displays loss result with correct styling', () => {
    const lossMatch = {
      ...mockCompletedMatch,
      ourScore: 1,
      opponentScore: 2,
    };
    
    render(<CompletedMatchesList {...defaultProps} matches={[lossMatch]} />);
    
    const scoreDisplay = screen.getByText('1 - 2');
    expect(scoreDisplay).toHaveClass('score-display', 'loss');
    
    const resultIndicator = screen.getByText('L');
    expect(resultIndicator).toHaveClass('result-indicator', 'loss');
  });

  it('displays draw result with correct styling', () => {
    const drawMatch = {
      ...mockCompletedMatch,
      ourScore: 1,
      opponentScore: 1,
    };
    
    render(<CompletedMatchesList {...defaultProps} matches={[drawMatch]} />);
    
    const scoreDisplay = screen.getByText('1 - 1');
    expect(scoreDisplay).toHaveClass('score-display', 'draw');
    
    const resultIndicator = screen.getByText('D');
    expect(resultIndicator).toHaveClass('result-indicator', 'draw');
  });

  it('shows result indicator with correct color', () => {
    render(<CompletedMatchesList {...defaultProps} />);
    
    const matchItem = document.querySelector('.completed-match-item');
    expect(matchItem).toHaveClass('win');
    
    const resultIndicator = document.querySelector('.match-result-indicator');
    expect(resultIndicator).toHaveClass('win');
  });

  it('expands match details when clicked', () => {
    const mockOnToggleExpand = vi.fn();
    render(<CompletedMatchesList {...defaultProps} onToggleExpand={mockOnToggleExpand} />);
    
    const matchHeader = document.querySelector('.match-header');
    fireEvent.click(matchHeader!);
    
    expect(mockOnToggleExpand).toHaveBeenCalledWith('match1');
  });

  it('shows expanded details when match is expanded', () => {
    const expandedMatches = new Set(['match1']);
    render(<CompletedMatchesList {...defaultProps} expandedMatches={expandedMatches} />);
    
    expect(screen.getByText('Venue')).toBeInTheDocument();
    expect(screen.getByText('Home Ground')).toBeInTheDocument();
    expect(screen.getByText('Competition')).toBeInTheDocument();
    expect(screen.getByText('League Cup')).toBeInTheDocument();
    expect(screen.getByText('Show Match Events')).toBeInTheDocument();
  });

  it('shows Show Match Events button as disabled (stubbed for future)', () => {
    const expandedMatches = new Set(['match1']);
    render(
      <CompletedMatchesList 
        {...defaultProps} 
        expandedMatches={expandedMatches}
      />
    );
    
    const viewEventsButton = screen.getByText('Show Match Events');
    expect(viewEventsButton).toBeDisabled();
  });

  it('shows loading state', () => {
    render(<CompletedMatchesList {...defaultProps} loading={true} />);
    
    expect(screen.getByTestId('completed-matches-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-match-item')).toHaveLength(3);
  });

  it('shows empty state when no completed matches', () => {
    render(<CompletedMatchesList {...defaultProps} matches={[mockUpcomingMatch]} />);
    
    expect(screen.getByText('No Completed Matches')).toBeInTheDocument();
    expect(screen.getByText('Completed matches will appear here after they\'ve been played.')).toBeInTheDocument();
  });

  it('sorts completed matches by most recent first', () => {
    const olderMatch = {
      ...mockCompletedMatch,
      id: 'match3',
      kickoffTime: new Date('2024-01-10T14:00:00Z'),
      ourScore: 3,
      opponentScore: 0,
    };

    const newerMatch = {
      ...mockCompletedMatch,
      id: 'match4',
      kickoffTime: new Date('2024-01-20T14:00:00Z'),
      ourScore: 1,
      opponentScore: 0,
    };

    render(<CompletedMatchesList {...defaultProps} matches={[olderMatch, newerMatch]} />);
    
    const scores = screen.getAllByText(/\d+ - \d+/);
    expect(scores[0]).toHaveTextContent('1 - 0'); // Newer match first
    expect(scores[1]).toHaveTextContent('3 - 0'); // Older match second
  });

  it('handles matches with zero scores', () => {
    const zeroScoreMatch = {
      ...mockCompletedMatch,
      ourScore: 0,
      opponentScore: 0,
    };
    
    render(<CompletedMatchesList {...defaultProps} matches={[zeroScoreMatch]} />);
    
    const scoreDisplay = screen.getByText('0 - 0');
    expect(scoreDisplay).toHaveClass('score-display', 'draw');
    
    const resultIndicator = screen.getByText('D');
    expect(resultIndicator).toHaveClass('result-indicator', 'draw');
  });

  it('displays correct result indicators for different outcomes', () => {
    const winMatch = { ...mockCompletedMatch, id: 'win', ourScore: 3, opponentScore: 1 };
    const lossMatch = { ...mockCompletedMatch, id: 'loss', ourScore: 0, opponentScore: 2 };
    const drawMatch = { ...mockCompletedMatch, id: 'draw', ourScore: 2, opponentScore: 2 };
    
    render(<CompletedMatchesList {...defaultProps} matches={[winMatch, lossMatch, drawMatch]} />);
    
    // Check for W, L, D indicators
    expect(screen.getByText('W')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    
    // Check they have correct classes
    expect(screen.getByText('W')).toHaveClass('result-indicator', 'win');
    expect(screen.getByText('L')).toHaveClass('result-indicator', 'loss');
    expect(screen.getByText('D')).toHaveClass('result-indicator', 'draw');
  });
});