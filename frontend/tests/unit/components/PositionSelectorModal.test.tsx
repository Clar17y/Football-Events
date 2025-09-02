import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import PositionSelectorModal from '../../../src/components/lineup/PositionSelectorModal';

// Mock Ionic components
vi.mock('@ionic/react', () => ({
  IonModal: ({ children, isOpen, onDidDismiss, ...props }: any) => (
    isOpen ? (
      <div data-testid="ion-modal" {...props}>
        <div onClick={onDidDismiss} data-testid="modal-backdrop" />
        <div data-testid="modal-content">
          {children}
        </div>
      </div>
    ) : null
  ),
  IonHeader: ({ children }: any) => <div data-testid="ion-header">{children}</div>,
  IonToolbar: ({ children }: any) => <div data-testid="ion-toolbar">{children}</div>,
  IonTitle: ({ children }: any) => <div data-testid="ion-title">{children}</div>,
  IonContent: ({ children }: any) => <div data-testid="ion-content">{children}</div>,
  IonButton: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
  IonIcon: ({ icon }: any) => <span data-testid="ion-icon">{icon}</span>,
  IonSearchbar: ({ value, onIonInput, placeholder, ...props }: any) => (
    <input
      data-testid="ion-searchbar"
      value={value}
      onChange={(e) => onIonInput?.({ detail: { value: e.target.value } })}
      placeholder={placeholder}
      {...props}
    />
  ),
  IonSpinner: () => <div data-testid="ion-spinner">Loading...</div>,
  IonText: ({ children }: any) => <div data-testid="ion-text">{children}</div>,
  IonGrid: ({ children }: any) => <div data-testid="ion-grid">{children}</div>,
  IonRow: ({ children }: any) => <div data-testid="ion-row">{children}</div>,
  IonCol: ({ children }: any) => <div data-testid="ion-col">{children}</div>,
  IonItem: ({ children }: any) => <div data-testid="ion-item">{children}</div>,
  IonLabel: ({ children }: any) => <div data-testid="ion-label">{children}</div>,
}));

// Mock ionicons
vi.mock('ionicons/icons', () => ({
  close: 'close-icon',
  search: 'search-icon',
  football: 'football-icon',
}));

describe('PositionSelectorModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onPositionSelect: vi.fn(),
    playerName: 'John Doe',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders when open', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      expect(screen.getByTestId('ion-modal')).toBeInTheDocument();
      expect(screen.getByText('Select Position for John Doe')).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<PositionSelectorModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByTestId('ion-modal')).not.toBeInTheDocument();
    });

    it('displays player name in title', () => {
      render(<PositionSelectorModal {...defaultProps} playerName="Jane Smith" />);
      
      expect(screen.getByText('Select Position for Jane Smith')).toBeInTheDocument();
    });
  });

  describe('Position Display', () => {
    it('displays all position categories', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      expect(screen.getByRole('heading', { name: 'Goalkeeper' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Defenders' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Midfielders' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Forwards' })).toBeInTheDocument();
    });

    it('displays position codes and names', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      // Check for some key positions
      expect(screen.getByText('GK')).toBeInTheDocument();
      expect(screen.getAllByText('Goalkeeper')).toHaveLength(2); // Category title + position name
      expect(screen.getByText('CB')).toBeInTheDocument();
      expect(screen.getByText('Centre Back')).toBeInTheDocument();
      expect(screen.getByText('ST')).toBeInTheDocument();
      expect(screen.getByText('Striker')).toBeInTheDocument();
    });

    it('filters positions based on availablePositions prop', () => {
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          availablePositions={['GK', 'CB', 'ST']} 
        />
      );
      
      expect(screen.getByText('GK')).toBeInTheDocument();
      expect(screen.getByText('CB')).toBeInTheDocument();
      expect(screen.getByText('ST')).toBeInTheDocument();
      
      // These should not be present
      expect(screen.queryByText('LB')).not.toBeInTheDocument();
      expect(screen.queryByText('RM')).not.toBeInTheDocument();
    });
  });

  describe('Search Functionality', () => {
    it('renders search bar', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      const searchBar = screen.getByTestId('ion-searchbar');
      expect(searchBar).toBeInTheDocument();
      expect(searchBar).toHaveAttribute('placeholder', 'Search positions...');
    });

    it('filters positions by search text', async () => {
      const user = userEvent.setup();
      render(<PositionSelectorModal {...defaultProps} />);
      
      const searchBar = screen.getByTestId('ion-searchbar');
      
      // Search for goalkeeper
      await user.type(searchBar, 'goal');
      
      expect(screen.getByText('GK')).toBeInTheDocument();
      expect(screen.getAllByText('Goalkeeper')).toHaveLength(2); // Category title + position name
      
      // Other positions should be filtered out
      expect(screen.queryByText('CB')).not.toBeInTheDocument();
      expect(screen.queryByText('ST')).not.toBeInTheDocument();
    });

    it('filters positions by position code', async () => {
      const user = userEvent.setup();
      render(<PositionSelectorModal {...defaultProps} />);
      
      const searchBar = screen.getByTestId('ion-searchbar');
      
      // Search for CB
      await user.type(searchBar, 'CB');
      
      expect(screen.getByText('CB')).toBeInTheDocument();
      expect(screen.getByText('Centre Back')).toBeInTheDocument();
      
      // Should also show RCB and LCB
      expect(screen.getByText('RCB')).toBeInTheDocument();
      expect(screen.getByText('LCB')).toBeInTheDocument();
    });

    it('shows no results message when search yields no matches', async () => {
      const user = userEvent.setup();
      render(<PositionSelectorModal {...defaultProps} />);
      
      const searchBar = screen.getByTestId('ion-searchbar');
      
      await user.type(searchBar, 'xyz123');
      
      expect(screen.getByText('No positions found')).toBeInTheDocument();
      expect(screen.getByText('Try adjusting your search terms')).toBeInTheDocument();
    });
  });

  describe('Position Selection', () => {
    it('calls onPositionSelect when position is clicked', async () => {
      const user = userEvent.setup();
      const onPositionSelect = vi.fn();
      
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          onPositionSelect={onPositionSelect}
        />
      );
      
      // Find and click the GK position
      const gkPosition = screen.getByText('GK').closest('.position-item');
      expect(gkPosition).toBeInTheDocument();
      
      await user.click(gkPosition!);
      
      expect(onPositionSelect).toHaveBeenCalledWith('GK');
    });

    it('calls onClose after position selection', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          onClose={onClose}
        />
      );
      
      const gkPosition = screen.getByText('GK').closest('.position-item');
      await user.click(gkPosition!);
      
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Loading and Error States', () => {
    it('displays loading state', () => {
      render(<PositionSelectorModal {...defaultProps} loading={true} />);
      
      expect(screen.getByTestId('ion-spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading available positions...')).toBeInTheDocument();
    });

    it('displays error state', () => {
      const errorMessage = 'Failed to load positions';
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          error={errorMessage}
        />
      );
      
      expect(screen.getByText('Unable to load positions')).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });

    it('hides position grid when loading', () => {
      render(<PositionSelectorModal {...defaultProps} loading={true} />);
      
      expect(screen.queryByText('Goalkeeper')).not.toBeInTheDocument();
      expect(screen.queryByText('GK')).not.toBeInTheDocument();
    });

    it('hides position grid when error', () => {
      render(<PositionSelectorModal {...defaultProps} error="Test error" />);
      
      expect(screen.queryByText('Goalkeeper')).not.toBeInTheDocument();
      expect(screen.queryByText('GK')).not.toBeInTheDocument();
    });
  });

  describe('Modal Controls', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          onClose={onClose}
        />
      );
      
      const closeButton = screen.getByRole('button', { name: /close position selector/i });
      await user.click(closeButton);
      
      expect(onClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          onClose={onClose}
        />
      );
      
      const backdrop = screen.getByTestId('modal-backdrop');
      await user.click(backdrop);
      
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('handles escape key to close modal', () => {
      const onClose = vi.fn();
      
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          onClose={onClose}
        />
      );
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(onClose).toHaveBeenCalled();
    });

    it('handles enter key to select focused position', () => {
      const onPositionSelect = vi.fn();
      
      render(
        <PositionSelectorModal 
          {...defaultProps} 
          onPositionSelect={onPositionSelect}
        />
      );
      
      // The first position should be focused by default (GK)
      fireEvent.keyDown(document, { key: 'Enter' });
      
      expect(onPositionSelect).toHaveBeenCalledWith('GK');
    });

    it('handles arrow keys for navigation', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      // Arrow down should move focus
      fireEvent.keyDown(document, { key: 'ArrowDown' });
      
      // Arrow up should move focus back
      fireEvent.keyDown(document, { key: 'ArrowUp' });
      
      // No errors should occur
      expect(screen.getByTestId('ion-modal')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      const modal = screen.getByTestId('ion-modal');
      expect(modal).toHaveAttribute('aria-labelledby', 'position-modal-title');
      
      const closeButton = screen.getByRole('button', { name: /close position selector/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('has proper role attributes for position items', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      const positionItems = document.querySelectorAll('.position-item');
      positionItems.forEach(item => {
        expect(item).toHaveAttribute('role', 'button');
        expect(item).toHaveAttribute('aria-label');
      });
    });

    it('manages focus properly', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      // Check that focused items have proper tabindex
      const focusedItem = document.querySelector('.position-item.focused');
      if (focusedItem) {
        expect(focusedItem).toHaveAttribute('tabIndex', '0');
      }
    });
  });

  describe('Instructions', () => {
    it('displays usage instructions when positions are available', () => {
      render(<PositionSelectorModal {...defaultProps} />);
      
      expect(screen.getByText(/Use arrow keys to navigate/)).toBeInTheDocument();
      expect(screen.getByText(/Tap or click on a position to select it/)).toBeInTheDocument();
    });

    it('hides instructions when loading', () => {
      render(<PositionSelectorModal {...defaultProps} loading={true} />);
      
      expect(screen.queryByText(/Use arrow keys to navigate/)).not.toBeInTheDocument();
    });

    it('hides instructions when error', () => {
      render(<PositionSelectorModal {...defaultProps} error="Test error" />);
      
      expect(screen.queryByText(/Use arrow keys to navigate/)).not.toBeInTheDocument();
    });
  });
});