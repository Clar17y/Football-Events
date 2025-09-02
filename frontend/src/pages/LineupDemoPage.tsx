/**
 * Temporary demo page for VisualPitchInterface component
 * This will be replaced by the full LineupManagementPage later
 */

import React, { useMemo, useState } from 'react';
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonButtons,
  IonBackButton,
  IonText
} from '@ionic/react';
import { VisualPitchInterface, PlayerSelectionPanel, PlayerWithPosition, FormationData, PitchPosition } from '../components/lineup';
import PositionSelectorModal from '../components/lineup/PositionSelectorModal';
import './LineupDemoPage.css';

const LineupDemoPage: React.FC = () => {
  // Sample players for demo (covering many preferred positions)
  const [players] = useState<PlayerWithPosition[]>([
    { id: '1',  name: 'John Keeper',    squadNumber: 1,  preferredPosition: 'GK' },
    { id: '2',  name: 'Sam Right CB',   squadNumber: 2,  preferredPosition: 'RCB' },
    { id: '3',  name: 'Leo Left CB',    squadNumber: 3,  preferredPosition: 'LCB' },
    { id: '4',  name: 'Clare Sweeper',  squadNumber: 4,  preferredPosition: 'SW' },
    { id: '5',  name: 'Rita Right Back',squadNumber: 5,  preferredPosition: 'RB' },
    { id: '6',  name: 'Lara Left Back', squadNumber: 6,  preferredPosition: 'LB' },
    { id: '7',  name: 'Ryan RWB',       squadNumber: 7,  preferredPosition: 'RWB' },
    { id: '8',  name: 'Liam LWB',       squadNumber: 8,  preferredPosition: 'LWB' },
    { id: '9',  name: 'Drew RDM',       squadNumber: 14, preferredPosition: 'RDM' },
    { id: '10', name: 'Dana LDM',       squadNumber: 12, preferredPosition: 'LDM' },
    { id: '11', name: 'Mike Mid',       squadNumber: 8,  preferredPosition: 'CM' },
    { id: '12', name: 'Rory RCM',       squadNumber: 15, preferredPosition: 'RCM' },
    { id: '13', name: 'Liam LCM',       squadNumber: 16, preferredPosition: 'LCM' },
    { id: '14', name: 'Cami CAM',       squadNumber: 10, preferredPosition: 'CAM' },
    { id: '15', name: 'Rae RAM',        squadNumber: 18, preferredPosition: 'RAM' },
    { id: '16', name: 'Lee LAM',        squadNumber: 19, preferredPosition: 'LAM' },
    { id: '17', name: 'Remy RM',        squadNumber: 20, preferredPosition: 'RM' },
    { id: '18', name: 'Lara LM',        squadNumber: 21, preferredPosition: 'LM' },
    { id: '19', name: 'Rex RW',         squadNumber: 11, preferredPosition: 'RW' },
    { id: '20', name: 'Liv LW',         squadNumber: 17, preferredPosition: 'LW' },
    { id: '21', name: 'Ray RF',         squadNumber: 22, preferredPosition: 'RF' },
    { id: '22', name: 'Lou LF',         squadNumber: 23, preferredPosition: 'LF' },
    { id: '23', name: 'Chris CF',       squadNumber: 9,  preferredPosition: 'CF' },
    { id: '24', name: 'Sara Striker',   squadNumber: 13, preferredPosition: 'ST' },
    { id: '25', name: 'Sid Second ST',  squadNumber: 24, preferredPosition: 'SS' },
    { id: '26', name: 'Andy AM',        squadNumber: 25, preferredPosition: 'AM' },
    { id: '27', name: 'Dylan DM',       squadNumber: 26, preferredPosition: 'DM' },
    { id: '28', name: 'Whit WM',        squadNumber: 27, preferredPosition: 'WM' },
    { id: '29', name: 'Wes WB',         squadNumber: 28, preferredPosition: 'WB' },
    { id: '30', name: 'Finn FB',        squadNumber: 29, preferredPosition: 'FB' },
    { id: '31', name: 'Alex Unknown',   squadNumber: 31 }, // No preferred position
    { id: '32', name: 'Jordan Flex',    squadNumber: 32 }, // No preferred position
  ]);

  const [formation, setFormation] = useState<FormationData>({
    players: [
      { ...players[0], position: { x: 10, y: 50 } }, // GK
      { ...players[1], position: { x: 25, y: 50 } }, // CB
      { ...players[2], position: { x: 50, y: 50 } }, // CM
    ]
  });

  const [readonly, setReadonly] = useState(false);
  const [computedFormation, setComputedFormation] = useState<string>('');
  const [showPlayerPanel, setShowPlayerPanel] = useState(true);
  
  // Position selector modal state
  const [showPositionModal, setShowPositionModal] = useState(false);
  const [selectedPlayerForPosition, setSelectedPlayerForPosition] = useState<PlayerWithPosition | null>(null);

  // Simple heuristic formation detector from current on-pitch positions
  const computeFormationString = (onPitch: PlayerWithPosition[]): string => {
    const withPos = onPitch.filter(p => p.position);
    if (withPos.length === 0) return '';
    // Identify GK by deep x position (left goal). Others are outfield
    const isGK = (p: PlayerWithPosition) => (p.position!.x <= 12 && p.position!.y >= 35 && p.position!.y <= 65);
    const outfield = withPos.filter(p => !isGK(p));
    // Bin by x (left→right = defense→attack)
    let D = 0, DM = 0, AM = 0, F = 0;
    outfield.forEach(p => {
      const x = p.position!.x;
      if (x < 36) D += 1;           // defenders line
      else if (x < 50) DM += 1;     // deep mids
      else if (x < 70) AM += 1;     // advanced mids
      else F += 1;                  // forwards
    });
    // Prefer 4-line if both DM and AM have players
    const parts = (DM > 0 && AM > 0) ? [D, DM, AM, F] : [D, DM + AM, F];
    // Hide any zeros (e.g., 2-0-2 => 2-2)
    const filtered = parts.filter(n => n > 0);
    return filtered.join('-');
  };

  const handlePlayerMove = (playerId: string, position: PitchPosition) => {
    setFormation(prev => ({
      players: prev.players.map(player =>
        player.id === playerId ? { ...player, position } : player
      )
    }));
    // Optionally live-update computed formation
    // setComputedFormation(computeFormationString([...formation.players.map(p => p.id === playerId ? { ...p, position } : p)] as any));
  };

  const handlePlayerRemove = (playerId: string) => {
    setFormation(prev => ({
      players: prev.players.filter(player => player.id !== playerId)
    }));
  };

  const addPlayerToPitch = (player: PlayerWithPosition) => {
    // Enforce max 11 on pitch
    if (formation.players.length >= 11) return;
    // Prefer player's preferred position if available; otherwise center
    const preferred = (player as any).preferred_pos ?? player.preferredPosition;

    const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
    const chooseByPreferred = (code?: string): PitchPosition => {
      switch ((code || '').toUpperCase()) {
        case 'GK':
          return { x: 6, y: 50 };
        case 'LB':
          return { x: 20, y: 18 };
        case 'RB':
          return { x: 20, y: 82 };
        case 'RCB':
          return { x: 22, y: 60 };
        case 'LCB':
          return { x: 22, y: 40 };
        case 'LWB':
          return { x: 34, y: 22 };
        case 'RWB':
          return { x: 34, y: 78 };
        case 'CB':
          return { x: 22, y: 50 };
        case 'SW':
          return { x: 14, y: 50 };
        case 'CDM':
          return { x: 42, y: 50 };
        case 'RDM':
          return { x: 42, y: 60 };
        case 'LDM':
          return { x: 42, y: 40 };
        case 'CM':
          return { x: 54, y: 50 };
        case 'RCM':
          return { x: 54, y: 60 };
        case 'LCM':
          return { x: 54, y: 40 };
        case 'CAM':
          return { x: 66, y: 50 };
        case 'RAM':
          return { x: 66, y: 60 };
        case 'LAM':
          return { x: 66, y: 40 };
        case 'LM':
          return { x: 52, y: 22 };
        case 'RM':
          return { x: 52, y: 78 };
        case 'LW':
          return { x: 85, y: 22 };
        case 'RW':
          return { x: 85, y: 78 };
        case 'RF':
          return { x: 86, y: 60 };
        case 'LF':
          return { x: 86, y: 40 };
        case 'CF':
          return { x: 84, y: 50 };
        case 'ST':
          return { x: 92, y: 50 };
        case 'SS':
          return { x: 76, y: 50 };
        case 'AM':
          return { x: 66, y: 50 };
        case 'DM':
          return { x: 42, y: 50 };
        case 'WM':
          return { x: 52, y: 50 };
        case 'WB':
          return { x: 34, y: 50 };
        case 'FB':
          return { x: 20, y: 50 };
        default:
          return { x: 50, y: 50 };
      }
    };

    const pos = chooseByPreferred(preferred);
    const newPlayer = { ...player, position: { x: clamp(pos.x), y: clamp(pos.y) } };
    setFormation(prev => ({ players: [...prev.players, newPlayer] }));
  };

  const availablePlayers = players.filter(player => 
    !formation.players.some(fp => fp.id === player.id)
  );

  // Get selected players (those on the pitch)
  const selectedPlayers = useMemo(() => {
    return new Set(formation.players.map(p => p.id));
  }, [formation.players]);

  const handlePlayerSelect = (player: PlayerWithPosition) => {
    // Use the existing addPlayerToPitch function
    addPlayerToPitch(player);
  };

  const handlePlayerRemoveFromPanel = (player: PlayerWithPosition) => {
    // Remove player from formation
    setFormation(prev => ({
      players: prev.players.filter(p => p.id !== player.id)
    }));
  };

  const handleComputeFormation = () => {
    setComputedFormation(computeFormationString(formation.players));
  };

  // Position selector modal handlers
  const handleShowPositionSelector = (player: PlayerWithPosition) => {
    setSelectedPlayerForPosition(player);
    setShowPositionModal(true);
  };

  const handlePositionSelect = (positionCode: string) => {
    if (selectedPlayerForPosition) {
      console.log(`Selected position ${positionCode} for player ${selectedPlayerForPosition.name}`);
      // In a real implementation, this would update the player's position or create a substitution
    }
    setShowPositionModal(false);
    setSelectedPlayerForPosition(null);
  };

  const handleClosePositionModal = () => {
    setShowPositionModal(false);
    setSelectedPlayerForPosition(null);
  };

  return (
    <IonPage data-theme="player">
      <IonHeader>
        <IonToolbar color="indigo">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/home" />
          </IonButtons>
          <IonTitle>Lineup Demo</IonTitle>
          <IonButtons slot="end">
            <IonButton 
              fill="clear" 
              onClick={() => setShowPlayerPanel(!showPlayerPanel)}
            >
              {showPlayerPanel ? 'Hide Panel' : 'Show Panel'}
            </IonButton>
            <IonButton 
              fill="clear" 
              onClick={() => setReadonly(!readonly)}
            >
              {readonly ? 'Edit' : 'View'}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="lineup-demo-content">
        <div className="demo-container">
          <div className="demo-header">
            <IonText>
              <h2>Lineup Management Demo</h2>
              <p>
                {readonly 
                  ? 'Viewing mode - players cannot be moved or removed'
                  : showPlayerPanel 
                    ? 'Tap players from the panel below to add them to the pitch. Tap selected players to remove them.'
                    : 'Drag players to position them on the pitch. Click the × to remove players.'
                }
              </p>
            </IonText>
          </div>

          <div className="demo-layout">
            <div className="pitch-section">
              <VisualPitchInterface
                players={players}
                formation={formation}
                onPlayerMove={handlePlayerMove}
                onPlayerRemove={handlePlayerRemove}
                readonly={readonly}
                maxPlayers={11}
              />
            </div>
            
            {showPlayerPanel && (
              <div className="player-panel-section">
                <PlayerSelectionPanel
                  players={players}
                  onPlayerSelect={handlePlayerSelect}
                  onPlayerRemove={handlePlayerRemoveFromPanel}
                  selectedPlayers={selectedPlayers}
                  maxPlayers={11}
                  readonly={readonly}
                  searchable={true}
                />
              </div>
            )}
          </div>

          {!readonly && availablePlayers.length > 0 && (
            <div className="available-players">
              <IonText>
                <h3>Available Players</h3>
                <p>Click to add to pitch:</p>
              </IonText>
              <div className="player-buttons">
                {availablePlayers.map(player => (
                  <IonButton
                    key={player.id}
                    fill="outline"
                    size="small"
                    onClick={() => addPlayerToPitch(player)}
                    disabled={formation.players.length >= 11}
                  >
                    {player.squadNumber} - {player.name} ({player.preferredPosition})
                  </IonButton>
                ))}
              </div>
            </div>
          )}

          <div className="demo-info">
            <IonText color="medium">
              <h4>Features Demonstrated:</h4>
              <ul>
                <li>SVG-based football pitch with proper proportions</li>
                <li>Player selection panel with position grouping</li>
                <li>Position selector modal with visual pitch previews</li>
                <li>Click-to-add functionality for easy player selection</li>
                <li>Drag and drop functionality for player positioning</li>
                <li>Real-time position feedback and zone highlighting</li>
                <li>Player search and filtering</li>
                <li>Touch and mouse event handling</li>
                <li>Player removal functionality</li>
                <li>Selection state management</li>
                <li>Readonly mode support</li>
                <li>Player count indicator</li>
                <li>Keyboard navigation and accessibility</li>
                <li>Responsive design</li>
              </ul>
              <div style={{ marginTop: 12 }}>
                <IonButton size="small" onClick={handleComputeFormation}>
                  Generate Formation
                </IonButton>
                {computedFormation && (
                  <p style={{ marginTop: 8 }}>
                    Detected Formation: <strong>{computedFormation}</strong>
                  </p>
                )}
              </div>
              
              <div style={{ marginTop: 12 }}>
                <h5>Position Selector Modal Demo:</h5>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {players.slice(0, 5).map(player => (
                    <IonButton
                      key={player.id}
                      size="small"
                      fill="outline"
                      onClick={() => handleShowPositionSelector(player)}
                    >
                      Select Position for {player.name}
                    </IonButton>
                  ))}
                </div>
              </div>
            </IonText>
          </div>
        </div>
        
        {/* Position Selector Modal */}
        <PositionSelectorModal
          isOpen={showPositionModal}
          onClose={handleClosePositionModal}
          onPositionSelect={handlePositionSelect}
          playerName={selectedPlayerForPosition?.name || ''}
          availablePositions={['GK', 'CB', 'LB', 'RB', 'CM', 'LM', 'RM', 'CAM', 'ST']} // Demo with limited positions
        />
      </IonContent>
    </IonPage>
  );
};

export default LineupDemoPage;
