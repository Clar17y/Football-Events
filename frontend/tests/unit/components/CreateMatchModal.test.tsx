/**
 * CreateMatchModal Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import CreateMatchModal from '../../../src/components/CreateMatchModal';
import { useTeams } from '../../../src/hooks/useTeams';
import { useSeasons } from '../../../src/hooks/useSeasons';
import { useToast } from '../../../src/contexts/ToastContext';
import { matchesApi } from '../../../src/services/api/matchesApi';

// Mock the hooks and API
vi.mock('../../../src/hooks/useTeams');
vi.mock('../../../src/hooks/useSeasons');
vi.mock('../../../src/contexts/ToastContext');
vi.mock('../../../src/services/api/matchesApi');

const mockUseTeams = useTeams as vi.MockedFunction<typeof useTeams>;
const mockUseSeasons = useSeasons as vi.MockedFunction<typeof useSeasons>;
const mockUseToast = useToast as vi.MockedFunction<typeof useToast>;
const mockMatchesApi = matchesApi as vi.Mocked<typeof matchesApi>;

const mockTeams = [
  {
    id: '1',
    name: 'Test Team 1',
    homeKitPrimary: '#FF0000',
    homeKitSecondary: '#FFFFFF',
    awayKitPrimary: '#0000FF',
    awayKitSecondary: '#FFFFFF',
    createdAt: new Date(),
    created_by_user_id: 'user1',
    is_deleted: false,
    is_opponent: false
  },
  {
    id: '2',
    name: 'Test Team 2',
    homeKitPrimary: '#00FF00',
    homeKitSecondary: '#000000',
    awayKitPrimary: '#FFFF00',
    awayKitSecondary: '#000000',
    createdAt: new Date(),
    created_by_user_id: 'user1',
    is_deleted: false,
    is_opponent: false
  }
];

const mockSeasons = [
  {
    id: '1',
    seasonId: '1',
    label: '2024-25 Season',
    isCurrent: true,
    createdAt: new Date(),
    created_by_user_id: 'user1',
    is_deleted: false
  },
  {
    id: '2',
    seasonId: '2',
    label: '2023-24 Season',
    isCurrent: false,
    createdAt: new Date(),
    created_by_user_id: 'user1',
    is_deleted: false
  }
];

const mockShowToast = vi.fn();

describe('CreateMatchModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    mockUseTeams.mockReturnValue({
      teams: mockTeams,
      loading: false,
      error: null,
      total: 2,
      page: 1,
      hasMore: false,
      loadTeams: vi.fn(),
      createTeam: vi.fn(),
      updateTeam: vi.fn(),
      deleteTeam: vi.fn(),
      refreshTeams: vi.fn(),
      clearError: vi.fn()
    });

    mockUseSeasons.mockReturnValue({
      seasons: mockSeasons,
      loading: false,
      error: null,
      total: 2,
      page: 1,
      hasMore: false,
      loadSeasons: vi.fn(),
      createSeason: vi.fn(),
      updateSeason: vi.fn(),
      deleteSeason: vi.fn(),
      refreshSeasons: vi.fn(),
      clearError: vi.fn()
    });

    mockUseToast.mockReturnValue({
      showToast: mockShowToast
    });
  });

  it('renders modal when open', () => {
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

  it('pre-populates date when provided', () => {
    const preselectedDate = new Date('2024-01-15T14:00:00Z');
    
    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
        preselectedDate={preselectedDate}
      />
    );

    // The datetime input should have the preselected date
    const datetimeInput = screen.getByDisplayValue(/2024-01-15/);
    expect(datetimeInput).toBeInTheDocument();
  });

  it('shows validation errors for required fields', async () => {
    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    // Try to submit without filling required fields
    const submitButton = screen.getByText('Create Match');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Please select your team')).toBeInTheDocument();
      expect(screen.getByText('Opponent name is required')).toBeInTheDocument();
      expect(screen.getByText('Kickoff time is required')).toBeInTheDocument();
      expect(screen.getByText('Please select a season')).toBeInTheDocument();
    });
  });

  it('calls matchesApi.quickStart when form is valid', async () => {
    const mockMatch = {
      id: '1',
      seasonId: '1',
      kickoffTime: new Date(),
      homeTeamId: '1',
      awayTeamId: '2',
      durationMinutes: 90,
      periodFormat: 'half',
      ourScore: 0,
      opponentScore: 0,
      createdAt: new Date(),
      created_by_user_id: 'user1',
      is_deleted: false
    };

    mockMatchesApi.quickStart.mockResolvedValue(mockMatch);

    const onMatchCreated = vi.fn();
    const onDidDismiss = vi.fn();

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={onDidDismiss}
        onMatchCreated={onMatchCreated}
      />
    );

    // Fill in the form
    const opponentInput = screen.getByPlaceholderText('Enter opponent name');
    fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

    // Set a kickoff time
    const datetimeInput = screen.getByRole('textbox');
    fireEvent.change(datetimeInput, { target: { value: '2024-01-15T14:00:00Z' } });

    // Submit the form
    const submitButton = screen.getByText('Create Match');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockMatchesApi.quickStart).toHaveBeenCalledWith(
        expect.objectContaining({
          opponentName: 'Test Opponent',
          kickoffTime: '2024-01-15T14:00:00Z',
          isHome: true,
          durationMinutes: 90,
          periodFormat: 'half'
        })
      );
      expect(onMatchCreated).toHaveBeenCalledWith(mockMatch);
      expect(mockShowToast).toHaveBeenCalledWith({
        message: 'Match created successfully',
        severity: 'success'
      });
      expect(onDidDismiss).toHaveBeenCalled();
    });
  });

  it('handles API errors gracefully', async () => {
    const errorMessage = 'Failed to create match';
    mockMatchesApi.quickStart.mockRejectedValue(new Error(errorMessage));

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={vi.fn()}
      />
    );

    // Fill in the form
    const opponentInput = screen.getByPlaceholderText('Enter opponent name');
    fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

    // Submit the form
    const submitButton = screen.getByText('Create Match');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith({
        message: errorMessage,
        severity: 'error'
      });
    });
  });

  it('resets form when cancelled', () => {
    const onDidDismiss = vi.fn();

    render(
      <CreateMatchModal
        isOpen={true}
        onDidDismiss={onDidDismiss}
      />
    );

    // Fill in some data
    const opponentInput = screen.getByPlaceholderText('Enter opponent name');
    fireEvent.change(opponentInput, { target: { value: 'Test Opponent' } });

    // Cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onDidDismiss).toHaveBeenCalled();
  });
});