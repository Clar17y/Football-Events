/**
 * Player Selection Panel Component
 * Displays available players grouped by preferred positions with drag initiation functionality
 * Provides visual indicators for player selection state and supports team roster management
 */

import React, { useState, useCallback, useMemo } from 'react';
import { IonIcon } from '@ionic/react';
import { person, search, chevronDown, chevronUp } from 'ionicons/icons';
import { PlayerWithPosition } from './VisualPitchInterface';
import './PlayerSelectionPanel.css';

interface PlayerSelectionPanelProps {
  players: PlayerWithPosition[];
  onPlayerSelect: (player: PlayerWithPosition) => void;
  onPlayerRemove: (player: PlayerWithPosition) => void;
  selectedPlayers: Set<string>;
  maxPlayers?: number;
  readonly?: boolean;
  searchable?: boolean;
}

interface PositionGroup {
  code: string;
  name: string;
  players: PlayerWithPosition[];
  isExpanded: boolean;
}

// Simplified position grouping - map all positions to 4 main categories
const POSITION_CATEGORY_MAP: Record<string, string> = {
  // Goalkeepers
  'GK': 'Goalkeepers',
  
  // Defenders
  'CB': 'Defenders', 'LCB': 'Defenders', 'RCB': 'Defenders', 'SW': 'Defenders',
  'LB': 'Defenders', 'RB': 'Defenders', 'LWB': 'Defenders', 'RWB': 'Defenders',
  'WB': 'Defenders', 'FB': 'Defenders',
  
  // Midfielders  
  'CDM': 'Midfielders', 'LDM': 'Midfielders', 'RDM': 'Midfielders', 'DM': 'Midfielders',
  'CM': 'Midfielders', 'LCM': 'Midfielders', 'RCM': 'Midfielders',
  'CAM': 'Midfielders', 'LAM': 'Midfielders', 'RAM': 'Midfielders', 'AM': 'Midfielders',
  'LM': 'Midfielders', 'RM': 'Midfielders', 'WM': 'Midfielders',
  
  // Strikers/Forwards
  'LW': 'Strikers', 'RW': 'Strikers', 'LF': 'Strikers', 'RF': 'Strikers',
  'CF': 'Strikers', 'ST': 'Strikers', 'SS': 'Strikers'
};

const CATEGORY_ORDER = ['Goalkeepers', 'Defenders', 'Midfielders', 'Strikers', 'No Position Set'];

const PlayerSelectionPanel: React.FC<PlayerSelectionPanelProps> = ({
  players,
  onPlayerSelect,
  onPlayerRemove,
  selectedPlayers,
  maxPlayers = 11,
  readonly = false,
  searchable = true
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Goalkeepers', 'Defenders', 'Midfielders', 'Strikers']));

  // Filter players based on search term
  const filteredPlayers = useMemo(() => {
    if (!searchTerm.trim()) return players;
    
    const term = searchTerm.toLowerCase();
    return players.filter(player => 
      player.name.toLowerCase().includes(term) ||
      (player.squadNumber && player.squadNumber.toString().includes(term)) ||
      (player.preferredPosition && player.preferredPosition.toLowerCase().includes(term))
    );
  }, [players, searchTerm]);

  // Group filtered players by simplified categories
  const filteredGroupedByCategory = useMemo(() => {
    const grouped: Record<string, PlayerWithPosition[]> = {};
    
    filteredPlayers.forEach(player => {
      const position = player.preferredPosition || 'Unknown';
      const category = POSITION_CATEGORY_MAP[position] || 'Strikers'; // Default unknown positions to Strikers
      
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(player);
    });

    // Sort players within each group by squad number, then by name
    Object.keys(grouped).forEach(category => {
      grouped[category].sort((a, b) => {
        if (a.squadNumber && b.squadNumber) {
          return a.squadNumber - b.squadNumber;
        }
        if (a.squadNumber && !b.squadNumber) return -1;
        if (!a.squadNumber && b.squadNumber) return 1;
        return a.name.localeCompare(b.name);
      });
    });

    return grouped;
  }, [filteredPlayers]);

  // Create category groups with proper ordering
  const categoryGroups = useMemo(() => {
    const groups: PositionGroup[] = [];
    
    // Add categories in order
    CATEGORY_ORDER.forEach(category => {
      const playersInCategory = filteredGroupedByCategory[category] || [];
      if (playersInCategory.length > 0) {
        groups.push({
          code: category,
          name: category,
          players: playersInCategory,
          isExpanded: expandedGroups.has(category)
        });
      }
    });

    return groups;
  }, [filteredGroupedByCategory, expandedGroups]);

  // Handle group expand/collapse
  const toggleGroup = useCallback((categoryCode: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryCode)) {
        newSet.delete(categoryCode);
      } else {
        newSet.add(categoryCode);
      }
      return newSet;
    });
  }, []);

  // Handle player selection/removal
  const handlePlayerClick = useCallback((player: PlayerWithPosition) => {
    if (readonly) return;
    
    const isSelected = selectedPlayers.has(player.id);
    
    if (isSelected) {
      // Player is on pitch - remove them
      onPlayerRemove(player);
    } else {
      // Player is not on pitch - add them if possible
      const selectedCount = selectedPlayers.size;
      const canSelect = selectedCount < maxPlayers;
      
      if (canSelect) {
        onPlayerSelect(player);
      }
    }
  }, [readonly, selectedPlayers, maxPlayers, onPlayerSelect, onPlayerRemove]);

  // Calculate selection stats
  const selectionStats = useMemo(() => {
    const selectedCount = selectedPlayers.size;
    const availableCount = players.length - selectedCount;
    return { selectedCount, availableCount };
  }, [selectedPlayers, players]);

  return (
    <div className="player-selection-panel">
      {/* Header */}
      <div className="panel-header">
        <h3 className="panel-title">
          <IonIcon icon={person} />
          Team Squad
        </h3>
        <div className="selection-stats">
          <span className="selected-count">{selectionStats.selectedCount}/{maxPlayers}</span>
          <span className="available-count">({selectionStats.availableCount} available)</span>
        </div>
      </div>

      {/* Search */}
      {searchable && (
        <div className="search-container">
          <div className="search-input-wrapper">
            <IonIcon icon={search} className="search-icon" />
            <input
              type="text"
              placeholder="Search players..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
      )}

      {/* Player Groups */}
      <div className="player-groups">
        {categoryGroups.length === 0 ? (
          <div className="empty-state">
            <IonIcon icon={person} />
            <p>No players found</p>
            {searchTerm && (
              <button 
                className="clear-search-btn"
                onClick={() => setSearchTerm('')}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          categoryGroups.map(group => (
            <div key={group.code} className="position-group">
              {/* Group Header */}
              <button
                className="group-header"
                onClick={() => toggleGroup(group.code)}
              >
                <div className="group-info">
                  <span className="group-name">{group.name}</span>
                  <span className="group-count">({group.players.length})</span>
                </div>
                <IonIcon 
                  icon={group.isExpanded ? chevronUp : chevronDown} 
                  className="expand-icon"
                />
              </button>

              {/* Group Players */}
              {group.isExpanded && (
                <div className="group-players">
                  {group.players.map(player => {
                    const isSelected = selectedPlayers.has(player.id);
                    const canSelect = !isSelected && selectionStats.selectedCount < maxPlayers;
                    
                    return (
                      <div
                        key={player.id}
                        className={`player-item ${isSelected ? 'selected' : ''} ${!canSelect && !isSelected ? 'disabled' : ''} ${(canSelect || isSelected) ? 'clickable' : ''}`}
                        onClick={() => handlePlayerClick(player)}
                      >
                        {/* Player Avatar */}
                        <div className="player-avatar">
                          {player.squadNumber ? (
                            <span className="squad-number">{player.squadNumber}</span>
                          ) : (
                            <IonIcon icon={person} />
                          )}
                        </div>

                        {/* Player Info */}
                        <div className="player-info">
                          <div className="player-name">{player.name}</div>
                          {player.preferredPosition && (
                            <div className="player-position">{player.preferredPosition}</div>
                          )}
                        </div>

                        {/* Selection Indicator */}
                        <div className="selection-indicator">
                          {isSelected && !readonly && (
                            <div className="remove-hint">Tap to remove</div>
                          )}
                          {isSelected && readonly && (
                            <div className="selected-badge">On Pitch</div>
                          )}
                          {!isSelected && !canSelect && (
                            <div className="disabled-badge">Max Reached</div>
                          )}
                          {!isSelected && canSelect && !readonly && (
                            <div className="click-hint">Tap to add</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      {!readonly && (
        <div className="instructions">
          <p>Tap players to add them to the pitch</p>
          <p>Maximum {maxPlayers} players can be positioned</p>
        </div>
      )}
    </div>
  );
};

export default PlayerSelectionPanel;