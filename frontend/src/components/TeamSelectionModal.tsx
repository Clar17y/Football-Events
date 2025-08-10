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
import { teamsApi } from '../services/api/teamsApi';

interface TeamSelectionModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  onTeamSelect: (teamName: string, teamId?: string) => void;
  selectedTeam?: string; // For backward compatibility
  selectedTeams?: string[]; // For multiple selection
  noTeamSelected?: boolean; // For filter context to reflect selection
  noTeamLabel?: string; // Custom label for the 'no team' option
  title?: string;
  allowMultiple?: boolean; // Enable multiple selection mode
}

const TeamSelectionModal: React.FC<TeamSelectionModalProps> = ({
  isOpen,
  onDidDismiss,
  onTeamSelect,
  selectedTeam = '',
  selectedTeams = [],
  noTeamSelected = false,
  noTeamLabel,
  title = 'Select Team',
  allowMultiple = false
}) => {
  const { teams, loadTeams, loading } = useTeams();
  const noTeamText = noTeamLabel || 'Players without an active team';
  const [searchText, setSearchText] = useState('');
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [teamPlayerCounts, setTeamPlayerCounts] = useState<Record<string, number>>({});

  // Load teams once when modal opens
  useEffect(() => {
    if (!isOpen) return;
    void loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fetch player counts when teams are available (with caching and cancel guard)
  const countsCacheRef = React.useRef<Record<string, number>>({});
  useEffect(() => {
    if (!isOpen || teams.length === 0) return;
    let cancelled = false;

    const fetchCounts = async () => {
      // Prime from cache
      const cache = countsCacheRef.current;
      const toFetch = teams.filter(t => cache[t.id] === undefined);

      if (toFetch.length > 0) {
        await Promise.all(
          toFetch.map(async (team) => {
            try {
              const resp = await teamsApi.getActiveTeamPlayers(team.id);
              cache[team.id] = resp.data.length;
            } catch {
              cache[team.id] = 0;
            }
          })
        );
      }

      if (!cancelled) {
        const merged: Record<string, number> = {};
        teams.forEach(t => { merged[t.id] = cache[t.id] ?? 0; });
        setTeamPlayerCounts(merged);
      }
    };

    fetchCounts();
    return () => { cancelled = true; };
  }, [isOpen, teams]);

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

  const handleTeamSelect = (teamName: string, teamId?: string) => {
    onTeamSelect(teamName, teamId);
    if (!allowMultiple) {
      onDidDismiss();
    }
  };

  const handleNoTeamSelect = () => {
    // Toggle no team selection via empty name
    onTeamSelect('', undefined);
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

  const toggleSelection = (teamName: string, teamId: string) => {
    onTeamSelect(teamName, teamId);
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
            {/* No Team Option (filter context) */}
            <IonItem
              button
              onClick={handleNoTeamSelect}
              className={`team-item no-team-item ${noTeamSelected ? 'selected' : ''}`}
            >
              <div className="team-avatar no-team-avatar">
                <IonIcon icon={people} />
              </div>
              <IonLabel>
                <h2 className="team-name">No Team</h2>
                <p className="team-description">{noTeamText}</p>
              </IonLabel>
              {noTeamSelected && (
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
                  onClick={() => toggleSelection(team.name, team.id)}
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
                      {teamPlayerCounts[team.id] ?? 0} Player{(teamPlayerCounts[team.id] ?? 0) !== 1 ? 's' : ''}
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