import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import MatchesPage from '../../../src/pages/MatchesPage';
import type { Match, Team } from '@shared/types';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

// Mock the API modules
vi.mock('../../../src/services/api/matchesApi', () => ({
  matchesApi: {
    getMatches: vi.fn().mockResolvedValue({ data: [] }),
  }
}));

vi.mock('../../../src/services/api/teamsApi', () => ({
  teamsApi: {
    getTeams: vi.fn().mockResolvedValue({ data: [] }),
  }
}));

// Mock Ionic components
vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual('@ionic/react');
  return {
    ...actual,
    IonPage: ({ children, ...props }: any) => <div data-testid="ion-page" {...props}>{children}</div>,
    IonContent: ({ children, ...props }: any) => <div data-testid="ion-content" {...props}>{children}</div>,
    IonButton: ({ children, onClick, ...props }: any) => (
      <button data-testid="ion-button" onClick={onClick} {...props}>{children}</button>
    ),
    IonIcon: ({ icon, ...props }: any) => <div data-testid="ion-icon" data-icon={icon} {...props} />,
    IonRefresher: ({ children, ...props }: any) => <div data-testid="ion-refresher" {...props}>{children}</div>,
    IonRefresherContent: (props: any) => <div data-testid="ion-refresher-content" {...props} />,
    IonToast: (props: any) => <div data-testid="ion-toast" {...props} />,
  };
});

// Mock the child components
vi.mock('../../../src/components/PageHeader', () => ({
  default: ({ onNavigate, additionalButtons }: any) => (
    <div data-testid="page-header">
      {additionalButtons}
    </div>
  )
}));

vi.mock('../../../src/components/MatchesCalendar', () => ({
  default: ({ onMatchClick, matches }: any) => (
    <div data-testid="matches-calendar">
      {matches.map((match: Match) => (
        <button
          key={match.id}
          data-testid={`calendar-match-${match.id}`}
          onClick={() => onMatchClick(match.id)}
        >
          {match.id}
        </button>
      ))}
    </div>
  )
}));

vi.mock('../../../src/components/UpcomingMatchesList', () => ({
  default: ({ matches }: any) => (
    <div data-testid="upcoming-matches-list">
      {matches
        .filter((match: Match) => new Date(match.kickoffTime) >= new Date())
        .map((match: Match) => (
          <div
            key={match.id}
            data-testid={`upcoming-match-${match.id}`}
            data-match-id={match.id}
            tabIndex={-1}
          >
            {match.id}
          </div>
        ))}
    </div>
  )
}));

vi.mock('../../../src/components/CompletedMatchesList', () => ({
  default: ({ matches }: any) => (
    <div data-testid="completed-matches-list">
      {matches
        .filter((match: Match) => new Date(match.kickoffTime) < new Date())
        .map((match: Match) => (
          <div
            key={match.id}
            data-testid={`completed-match-${match.id}`}
            data-match-id={match.id}
            tabIndex={-1}
          >
            {match.id}
          </div>
        ))}
    </div>
  )
}));

vi.mock('../../../src/components/CreateMatchModal', () => ({
  default: (props: any) => <div data-testid="create-match-modal" {...props} />
}));

// Mock scrollIntoView and focus methods
const mockScrollIntoView = vi.fn();
const mockFocus = vi.fn();

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  value: mockScrollIntoView,
  writable: true,
});

Object.defineProperty(HTMLElement.prototype, 'focus', {
  value: mockFocus,
  writable: true,
});

describe('MatchesPage Calendar-to-List Navigation', () => {
  const mockUpcomingMatch: Match = {
    id: 'upcoming-match-1',
    homeTeamId: 'team1',
    awayTeamId: 'team2',
    kickoffTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
    durationMinutes: 90,
    periodFormat: '2x45',
    homeTeam: {
      id: 'team1',
      name: 'Home Team',
      is_opponent: false,
      homeKitPrimary: '#2563eb',
      awayKitPrimary: '#ea580c',
    } as Team,
    awayTeam: {
      id: 'team2',
      name: 'Away Team',
      is_opponent: true,
      homeKitPrimary: '#dc2626',
      awayKitPrimary: '#059669',
    } as Team,
  };

  const mockCompletedMatch: Match = {
    id: 'completed-match-1',
    homeTeamId: 'team1',
    awayTeamId: 'team2',
    kickoffTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
    durationMinutes: 90,
    periodFormat: '2x45',
    ourScore: 2,
    opponentScore: 1,
    homeTeam: {
      id: 'team1',
      name: 'Home Team',
      is_opponent: false,
      homeKitPrimary: '#2563eb',
      awayKitPrimary: '#ea580c',
    } as Team,
    awayTeam: {
      id: 'team2',
      name: 'Away Team',
      is_opponent: true,
      homeKitPrimary: '#dc2626',
      awayKitPrimary: '#059669',
    } as Team,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock the API to return our test matches
    const { matchesApi } = await import('../../../src/services/api/matchesApi');
    (matchesApi.getMatches as any).mockResolvedValue({
      data: [mockUpcomingMatch, mockCompletedMatch]
    });
  });

  it('should scroll to upcoming match when calendar match indicator is clicked', async () => {
    render(<MatchesPage />);

    // Wait for the component to load matches
    await waitFor(() => {
      expect(screen.getByTestId('matches-calendar')).toBeInTheDocument();
    });

    // Click on the upcoming match in the calendar
    const calendarMatch = screen.getByTestId(`calendar-match-${mockUpcomingMatch.id}`);
    fireEvent.click(calendarMatch);

    // Verify scrollIntoView was called
    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center'
    });

    // Verify focus was called after a delay
    await waitFor(() => {
      expect(mockFocus).toHaveBeenCalled();
    }, { timeout: 200 });
  });

  it('should scroll to completed match when calendar match indicator is clicked', async () => {
    render(<MatchesPage />);

    // Wait for the component to load matches
    await waitFor(() => {
      expect(screen.getByTestId('matches-calendar')).toBeInTheDocument();
    });

    // Click on the completed match in the calendar
    const calendarMatch = screen.getByTestId(`calendar-match-${mockCompletedMatch.id}`);
    fireEvent.click(calendarMatch);

    // Verify scrollIntoView was called
    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center'
    });

    // Verify focus was called after a delay
    await waitFor(() => {
      expect(mockFocus).toHaveBeenCalled();
    }, { timeout: 200 });
  });

  it('should add and remove highlight animation class', async () => {
    render(<MatchesPage />);

    // Wait for the component to load matches
    await waitFor(() => {
      expect(screen.getByTestId('matches-calendar')).toBeInTheDocument();
    });

    // Get the upcoming match element
    const upcomingMatchElement = screen.getByTestId(`upcoming-match-${mockUpcomingMatch.id}`);

    // Click on the upcoming match in the calendar
    const calendarMatch = screen.getByTestId(`calendar-match-${mockUpcomingMatch.id}`);
    fireEvent.click(calendarMatch);

    // Verify the highlight class is added
    expect(upcomingMatchElement.classList.contains('match-highlighted')).toBe(true);

    // Wait for the highlight class to be removed (after 2 seconds)
    await waitFor(() => {
      expect(upcomingMatchElement.classList.contains('match-highlighted')).toBe(false);
    }, { timeout: 2500 });
  });

  it('should scroll to appropriate section when match element is not found', async () => {
    render(<MatchesPage />);

    // Wait for the component to load matches
    await waitFor(() => {
      expect(screen.getByTestId('matches-calendar')).toBeInTheDocument();
    });

    // Mock querySelector to return null (simulating match element not found)
    const originalQuerySelector = document.querySelector;
    document.querySelector = vi.fn().mockImplementation((selector) => {
      if (selector.includes('data-match-id')) {
        return null; // Simulate match element not found
      }
      return originalQuerySelector.call(document, selector);
    });

    // Click on a match in the calendar
    const calendarMatch = screen.getByTestId(`calendar-match-${mockUpcomingMatch.id}`);
    fireEvent.click(calendarMatch);

    // Verify scrollIntoView was still called (for the section fallback)
    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start'
    });

    // Restore original querySelector
    document.querySelector = originalQuerySelector;
  });

  it('should ensure match elements have proper tabindex for focus management', async () => {
    render(<MatchesPage />);

    // Wait for the component to load matches
    await waitFor(() => {
      expect(screen.getByTestId('matches-calendar')).toBeInTheDocument();
    });

    // Check that upcoming match has tabindex="-1"
    const upcomingMatchElement = screen.getByTestId(`upcoming-match-${mockUpcomingMatch.id}`);
    expect(upcomingMatchElement.getAttribute('tabindex')).toBe('-1');

    // Check that completed match has tabindex="-1"
    const completedMatchElement = screen.getByTestId(`completed-match-${mockCompletedMatch.id}`);
    expect(completedMatchElement.getAttribute('tabindex')).toBe('-1');
  });
});