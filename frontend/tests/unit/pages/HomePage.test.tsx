import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import HomePage from '../../../src/pages/HomePage';
import type { Team, Match } from '@shared/types';
import { db } from '../../../src/db/indexedDB';
import { apiClient } from '../../../src/services/api/baseApi';

const mockBootstrapOwnedTeams = vi.fn();
vi.mock('../../../src/services/ownedTeamBootstrap', () => ({ bootstrapOwnedTeams: (...args: any[]) => mockBootstrapOwnedTeams(...args) }));

// Mock contexts
const mockShowInfo = vi.fn();
let mockAuthUser: any = { id: 'u1', email: 'user@example.com' };
let mockIsAuthenticated = true;
let mockRetainedAccount = false;
let mockRecoveryMessage: string | null = null;
let mockResumeAction: (() => void) | undefined;
vi.mock('../../../src/utils/network', () => ({
  getCurrentUserId: () => mockAuthUser?.id || (mockRetainedAccount ? 'u1' : 'guest-one'),
  getAuthUserId: () => mockAuthUser?.id || (mockRetainedAccount ? 'u1' : null),
}));

vi.mock('../../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isAuthenticated: mockIsAuthenticated,
    recoveryMessage: mockRecoveryMessage,
  }),
}));

vi.mock('../../../src/contexts/ToastContext', () => ({
  useToast: () => ({
    showInfo: mockShowInfo,
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
    dismissToast: vi.fn(),
    clearAllToasts: vi.fn(),
    toasts: [],
  }),
}));

// Mock hooks
vi.mock('../../../src/hooks/useGlobalStats', () => ({
  useGlobalStats: () => ({
    stats: { active_teams: 2, total_players: 15, matches_played: 8, active_matches: 1 },
    loading: false,
    error: null,
    fromCache: false,
    lastUpdated: null,
  }),
}));

let mockLocalMatchesList: Match[] = [];
let mockLocalMatchStatesList: any[] = [];
let mockAllLocalTeams: Team[] = [];

let mockDiscoveryLoading = false;
let mockRealDiscovery = false;
vi.mock('../../../src/hooks/useOwnedDiscovery', async () => {
  const actual = await vi.importActual<typeof import('../../../src/hooks/useOwnedDiscovery')>('../../../src/hooks/useOwnedDiscovery');
  return { ...actual, useOwnedDiscovery: () => {
    if (mockRealDiscovery) return actual.useOwnedDiscovery();
    const actor = actual.useDiscoveryActor();
    const teams = React.useMemo(() => mockDiscoveryLoading ? [] : mockTeamsResponse.filter(row => actual.isOwnedDiscoveryRow(row, actor.ownerId)), [mockTeamsResponse, actor.ownerId, mockDiscoveryLoading]);
    const matches = React.useMemo(() => mockLocalMatchesList.filter(row => actual.isOwnedDiscoveryRow(row, actor.ownerId)), [mockLocalMatchesList, actor.ownerId]);
    const states = React.useMemo(() => mockLocalMatchStatesList.filter(row => actual.isOwnedRecordingRow(row, matches.find(m => m.id === row.matchId), actor.ownerId)), [mockLocalMatchStatesList, matches, actor.ownerId]);
    const current = React.useRef(matches); current.current = matches;
    return { ...actor, teams, matches, matchStates: states, loading: mockDiscoveryLoading,
      canAccessMatch: (id: string) => actor.isCurrent() && current.current.some(row => row.id === id) };
  } };
});

// Mock APIs & services
const mockGetSettings = vi.fn();
vi.mock('../../../src/services/api/authApi', () => ({
  authApi: {
    getSettings: () => mockGetSettings(),
    getSessionGeneration: () => 0,
    getCachedProfile: () => mockIsAuthenticated ? mockAuthUser : null,
    isAuthenticated: () => mockRetainedAccount,
  },
}));

const mockQuickStart = vi.fn();
vi.mock('../../../src/services/api/matchesApi', () => ({
  matchesApi: {
    quickStart: (...args: any[]) => mockQuickStart(...args),
  },
}));

const mockCreateLocalQuickMatch = vi.fn();
vi.mock('../../../src/services/guestQuickMatch', () => ({
  createLocalQuickMatch: (...args: any[]) => mockCreateLocalQuickMatch(...args),
}));

const mockCanCreateMatch = vi.fn();
vi.mock('../../../src/utils/quotas', () => ({
  canCreateMatch: () => mockCanCreateMatch(),
}));

let mockTeamsResponse: Team[] = [];
const mockGetTeams = vi.fn();
vi.mock('../../../src/services/api/teamsApi', () => ({
  teamsApi: {
    getTeams: (...args: any[]) => mockGetTeams(...args),
    getOpponentTeams: vi.fn().mockResolvedValue([]),
  },
}));

// Mock child components
vi.mock('../../../src/components/ThemeToggle', () => ({ default: () => <div data-testid="theme-toggle" /> }));
vi.mock('../../../src/components/UserProfile', () => ({ default: () => <div data-testid="user-profile" /> }));
vi.mock('../../../src/components/ImportGuestDataButton', () => ({ default: () => <div data-testid="import-guest" /> }));
vi.mock('../../../src/components/GuestBanner', () => ({ default: () => <div data-testid="guest-banner" /> }));
vi.mock('../../../src/components/OfflineSyncIndicator', () => ({ default: () => <div data-testid="offline-sync" /> }));
vi.mock('../../../src/components/RecentActivity', () => ({ default: () => <div data-testid="recent-activity" /> }));
vi.mock('../../../src/components/CreateTeamModal', () => ({ default: () => <div data-testid="create-team-modal" /> }));

// Mock Ionic components
vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual('@ionic/react');
  return {
    ...actual,
    IonPage: ({ children }: any) => <div data-testid="ion-page">{children}</div>,
    IonContent: ({ children, className }: any) => <div data-testid="ion-content" className={className}>{children}</div>,
    IonHeader: ({ children }: any) => <div>{children}</div>,
    IonToolbar: ({ children }: any) => <div>{children}</div>,
    IonTitle: ({ children }: any) => <div>{children}</div>,
    IonButtons: ({ children }: any) => <div>{children}</div>,
    IonButton: ({ children, onClick, disabled, className, 'aria-label': ariaLabel }: any) => {
      if (typeof children === 'string' && children.trim() === 'Resume Match') mockResumeAction = onClick;
      return (<button data-testid="ion-button" className={className} aria-label={ariaLabel} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ); },
    IonIcon: ({ icon }: any) => <span data-testid="ion-icon">{icon?.name || 'icon'}</span>,
    IonCard: ({ children, className, onClick }: any) => (
      <div data-testid="ion-card" className={className} onClick={onClick}>
        {children}
      </div>
    ),
    IonCardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
    IonGrid: ({ children, className }: any) => <div className={className}>{children}</div>,
    IonRow: ({ children }: any) => <div>{children}</div>,
    IonCol: ({ children }: any) => <div>{children}</div>,
    IonChip: ({ children, className }: any) => <div className={className}>{children}</div>,
    IonLabel: ({ children }: any) => <div>{children}</div>,
  };
});

const teamAlpha: Team = {
  id: 'team-alpha',
  name: 'Alpha FC',
  isOpponent: false,
  createdAt: new Date().toISOString(),
  createdByUserId: 'u1',
  isDeleted: false,
};

const teamBeta: Team = {
  id: 'team-beta',
  name: 'Beta United',
  isOpponent: false,
  createdAt: new Date().toISOString(),
  createdByUserId: 'u1',
  isDeleted: false,
};

const teamOpponent: Team = {
  id: 'team-opp',
  name: 'Opponent City',
  isOpponent: true,
  createdAt: new Date().toISOString(),
  createdByUserId: 'u1',
  isDeleted: false,
};

describe('HomePage Quick Match Start & Entry Batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockAuthUser = { id: 'u1', email: 'user@example.com' };
    mockIsAuthenticated = true;
    mockRetainedAccount = false;
    mockRecoveryMessage = null;
    mockDiscoveryLoading = false;
    mockRealDiscovery = false;
    mockBootstrapOwnedTeams.mockReset().mockResolvedValue(undefined);
    mockTeamsResponse = [teamAlpha, teamBeta, teamOpponent];
    mockGetTeams.mockReset().mockImplementation(() => Promise.resolve({ data: mockTeamsResponse }));
    mockAllLocalTeams = [teamAlpha, teamBeta, teamOpponent];
    mockLocalMatchesList = [];
    mockLocalMatchStatesList = [];
    mockCanCreateMatch.mockResolvedValue({ ok: true });
    mockGetSettings.mockResolvedValue({ success: true, data: { display_name: 'Coach Test' } });
    mockQuickStart.mockResolvedValue({ id: 'match-created-1' });
    mockCreateLocalQuickMatch.mockResolvedValue({ id: 'match-guest-1' });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('populates fresh confirmed Home from remote owned managed teams without visiting Teams', async () => {
    await db.open(); await db.teams.clear();
    mockRealDiscovery = true;
    mockAuthUser = null; mockIsAuthenticated = false;
    const actual = await vi.importActual<typeof import('../../../src/services/ownedTeamBootstrap')>('../../../src/services/ownedTeamBootstrap');
    mockBootstrapOwnedTeams.mockImplementation(actual.bootstrapOwnedTeams);
    const request = vi.spyOn(apiClient, 'get').mockResolvedValue({ success: true, data: {
      data: [{ ...teamAlpha, id: 'remote-managed', name: 'Remote Managed Club', createdByUserId: 'u1' }], pagination: { page: 1, hasNext: false },
    } } as any);
    const view = render(<HomePage />);
    expect(request).not.toHaveBeenCalled();
    mockAuthUser = { id: 'u1', email: 'user@example.com' }; mockIsAuthenticated = true;
    view.rerender(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Remote Managed Club'));
    expect(screen.getByRole('button', { name: /Start Live Match/ })).toBeEnabled();
    expect(request).toHaveBeenCalledTimes(1);
    expect(await db.teams.get('remote-managed')).toMatchObject({ createdByUserId: 'u1', synced: true });
    await db.teams.clear();
  });

  it('uses a real cached owned team offline without waiting for or starting a server request', async () => {
    await db.open(); await db.teams.clear();
    await db.teams.put({ ...teamAlpha, synced: true } as any);
    mockRealDiscovery = true;
    const actual = await vi.importActual<typeof import('../../../src/services/ownedTeamBootstrap')>('../../../src/services/ownedTeamBootstrap');
    mockBootstrapOwnedTeams.mockImplementation(actual.bootstrapOwnedTeams);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const request = vi.spyOn(apiClient, 'get');
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    expect(screen.getByRole('button', { name: /Start Live Match/ })).toBeEnabled();
    expect(request).not.toHaveBeenCalled();
    await db.teams.clear();
  });

  it('keeps cached owned Quick Start usable immediately while background bootstrap hangs', async () => {
    mockBootstrapOwnedTeams.mockReturnValue(new Promise(() => {}));
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    expect(screen.getByRole('button', { name: /Start Live Match/ })).toBeEnabled();
    expect(mockBootstrapOwnedTeams).toHaveBeenCalledTimes(1);
  });

  it('does not bootstrap guest or unresolved retained accounts and invalidates prior caller on account swap', async () => {
    const view = render(<HomePage />);
    const isOldCallerCurrent = mockBootstrapOwnedTeams.mock.calls[0][1];
    mockAuthUser = { id: 'u2' }; view.rerender(<HomePage />);
    expect(isOldCallerCurrent()).toBe(false);
    expect(mockBootstrapOwnedTeams.mock.calls[1][0]).toBe('u2');
    mockAuthUser = null; mockIsAuthenticated = false; mockRetainedAccount = true;
    view.rerender(<HomePage />);
    expect(mockBootstrapOwnedTeams).toHaveBeenCalledTimes(2);
    mockRetainedAccount = false; view.rerender(<HomePage />);
    expect(mockBootstrapOwnedTeams).toHaveBeenCalledTimes(2);
  });

  it('clears a previous display name on same-auth account replacement and ignores its late settings', async () => {
    let resolveOld!: (value: any) => void;
    mockGetSettings.mockReset().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ success: true, data: { display_name: 'Second Coach' } });
    mockAuthUser = { id: 'u1', first_name: 'First' };
    const view = render(<HomePage />);
    await waitFor(() => expect(mockGetSettings).toHaveBeenCalledTimes(1));
    mockAuthUser = { id: 'u2', first_name: 'Second' };
    view.rerender(<HomePage />);
    expect(screen.getByText('Welcome back, Second!')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Welcome back, Second Coach!')).toBeInTheDocument());
    await act(async () => resolveOld({ success: true, data: { display_name: 'Previous Coach' } }));
    expect(screen.getByText('Welcome back, Second Coach!')).toBeInTheDocument();
    expect(screen.queryByText('Welcome back, Previous Coach!')).not.toBeInTheDocument();
  });

  it('hides a loaded account display name immediately and preserves the remembered guest name', async () => {
    const view = render(<HomePage />);
    await waitFor(() => expect(screen.getByText('Welcome back, Coach Test!')).toBeInTheDocument());
    mockIsAuthenticated = false;
    mockAuthUser = { id: 'guest-one', first_name: 'Remembered Guest' };
    view.rerender(<HomePage />);
    expect(screen.getByText('Welcome back, Remembered Guest!')).toBeInTheDocument();
    expect(mockGetSettings).toHaveBeenCalledTimes(1);
  });

  it('renders Quick Match Start at top and retains all 8 management navigation cards', async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));

    expect(screen.getByText('Quick Match Start')).toBeInTheDocument();
    expect(screen.getByText("Start recording your child's football match immediately")).toBeInTheDocument();

    // Verify all 8 management navigation cards are present
    const expectedCards = [
      'Live Match',
      'Matches',
      'Lineup Management',
      'Players',
      'Teams',
      'Awards',
      'Seasons',
      'Statistics',
    ];
    for (const title of expectedCards) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('displays direct resume section when local matches are LIVE or PAUSED', async () => {
    const liveMatch: Match = {
      id: 'live-match-1',
      seasonId: 'season1',
      homeTeamId: 'team-alpha',
      awayTeamId: 'team-opp',
      kickoffTime: new Date().toISOString(),
      durationMinutes: 60,
      periodFormat: 'half',
      homeScore: 1,
      awayScore: 0,
      createdAt: new Date().toISOString(),
      createdByUserId: 'u1',
      isDeleted: false,
    };

    mockLocalMatchesList = [liveMatch];
    mockLocalMatchStatesList = [
      {
        matchId: 'live-match-1',
        createdByUserId: 'u1',
        status: 'LIVE',
        timerMs: 300000,
        lastUpdatedAt: Date.now(),
        isDeleted: false,
      },
    ];

    const mockNavigate = vi.fn();
    render(<HomePage onNavigate={mockNavigate} />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));

    expect(screen.getByText('In-Progress Matches')).toBeInTheDocument();
    expect(screen.getByText('Alpha FC vs Opponent City')).toBeInTheDocument();

    const resumeBtn = screen.getByText('Resume Match');
    fireEvent.click(resumeBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/live/live-match-1');
  });

  it('shows only proven owned resumes and hides/blocks a retained resume action on account replacement', async () => {
    const own = { id: 'owned-live', createdByUserId: 'u1', homeTeamId: 'team-alpha', awayTeamId: 'foreign-team' };
    mockLocalMatchesList = [own, { ...own, id: 'foreign-live', createdByUserId: 'other' },
      { ...own, id: 'conflicting-live', created_by_user_id: 'other' },
      { ...own, id: 'missing-live', createdByUserId: undefined }, { ...own, id: 'deleted-live', is_deleted: true }] as any;
    mockLocalMatchStatesList = mockLocalMatchesList.map(match => ({ matchId: match.id, status: 'LIVE', createdByUserId: 'u1' }));
    mockTeamsResponse = [teamAlpha, { ...teamOpponent, id: 'foreign-team', name: 'Foreign name', createdByUserId: 'other' }];
    const navigate = vi.fn();
    const view = render(<HomePage onNavigate={navigate} />);
    expect(screen.getAllByText('Resume Match')).toHaveLength(1);
    expect(screen.getByText('Alpha FC vs Away')).toBeInTheDocument();
    expect(screen.queryByText(/Foreign name/)).not.toBeInTheDocument();
    const oldAction = mockResumeAction!;
    mockAuthUser = { id: 'other', email: 'other@example.test' };
    view.rerender(<HomePage onNavigate={navigate} />);
    expect(screen.queryByText('Resume Match')).not.toBeInTheDocument();
    act(() => { oldAction(); });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('restores remembered team from quick_start_defaults_v1 when valid', async () => {
    localStorage.setItem('quick_start_defaults_v1', JSON.stringify({ teamId: 'team-beta' }));

    render(<HomePage />);

    await waitFor(() => {
      // The Autocomplete input should display 'Beta United'
      const input = screen.getByPlaceholderText('Select team') as HTMLInputElement;
      expect(input.value).toBe('Beta United');
    });
  });

  it('falls back to first non-opponent team when stored preference is deleted or stale', async () => {
    localStorage.setItem('quick_start_defaults_v1', JSON.stringify({ teamId: 'non-existent-team-999' }));

    render(<HomePage />);

    await waitFor(() => {
      // Should fall back to teamAlpha ('Alpha FC')
      const input = screen.getByPlaceholderText('Select team') as HTMLInputElement;
      expect(input.value).toBe('Alpha FC');
    });
  });

  it('toggles optional details with aria-expanded', async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));

    const toggleBtn = screen.getByRole('button', { name: /more match details/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Duration \(mins: 1-200\)/i)).not.toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Duration \(mins: 1-200\)/i)).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Duration \(mins: 1-200\)/i)).not.toBeInTheDocument();
  });

  it('validates duration between 1 and 200 minutes and prevents submission if invalid', async () => {
    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC');
    });

    // Expand details to change duration
    const toggleBtn = screen.getByRole('button', { name: /more match details/i });
    fireEvent.click(toggleBtn);

    const durationInput = screen.getByDisplayValue('50'); // default app duration
    fireEvent.change(durationInput, { target: { value: '300' } });

    const startBtn = screen.getByText('Start Live Match');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Please enter a whole number between 1 and 200 minutes.');
    });

    expect(mockQuickStart).not.toHaveBeenCalled();
  });

  it('prevents double submissions via synchronous isSubmittingRef lock', async () => {
    let resolveQuickStart: (value: any) => void;
    mockQuickStart.mockImplementation(
      () => new Promise((resolve) => { resolveQuickStart = resolve; })
    );

    const mockNavigate = vi.fn();
    render(<HomePage onNavigate={mockNavigate} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC');
    });

    const startBtn = screen.getByText('Start Live Match');
    // Fire click twice rapidly
    act(() => {
      startBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      startBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockQuickStart).toHaveBeenCalledTimes(1);

    // Resolve quickstart
    await act(async () => { resolveQuickStart!({ id: 'match-123' }); });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/live/match-123');
    });
  });

  it('retains user inputs and displays error banner when submission fails', async () => {
    mockQuickStart.mockRejectedValueOnce(new Error('Network error starting match'));

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC');
    });

    const opponentInput = screen.getByPlaceholderText('Leave blank for Unknown Opponent');
    fireEvent.change(opponentInput, { target: { value: 'Tigers FC' } });

    const startBtn = screen.getByText('Start Live Match');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error starting match');
    });

    // Input should be retained
    expect(opponentInput).toHaveValue('Tigers FC');
    expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC');

    // Button should be unlocked for retry
    mockQuickStart.mockResolvedValueOnce({ id: 'match-retry-success' });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockQuickStart).toHaveBeenCalledTimes(2);
    });
  });

  it('handles guest mode with quota refusal banner', async () => {
    mockAuthUser = null;
    mockIsAuthenticated = false;
    mockTeamsResponse = [{ ...teamAlpha, createdByUserId: 'guest-one' }];
    mockCanCreateMatch.mockResolvedValueOnce({ ok: false, reason: 'Guest limit reached: 1 match' });

    render(<HomePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC');
    });

    const startBtn = screen.getByText('Start Live Match');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Guest limit reached: 1 match');
    });
    expect(mockCreateLocalQuickMatch).not.toHaveBeenCalled();
    expect(mockShowInfo).toHaveBeenCalledWith('Guest limit reached: 1 match');
  });

  it('creates local match in guest mode when quota permits and defaults opponent to Unknown Opponent if blank', async () => {
    mockAuthUser = null;
    mockIsAuthenticated = false;
    mockTeamsResponse = [{ ...teamAlpha, createdByUserId: 'guest-one' }];
    mockCanCreateMatch.mockResolvedValueOnce({ ok: true });
    mockCreateLocalQuickMatch.mockResolvedValueOnce({ id: 'guest-match-999' });

    const mockNavigate = vi.fn();
    render(<HomePage onNavigate={mockNavigate} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC');
    });

    const startBtn = screen.getByText('Start Live Match');
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockCreateLocalQuickMatch).toHaveBeenCalledWith(
        expect.objectContaining({
          myTeamId: 'team-alpha',
          opponentName: 'Unknown Opponent',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/live/guest-match-999');
    });
  });

  it('preserves a remembered team while the owned projection loads and persists it on reload', async () => {
    localStorage.setItem('quick_start_defaults_v1', JSON.stringify({ teamId: teamBeta.id }));
    mockDiscoveryLoading = true;
    const view = render(<HomePage />);
    expect(screen.getByText('Start Live Match')).toBeDisabled();
    mockDiscoveryLoading = false;
    view.rerender(<HomePage />);
    expect(screen.getByPlaceholderText('Select team')).toHaveValue('Beta United');
    expect(JSON.parse(localStorage.getItem('quick_start_defaults_v1')!)).toMatchObject({ teamId: teamBeta.id, ownerId: 'u1' });
    view.unmount();
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Beta United'));
  });

  it('can start with valid local teams when saving or loading a preference is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    fireEvent.click(screen.getByText('Start Live Match'));
    await waitFor(() => expect(mockQuickStart).toHaveBeenCalledWith(expect.objectContaining({ myTeamId: teamAlpha.id })));
  });

  it('excludes opponent and deleted teams from selectable fallback teams', async () => {
    localStorage.setItem('quick_start_defaults_v1', JSON.stringify({ teamId: teamOpponent.id }));
    mockTeamsResponse = [teamOpponent, { ...teamBeta, isDeleted: true }, teamAlpha];
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    expect(JSON.parse(localStorage.getItem('quick_start_defaults_v1')!)).toMatchObject({ teamId: teamAlpha.id, ownerId: 'u1' });
  });

  it('rejects fractional duration instead of silently rounding it', async () => {
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    fireEvent.click(screen.getByRole('button', { name: /more match details/i }));
    fireEvent.change(screen.getByDisplayValue('50'), { target: { value: '50.5' } });
    fireEvent.click(screen.getByText('Start Live Match'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('whole number'));
    expect(mockQuickStart).not.toHaveBeenCalled();
  });

  it('uses the actual current instant for local kickoff and shows saved whole-match defaults while collapsed', async () => {
    vi.stubEnv('TZ', 'Europe/London');
    vi.useFakeTimers({ toFake: ['Date'] });
    const now = new Date('2026-10-14T09:35:00.000Z');
    vi.setSystemTime(now);
    localStorage.setItem('matchmaster_app_settings', JSON.stringify({ defaultDurationMins: 70, defaultPeriodFormat: 'whole' }));
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    expect(screen.getByText(/Home · 70 minutes · Full Match/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start Live Match'));
    await waitFor(() => expect(mockQuickStart).toHaveBeenCalledWith(expect.objectContaining({
      kickoffTime: now.toISOString(), durationMinutes: 70, periodFormat: 'whole', opponentName: 'Unknown Opponent',
    })));
  });

  it('hides unsupported aggregate statistics for guests', async () => {
    mockAuthUser = null;
    mockIsAuthenticated = false;
    mockTeamsResponse = [{ ...teamAlpha, createdByUserId: 'guest-one' }];
    render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    expect(screen.queryByText('Active Teams')).not.toBeInTheDocument();
    expect(screen.queryByText('Live Now')).not.toBeInTheDocument();
    expect(screen.getByText("You can record without the opponent's name.")).toBeInTheDocument();
  });

  it('revalidates a remembered guest team after login and replaces previous-account defaults with a current managed team', async () => {
    const guestTeam = { ...teamBeta, id: 'guest-team', name: 'Guest Club', createdByUserId: 'guest-one' };
    const previousTeam = { ...teamBeta, id: 'previous-team', name: 'Previous Club', createdByUserId: 'previous-account' };
    mockAuthUser = null;
    mockIsAuthenticated = false;
    mockTeamsResponse = [guestTeam, previousTeam, teamAlpha];
    localStorage.setItem('quick_start_defaults_v1', JSON.stringify({ teamId: guestTeam.id }));
    const view = render(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Guest Club'));
    mockAuthUser = { id: 'u1', email: 'user@example.com' };
    mockIsAuthenticated = true;
    view.rerender(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    expect(JSON.parse(localStorage.getItem('quick_start_defaults_v1')!)).toMatchObject({ teamId: teamAlpha.id, ownerId: 'u1' });
    fireEvent.click(screen.getByText('Start Live Match'));
    await waitFor(() => expect(mockQuickStart).toHaveBeenCalledWith(expect.objectContaining({ myTeamId: teamAlpha.id })));
  });

  it('cannot start when only foreign, deleted or opponent teams are cached', async () => {
    mockTeamsResponse = [
      { ...teamAlpha, createdByUserId: 'previous-account' },
      { ...teamBeta, isDeleted: true },
      teamOpponent,
    ];
    render(<HomePage />);
    await waitFor(() => expect(screen.getByText('Create Team')).toBeEnabled());
    expect(screen.getByText('Start Live Match')).toBeDisabled();
    expect(mockQuickStart).not.toHaveBeenCalled();
  });

  it('does not write through guest mode while account credentials await a trusted profile', async () => {
    mockAuthUser = null;
    mockIsAuthenticated = false;
    mockRetainedAccount = true;
    render(<HomePage />);
    expect(screen.queryByPlaceholderText('Select team')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Connect once to confirm your account');
    expect(screen.getByText('Start Live Match')).toBeDisabled();
    fireEvent.click(screen.getByText('Start Live Match'));
    expect(mockCreateLocalQuickMatch).not.toHaveBeenCalled();
    expect(mockQuickStart).not.toHaveBeenCalled();
  });

  it('loads the current-account team when background cache filling completes after the initial empty read', async () => {
    mockTeamsResponse = [];
    mockAllLocalTeams = [];
    const view = render(<HomePage />);
    await waitFor(() => expect(screen.getByText('Create Team')).toBeEnabled());
    mockTeamsResponse = [teamAlpha];
    mockAllLocalTeams = [teamAlpha];
    view.rerender(<HomePage />);
    await waitFor(() => expect(screen.getByPlaceholderText('Select team')).toHaveValue('Alpha FC'));
    expect(screen.getByText('Start Live Match')).toBeEnabled();
  });
});
