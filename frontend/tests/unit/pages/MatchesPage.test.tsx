import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MatchesPage from '../../../src/pages/MatchesPage';
import type { Match, Team } from '@shared/types';
import { matchesApi } from '../../../src/services/api/matchesApi';

// Test data - defined early so mocks can reference them
const mockTeam1: Team = {
  id: 'team1',
  name: 'Home Team',
  isOpponent: false,
  homeKitPrimary: '#2563eb',
  awayKitPrimary: '#ea580c',
  createdAt: new Date().toISOString(),
  createdByUserId: 'user1',
  isDeleted: false,
};

const mockTeam2: Team = {
  id: 'team2',
  name: 'Away Team',
  isOpponent: true,
  homeKitPrimary: '#dc2626',
  awayKitPrimary: '#059669',
  createdAt: new Date().toISOString(),
  createdByUserId: 'user1',
  isDeleted: false,
};

const mockUpcomingMatch: Match = {
  id: 'upcoming-match-1',
  seasonId: 'season1',
  homeTeamId: 'team1',
  awayTeamId: 'team2',
  kickoffTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  durationMinutes: 90,
  periodFormat: '2x45',
  homeScore: 0,
  awayScore: 0,
  createdAt: new Date().toISOString(),
  createdByUserId: 'user1',
  isDeleted: false,
  homeTeam: mockTeam1,
  awayTeam: mockTeam2,
};

const mockCompletedMatch: Match = {
  id: 'completed-match-1',
  seasonId: 'season1',
  homeTeamId: 'team1',
  awayTeamId: 'team2',
  kickoffTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  durationMinutes: 90,
  periodFormat: '2x45',
  homeScore: 2,
  awayScore: 1,
  createdAt: new Date().toISOString(),
  createdByUserId: 'user1',
  isDeleted: false,
  homeTeam: mockTeam1,
  awayTeam: mockTeam2,
};

let mockMatchesList = [mockUpcomingMatch, mockCompletedMatch];
let mockMatchStatesList = [
  {
    matchId: 'upcoming-match-1',
    status: 'SCHEDULED',
    timerMs: 0,
    lastUpdatedAt: Date.now(),
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
    synced: true,
  },
  {
    matchId: 'completed-match-1',
    status: 'COMPLETED',
    timerMs: 5400000,
    lastUpdatedAt: Date.now(),
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
    synced: true,
  },
];

let mockOwner: string | null = 'user1';
let mockSubject: string | null = 'user1';
let mockGeneration = 0;
let mockTeams = [mockTeam1, mockTeam2];
let lastUpcoming: any;
let lastCalendar: any;
let lastModal: any;
vi.mock('../../../src/contexts/AuthContext', () => ({ useAuth: () => ({
  user: mockOwner ? { id: mockOwner } : null, isAuthenticated: !!mockOwner
}) }));
vi.mock('../../../src/utils/network', () => ({ getAuthUserId: () => mockSubject, getCurrentUserId: () => 'guest-one' }));
vi.mock('../../../src/services/api/authApi', () => ({ authApi: {
  isAuthenticated: () => !!mockSubject, getSessionGeneration: () => mockGeneration
} }));
vi.mock('../../../src/hooks/useOwnedDiscovery', async () => {
  const actual = await vi.importActual<typeof import('../../../src/hooks/useOwnedDiscovery')>('../../../src/hooks/useOwnedDiscovery');
  return { ...actual, useOwnedDiscovery: () => {
    const actor = actual.useDiscoveryActor();
    const teams = React.useMemo(() => mockTeams.filter(row => actual.isOwnedDiscoveryRow(row, actor.ownerId)), [mockTeams, actor.ownerId]);
    const matches = React.useMemo(() => mockMatchesList.filter(row => actual.isOwnedDiscoveryRow(row, actor.ownerId)), [mockMatchesList, actor.ownerId]);
    const states = React.useMemo(() => mockMatchStatesList.filter(row => actual.isOwnedRecordingRow(row, matches.find(m => m.id === row.matchId), actor.ownerId)), [mockMatchStatesList, matches, actor.ownerId]);
    const current = React.useRef(matches); current.current = matches;
    return { ...actor, teams, matches, matchStates: states, loading: false,
      canAccessMatch: (id: string) => actor.isCurrent() && current.current.some(row => row.id === id) };
  } };
});

// Mock useInitialSync hook
vi.mock('../../../src/hooks/useInitialSync', () => ({
  useInitialSync: () => {},
}));

// Mock useDeepLinkScrollHighlight hook
vi.mock('../../../src/hooks/useDeepLinkScrollHighlight', () => ({
  default: () => {},
}));

// Mock the API modules (still needed for delete operations etc)
vi.mock('../../../src/services/api/matchesApi', () => ({
  matchesApi: {
    getMatches: vi.fn().mockResolvedValue({ data: [] }),
    deleteMatch: vi.fn().mockResolvedValue({}),
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
  default: (props: any) => {
    lastCalendar = props;
    const { onMatchClick, matches } = props;
    return (
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
  ); }
}));

vi.mock('../../../src/components/UpcomingMatchesList', () => ({
  default: (props: any) => {
    lastUpcoming = props;
    const { matches, onLiveMatch, onEditMatch } = props;
    return (
    <div data-testid="upcoming-matches-list" className="upcoming-matches-list">
      {matches.map((match: Match) => (
        <div
          key={match.id}
          data-testid={`upcoming-match-${match.id}`}
          data-match-id={match.id}
          className="upcoming-match-item"
          tabIndex={-1}
        >
          {match.id}
          <button onClick={() => onLiveMatch(match)}>Open match</button>
          <button onClick={() => onEditMatch(match)}>Edit match</button>
        </div>
      ))}
    </div>
  ); }
}));

vi.mock('../../../src/components/CompletedMatchesList', () => ({
  default: ({ matches }: any) => (
    <div data-testid="completed-matches-list" className="completed-matches-list">
      {matches.map((match: Match) => (
        <div
          key={match.id}
          data-testid={`completed-match-${match.id}`}
          data-match-id={match.id}
          className="completed-match-item"
          tabIndex={-1}
        >
          {match.id}
        </div>
      ))}
    </div>
  )
}));

vi.mock('../../../src/components/LiveMatchesList', () => ({
  default: ({ matches }: any) => (
    <div data-testid="live-matches-list" className="live-matches-list">
      {matches.map((match: Match) => (
        <div
          key={match.id}
          data-testid={`live-match-${match.id}`}
          data-match-id={match.id}
          className="live-match-item"
          tabIndex={-1}
        >
          {match.id}
        </div>
      ))}
    </div>
  )
}));

vi.mock('../../../src/components/CreateMatchModal', () => ({
  default: (props: any) => {
    lastModal = props;
    return <div data-testid="create-match-modal">{props.isOpen && <span>Editor: {props.editingMatch?.id || 'new'}</span>}</div>;
  }
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

describe('Matches owner replacement and raw proof', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mockOwner = mockSubject = 'user1'; mockGeneration = 0;
    mockTeams = [mockTeam1, mockTeam2]; mockMatchesList = [mockUpcomingMatch, mockCompletedMatch];
    mockMatchStatesList = [];
  });

  it('closes an open editor and expansion, blocks all stale actions, and keeps new-owner calendar/editor actions', async () => {
    const navigate = vi.fn();
    const view = render(<MatchesPage onNavigate={navigate} />);
    const old = lastUpcoming;
    const oldCalendar = lastCalendar;
    act(() => { old.onToggleExpand(mockUpcomingMatch.id); old.onEditMatch(mockUpcomingMatch); });
    expect(lastUpcoming.expandedMatches.has(mockUpcomingMatch.id)).toBe(true);
    expect(screen.getByText(`Editor: ${mockUpcomingMatch.id}`)).toBeInTheDocument();
    const next = { ...mockUpcomingMatch, id: 'next-match', createdByUserId: 'user2' };
    mockMatchesList = [...mockMatchesList, next];
    mockOwner = mockSubject = 'user2'; mockGeneration++;
    view.rerender(<MatchesPage onNavigate={navigate} />);
    expect(lastModal.isOpen).toBe(false);
    expect(lastModal.editingMatch).toBeNull();
    expect(lastUpcoming.expandedMatches.size).toBe(0);
    expect(screen.queryByTestId(`calendar-match-${mockUpcomingMatch.id}`)).not.toBeInTheDocument();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      old.onEditMatch(mockUpcomingMatch); old.onLiveMatch(mockUpcomingMatch); old.onMatchSelect(mockUpcomingMatch.id);
      await old.onDeleteMatch(mockUpcomingMatch); await oldCalendar.onMatchClick(mockUpcomingMatch.id);
      oldCalendar.onDateClick(new Date());
    });
    expect(lastModal.isOpen).toBe(false);
    expect(lastUpcoming.expandedMatches.size).toBe(0);
    expect(navigate).not.toHaveBeenCalled();
    expect(matchesApi.deleteMatch).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled();
    act(() => { lastUpcoming.onEditMatch(next); });
    expect(lastModal.editingMatch.id).toBe('next-match');
    expect(lastModal.isOpen).toBe(true);
    act(() => { lastModal.onDidDismiss(); lastCalendar.onDateClick(new Date()); });
    expect(lastModal.isOpen).toBe(true); expect(lastModal.editingMatch).toBeNull();
    confirm.mockRestore();
  });

  it('excludes conflicting/missing/deleted/foreign roots and replaces embedded foreign team data', () => {
    mockMatchesList = [
      { ...mockUpcomingMatch, homeTeam: { ...mockTeam1, name: 'Foreign embedded', createdByUserId: 'foreign' } },
      { ...mockUpcomingMatch, id: 'snake', createdByUserId: undefined, created_by_user_id: 'user1' },
      { ...mockUpcomingMatch, id: 'conflict', created_by_user_id: 'foreign' },
      { ...mockUpcomingMatch, id: 'missing', createdByUserId: undefined },
      { ...mockUpcomingMatch, id: 'deleted', is_deleted: true },
      { ...mockUpcomingMatch, id: 'foreign', createdByUserId: 'user2' }
    ] as any;
    mockTeams = [{ ...mockTeam1, id: 'foreign-team', name: 'Foreign first', createdByUserId: 'user2' }, mockTeam1, mockTeam2];
    render(<MatchesPage />);
    expect(lastCalendar.matches.map((row: Match) => row.id).sort()).toEqual(['snake', mockUpcomingMatch.id].sort());
    expect([...lastCalendar.teamsCache.keys()]).toEqual(['team1', 'team2']);
    expect(lastCalendar.primaryTeamId).toBe('team1');
    expect(lastCalendar.matches[0].homeTeam.name).toBe('Home Team');
  });

  it('hides rows and disables creation while retained credentials lack a matching confirmed profile', () => {
    const view = render(<MatchesPage />);
    mockOwner = null;
    view.rerender(<MatchesPage />);
    expect(lastCalendar.matches).toEqual([]);
    expect(lastCalendar.teamsCache.size).toBe(0);
    expect(screen.getByText('Schedule Your First Match')).toBeDisabled();
    expect(lastModal.isOpen).toBe(false);
  });
});

describe('MatchesPage Calendar-to-List Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOwner = mockSubject = 'user1';
    mockGeneration = 0;
    mockTeams = [mockTeam1, mockTeam2];
    mockMatchesList = [mockUpcomingMatch, mockCompletedMatch];
    mockMatchStatesList = [
      {
        matchId: 'upcoming-match-1',
        status: 'SCHEDULED',
        timerMs: 0,
        lastUpdatedAt: Date.now(),
        createdAt: new Date().toISOString(),
        createdByUserId: 'user1',
        isDeleted: false,
        synced: true,
      },
      {
        matchId: 'completed-match-1',
        status: 'COMPLETED',
        timerMs: 5400000,
        lastUpdatedAt: Date.now(),
        createdAt: new Date().toISOString(),
        createdByUserId: 'user1',
        isDeleted: false,
        synced: true,
      },
    ];
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
    }, { timeout: 1000 });
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
    }, { timeout: 1000 });
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

  describe('Match status partitioning', () => {
    it.each([['PAUSED', -1], ['LIVE', 1]])('keeps %s matches active with a %s hour kickoff offset', async (status, offset) => {
      mockMatchesList = [{ ...mockUpcomingMatch, id: 'active-match', kickoffTime: new Date(Date.now() + Number(offset) * 3600000).toISOString() }];
      mockMatchStatesList = [{ ...mockMatchStatesList[0], matchId: 'active-match', status: String(status) }];
      render(<MatchesPage />);
      expect(screen.getByTestId('live-match-active-match')).toBeInTheDocument();
      expect(screen.queryByTestId('completed-match-active-match')).not.toBeInTheDocument();
      expect(screen.queryByTestId('upcoming-match-active-match')).not.toBeInTheDocument();
    });

    it.each(['COMPLETED', 'CANCELLED'])('keeps %s matches terminal with either past or future kickoff', async status => {
      mockMatchesList = [
        { ...mockUpcomingMatch, id: 'terminal-future' },
        { ...mockCompletedMatch, id: 'terminal-past' },
      ];
      mockMatchStatesList = mockMatchesList.map(match => ({ ...mockMatchStatesList[0], matchId: match.id, status }));
      render(<MatchesPage />);
      expect(screen.getByTestId('completed-match-terminal-future')).toBeInTheDocument();
      expect(screen.getByTestId('completed-match-terminal-past')).toBeInTheDocument();
      expect(screen.queryByTestId('live-matches-list')).not.toBeInTheDocument();
      expect(screen.queryByTestId('upcoming-match-terminal-future')).not.toBeInTheDocument();
    });

    it('should partition LIVE and PAUSED matches into live section regardless of past or future kickoff date', async () => {
      const pastLiveMatch: Match = {
        id: 'past-live-match',
        seasonId: 'season1',
        homeTeamId: 'team1',
        awayTeamId: 'team2',
        kickoffTime: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        durationMinutes: 90,
        periodFormat: '2x45',
        homeScore: 1,
        awayScore: 0,
        createdAt: new Date().toISOString(),
        createdByUserId: 'user1',
        isDeleted: false,
        homeTeam: mockTeam1,
        awayTeam: mockTeam2,
      };

      const futurePausedMatch: Match = {
        id: 'future-paused-match',
        seasonId: 'season1',
        homeTeamId: 'team1',
        awayTeamId: 'team2',
        kickoffTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour future
        durationMinutes: 90,
        periodFormat: '2x45',
        homeScore: 0,
        awayScore: 0,
        createdAt: new Date().toISOString(),
        createdByUserId: 'user1',
        isDeleted: false,
        homeTeam: mockTeam1,
        awayTeam: mockTeam2,
      };

      mockMatchesList = [pastLiveMatch, futurePausedMatch];
      mockMatchStatesList = [
        {
          matchId: 'past-live-match',
          status: 'LIVE',
          timerMs: 1200000,
          lastUpdatedAt: Date.now(),
          createdAt: new Date().toISOString(),
          createdByUserId: 'user1',
          isDeleted: false,
          synced: true,
        },
        {
          matchId: 'future-paused-match',
          status: 'PAUSED',
          timerMs: 600000,
          lastUpdatedAt: Date.now(),
          createdAt: new Date().toISOString(),
          createdByUserId: 'user1',
          isDeleted: false,
          synced: true,
        },
      ];

      render(<MatchesPage />);

      await waitFor(() => {
        expect(screen.getByTestId('live-matches-list')).toBeInTheDocument();
      });

      expect(screen.getByTestId('live-match-past-live-match')).toBeInTheDocument();
      expect(screen.getByTestId('live-match-future-paused-match')).toBeInTheDocument();
    });

    it.each(['user1', 'guest-one'])('shows state-unknown historical matches in Past matches for %s without inferring completion', async owner => {
      if (owner.startsWith('guest-')) mockOwner = mockSubject = null;
      const pastUnstartedMatch: Match = {
        id: 'past-unstarted-match',
        seasonId: 'season1',
        homeTeamId: 'team1',
        awayTeamId: 'team2',
        kickoffTime: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        durationMinutes: 90,
        periodFormat: '2x45',
        homeScore: 0,
        awayScore: 0,
        createdAt: new Date().toISOString(),
        createdByUserId: owner,
        isDeleted: false,
        homeTeam: mockTeam1,
        awayTeam: mockTeam2,
      };

      // No match state record for this match!
      mockMatchesList = [pastUnstartedMatch];
      mockMatchStatesList = [];

      const onNavigate = vi.fn();
      render(<MatchesPage onNavigate={onNavigate} />);

      const pastSection = screen.getByRole('heading', { name: 'Past matches' }).parentElement!;
      expect(within(pastSection).getByTestId('upcoming-match-past-unstarted-match')).toBeInTheDocument();
      expect(document.querySelectorAll('[data-match-id="past-unstarted-match"]')).toHaveLength(1);
      expect(screen.getByTestId('completed-matches-list')).not.toHaveTextContent('past-unstarted-match');
      fireEvent.click(within(pastSection).getByText('Open match'));
      expect(onNavigate).toHaveBeenCalledWith('/live/past-unstarted-match');
    });

    it('keeps a known scheduled match Upcoming after kickoff and moves only purged-state history to Past', () => {
      const scheduled = { ...mockCompletedMatch, id: 'scheduled-old' };
      const historical = { ...mockCompletedMatch, id: 'purged-state-old' };
      mockMatchesList = [scheduled, historical];
      mockMatchStatesList = [{ ...mockMatchStatesList[0], matchId: scheduled.id, status: 'SCHEDULED' }];
      const view = render(<MatchesPage />);
      const upcomingSection = screen.getByRole('heading', { name: 'Upcoming Matches' }).parentElement!;
      const pastSection = screen.getByRole('heading', { name: 'Past matches' }).parentElement!;
      expect(within(upcomingSection).getByTestId('upcoming-match-scheduled-old')).toBeInTheDocument();
      expect(within(pastSection).getByTestId('upcoming-match-purged-state-old')).toBeInTheDocument();
      mockMatchStatesList = [];
      view.rerender(<MatchesPage />);
      expect(within(screen.getByRole('heading', { name: 'Past matches' }).parentElement!).getByTestId('upcoming-match-scheduled-old')).toBeInTheDocument();
      expect(document.querySelectorAll('[data-match-id="scheduled-old"]')).toHaveLength(1);
    });
  });
});
