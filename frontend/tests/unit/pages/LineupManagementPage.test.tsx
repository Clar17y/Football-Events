/**
 * LineupManagementPage Component Tests
 * Tests for the main lineup management page functionality
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import LineupManagementPage from '../../../src/pages/LineupManagementPage';
import { teamsApi } from '../../../src/services/api/teamsApi';
import { defaultLineupsApi } from '../../../src/services/api/defaultLineupsApi';

// Mock the API services
vi.mock('../../../src/services/api/teamsApi');
vi.mock('../../../src/services/api/defaultLineupsApi');

// Mock Ionic components
vi.mock('@ionic/react', async () => {
  const actual = await vi.importActual('@ionic/react');
  return {
    ...actual,
    IonPage: ({ children }: any) => <div data-testid="ion-page">{children}</div>,
    IonHeader: ({ children }: any) => <div data-testid="ion-header">{children}</div>,
    IonToolbar: ({ children }: any) => <div data-testid="ion-toolbar">{children}</div>,
    IonTitle: ({ children }: any) => <div data-testid="ion-title">{children}</div>,
    IonContent: ({ children }: any) => <div data-testid="ion-content">{children}</div>,
    IonButtons: ({ children }: any) => <div data-testid="ion-buttons">{children}</div>,
    IonBackButton: () => <button data-testid="ion-back-button">Back</button>,
    IonButton: ({ children, onClick, disabled }: any) => (
      <button data-testid="ion-button" onClick={onClick} disabled={disabled}>
        {children}
      </button>
    ),
    IonItem: ({ children }: any) => <div data-testid="ion-item">{children}</div>,
    IonLabel: ({ children }: any) => <div data-testid="ion-label">{children}</div>,
    IonSelect: ({ children, onSelectionChange, value }: any) => (
      <select
        data-testid="ion-select"
        value={value}
        onChange={(e) => onSelectionChange?.({ detail: { value: e.target.value } })}
      >
        {children}
      </select>
    ),
    IonSelectOption: ({ value, children }: any) => (
      <option value={value}>{children}</option>
    ),
    IonSpinner: () => <div data-testid="ion-spinner">Loading...</div>,
    IonText: ({ children }: any) => <div data-testid="ion-text">{children}</div>,
    IonToast: ({ isOpen, message }: any) =>
      isOpen ? <div data-testid="ion-toast">{message}</div> : null,
    IonIcon: ({ icon }: any) => <div data-testid="ion-icon">{icon?.name || 'icon'}</div>,
  };
});

// Mock ionicons
vi.mock('ionicons/icons', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    people: { name: 'people' },
    chevronDown: { name: 'chevronDown' },
    arrowBackOutline: { name: 'arrowBackOutline' },
    football: { name: 'football' },
  };
});

// Mock PageHeader component
vi.mock('../../../src/components/PageHeader', () => ({
  default: ({ onNavigate }: any) => (
    <div data-testid="page-header">
      <button onClick={() => onNavigate?.('home')}>Back</button>
      <span>MatchMaster</span>
    </div>
  ),
}));

// Mock TeamSelectionModal component
vi.mock('../../../src/components/TeamSelectionModal', () => ({
  default: ({ isOpen, onTeamSelect, onDidDismiss }: any) =>
    isOpen ? (
      <div data-testid="team-selection-modal">
        <button onClick={() => onTeamSelect('Test Team 1', 'team-1')}>Test Team 1</button>
        <button onClick={onDidDismiss}>Close</button>
      </div>
    ) : null,
}));

// Mock the lineup components
vi.mock('../../../src/components/lineup', () => ({
  VisualPitchInterface: ({ formation }: any) => (
    <div data-testid="visual-pitch-interface">
      Players on pitch: {formation?.players?.length || 0}
    </div>
  ),
  PlayerSelectionPanel: ({ players }: any) => (
    <div data-testid="player-selection-panel">
      Available players: {players?.length || 0}
    </div>
  ),
}));

const mockTeams = [
  {
    id: 'team-1',
    name: 'Test Team 1',
    createdAt: new Date('2023-01-01').toISOString(),
    isOpponent: false,
    createdByUserId: 'user-1',
    isDeleted: false,
    updatedAt: new Date('2023-01-01').toISOString()
  },
  {
    id: 'team-2',
    name: 'Test Team 2',
    createdAt: new Date('2023-01-02').toISOString(),
    isOpponent: false,
    createdByUserId: 'user-1',
    isDeleted: false,
    updatedAt: new Date('2023-01-02').toISOString()
  }
];

const mockPlayers = [
  {
    id: 'player-1',
    name: 'John Doe',
    squadNumber: 1,
    preferredPosition: 'GK',
    isActive: true
  },
  {
    id: 'player-2',
    name: 'Jane Smith',
    squadNumber: 2,
    preferredPosition: 'CB',
    isActive: true
  }
];

describe('LineupManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
    });

    // Setup default API mocks
    vi.mocked(teamsApi.getTeams).mockResolvedValue({
      data: mockTeams,
      total: mockTeams.length,
      page: 1,
      limit: 100,
      hasMore: false
    });

    vi.mocked(teamsApi.getTeamPlayers).mockResolvedValue({
      data: mockPlayers,
      success: true
    });

    vi.mocked(defaultLineupsApi.getDefaultLineup).mockResolvedValue(null);
  });

  it('renders the page structure correctly', async () => {
    render(<LineupManagementPage />);

    // Check main page elements
    expect(screen.getByTestId('ion-page')).toBeInTheDocument();
    expect(screen.getByTestId('page-header')).toBeInTheDocument();
    expect(screen.getByTestId('ion-content')).toBeInTheDocument();

    // Wait for the page to load and show the title
    await waitFor(() => {
      expect(screen.getByText('Lineup Management')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(<LineupManagementPage />);

    expect(screen.getByTestId('ion-spinner')).toBeInTheDocument();
    expect(screen.getByText('Loading lineup data...')).toBeInTheDocument();
  });

  it('loads teams and displays team selector', async () => {
    render(<LineupManagementPage />);

    await waitFor(() => {
      expect(teamsApi.getTeams).toHaveBeenCalledWith({
        limit: 100,
        includeOpponents: false
      });
    });

    await waitFor(() => {
      // Should show the selected team name (text is split across elements)
      expect(screen.getByText((content, element) => {
        return element?.textContent === 'Test Team 1 (2 players)';
      })).toBeInTheDocument();
    });
  });

  it('loads team data when team is selected', async () => {
    render(<LineupManagementPage />);

    // Wait for teams to load and first team to be auto-selected
    await waitFor(() => {
      expect(teamsApi.getTeamPlayers).toHaveBeenCalledWith('team-1');
    });

    await waitFor(() => {
      expect(defaultLineupsApi.getDefaultLineup).toHaveBeenCalledWith('team-1');
    });
  });

  it('displays pitch interface and player panel when loaded', async () => {
    render(<LineupManagementPage />);

    await waitFor(() => {
      expect(screen.getByTestId('visual-pitch-interface')).toBeInTheDocument();
      expect(screen.getByTestId('player-selection-panel')).toBeInTheDocument();
    });
  });

  it('shows save button with correct state', async () => {
    render(<LineupManagementPage />);

    await waitFor(() => {
      const saveButton = screen.getByText(/Save Layout/);
      expect(saveButton).toBeInTheDocument();
      // Should be disabled initially (no players on pitch)
      expect(saveButton.closest('button')).toBeDisabled();
    });
  });

  it('remembers selected team in localStorage', async () => {
    const mockSetItem = vi.fn();
    Object.defineProperty(window, 'localStorage', {
      value: { ...window.localStorage, setItem: mockSetItem },
      writable: true,
    });

    render(<LineupManagementPage />);

    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith(
        'lineup-management-selected-team',
        'team-1'
      );
    });
  });

  it('handles API errors gracefully', async () => {
    vi.mocked(teamsApi.getTeams).mockRejectedValue(new Error('API Error'));

    render(<LineupManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load teams. Please try again.')).toBeInTheDocument();
    });
  });

  it('selects oldest team by default', async () => {
    render(<LineupManagementPage />);

    await waitFor(() => {
      // Should select team-1 (created 2023-01-01) over team-2 (created 2023-01-02)
      expect(teamsApi.getTeamPlayers).toHaveBeenCalledWith('team-1');
    });
  });

  it('displays team squad section', async () => {
    render(<LineupManagementPage />);

    await waitFor(() => {
      expect(screen.getByText('Team Squad')).toBeInTheDocument();
    });
  });
});