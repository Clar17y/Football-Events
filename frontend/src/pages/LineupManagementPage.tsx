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
import { teamsApi } from '../services/api/teamsApi';
import { defaultLineupsApi, FormationPlayer, DefaultLineupData } from '../services/api/defaultLineupsApi';
import PageHeader from '../components/PageHeader';
import TeamSelectionModal from '../components/TeamSelectionModal';
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

interface LineupManagementState {
  selectedTeam: Team | null;
  teams: Team[];
  players: PlayerWithPosition[];
  currentFormation: FormationData;
  defaultLineup: DefaultLineupData | null;
  isLoading: boolean;
  isTeamsLoading: boolean;
  isPlayersLoading: boolean;
  isDefaultLineupLoading: boolean;
  isSaving: boolean;
  error: string | null;
  isDirty: boolean;
  showTeamModal: boolean;
  teamPlayerCounts: Record<string, number>;
}

interface LineupManagementPageProps {
  onNavigate?: (page: string) => void;
}

const LineupManagementPage: React.FC<LineupManagementPageProps> = ({ onNavigate }) => {
  const [state, setState] = useState<LineupManagementState>({
    selectedTeam: null,
    teams: [],
    players: [],
    currentFormation: { players: [] },
    defaultLineup: null,
    isLoading: true,
    isTeamsLoading: true,
    isPlayersLoading: false,
    isDefaultLineupLoading: false,
    isSaving: false,
    error: null,
    isDirty: false,
    showTeamModal: false,
    teamPlayerCounts: {}
  });

  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastColor, setToastColor] = useState<'success' | 'danger'>('success');

  // Load teams on component mount
  useEffect(() => {
    loadTeams();
  }, []);

  // Load team player counts when teams are available
  useEffect(() => {
    if (state.teams.length > 0) {
      loadTeamPlayerCounts();
    }
  }, [state.teams]);

  // Load team data when selected team changes
  useEffect(() => {
    if (state.selectedTeam) {
      loadTeamData(state.selectedTeam.id);
      // Save selected team to localStorage
      localStorage.setItem(SELECTED_TEAM_STORAGE_KEY, state.selectedTeam.id);
    }
  }, [state.selectedTeam]);

  const loadTeams = async () => {
    try {
      setState(prev => ({ ...prev, isTeamsLoading: true, error: null }));
      
      const response = await teamsApi.getTeams({ 
        limit: 100, // Get all teams
        includeOpponents: false // Only user's teams
      });
      
      const userTeams = response.data.filter(team => !team.is_opponent);
      
      // Sort by created_at (oldest first) to get default team
      const sortedTeams = userTeams.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      setState(prev => ({ 
        ...prev, 
        teams: sortedTeams,
        isTeamsLoading: false,
        isLoading: false
      }));

      // Prefer selection from URL (?teamId=...), then localStorage, then oldest team
      if (sortedTeams.length > 0) {
        let urlTeamId: string | null = null;
        try {
          const params = new URLSearchParams(window.location.search);
          urlTeamId = params.get('teamId');
        } catch {}

        const savedTeamId = localStorage.getItem(SELECTED_TEAM_STORAGE_KEY);
        const teamToSelect = (urlTeamId && sortedTeams.find(t => t.id === urlTeamId))
          || (savedTeamId && sortedTeams.find(team => team.id === savedTeamId))
          || sortedTeams[0];
        
        setState(prev => ({ 
          ...prev, 
          selectedTeam: teamToSelect 
        }));
      }
    } catch (error: any) {
      console.error('Failed to load teams:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to load teams. Please try again.',
        isTeamsLoading: false 
      }));
      showErrorToast('Failed to load teams');
    }
  };

  const loadTeamData = async (teamId: string) => {
    try {
      setState(prev => ({ 
        ...prev, 
        isPlayersLoading: true, 
        isDefaultLineupLoading: true,
        error: null 
      }));

      // Load team players first
      const playersResponse = await teamsApi.getTeamPlayers(teamId);
      
      console.log('[LineupManagement] Loaded team players:', {
        teamId,
        count: playersResponse.data?.length
      });

      // Transform players (active only)
      const playersWithPosition: PlayerWithPosition[] = playersResponse.data
        .filter(player => player.isActive)
        .map(player => ({
          id: player.id,
          name: player.name,
          squadNumber: player.squadNumber,
          preferredPosition: player.preferredPosition
        }));

      setState(prev => ({ 
        ...prev,
        players: playersWithPosition,
        isPlayersLoading: false
      }));

      // Load default lineup separately to handle 404 gracefully
      try {
        const defaultLineup = await defaultLineupsApi.getDefaultLineup(teamId);
        
        // Create formation from default lineup if available
        let formation: FormationData = { players: [] };
        if (defaultLineup) {
          console.log('[LineupManagement] Loaded default lineup:', defaultLineup);
          const mapped: PlayerWithPosition[] = [];
          for (const fp of defaultLineup.formation) {
            let player = playersWithPosition.find(p => p.id === fp.playerId);
            if (!player) {
              console.warn('[LineupManagement] Formation player not in active roster, fetching:', fp.playerId);
              try {
                const resp = await (await import('../services/api/playersApi')).playersApi.getPlayerById(fp.playerId);
                const fetched = resp.data;
                player = {
                  id: fetched.id,
                  name: fetched.name,
                  squadNumber: (fetched as any).squadNumber,
                  preferredPosition: (fetched as any).preferredPosition
                };
                // Add to roster for visibility in squad panel
                playersWithPosition.push(player);
              } catch (e) {
                console.warn('[LineupManagement] Failed to fetch missing player', fp.playerId, e);
                continue;
              }
            }
            mapped.push({ ...player, position: { x: fp.pitchX, y: fp.pitchY } });
          }
          formation = { players: mapped };
          console.log('[LineupManagement] Mapped formation players:', formation.players.length);
        } else {
          console.log('[LineupManagement] No default lineup found for team (null response)');
        }

        setState(prev => ({ 
          ...prev,
          players: playersWithPosition,
          currentFormation: formation,
          defaultLineup,
          isDefaultLineupLoading: false,
          isDirty: false,
          isLoading: false
        }));
        console.log('[LineupManagement] State set with formation count:', formation.players.length);
      } catch (defaultLineupError: any) {
        // Handle 404 or other errors for default lineup gracefully
        console.log('No default lineup found for team, starting with empty formation');
        setState(prev => ({ 
          ...prev,
          currentFormation: { players: [] },
          defaultLineup: null,
          isDefaultLineupLoading: false,
          isDirty: false,
          isLoading: false
        }));
      }
    } catch (error: any) {
      console.error('Failed to load team data:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Failed to load team data. Please try again.',
        isPlayersLoading: false,
        isDefaultLineupLoading: false,
        isLoading: false
      }));
      showErrorToast('Failed to load team data');
    }
  };

  const handleTeamChange = (teamName: string, teamId?: string) => {
    const team = state.teams.find(t => t.id === teamId);
    if (team) {
      setState(prev => ({ 
        ...prev, 
        selectedTeam: team,
        isLoading: true,
        showTeamModal: false
      }));
    }
  };

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const loadTeamPlayerCounts = async () => {
    try {
      const counts: Record<string, number> = {};
      await Promise.all(
        state.teams.map(async (team) => {
          try {
            const response = await teamsApi.getTeamPlayers(team.id);
            counts[team.id] = response.data.filter(player => player.isActive).length;
          } catch {
            counts[team.id] = 0;
          }
        })
      );
      setState(prev => ({ ...prev, teamPlayerCounts: counts }));
    } catch (error) {
      console.error('Failed to load team player counts:', error);
    }
  };

  const handlePlayerMove = useCallback((playerId: string, position: PitchPosition) => {
    console.log('[LineupManagement] onPlayerMove', { playerId, position });
    setState(prev => ({
      ...prev,
      currentFormation: {
        players: prev.currentFormation.players.map(player =>
          player.id === playerId ? { ...player, position } : player
        )
      },
      isDirty: true
    }));
  }, []);

  const handlePlayerRemove = useCallback((playerId: string) => {
    setState(prev => ({
      ...prev,
      currentFormation: {
        players: prev.currentFormation.players.filter(player => player.id !== playerId)
      },
      isDirty: true
    }));
  }, []);

  const handlePlayerSelect = useCallback((player: PlayerWithPosition) => {
    // Enforce max 11 players
    if (state.currentFormation.players.length >= 11) {
      showErrorToast('Maximum 11 players allowed on pitch');
      return;
    }

    // Add player to formation with default position based on preferred position
    const getDefaultPosition = (preferredPosition?: string): PitchPosition => {
      const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
      
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

    setState(prev => ({
      ...prev,
      currentFormation: {
        players: [...prev.currentFormation.players, newPlayer]
      },
      isDirty: true
    }));
  }, [state.currentFormation.players.length]);

  const handlePlayerRemoveFromPanel = useCallback((player: PlayerWithPosition) => {
    handlePlayerRemove(player.id);
  }, [handlePlayerRemove]);

  const handleSaveLayout = async () => {
    if (!state.selectedTeam) {
      showErrorToast('No team selected');
      return;
    }

    if (state.currentFormation.players.length === 0) {
      showErrorToast('Cannot save empty formation');
      return;
    }

    try {
      setState(prev => ({ ...prev, isSaving: true }));

      // Determine actual zone based on pitch coordinates
      const calcZone = (x: number, y: number): string => {
        // Zones aligned with VisualPitchInterface
        const zones = [
          { code: 'GK', area: { minX: 0, maxX: 12, minY: 40, maxY: 60 }, priority: 1 },
          { code: 'CB', area: { minX: 12, maxX: 32, minY: 28, maxY: 72 }, priority: 2 },
          { code: 'LB', area: { minX: 8, maxX: 28, minY: 0,  maxY: 36 }, priority: 2 },
          { code: 'RB', area: { minX: 8, maxX: 28, minY: 64, maxY: 100 }, priority: 2 },
          { code: 'LWB', area:{ minX:24, maxX:42, minY: 0,  maxY: 32 }, priority: 2 },
          { code: 'RWB', area:{ minX:24, maxX:42, minY: 68, maxY:100 }, priority: 2 },
          { code: 'CDM', area:{ minX:34, maxX:52, minY: 30, maxY: 70 }, priority: 3 },
          { code: 'CM',  area:{ minX:44, maxX:64, minY: 24, maxY: 76 }, priority: 3 },
          { code: 'LM',  area:{ minX:40, maxX:62, minY: 0,  maxY: 30 }, priority: 3 },
          { code: 'RM',  area:{ minX:40, maxX:62, minY: 70, maxY:100 }, priority: 3 },
          { code: 'LAM', area:{ minX:58, maxX:74, minY: 8,  maxY: 36 }, priority: 3 },
          { code: 'RAM', area:{ minX:58, maxX:74, minY: 64, maxY: 92 }, priority: 3 },
          { code: 'CAM', area:{ minX:60, maxX:78, minY: 24, maxY: 76 }, priority: 3 },
          { code: 'LW',  area:{ minX:76, maxX:98, minY: 0,  maxY: 36 }, priority: 4 },
          { code: 'RW',  area:{ minX:76, maxX:98, minY: 64, maxY:100 }, priority: 4 },
          { code: 'CF',  area:{ minX:72, maxX:96, minY: 30, maxY: 70 }, priority: 4 },
          { code: 'ST',  area:{ minX:82, maxX:100,minY: 24, maxY: 76 }, priority: 4 },
        ];
        const matches = zones.filter(z => x>=z.area.minX && x<=z.area.maxX && y>=z.area.minY && y<=z.area.maxY);
        if (matches.length) return matches.reduce((b,c)=> c.priority<b.priority?c:b).code;
        // nearest by rect distance
        let best = 'CM'; let dist=Infinity; let bestP=99;
        for (const z of zones) {
          const dx = x<z.area.minX? (z.area.minX-x): (x>z.area.maxX? (x-z.area.maxX): 0);
          const dy = y<z.area.minY? (z.area.minY-y): (y>z.area.maxY? (y-z.area.maxY): 0);
          const d = Math.hypot(dx,dy);
          if (d<dist || (d===dist && z.priority<bestP)) { dist=d; best=z.code; bestP=z.priority; }
        }
        return best;
      };

      // Convert formation to API format using computed zone from coordinates
      const formation: FormationPlayer[] = state.currentFormation.players.map(player => {
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

      const response = await defaultLineupsApi.saveDefaultLineup({
        teamId: state.selectedTeam.id,
        formation
      });

      setState(prev => ({ 
        ...prev, 
        defaultLineup: response.data,
        isDirty: false,
        isSaving: false
      }));

      showSuccessToast('Formation saved successfully');
    } catch (error: any) {
      console.error('Failed to save formation:', error);
      setState(prev => ({ ...prev, isSaving: false }));
      showErrorToast('Failed to save formation');
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
    return state.players.filter(player => 
      !state.currentFormation.players.some(fp => fp.id === player.id)
    );
  }, [state.players, state.currentFormation.players]);

  // Get selected players (those on the pitch)
  const selectedPlayers = useMemo(() => {
    return new Set(state.currentFormation.players.map(p => p.id));
  }, [state.currentFormation.players]);

  // Check if page is ready (all data loaded)
  const isPageReady = !state.isLoading && !state.isTeamsLoading && 
                     !state.isPlayersLoading && !state.isDefaultLineupLoading;

  // Check if save button should be disabled
  // Disable when: no unsaved changes, currently saving, or no players on pitch
  const isSaveDisabled = !state.isDirty || state.isSaving || state.currentFormation.players.length === 0;

  // Formation suggestion helpers
  const groupForPos = (code?: string): 'GK' | 'DEF' | 'MID' | 'FWD' => {
    const c = (code || '').toUpperCase();
    if (c === 'GK') return 'GK';
    if (['CB','LCB','RCB','SW','LB','RB','LWB','RWB','WB','FB'].includes(c)) return 'DEF';
    if (['CDM','LDM','RDM','DM','CM','LCM','RCM','CAM','LAM','RAM','LM','RM','WM','AM'].includes(c)) return 'MID';
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

  const slotsForFormation = (formation: string): Array<{ x: number; y: number; group: 'GK'|'DEF'|'MID'|'FWD' }[]> => {
    // Returns an array of lines (each line: array of slots with group)
    const parts = formation.split('-').map(n => Math.max(0, parseInt(n.trim() || '0', 10) || 0));
    const lines: number[] = parts.length === 1 ? [parts[0]] : parts;
    // Prepend GK line implicitly
    const lineDefs: { x: number; group: 'GK'|'DEF'|'MID'|'FWD' }[] = [];
    // GK line
    lineDefs.push({ x: 8, group: 'GK' });
    // Map subsequent lines from back to front
    const lineGroups: ('DEF'|'MID'|'MID'|'FWD')[] = ['DEF','MID','MID','FWD'];
    const lineXs = [24, 50, 66, 88];
    const result: Array<{ x: number; y: number; group: 'GK'|'DEF'|'MID'|'FWD' }[]> = [];
    // GK line single slot
    result.push([{ x: 8, y: 50, group: 'GK' }]);
    // Build outfield lines
    for (let i = 0; i < lines.length; i++) {
      const count = lines[i];
      const group = lineGroups[Math.min(i, lineGroups.length - 1)];
      const x = lineXs[Math.min(i, lineXs.length - 1)];
      const slots: { x: number; y: number; group: 'GK'|'DEF'|'MID'|'FWD' }[] = [];
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
    const current = state.currentFormation.players;
    if (current.length === 0) return;
    const slots = generateSlotsForFormation(formation);
    const players = current.map(p => ({ id: p.id, x: p.position?.x ?? 50, y: p.position?.y ?? 50, preferredPosition: p.preferredPosition }));
    const result = assignPlayersToSlots(players, slots, { enabled: true, tag: 'auto' });
    setState(prev => ({
      ...prev,
      currentFormation: {
        players: prev.currentFormation.players.map(p => result.positions[p.id] ? ({ ...p, position: result.positions[p.id] }) : p)
      },
      isDirty: true
    }));
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
        ) : state.teams.length === 0 ? (
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
                    onClick={() => setState(prev => ({ ...prev, showTeamModal: true }))}
                    disabled={state.teams.length === 0}
                    className="team-selector-button"
                  >
                    <IonIcon icon={people} slot="start" />
                    {state.selectedTeam ? (
                      <span>
                        {state.selectedTeam.name} 
                        {state.teamPlayerCounts[state.selectedTeam.id] !== undefined && 
                          ` (${state.teamPlayerCounts[state.selectedTeam.id]} players)`
                        }
                      </span>
                    ) : (
                      'Select Team'
                    )}
                    <IonIcon icon={chevronDown} slot="end" />
                  </IonButton>
                </div>

                {/* Suggested formations */}
                {state.currentFormation.players.length > 1 && (
                  <div style={{ marginTop: 12 }}>
                    <IonText color="medium"><p style={{ margin: '8px 0' }}>Suggested formations</p></IonText>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {suggestFormationsByCount(state.currentFormation.players.length).map(f => (
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
                    players={state.players}
                    formation={state.currentFormation}
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
                      className={`save-layout-button ${state.isDirty ? 'dirty' : ''}`}
                      fill="solid"
                      onClick={handleSaveLayout}
                      disabled={isSaveDisabled}
                      color={state.isDirty ? 'success' : 'medium'}
                      strong={state.isDirty}
                    >
                      {state.isSaving ? (
                        <>
                          <IonSpinner name="crescent" />
                          &nbsp;Saving...
                        </>
                      ) : (
                        `Save Layout${state.isDirty ? ' *' : ''}`
                      )}
                    </IonButton>
                  </div>
                </div>

                {/* Player Selection Panel */}
                <div className="player-panel-section">
                  <div className="player-panel-content">
                    <PlayerSelectionPanel
                      players={state.players}
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

        {/* Error Display */}
        {state.error && (
          <div className="error-container">
            <IonText color="danger">
              <p>{state.error}</p>
            </IonText>
          </div>
        )}

        {/* Team Selection Modal */}
        <TeamSelectionModal
          isOpen={state.showTeamModal}
          onDidDismiss={() => setState(prev => ({ ...prev, showTeamModal: false }))}
          onTeamSelect={handleTeamChange}
          selectedTeam={state.selectedTeam?.name || ''}
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
