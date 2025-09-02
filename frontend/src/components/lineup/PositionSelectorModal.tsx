/**
 * Position Selector Modal Component
 * Modal for selecting player positions during substitutions with visual pitch previews
 * Supports keyboard navigation, search, and accessibility features
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonSearchbar,
  IonSpinner,
  IonText,
  IonGrid,
  IonRow,
  IonCol,
  IonItem,
  IonLabel
} from '@ionic/react';
import { close, search, football } from 'ionicons/icons';
import './PositionSelectorModal.css';

// Position data with display information
export interface PositionOption {
  code: string;
  longName: string;
  category: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
  pitchArea: {
    x: number; // 0-100 percentage
    y: number; // 0-100 percentage
  };
}

interface PositionSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPositionSelect: (position: string) => void;
  availablePositions?: string[];
  playerName: string;
  loading?: boolean;
  error?: string;
}

// Default position definitions with pitch coordinates
const DEFAULT_POSITIONS: PositionOption[] = [
  // Goalkeeper
  { code: 'GK', longName: 'Goalkeeper', category: 'goalkeeper', pitchArea: { x: 50, y: 5 } },
  
  // Defenders
  { code: 'CB', longName: 'Centre Back', category: 'defender', pitchArea: { x: 50, y: 20 } },
  { code: 'RCB', longName: 'Right Centre Back', category: 'defender', pitchArea: { x: 65, y: 20 } },
  { code: 'LCB', longName: 'Left Centre Back', category: 'defender', pitchArea: { x: 35, y: 20 } },
  { code: 'SW', longName: 'Sweeper', category: 'defender', pitchArea: { x: 50, y: 15 } },
  { code: 'RB', longName: 'Right Back', category: 'defender', pitchArea: { x: 85, y: 25 } },
  { code: 'LB', longName: 'Left Back', category: 'defender', pitchArea: { x: 15, y: 25 } },
  { code: 'RWB', longName: 'Right Wing Back', category: 'defender', pitchArea: { x: 85, y: 35 } },
  { code: 'LWB', longName: 'Left Wing Back', category: 'defender', pitchArea: { x: 15, y: 35 } },
  
  // Midfielders
  { code: 'CDM', longName: 'Central Defensive Midfielder', category: 'midfielder', pitchArea: { x: 50, y: 35 } },
  { code: 'RDM', longName: 'Right Defensive Midfielder', category: 'midfielder', pitchArea: { x: 65, y: 35 } },
  { code: 'LDM', longName: 'Left Defensive Midfielder', category: 'midfielder', pitchArea: { x: 35, y: 35 } },
  { code: 'CM', longName: 'Central Midfielder', category: 'midfielder', pitchArea: { x: 50, y: 50 } },
  { code: 'RCM', longName: 'Right Central Midfielder', category: 'midfielder', pitchArea: { x: 65, y: 50 } },
  { code: 'LCM', longName: 'Left Central Midfielder', category: 'midfielder', pitchArea: { x: 35, y: 50 } },
  { code: 'CAM', longName: 'Central Attacking Midfielder', category: 'midfielder', pitchArea: { x: 50, y: 65 } },
  { code: 'RAM', longName: 'Right Attacking Midfielder', category: 'midfielder', pitchArea: { x: 65, y: 65 } },
  { code: 'LAM', longName: 'Left Attacking Midfielder', category: 'midfielder', pitchArea: { x: 35, y: 65 } },
  { code: 'RM', longName: 'Right Midfielder', category: 'midfielder', pitchArea: { x: 85, y: 50 } },
  { code: 'LM', longName: 'Left Midfielder', category: 'midfielder', pitchArea: { x: 15, y: 50 } },
  { code: 'RW', longName: 'Right Winger', category: 'midfielder', pitchArea: { x: 85, y: 65 } },
  { code: 'LW', longName: 'Left Winger', category: 'midfielder', pitchArea: { x: 15, y: 65 } },
  
  // Forwards
  { code: 'RF', longName: 'Right Forward', category: 'forward', pitchArea: { x: 65, y: 80 } },
  { code: 'LF', longName: 'Left Forward', category: 'forward', pitchArea: { x: 35, y: 80 } },
  { code: 'CF', longName: 'Centre Forward', category: 'forward', pitchArea: { x: 50, y: 85 } },
  { code: 'ST', longName: 'Striker', category: 'forward', pitchArea: { x: 50, y: 90 } },
  { code: 'SS', longName: 'Second Striker', category: 'forward', pitchArea: { x: 50, y: 75 } },
];

const PositionSelectorModal: React.FC<PositionSelectorModalProps> = ({
  isOpen,
  onClose,
  onPositionSelect,
  availablePositions,
  playerName,
  loading = false,
  error
}) => {
  const [searchText, setSearchText] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const modalRef = useRef<HTMLIonModalElement>(null);
  const searchRef = useRef<HTMLIonSearchbarElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Filter positions based on search and availability
  const filteredPositions = DEFAULT_POSITIONS.filter(position => {
    const matchesSearch = position.code.toLowerCase().includes(searchText.toLowerCase()) ||
                         position.longName.toLowerCase().includes(searchText.toLowerCase());
    const isAvailable = !availablePositions || availablePositions.includes(position.code);
    return matchesSearch && isAvailable;
  });

  // Group positions by category
  const groupedPositions = filteredPositions.reduce((groups, position) => {
    if (!groups[position.category]) {
      groups[position.category] = [];
    }
    groups[position.category].push(position);
    return groups;
  }, {} as Record<string, PositionOption[]>);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchText('');
      setSelectedPosition(null);
      setFocusedIndex(0);
      // Focus search bar after modal animation
      setTimeout(() => {
        searchRef.current?.setFocus();
      }, 300);
    }
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => Math.min(prev + 1, filteredPositions.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (filteredPositions[focusedIndex]) {
          handlePositionSelect(filteredPositions[focusedIndex].code);
        }
        break;
    }
  }, [isOpen, filteredPositions, focusedIndex, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle position selection
  const handlePositionSelect = (positionCode: string) => {
    setSelectedPosition(positionCode);
    onPositionSelect(positionCode);
    onClose();
  };

  // Render mini pitch preview
  const renderMiniPitch = (position: PositionOption) => (
    <div className="mini-pitch" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="mini-pitch-svg">
        {/* Pitch outline */}
        <rect x="5" y="5" width="90" height="90" fill="none" stroke="currentColor" strokeWidth="1" />
        {/* Goal areas */}
        <rect x="35" y="5" width="30" height="15" fill="none" stroke="currentColor" strokeWidth="0.5" />
        <rect x="35" y="80" width="30" height="15" fill="none" stroke="currentColor" strokeWidth="0.5" />
        {/* Center circle */}
        <circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" strokeWidth="0.5" />
        {/* Position indicator */}
        <circle 
          cx={position.pitchArea.x} 
          cy={position.pitchArea.y} 
          r="3" 
          fill="var(--ion-color-primary)" 
          stroke="white" 
          strokeWidth="1"
        />
      </svg>
    </div>
  );

  // Render position grid item
  const renderPositionItem = (position: PositionOption, index: number) => {
    const isFocused = index === focusedIndex;
    
    return (
      <IonCol size="6" sizeMd="4" sizeLg="3" key={position.code}>
        <div 
          className={`position-item ${isFocused ? 'focused' : ''}`}
          onClick={() => handlePositionSelect(position.code)}
          onMouseEnter={() => setFocusedIndex(index)}
          role="button"
          tabIndex={isFocused ? 0 : -1}
          aria-label={`Select ${position.longName} position`}
        >
          <div className="position-preview">
            {renderMiniPitch(position)}
          </div>
          <div className="position-info">
            <div className="position-code">{position.code}</div>
            <div className="position-name">{position.longName}</div>
          </div>
        </div>
      </IonCol>
    );
  };

  // Render category section
  const renderCategorySection = (category: string, positions: PositionOption[]) => {
    const categoryTitles = {
      goalkeeper: 'Goalkeeper',
      defender: 'Defenders',
      midfielder: 'Midfielders',
      forward: 'Forwards'
    };

    const startIndex = filteredPositions.findIndex(p => p.category === category);
    
    return (
      <div key={category} className="position-category">
        <h3 className="category-title">{categoryTitles[category as keyof typeof categoryTitles]}</h3>
        <IonGrid className="position-grid">
          <IonRow>
            {positions.map((position, index) => 
              renderPositionItem(position, startIndex + index)
            )}
          </IonRow>
        </IonGrid>
      </div>
    );
  };

  return (
    <IonModal
      ref={modalRef}
      isOpen={isOpen}
      onDidDismiss={onClose}
      className="position-selector-modal"
      aria-labelledby="position-modal-title"
    >
      <IonHeader>
        <IonToolbar color="primary">
          <IonTitle id="position-modal-title">
            Select Position for {playerName}
          </IonTitle>
          <IonButton
            slot="end"
            fill="clear"
            color="light"
            onClick={onClose}
            aria-label="Close position selector"
          >
            <IonIcon icon={close} />
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent className="position-selector-content">
        <div className="position-selector-container">
          {/* Search Bar */}
          <div className="search-section">
            <IonSearchbar
              ref={searchRef}
              value={searchText}
              onIonInput={(e) => setSearchText(e.detail.value!)}
              placeholder="Search positions..."
              showClearButton="focus"
              debounce={300}
              className="position-search"
            />
          </div>

          {/* Loading State */}
          {loading && (
            <div className="loading-state">
              <IonSpinner name="crescent" />
              <IonText>
                <p>Loading available positions...</p>
              </IonText>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="error-state">
              <IonIcon icon={football} size="large" />
              <IonText color="danger">
                <h3>Unable to load positions</h3>
                <p>{error}</p>
              </IonText>
              <IonButton fill="outline" onClick={onClose}>
                Close
              </IonButton>
            </div>
          )}

          {/* Position Grid */}
          {!loading && !error && (
            <div ref={gridRef} className="positions-container">
              {Object.keys(groupedPositions).length === 0 ? (
                <div className="no-results">
                  <IonIcon icon={search} size="large" />
                  <IonText>
                    <h3>No positions found</h3>
                    <p>Try adjusting your search terms</p>
                  </IonText>
                </div>
              ) : (
                Object.entries(groupedPositions).map(([category, positions]) =>
                  renderCategorySection(category, positions)
                )
              )}
            </div>
          )}

          {/* Instructions */}
          {!loading && !error && filteredPositions.length > 0 && (
            <div className="instructions">
              <IonText color="medium">
                <p>
                  Use arrow keys to navigate, Enter to select, or Escape to close.
                  Tap or click on a position to select it.
                </p>
              </IonText>
            </div>
          )}
        </div>
      </IonContent>
    </IonModal>
  );
};

export default PositionSelectorModal;