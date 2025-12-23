/**
 * CreateMatchModal Component Tests
 * 
 * Tests the CreateMatchModal component which uses matchesApi.quickStart
 * for local-first match creation.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, MockedFunction, Mocked } from 'vitest';
import CreateMatchModal from '../../../src/components/CreateMatchModal';
import { useToast } from '../../../src/contexts/ToastContext';
import { matchesApi } from '../../../src/services/api/matchesApi';
import { teamsApi } from '../../../src/services/api/teamsApi';
import { seasonsApi } from '../../../src/services/api/seasonsApi';
import { authApi } from '../../../src/services/api/authApi';

// Mock the hooks and APIs
vi.mock('../../../src/contexts/ToastContext');
vi.mock('../../../src/services/api/matchesApi');
vi.mock('../../../src/services/api/teamsApi');
vi.mock('../../../src/services/api/seasonsApi');
vi.mock('../../../src/services/api/authApi');

// Mock guest quota
vi.mock('../../../src/utils/guestQuota', () => ({
  canCreateMatch: vi.fn(() => Promise.resolve({ ok: true }))
}));

// Mock the debounced search hook
vi.mock('../../../src/hooks/useDebouncedSearch', () => ({
  useDebouncedSearch: vi.fn(() => ({
    searchText: '',
    setSearchText: vi.fn(),
    showSpinner: false
  }))
}));

const mockUseToast = useToast as MockedFunction<typeof useToast>;
const mockMatchesApi = matchesApi as Mocked<typeof matchesApi>;
const mockTeamsApi = teamsApi as Mocked<typeof teamsApi>;
const mockSeasonsApi = seasonsApi as Mocked<typeof seasonsApi>;
const mockAuthApi = authApi as Mocked<typeof authApi>;

const mockTeams = [
  {
    id: '1',
    name: 'Test Team 1',
    homeKitPrimary: '#FF0000',
    homeKitSecondary: '#FFFFFF',
    awayKitPrimary: '#0000FF',
    awayKitSecondary: '#FFFFFF',
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
    isOpponent: false
  },
  {
    id: '2',
    name: 'Test Team 2',
    homeKitPrimary: '#00FF00',
    homeKitSecondary: '#000000',
    awayKitPrimary: '#FFFF00',
    awayKitSecondary: '#000000',
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false,
    isOpponent: false
  }
];

const mockSeasons = [
  {
    id: 's1',
    seasonId: '2023-24',
    label: '2023/24 Season',
    isCurrent: true,
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false
  },
  {
    id: 's2',
    seasonId: '2022-23',
    label: '2022/23 Season',
    isCurrent: false,
    createdAt: new Date().toISOString(),
    createdByUserId: 'user1',
    isDeleted: false
  }
];

const mockShowToast = vi.fn();

describe('CreateMatchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock toast context
    mockUseToast.mockReturnValue({
      showToast: mockShowToast,
      showSuccess: vi.fn(),
      showError: vi.fn(),
      showWarning: vi.fn(),
      showInfo: vi.fn(),
      dismissToast: vi.fn(),
      clearAllToasts: vi.fn(),
      toasts: []
    });

    // Mock teamsApi
    mockTeamsApi.getTeams.mockResolvedValue({
      data: mockTeams,
      total: 2,
      page: 1,
      limit: 100,
      hasMore: false
    });
    mockTeamsApi.getOpponentTeams.mockResolvedValue([]);

    // Mock seasonsApi
    mockSeasonsApi.getSeasons.mockResolvedValue({
      data: mockSeasons,
      total: 2,
      page: 1,
      limit: 100,
      hasMore: false
    });

    // Mock authApi - default to authenticated user
    mockAuthApi.isAuthenticated.mockReturnValue(true);
  });

  it('renders modal when open', async () => {
    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('Create New Match')).toBeInTheDocument();
    expect(screen.getByText('Teams')).toBeInTheDocument();
    expect(screen.getByText('Match Details')).toBeInTheDocument();
    expect(screen.getByText('Match Format')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <CreateMatchModal
        isOpen={false}
        onDidDismiss={vi.fn()}
      />
    );

    expect(screen.queryByText('Create New Match')).not.toBeInTheDocument();
  });

  it('shows Edit Match title when editing', async () => {
    const editingMatch = {
      id: 'match-1',
      seasonId: 's1',
      kickoffTime: new Date().toISOString(),
      homeTeamId: '1',
      awayTeamId: '2',
      homeTeam: mockTeams[0],
      awayTeam: { ...mockTeams[1], isOpponent: true },
      durationMinutes: 90,
      periodFormat: 'half' as const,
      homeScore: 0,
      awayScore: 0,
      createdAt: new Date().toISOString(),
      createdByUserId: 'user1',
      isDeleted: false
    };

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
        editingMatch={editingMatch}
      />
    );

    expect(screen.getByText('Edit Match')).toBeInTheDocument();
  });

  it('calls onDidDismiss when cancel button is clicked', async () => {
    const onDidDismiss = vi.fn();

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={onDidDismiss}
      />
    );

    // Find and click cancel button
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onDidDismiss).toHaveBeenCalled();
  });

  it('loads teams when modal opens', async () => {
    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockTeamsApi.getTeams).toHaveBeenCalledWith({ page: 1, limit: 100 });
    });
  });

  it('loads seasons when modal opens for authenticated user', async () => {
    mockAuthApi.isAuthenticated.mockReturnValue(true);

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockSeasonsApi.getSeasons).toHaveBeenCalledWith({ page: 1, limit: 100 });
    });
  });

  it('skips loading seasons for guest user', async () => {
    mockAuthApi.isAuthenticated.mockReturnValue(false);

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    // Wait a bit to ensure the effect has run
    await waitFor(() => {
      expect(mockTeamsApi.getTeams).toHaveBeenCalled();
    });

    // Seasons should not be loaded for guests
    expect(mockSeasonsApi.getSeasons).not.toHaveBeenCalled();
  });

  it('shows Create Team button when no teams exist', async () => {
    mockTeamsApi.getTeams.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 100,
      hasMore: false
    });

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Create Team')).toBeInTheDocument();
    });
  });

  it('has opponent team input field', async () => {
    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    // The opponent input uses MUI Autocomplete with placeholder "Opponent team"
    const opponentInput = screen.getByPlaceholderText('Opponent team');
    expect(opponentInput).toBeInTheDocument();
  });

  it('has home/away venue selection buttons', async () => {
    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Away')).toBeInTheDocument();
  });

  it('calls matchesApi.quickStart when form is submitted (local-first)', async () => {
    const mockMatch = {
      id: 'match-1',
      seasonId: 's1',
      kickoffTime: new Date().toISOString(),
      homeTeamId: '1',
      awayTeamId: '2',
      durationMinutes: 90,
      periodFormat: 'half' as const,
      homeScore: 0,
      awayScore: 0,
      createdAt: new Date().toISOString(),
      createdByUserId: 'user1',
      isDeleted: false
    };

    mockMatchesApi.quickStart.mockResolvedValue(mockMatch);

    const onMatchCreated = vi.fn();
    const onDidDismiss = vi.fn();

    // Use useDebouncedSearch mock to simulate opponent text
    const { useDebouncedSearch } = await import('../../../src/hooks/useDebouncedSearch');
    (useDebouncedSearch as any).mockReturnValue({
      searchText: 'Test Opponent',
      setSearchText: vi.fn(),
      showSpinner: false
    });

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={onDidDismiss}
        onMatchCreated={onMatchCreated}
      />
    );

    // Wait for teams to load
    await waitFor(() => {
      expect(mockTeamsApi.getTeams).toHaveBeenCalled();
    });

    // Submit the form
    const submitButton = screen.getByText('Create Match');
    fireEvent.click(submitButton);

    // The quickStart should be called (local-first - no server call needed)
    await waitFor(() => {
      expect(mockMatchesApi.quickStart).toHaveBeenCalled();
    });
  });

  it('shows success toast after match creation', async () => {
    const mockMatch = {
      id: 'match-1',
      seasonId: 's1',
      kickoffTime: new Date().toISOString(),
      homeTeamId: '1',
      awayTeamId: '2',
      durationMinutes: 90,
      periodFormat: 'half' as const,
      homeScore: 0,
      awayScore: 0,
      createdAt: new Date().toISOString(),
      createdByUserId: 'user1',
      isDeleted: false
    };

    mockMatchesApi.quickStart.mockResolvedValue(mockMatch);

    // Use useDebouncedSearch mock to simulate opponent text
    const { useDebouncedSearch } = await import('../../../src/hooks/useDebouncedSearch');
    (useDebouncedSearch as any).mockReturnValue({
      searchText: 'Test Opponent',
      setSearchText: vi.fn(),
      showSpinner: false
    });

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
        onMatchCreated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockTeamsApi.getTeams).toHaveBeenCalled();
    });

    const submitButton = screen.getByText('Create Match');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Match created successfully',
        severity: 'success'
      });
    });
  });

  it('handles quickStart errors gracefully', async () => {
    const errorMessage = 'Failed to create match';
    mockMatchesApi.quickStart.mockRejectedValue(new Error(errorMessage));

    // Use useDebouncedSearch mock to simulate opponent text
    const { useDebouncedSearch } = await import('../../../src/hooks/useDebouncedSearch');
    (useDebouncedSearch as any).mockReturnValue({
      searchText: 'Test Opponent',
      setSearchText: vi.fn(),
      showSpinner: false
    });

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockTeamsApi.getTeams).toHaveBeenCalled();
    });

    const submitButton = screen.getByText('Create Match');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        message: errorMessage,
        severity: 'error'
      });
    });
  });
});
