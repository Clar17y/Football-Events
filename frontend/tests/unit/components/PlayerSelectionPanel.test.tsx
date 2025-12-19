/**
 * PlayerSelectionPanel Component Tests
 * Tests for player list grouping, click functionality, and selection state management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PlayerSelectionPanel from '../../../src/components/lineup/PlayerSelectionPanel';
import { PlayerWithPosition } from '../../../src/components/lineup/VisualPitchInterface';

// Mock Ionic components
vi.mock('@ionic/react', () => ({
  IonIcon: ({ icon, className }: { icon: string; className?: string }) => (
    <span data-testid="ion-icon" data-icon={icon} className={className} />
  ),
}));

// Mock icons
vi.mock('ionicons/icons', () => ({
  person: 'person',
  search: 'search',
  chevronDown: 'chevron-down',
  chevronUp: 'chevron-up',
}));

describe('PlayerSelectionPanel', () => {
  const mockPlayers: PlayerWithPosition[] = [
    {
      id: '1',
      name: 'John Doe',
      squadNumber: 1,
      preferredPosition: 'GK',
    },
    {
      id: '2',
      name: 'Jane Smith',
      squadNumber: 5,
      preferredPosition: 'CB',
    },
    {
      id: '3',
      name: 'Bob Johnson',
      squadNumber: 10,
      preferredPosition: 'CM',
    },
    {
      id: '4',
      name: 'Alice Brown',
      squadNumber: 9,
      preferredPosition: 'ST',
    },
    {
      id: '5',
      name: 'Charlie Wilson',
      preferredPosition: 'CM',
    },
  ];

  const defaultProps = {
    players: mockPlayers,
    onPlayerSelect: vi.fn(),
    onPlayerRemove: vi.fn(),
    selectedPlayers: new Set<string>(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the component with header and player groups', () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      expect(screen.getByText('Team Squad')).toBeInTheDocument();
      expect(screen.getByText('0/11')).toBeInTheDocument();
      expect(screen.getByText('(5 available)')).toBeInTheDocument();
    });

    it('renders search input when searchable is true', () => {
      render(<PlayerSelectionPanel {...defaultProps} searchable={true} />);

      expect(screen.getByPlaceholderText('Search players...')).toBeInTheDocument();
    });

    it('does not render search input when searchable is false', () => {
      render(<PlayerSelectionPanel {...defaultProps} searchable={false} />);

      expect(screen.queryByPlaceholderText('Search players...')).not.toBeInTheDocument();
    });

    it('renders position groups with correct names and player counts', () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      expect(screen.getByText('Goalkeepers')).toBeInTheDocument();
      expect(screen.getByText('Defenders')).toBeInTheDocument();
      expect(screen.getByText('Midfielders')).toBeInTheDocument();
      expect(screen.getByText('Strikers')).toBeInTheDocument();

      // Check for specific counts - CM players should be in Midfielders (2), others in their respective categories (1 each)
      expect(screen.getByText('(2)', { selector: '.group-count' })).toBeInTheDocument();
      // Check that we have the right number of (1) counts
      expect(screen.getAllByText('(1)', { selector: '.group-count' })).toHaveLength(3);
    });

    it('renders players with correct information', () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('Player Selection State', () => {
    it('shows selected players with correct styling', () => {
      const selectedPlayers = new Set(['1', '2']);
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          selectedPlayers={selectedPlayers}
        />
      );

      const removeHints = screen.getAllByText('Tap to remove');
      expect(removeHints).toHaveLength(2);

      expect(screen.getByText('2/11')).toBeInTheDocument();
      expect(screen.getByText('(3 available)')).toBeInTheDocument();
    });

    it('shows max reached message when selection limit is reached', () => {
      const selectedPlayers = new Set(['1', '2', '3', '4']);
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          selectedPlayers={selectedPlayers}
          maxPlayers={4}
        />
      );

      expect(screen.getByText('Max Reached')).toBeInTheDocument();
      expect(screen.getByText('4/4')).toBeInTheDocument();
    });

    it('shows click hint for available players', () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      const clickHints = screen.getAllByText('Tap to add');
      expect(clickHints.length).toBeGreaterThan(0);
    });

    it('shows remove hint for selected players', () => {
      const selectedPlayers = new Set(['1', '2']);
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          selectedPlayers={selectedPlayers}
        />
      );

      const removeHints = screen.getAllByText('Tap to remove');
      expect(removeHints).toHaveLength(2);
    });

    it('shows "On Pitch" badge for selected players in readonly mode', () => {
      const selectedPlayers = new Set(['1', '2']);
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          selectedPlayers={selectedPlayers}
          readonly={true}
        />
      );

      const onPitchBadges = screen.getAllByText('On Pitch');
      expect(onPitchBadges).toHaveLength(2);

      // Should not show remove hints in readonly mode
      expect(screen.queryByText('Tap to remove')).not.toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('filters players by name', async () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search players...');
      fireEvent.change(searchInput, { target: { value: 'John' } });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });
    });

    it('filters players by squad number', async () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search players...');
      fireEvent.change(searchInput, { target: { value: '10' } });

      await waitFor(() => {
        expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
    });

    it('filters players by position', async () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search players...');
      fireEvent.change(searchInput, { target: { value: 'GK' } });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
      });
    });

    it('shows empty state when no players match search', async () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search players...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('No players found')).toBeInTheDocument();
        expect(screen.getByText('Clear search')).toBeInTheDocument();
      });
    });

    it('clears search when clear button is clicked', async () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search players...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('Clear search')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Clear search'));

      await waitFor(() => {
        expect(searchInput).toHaveValue('');
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });
  });

  describe('Group Expansion', () => {
    it('expands and collapses category groups', () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      // Initially, all groups should be expanded
      expect(screen.getByText('John Doe')).toBeInTheDocument();

      // Click to collapse Goalkeepers group
      const gkHeader = screen.getByText('Goalkeepers').closest('button');
      fireEvent.click(gkHeader!);

      // Player should no longer be visible
      expect(screen.queryByText('John Doe')).not.toBeInTheDocument();

      // Click to expand again
      fireEvent.click(gkHeader!);

      // Player should be visible again
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  describe('Click Functionality', () => {
    it('calls onPlayerSelect when player is clicked', () => {
      const mockOnPlayerSelect = vi.fn();
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          onPlayerSelect={mockOnPlayerSelect}
        />
      );

      const playerItem = screen.getByText('John Doe').closest('.player-item');
      fireEvent.click(playerItem!);

      expect(mockOnPlayerSelect).toHaveBeenCalledWith(mockPlayers[0]);
    });

    it('does not allow selection when readonly', () => {
      const mockOnPlayerSelect = vi.fn();
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          onPlayerSelect={mockOnPlayerSelect}
          readonly={true}
        />
      );

      const playerItem = screen.getByText('John Doe').closest('.player-item');
      fireEvent.click(playerItem!);

      expect(mockOnPlayerSelect).not.toHaveBeenCalled();
    });

    it('does not allow selection when max players reached', () => {
      const mockOnPlayerSelect = vi.fn();
      const selectedPlayers = new Set(['1', '2']);
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          onPlayerSelect={mockOnPlayerSelect}
          selectedPlayers={selectedPlayers}
          maxPlayers={2}
        />
      );

      // Try to select an unselected player when max is reached
      const playerItem = screen.getByText('Bob Johnson').closest('.player-item');
      fireEvent.click(playerItem!);

      expect(mockOnPlayerSelect).not.toHaveBeenCalled();
    });

    it('calls onPlayerRemove when selected player is clicked', () => {
      const mockOnPlayerSelect = vi.fn();
      const mockOnPlayerRemove = vi.fn();
      const selectedPlayers = new Set(['1']);
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          onPlayerSelect={mockOnPlayerSelect}
          onPlayerRemove={mockOnPlayerRemove}
          selectedPlayers={selectedPlayers}
        />
      );

      // Click on a selected player should remove them
      const playerItem = screen.getByText('John Doe').closest('.player-item');
      fireEvent.click(playerItem!);

      expect(mockOnPlayerSelect).not.toHaveBeenCalled();
      expect(mockOnPlayerRemove).toHaveBeenCalledWith(mockPlayers[0]);
    });

    it('does not allow removal when readonly', () => {
      const mockOnPlayerSelect = vi.fn();
      const mockOnPlayerRemove = vi.fn();
      const selectedPlayers = new Set(['1']);
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          onPlayerSelect={mockOnPlayerSelect}
          onPlayerRemove={mockOnPlayerRemove}
          selectedPlayers={selectedPlayers}
          readonly={true}
        />
      );

      // Click on a selected player in readonly mode should not remove them
      const playerItem = screen.getByText('John Doe').closest('.player-item');
      fireEvent.click(playerItem!);

      expect(mockOnPlayerSelect).not.toHaveBeenCalled();
      expect(mockOnPlayerRemove).not.toHaveBeenCalled();
    });
  });

  describe('Touch Events', () => {
    it('handles touch events for player selection', () => {
      const mockOnPlayerSelect = vi.fn();
      render(
        <PlayerSelectionPanel
          {...defaultProps}
          onPlayerSelect={mockOnPlayerSelect}
        />
      );

      const playerItem = screen.getByText('John Doe').closest('.player-item');
      fireEvent.touchStart(playerItem!);
      fireEvent.touchEnd(playerItem!);
      fireEvent.click(playerItem!);

      expect(mockOnPlayerSelect).toHaveBeenCalledWith(mockPlayers[0]);
    });
  });

  describe('Accessibility', () => {
    it('renders with proper ARIA attributes', () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search players...');
      expect(searchInput).toHaveAttribute('type', 'text');
    });

    it('shows instructions for user guidance', () => {
      render(<PlayerSelectionPanel {...defaultProps} />);

      expect(screen.getByText('Tap players to add them to the pitch')).toBeInTheDocument();
      expect(screen.getByText('Maximum 11 players can be positioned')).toBeInTheDocument();
    });

    it('does not show instructions when readonly', () => {
      render(<PlayerSelectionPanel {...defaultProps} readonly={true} />);

      // Instructions section should not be present in readonly mode
      expect(screen.queryByText('Tap players to add them to the pitch')).not.toBeInTheDocument();
      expect(screen.queryByText('Maximum 11 players can be positioned')).not.toBeInTheDocument();
    });
  });

  describe('Player Sorting', () => {
    it('sorts players by squad number within groups', () => {
      const playersWithNumbers: PlayerWithPosition[] = [
        {
          id: '1',
          name: 'Player 10',
          squadNumber: 10,
          preferredPosition: 'CM',
        },
        {
          id: '2',
          name: 'Player 5',
          squadNumber: 5,
          preferredPosition: 'CM',
        },
      ];

      render(
        <PlayerSelectionPanel
          {...defaultProps}
          players={playersWithNumbers}
        />
      );

      const playerNames = screen.getAllByText(/Player \d+/);
      expect(playerNames[0]).toHaveTextContent('Player 5');
      expect(playerNames[1]).toHaveTextContent('Player 10');
    });
  });
});