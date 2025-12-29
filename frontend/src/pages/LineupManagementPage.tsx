/**
 * Lineup Management Page
 * Main page for creating and managing default team lineups
 * Provides visual pitch interface for intuitive player positioning
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IonContent,
  IonPage,
  IonButton,
  IonSpinner,
  IonText,
  IonToast,
  IonIcon
} from '@ionic/react';
import { people, chevronDown } from 'ionicons/icons';
import { VisualPitchInterface, PlayerSelectionPanel, PlayerWithPosition, FormationData, PitchPosition } from '../components/lineup';
import { defaultLineupsApi, FormationPlayer, DefaultLineupData } from '../services/api/defaultLineupsApi';
import PageHeader from '../components/PageHeader';
import TeamSelectionModal from '../components/TeamSelectionModal';
import { useLocalTeams, useLocalPlayers, useLocalDefaultLineup } from '../hooks/useLocalData';
import { useInitialSync } from '../hooks/useInitialSync';
import {
  suggestFormationsByCount,
  generateSlotsForFormation,
  assignPlayersToSlots,
  zoneFromCoord,
} from '../lib/formationCore';
import type { Team } from '@shared/types';
import './LineupManagementPage.css';

// Local storage key for remembering selected team
const SELECTED_TEAM_STORAGE_KEY = 'lineup-management-selected-team';

interface LineupManagementPageProps {
  onNavigate?: (page: string) => void;
}

const LineupManagementPage: React.FC<LineupManagementPageProps> = ({ onNavigate }) => {
  // Trigger initial sync from server for authenticated users
  useInitialSync();

  // Reactive data from IndexedDB - auto-updates when data changes
  const { teams: allTeams, loading: teamsLoading } = useLocalTeams();

  // Filter to user's teams only (not opponents), sorted by createdAt
  const teams = useMemo(() => {
    return allTeams
      .filter(team => !team.isOpponent)
      .sort((a, b) => (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()));
  }, [allTeams]);

  // Selected team state
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(() => {
    // Initialize from URL or localStorage
    try {
      const params = new URLSearchParams(window.location.search);
      const urlTeamId = params.get('teamId');
      if (urlTeamId) return urlTeamId;
    } catch { }
    return localStorage.getItem(SELECTED_TEAM_STORAGE_KEY);
  });

  // Auto-select first team when teams load and no selection
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      setSelectedTeamId(teams[0].id);
    }
  }, [teams, selectedTeamId]);

  // Save selected team to localStorage when it changes
  useEffect(() => {
    if (selectedTeamId) {
      localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, selectedTeamId);
    }
  }, [selectedTeamId]);

  // Get selected team object
  const selectedTeam = useMemo(() => {
    return teams.find(t => t.id === selectedTeamId) || null;
  }, [teams, selectedTeamId]);

  // Reactive players for selected team
  const { players: rawPlayers, loading: playersLoading } = useLocalPlayers({
    teamId: selectedTeamId || undefined
  });

  // Transform players to PlayerWithPosition format (active only)
  const players: PlayerWithPosition[] = useMemo(() => {
    return rawPlayers
      .filter((p: any) => p.isActive !== false) // Default to active if not specified
      .map((player: any) => ({
        id: player.id,
        name: player.name,
        squadNumber: player.squadNumber,
        preferredPosition: player.preferredPosition
      }));
  }, [rawPlayers]);

  // Reactive default lineup for selected team
  const { defaultLineup: localDefaultLineup, loading: defaultLineupLoading } = useLocalDefaultLineup(selectedTeamId || undefined);

  // UI state
  const [currentFormation, setCurrentFormation] = useState<FormationData>({ players: [] });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  // Build formation from default lineup when it changes
  useEffect(() => {
    if (localDefaultLineup && players.length > 0) {
      const mapped: PlayerWithPosition[] = [];
      for (const fp of localDefaultLineup.formation || []) {
        const player = players.find(p => p.id === fp.playerId);
        if (player) {
          mapped.push({ ...player, position: { x: fp.pitchX, y: fp.pitchY } });
        }
      }
      setCurrentFormation({ players: mapped });
      setIsDirty(false);
    } else if (!localDefaultLineup && !defaultLineupLoading) {
      // No default lineup exists - start with empty formation
      setCurrentFormation({ players: [] });
      setIsDirty(false);
    }
  }, [localDefaultLineup, players, defaultLineupLoading]);

  // Compute player counts per team for display
  const teamPlayerCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // Since we have all players loaded, we can compute counts from rawPlayers
    // But for simplicity, just show the count for selected team
    if (selectedTeamId) {
      counts[selectedTeamId] = players.length;
    }
    return counts;
  }, [selectedTeamId, players.length]);

  const handleTeamChange = (teamName: string, teamId?: string) => {
    if (teamId) {
      setSelectedTeamId(teamId);
      setShowTeamModal(false);
    }
  };

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const handlePlayerMove = useCallback((playerId: string, position: PitchPosition) => {
    console.log('[LineupManagement] onPlayerMove', { playerId, position });
    setCurrentFormation(prev => ({
      players: prev.players.map(player =>
        player.id === playerId ? { ...player, position } : player
      )
    }));
    setIsDirty(true);
  }, []);

  const handlePlayerRemove = useCallback((playerId: string) => {
    setCurrentFormation(prev => ({
      players: prev.players.filter(player => player.id !== playerId)
    }));
    setIsDirty(true);
  }, []);

  const handlePlayerSelect = useCallback((player: PlayerWithPosition) => {
    // Enforce max 11 players
    setCurrentFormation(prev => {
      if (prev.players.length >= 11) {
        showErrorToast('Maximum 11 players allowed on pitch');
        return prev;
      }

      // Add player to formation with default position based on preferred position
      const getDefaultPosition = (preferredPosition?: string): PitchPosition => {
        switch ((preferredPosition || '').toUpperCase()) {
          case 'GK': return { x: 6, y: 50 };
          case 'LB': return { x: 20, y: 18 };
          case 'RB': return { x: 20, y: 82 };
          case 'CB': case 'RCB': return { x: 22, y: 60 };
          case 'LCB': return { x: 22, y: 40 };
          case 'LWB': return { x: 34, y: 22 };
          case 'RWB': return { x: 34, y: 78 };
          case 'SW': return { x: 14, y: 50 };
          case 'CDM': case 'DM': return { x: 42, y: 50 };
          case 'RDM': return { x: 42, y: 60 };
          case 'LDM': return { x: 42, y: 40 };
          case 'CM': return { x: 54, y: 50 };
          case 'RCM': return { x: 54, y: 60 };
          case 'LCM': return { x: 54, y: 40 };
          case 'CAM': case 'AM': return { x: 66, y: 50 };
          case 'RAM': return { x: 66, y: 60 };
          case 'LAM': return { x: 66, y: 40 };
          case 'LM': return { x: 52, y: 22 };
          case 'RM': return { x: 52, y: 78 };
          case 'LW': return { x: 85, y: 22 };
          case 'RW': return { x: 85, y: 78 };
          case 'RF': return { x: 86, y: 60 };
          case 'LF': return { x: 86, y: 40 };
          case 'CF': return { x: 84, y: 50 };
          case 'ST': return { x: 92, y: 50 };
          case 'SS': return { x: 76, y: 50 };
          default: return { x: 50, y: 50 };
        }
      };

      const position = getDefaultPosition(player.preferredPosition);
      const newPlayer = { ...player, position };

      setIsDirty(true);
      return { players: [...prev.players, newPlayer] };
    });
  }, []);

  const handlePlayerRemoveFromPanel = useCallback((player: PlayerWithPosition) => {
    handlePlayerRemove(player.id);
  }, [handlePlayerRemove]);

  const handleSaveLayout = async () => {
    if (!selectedTeam) {
      showErrorToast('No team selected');
      return;
    }

    if (currentFormation.players.length === 0) {
      showErrorToast('Cannot save empty formation');
      return;
    }

    try {
      setIsSaving(true);

      // Convert formation to API format using computed zone from coordinates
      const formation: FormationPlayer[] = currentFormation.players.map(player => {
        const pitchX = player.position?.x ?? 50;
        const pitchY = player.position?.y ?? 50;
        const zone = zoneFromCoord(pitchX, pitchY);
        return {
          playerId: player.id,
          position: zone,
          pitchX,
          pitchY
        };
      });

      console.log('[LineupManagement] Saving formation payload:', formation);

      // Save via API (local-first - writes to IndexedDB, background syncs)
      await defaultLineupsApi.saveDefaultLineup({
        teamId: selectedTeam.id,
        formation
      });

      // The useLocalDefaultLineup hook will auto-update the UI
      setIsDirty(false);
      setIsSaving(false);
      showSuccessToast('Formation saved successfully');
    } catch (error: any) {
      console.error('Failed to save formation:', error);
      setIsSaving(false);
      // Local-first: IndexedDB errors are rare, just log them
    }
  };

  const showSuccessToast = (message: string) => {
    setToastMessage(message);
    setToastColor('success');
    setShowToast(true);
  };

  const showErrorToast = (message: string) => {
    setToastMessage(message);
    setToastColor('danger');
    setShowToast(true);
  };

  // Get available players (not on pitch)
  const availablePlayers = useMemo(() => {
    return players.filter(player =>
      !currentFormation.players.some(fp => fp.id === player.id)
    );
  }, [players, currentFormation.players]);

  // Get selected players (those on the pitch)
  const selectedPlayers = useMemo(() => {
    return new Set(currentFormation.players.map(p => p.id));
  }, [currentFormation.players]);

  // Check if page is ready (all data loaded)
  const isPageReady = !teamsLoading && !playersLoading && !defaultLineupLoading;

  // Check if save button should be disabled
  // Disable when: no unsaved changes, currently saving, or no players on pitch
  const isSaveDisabled = !isDirty || isSaving || currentFormation.players.length === 0;

  // Formation suggestion helpers
  const groupForPos = (code?: string): 'GK' | 'DEF' | 'MID' | 'FWD' => {
    const c = (code || '').toUpperCase();
    if (c === 'GK') return 'GK';
    if (['CB', 'LCB', 'RCB', 'SW', 'LB', 'RB', 'LWB', 'RWB', 'WB', 'FB'].includes(c)) return 'DEF';
    if (['CDM', 'LDM', 'RDM', 'DM', 'CM', 'LCM', 'RCM', 'CAM', 'LAM', 'RAM', 'LM', 'RM', 'WM', 'AM'].includes(c)) return 'MID';
    return 'FWD';
  };

  const suggestFormations = (totalOnPitch: number): string[] => {
    if (totalOnPitch <= 1) return [];
    const outfield = Math.max(0, totalOnPitch - 1); // exclude GK
    if (outfield <= 2) return ['2'];
    if (outfield === 3) return ['2-1', '1-2'];
    if (outfield === 4) return ['2-2', '1-2-1'];
    if (outfield === 5) return ['2-2-1', '1-3-1'];
    if (outfield === 6) return ['2-3-1', '3-2-1'];
    if (outfield === 7) return ['3-3-1', '2-3-2'];
    if (outfield === 8) return ['3-3-2', '4-3-1'];
    if (outfield >= 9) return ['4-4-1', '3-4-2'];
    return ['2-2'];
  };

  const slotsForFormation = (formation: string): Array<{ x: number; y: number; group: 'GK' | 'DEF' | 'MID' | 'FWD' }[]> => {
    // Returns an array of lines (each line: array of slots with group)
    const parts = formation.split('-').map(n => Math.max(0, parseInt(n.trim() || '0', 10) || 0));
    const lines: number[] = parts.length === 1 ? [parts[0]] : parts;
    // Prepend GK line implicitly
    const lineDefs: { x: number; group: 'GK' | 'DEF' | 'MID' | 'FWD' }[] = [];
    // GK line
    lineDefs.push({ x: 8, group: 'GK' });
    // Map subsequent lines from back to front
    const lineGroups: ('DEF' | 'MID' | 'MID' | 'FWD')[] = ['DEF', 'MID', 'MID', 'FWD'];
    const lineXs = [24, 50, 66, 88];
    const result: Array<{ x: number; y: number; group: 'GK' | 'DEF' | 'MID' | 'FWD' }[]> = [];
    // GK line single slot
    result.push([{ x: 8, y: 50, group: 'GK' }]);
    // Build outfield lines
    for (let i = 0; i < lines.length; i++) {
      const count = lines[i];
      const group = lineGroups[Math.min(i, lineGroups.length - 1)];
      const x = lineXs[Math.min(i, lineXs.length - 1)];
      const slots: { x: number; y: number; group: 'GK' | 'DEF' | 'MID' | 'FWD' }[] = [];
      if (count <= 0) { result.push([]); continue; }
      // Distribute y positions between 24 and 76 evenly
      const minY = 24, maxY = 76;
      for (let k = 0; k < count; k++) {
        const y = count === 1 ? 50 : minY + (k * (maxY - minY) / (count - 1));
        slots.push({ x, y, group });
      }
      result.push(slots);
    }
    return result;
  };

  const applyFormationAutoPlacement = (formation: string) => {
    if (currentFormation.players.length === 0) return;
    const slots = generateSlotsForFormation(formation);
    const playerData = currentFormation.players.map(p => ({
      id: p.id,
      x: p.position?.x ?? 50,
      y: p.position?.y ?? 50,
      preferredPosition: p.preferredPosition
    }));
    const result = assignPlayersToSlots(playerData, slots, { enabled: true, tag: 'auto' });
    setCurrentFormation(prev => ({
      players: prev.players.map(p => result.positions[p.id] ? ({ ...p, position: result.positions[p.id] }) : p)
    }));
    setIsDirty(true);
  };

  return (
    <IonPage className="page" data-theme="lineup">
      {/* Consistent app header */}
      <PageHeader onNavigate={navigate} />

      <IonContent className="lineup-management-content">
        {/* Lineup header (mirrors Matches header, themed Sky) */}
        <div className="lineup-header">
          <div className="lineup-title-section">
            <div className="page-header-with-color" style={{ backgroundColor: 'var(--theme-primary, var(--ion-color-secondary))' }}>
              <h1 className="lineup-main-title">Lineup Management</h1>
            </div>
            <p className="lineup-subtitle">Create and manage default team lineups with visual pitch interface</p>
          </div>
        </div>
        {(!isPageReady) ? (
          <div className="loading-container">
            <IonSpinner name="crescent" />
            <IonText>
              <p>Loading lineup data...</p>
            </IonText>
          </div>
        ) : teams.length === 0 ? (
          <div style={{ padding: '16px' }}>
            <div style={{
              border: '1px dashed var(--ion-color-medium)',
              borderRadius: 12,
              padding: '16px',
              background: 'var(--ion-color-step-50, rgba(0,0,0,0.02))'
            }}>
              <h2 style={{ margin: '0 0 8px' }}>Add a team to start</h2>
              <IonText color="medium">
                You’ll need at least one team before you can manage default lineups.
              </IonText>
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <IonButton color="primary" onClick={() => onNavigate ? onNavigate('teams') : window.history.pushState({}, '', '/teams')}>
                  Go to Teams
                </IonButton>
                <IonButton fill="outline" onClick={() => onNavigate ? onNavigate('home') : window.history.back()}>
                  Back to Home
                </IonButton>
              </div>
            </div>
          </div>
        ) : (
          <div className="lineup-content-wrapper">
            <div className="lineup-content">
              {/* Team Selection Section */}
              <div className="team-selection-section">
                <div className="team-selector-container">
                  <IonButton
                    fill="outline"
                    color="sky"
                    onClick={() => setShowTeamModal(true)}
                    disabled={teams.length === 0}
                    className="team-selector-button"
                  >
                    <IonIcon icon={people} slot="start" />
                    {selectedTeam ? (
                      <span>
                        {selectedTeam.name}
                        {teamPlayerCounts[selectedTeam.id] !== undefined &&
                          ` (${teamPlayerCounts[selectedTeam.id]} players)`
                        }
                      </span>
                    ) : (
                      'Select Team'
                    )}
                    <IonIcon icon={chevronDown} slot="end" />
                  </IonButton>
                </div>

                {/* Suggested formations */}
                {currentFormation.players.length > 1 && (
                  <div style={{ marginTop: 12 }}>
                    <IonText color="medium"><p style={{ margin: '8px 0' }}>Suggested formations</p></IonText>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {suggestFormationsByCount(currentFormation.players.length).map(f => (
                        <IonButton key={f} size="small" fill="outline" color="sky" onClick={() => applyFormationAutoPlacement(f)}>
                          {f}
                        </IonButton>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Main Layout */}
              <div className="main-layout">
                {/* Pitch Section */}
                <div className="pitch-section">
                  <VisualPitchInterface
                    players={players}
                    formation={currentFormation}
                    onPlayerMove={handlePlayerMove}
                    onPlayerRemove={handlePlayerRemove}
                    readonly={false}
                    maxPlayers={11}
                  />
                  {/* Save Button under pitch (inside same column) */}
                  <div className="save-button-container">
                    <IonButton
                      expand="block"
                      size="large"
                      className={`save-layout-button ${isDirty ? 'dirty' : ''}`}
                      fill="solid"
                      onClick={handleSaveLayout}
                      disabled={isSaveDisabled}
                      color={isDirty ? 'success' : 'medium'}
                      strong={isDirty}
                    >
                      {isSaving ? (
                        <>
                          <IonSpinner name="crescent" />
                          &nbsp;Saving...
                        </>
                      ) : (
                        `Save Layout${isDirty ? ' *' : ''}`
                      )}
                    </IonButton>
                  </div>
                </div>

                {/* Player Selection Panel */}
                <div className="player-panel-section">
                  <div className="player-panel-content">
                    <PlayerSelectionPanel
                      players={players}
                      onPlayerSelect={handlePlayerSelect}
                      onPlayerRemove={handlePlayerRemoveFromPanel}
                      selectedPlayers={selectedPlayers}
                      maxPlayers={11}
                      readonly={false}
                      searchable={true}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Team Selection Modal */}
        <TeamSelectionModal
          isOpen={showTeamModal}
          onDidDismiss={() => setShowTeamModal(false)}
          onTeamSelect={handleTeamChange}
          selectedTeam={selectedTeam?.name || ''}
          title="Select Team"
          hideNoTeamOption={true}
          color="sky"
        />

        {/* Toast Messages */}
        <IonToast
          isOpen={showToast}
          onDidDismiss={() => setShowToast(false)}
          message={toastMessage}
          duration={5000}
          position="bottom"
          color={toastColor}
        />
      </IonContent>
    </IonPage>
  );
};

export default LineupManagementPage;
