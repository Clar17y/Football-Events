/**
 * Position Selection Modal Component
 * Custom modal for selecting player positions that matches the app's design system
 * Mobile-first design optimized for iPhone UX
 */

import React, { useState } from 'react';
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonText,
  IonRippleEffect
} from '@ionic/react';
import {
  close,
  chevronBack,
  checkmark,
  football,
  shield,
  flash,
  trophy
} from 'ionicons/icons';
import './PositionSelectionModal.css';

interface Position {
  code: string;
  name: string;
  category: 'goalkeeper' | 'defender' | 'midfielder' | 'forward';
}

interface PositionSelectionModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  onPositionSelect: (positionCode: string) => void;
  selectedPosition?: string;
  title?: string;
}

// Football positions based on database enum (excluding SUB and BENCH)
const POSITIONS: Position[] = [
  // Goalkeeper
  { code: 'GK', name: 'Goalkeeper', category: 'goalkeeper' },
  
  // Defenders
  { code: 'CB', name: 'Centre Back', category: 'defender' },
  { code: 'RCB', name: 'Right Centre Back', category: 'defender' },
  { code: 'LCB', name: 'Left Centre Back', category: 'defender' },
  { code: 'SW', name: 'Sweeper', category: 'defender' },
  { code: 'RB', name: 'Right Back', category: 'defender' },
  { code: 'LB', name: 'Left Back', category: 'defender' },
  { code: 'RWB', name: 'Right Wing Back', category: 'defender' },
  { code: 'LWB', name: 'Left Wing Back', category: 'defender' },
  { code: 'WB', name: 'Wing Back', category: 'defender' },
  { code: 'FB', name: 'Full Back', category: 'defender' },
  
  // Midfielders
  { code: 'CDM', name: 'Central Defensive Midfielder', category: 'midfielder' },
  { code: 'RDM', name: 'Right Defensive Midfielder', category: 'midfielder' },
  { code: 'LDM', name: 'Left Defensive Midfielder', category: 'midfielder' },
  { code: 'CM', name: 'Central Midfielder', category: 'midfielder' },
  { code: 'RCM', name: 'Right Central Midfielder', category: 'midfielder' },
  { code: 'LCM', name: 'Left Central Midfielder', category: 'midfielder' },
  { code: 'CAM', name: 'Central Attacking Midfielder', category: 'midfielder' },
  { code: 'RAM', name: 'Right Attacking Midfielder', category: 'midfielder' },
  { code: 'LAM', name: 'Left Attacking Midfielder', category: 'midfielder' },
  { code: 'RM', name: 'Right Midfielder', category: 'midfielder' },
  { code: 'LM', name: 'Left Midfielder', category: 'midfielder' },
  { code: 'RW', name: 'Right Winger', category: 'midfielder' },
  { code: 'LW', name: 'Left Winger', category: 'midfielder' },
  { code: 'AM', name: 'Attacking Midfielder', category: 'midfielder' },
  { code: 'DM', name: 'Defensive Midfielder', category: 'midfielder' },
  { code: 'WM', name: 'Wide Midfielder', category: 'midfielder' },
  
  // Forwards
  { code: 'RF', name: 'Right Forward', category: 'forward' },
  { code: 'LF', name: 'Left Forward', category: 'forward' },
  { code: 'CF', name: 'Centre Forward', category: 'forward' },
  { code: 'ST', name: 'Striker', category: 'forward' },
  { code: 'SS', name: 'Second Striker', category: 'forward' }
];

const CATEGORY_INFO = {
  goalkeeper: { name: 'Goalkeeper', color: '#10b981', icon: football },
  defender: { name: 'Defenders', color: '#3182ce', icon: shield },
  midfielder: { name: 'Midfielders', color: '#ed8936', icon: flash },
  forward: { name: 'Forwards', color: '#e53e3e', icon: trophy }
};

const PositionSelectionModal: React.FC<PositionSelectionModalProps> = ({
  isOpen,
  onDidDismiss,
  onPositionSelect,
  selectedPosition = '',
  title = 'Select Position'
}) => {
  const [searchText, setSearchText] = useState('');

  // Filter positions based on search text
  const filteredPositions = searchText.trim()
    ? POSITIONS.filter(position =>
        position.name.toLowerCase().includes(searchText.toLowerCase()) ||
        position.code.toLowerCase().includes(searchText.toLowerCase())
      )
    : POSITIONS;

  // Group positions by category
  const groupedPositions = filteredPositions.reduce((acc, position) => {
    if (!acc[position.category]) {
      acc[position.category] = [];
    }
    acc[position.category].push(position);
    return acc;
  }, {} as Record<string, Position[]>);

  const handlePositionSelect = (positionCode: string) => {
    onPositionSelect(positionCode);
    onDidDismiss();
  };

  const handleCancel = () => {
    setSearchText('');
    onDidDismiss();
  };

  const getPositionDisplayName = (position: Position) => {
    return `${position.name} (${position.code})`;
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDidDismiss}
      className="position-selection-modal"
      data-theme="player"
    >
      <IonHeader>
        <IonToolbar color="indigo">
          <IonButton
            fill="clear"
            slot="start"
            onClick={handleCancel}
            className="back-button"
          >
            <IonIcon icon={chevronBack} />
          </IonButton>
          <IonTitle>{title}</IonTitle>
          <IonButton
            fill="clear"
            slot="end"
            onClick={handleCancel}
            className="close-button"
          >
            <IonIcon icon={close} />
          </IonButton>
        </IonToolbar>
      </IonHeader>

      <IonContent className="position-selection-content">
        {/* Search Bar */}
        <div className="search-container">
          <IonSearchbar
            value={searchText}
            onIonInput={(e) => setSearchText(e.detail.value!)}
            placeholder="Search positions..."
            showClearButton="focus"
            className="position-search"
          />
        </div>

        <div className="positions-container">
          {Object.entries(groupedPositions).map(([category, positions]) => {
            const categoryInfo = CATEGORY_INFO[category as keyof typeof CATEGORY_INFO];
            
            return (
              <div key={category} className="position-category">
                <div className="category-header">
                  <div 
                    className="category-icon"
                    style={{ backgroundColor: categoryInfo.color }}
                  >
                    <IonIcon icon={categoryInfo.icon} />
                  </div>
                  <h3 className="category-title">{categoryInfo.name}</h3>
                </div>

                <IonList className="position-list">
                  {positions.map((position) => (
                    <IonItem
                      key={position.code}
                      button
                      onClick={() => handlePositionSelect(position.code)}
                      className={`position-item ${selectedPosition === position.code ? 'selected' : ''}`}
                    >
                      <IonLabel>
                        <h2 className="position-name">
                          {getPositionDisplayName(position)}
                        </h2>
                      </IonLabel>
                      {selectedPosition === position.code && (
                        <IonIcon icon={checkmark} slot="end" className="selected-icon" />
                      )}
                      <IonRippleEffect slot="fixed" />
                    </IonItem>
                  ))}
                </IonList>
              </div>
            );
          })}

          {/* No Results */}
          {filteredPositions.length === 0 && searchText.trim() && (
            <div className="no-results">
              <IonText color="medium">
                <h3>No positions found</h3>
                <p>Try adjusting your search terms</p>
              </IonText>
            </div>
          )}
        </div>
      </IonContent>
    </IonModal>
  );
};

export default PositionSelectionModal;