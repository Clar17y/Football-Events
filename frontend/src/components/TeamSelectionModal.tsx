/**
 * Team Selection Modal Component
 * Custom modal for selecting teams that matches the app's design system
 * Mobile-first design optimized for iPhone UX
 */

import React, { useState, useEffect } from 'react';
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
  IonSpinner,
  IonRippleEffect
} from '@ionic/react';
import {
  close,
  chevronBack,
  search,
  people,
  checkmark
} from 'ionicons/icons';
import { useTeams } from '../hooks/useTeams';
import type { Team } from '@shared/types';
import './TeamSelectionModal.css';

interface TeamSelectionModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  onTeamSelect: (teamName: string) => void;
  selectedTeam?: string; // For backward compatibility
  selectedTeams?: string[]; // For multiple selection
  title?: string;
  allowMultiple?: boolean; // Enable multiple selection mode
}

const TeamSelectionModal: React.FC<TeamSelectionModalProps> = ({
  isOpen,
  onDidDismiss,
  onTeamSelect,
  selectedTeam = '',
  selectedTeams = [],
  title = 'Select Team',
  allowMultiple = false
}) => {
  const { teams, loadTeams, loading } = useTeams();
  const [searchText, setSearchText] = useState('');
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);

  // Load teams when modal opens
  useEffect(() => {
    if (isOpen) {
      loadTeams();
    }
  }, [isOpen, loadTeams]);

  // Filter teams based on search text
  useEffect(() => {
    if (!searchText.trim()) {
      setFilteredTeams(teams);
    } else {
      const filtered = teams.filter(team =>
        team.name.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredTeams(filtered);
    }
  }, [teams, searchText]);

  const handleTeamSelect = (teamName: string) => {
    onTeamSelect(teamName);
    if (!allowMultiple) {
      onDidDismiss();
    }
  };

  const handleNoTeamSelect = () => {
    onTeamSelect('');
    if (!allowMultiple) {
      onDidDismiss();
    }
  };

  const isTeamSelected = (teamName: string) => {
    if (allowMultiple) {
      return selectedTeams.includes(teamName);
    } else {
      return selectedTeam === teamName;
    }
  };

  const handleCancel = () => {
    setSearchText('');
    onDidDismiss();
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDidDismiss}
      className="team-selection-modal"
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

      <IonContent className="team-selection-content">
        {/* Search Bar */}
        <div className="search-container">
          <IonSearchbar
            value={searchText}
            onIonInput={(e) => setSearchText(e.detail.value!)}
            placeholder="Search teams..."
            showClearButton="focus"
            className="team-search"
          />
        </div>

        {loading ? (
          <div className="loading-container">
            <IonSpinner name="crescent" color="indigo" />
            <IonText color="medium">Loading teams...</IonText>
          </div>
        ) : (
          <IonList className="team-list">
            {/* No Team Option */}
            <IonItem
              button
              onClick={handleNoTeamSelect}
              className={`team-item no-team-item ${selectedTeam === '' ? 'selected' : ''}`}
            >
              <div className="team-avatar no-team-avatar">
                <IonIcon icon={people} />
              </div>
              <IonLabel>
                <h2 className="team-name">No Team</h2>
                <p className="team-description">Player not assigned to any team</p>
              </IonLabel>
              {(allowMultiple ? selectedTeams.length === 0 : selectedTeam === '') && (
                <IonIcon icon={checkmark} slot="end" className="selected-icon" />
              )}
              <IonRippleEffect />
            </IonItem>

            {/* Team Options */}
            {filteredTeams.map((team) => {
              const hasTeamColors = team.homeKitPrimary && team.homeKitSecondary;
              const primaryColor = team.homeKitPrimary || 'var(--ion-color-teal)';
              const secondaryColor = team.homeKitSecondary || 'var(--ion-color-teal-tint)';
              
              return (
                <IonItem
                  key={team.id}
                  button
                  onClick={() => handleTeamSelect(team.name)}
                  className={`team-item ${isTeamSelected(team.name) ? 'selected' : ''} ${hasTeamColors ? 'team-item-with-colors' : ''}`}
                >
                  {/* Team color stripes */}
                  {hasTeamColors && (
                    <div className="team-color-stripes">
                      <div className="stripe stripe-primary" style={{ backgroundColor: primaryColor }}></div>
                      <div className="stripe stripe-secondary" style={{ backgroundColor: secondaryColor }}></div>
                    </div>
                  )}
                  
                  <div className="team-avatar">
                    {team.logoUrl ? (
                      <img 
                        src={team.logoUrl} 
                        alt={`${team.name} logo`}
                        className="team-logo-img"
                      />
                    ) : (
                      <span 
                        className="team-letter"
                        style={{ 
                          backgroundColor: primaryColor,
                          color: secondaryColor || 'white'
                        }}
                      >
                        {team.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <IonLabel>
                    <h2 className="team-name">{team.name}</h2>
                    <p className="team-description">
                      1 Player
                    </p>
                  </IonLabel>
                  {isTeamSelected(team.name) && (
                    <IonIcon icon={checkmark} slot="end" className="selected-icon" />
                  )}
                  <IonRippleEffect />
                </IonItem>
              );
            })}

            {/* No Results */}
            {!loading && filteredTeams.length === 0 && searchText.trim() && (
              <div className="no-results">
                <IonText color="medium">
                  <h3>No teams found</h3>
                  <p>Try adjusting your search terms</p>
                </IonText>
              </div>
            )}

            {/* Empty State */}
            {!loading && teams.length === 0 && !searchText.trim() && (
              <div className="empty-state">
                <IonIcon icon={people} className="empty-icon" />
                <IonText color="medium">
                  <h3>No teams available</h3>
                  <p>Create a team first to assign players</p>
                </IonText>
              </div>
            )}
          </IonList>
        )}

        {/* Done button for multiple selection */}
        {allowMultiple && (
          <div style={{ 
            padding: '16px', 
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--ion-color-light-shade, #e9ecef)'
          }}>
            <IonButton 
              expand="block" 
              color="indigo" 
              onClick={onDidDismiss}
              disabled={loading}
            >
              Done ({selectedTeams.length} team{selectedTeams.length !== 1 ? 's' : ''} selected)
            </IonButton>
          </div>
        )}
      </IonContent>
    </IonModal>
  );
};

export default TeamSelectionModal;