import React, { useEffect, useRef, useState } from 'react';
import { 
  IonPage, 
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonFab,
  IonFabButton,
  IonSearchbar,
  IonGrid,
  IonRow,
  IonCol,
  IonChip,
  IonSkeletonText,
  IonRefresher,
  IonRefresherContent,
  IonActionSheet,
  IonAlert,
  IonSpinner
} from '@ionic/react';
import { 
  add, 
  person, 
  ellipsisVertical,
  pencil,
  trash,
  statsChart,
  refresh,
  people,
  shirt,
  close,
  chevronDown,
  chevronUp,
  shield,
  checkmark,
  football,
  trophy,
  eye,
  flash
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import GuestBanner from '../components/GuestBanner';
import CreatePlayerModal from '../components/CreatePlayerModal';
import TeamSelectionModal from '../components/TeamSelectionModal';
import ContextMenu, { type ContextMenuItem } from '../components/ContextMenu';
import { usePlayers } from '../hooks/usePlayers';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import { teamsApi } from '../services/api/teamsApi';
import type { Player, Team } from '@shared/types';
import './PageStyles.css';
import './PlayersPage.css';
import type { HTMLIonContentElement } from '@ionic/core/components';
import useDeepLinkScrollHighlight from '../hooks/useDeepLinkScrollHighlight';

interface PlayersPageProps {
  onNavigate?: (page: string) => void;
  initialTeamFilter?: {
    teamId: string;
    teamName: string;
  };
}

const PlayersPage: React.FC<PlayersPageProps> = ({ onNavigate, initialTeamFilter }) => {
  const {
    players,
    loading,
    error,
    total,
    loadPlayers,
    deletePlayer,
    refreshPlayers,
    clearError
  } = usePlayers();

  // Local state
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<HTMLElement | null>(null);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [showTeamModal, setShowTeamModal] = useState(false);
  
  // Team filtering state
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string | null>(
    initialTeamFilter?.teamId || null
  );
  const [teamFilterName, setTeamFilterName] = useState<string>(
    initialTeamFilter?.teamName || ''
  );
  // New multi-team filter state
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectedTeamNames, setSelectedTeamNames] = useState<string[]>([]);
  const [filterNoTeam, setFilterNoTeam] = useState<boolean>(false);
  const contentRef = useRef<HTMLIonContentElement | null>(null);

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    'no-position': false,
    'goalkeeper': false,
    'defender': false,
    'midfielder': false,
    'forward': false
  });

  // Debounced search functionality
  const { searchText, setSearchText, showSpinner } = useDebouncedSearch({
    delay: 300,
    onSearch: async (searchTerm: string) => {
      await loadPlayers({
        search: searchTerm || undefined,
        teamId: selectedTeamFilter || undefined
      });
    }
  });

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  // Load players on mount with initial team filter
  useEffect(() => {
    loadPlayers({
      teamId: selectedTeamFilter || undefined,
      teamIds: selectedTeamIds.length > 0 ? selectedTeamIds : undefined,
      noTeam: filterNoTeam || undefined
    });
  }, [selectedTeamFilter, selectedTeamIds, filterNoTeam]); // Remove loadPlayers from dependencies

  // Load teams for player team assignments
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const response = await teamsApi.getTeams({ limit: 100 });
        const teamsMap: Record<string, Team> = {};
        response.data.forEach(team => {
          teamsMap[team.id] = team;
        });
        setTeams(teamsMap);
      } catch (error) {
        console.error('Failed to load teams:', error);
      }
    };

    loadTeams();
  }, []);

  // Handle refresh
  const handleRefresh = async (event: CustomEvent) => {
    await loadPlayers({
      search: searchText.trim() || undefined,
      teamId: selectedTeamFilter || undefined
    });
    event.detail.complete();
  };

  // Clear team filter
  const clearTeamFilter = () => {
    setSelectedTeamFilter(null);
    setTeamFilterName('');
    setSelectedTeamIds([]);
    setSelectedTeamNames([]);
    setFilterNoTeam(false);
    // Remove from URL params
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('teamId');
      url.searchParams.delete('teamIds');
      url.searchParams.delete('teamName');
      url.searchParams.delete('noTeam');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const openTeamSelector = () => setShowTeamModal(true);

  const handleTeamSelectedFromModal = (teamName: string, teamId?: string) => {
    // For single-select backward compatibility
    if (teamId && teamName && selectedTeamIds.length === 0) {
      setSelectedTeamFilter(teamId);
      setTeamFilterName(teamName);
      setSelectedTeamIds([teamId]);
      setSelectedTeamNames([teamName]);
    }
    // Persist to URL for multi-select
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (selectedTeamIds.length > 0) {
        url.searchParams.set('teamIds', selectedTeamIds.join(','));
        url.searchParams.delete('teamId');
        url.searchParams.delete('teamName');
      }
      window.history.replaceState({}, '', url.toString());
    }
    setShowTeamModal(false);
  };

  // Handle ellipses click to show context menu
  const handlePlayerEllipsesClick = (event: React.MouseEvent, player: Player) => {
    event.stopPropagation();
    const buttonElement = event.currentTarget as HTMLElement;
    setContextMenuAnchor(buttonElement);
    setSelectedPlayer(player);
    setShowContextMenu(true);
  };

  // Define player context menu items
  const playerContextItems: ContextMenuItem[] = [
    {
      text: 'Edit player',
      icon: pencil,
      action: 'edit',
      color: 'primary'
    },
    {
      text: 'View statistics',
      icon: statsChart,
      action: 'stats',
      color: 'medium'
    },
    {
      text: 'Manage team',
      icon: people,
      action: 'team',
      color: 'medium'
    },
    {
      text: 'Delete player',
      icon: trash,
      action: 'delete',
      color: 'danger'
    }
  ];

  // Handle context menu actions
  const handlePlayerContextAction = (action: string) => {
    if (!selectedPlayer) return;
    
    switch (action) {
      case 'edit':
        handleEditPlayer(selectedPlayer);
        break;
      case 'delete':
        setShowDeleteAlert(true);
        break;
      case 'stats':
        // TODO: Navigate to player stats
        console.log('View stats for player:', selectedPlayer);
        break;
      case 'team':
        // TODO: Navigate to player team management
        console.log('Manage team for player:', selectedPlayer);
        break;
    }
  };

  const handleCreatePlayer = () => {
    setCreateModalOpen(true);
  };

  const handleEditPlayer = (player: Player) => {
    setEditPlayer(player);
    setEditModalOpen(true);
  };

  const handleCloseCreateModal = () => {
    setCreateModalOpen(false);
    refreshPlayers(); // Refresh the list after creating
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditPlayer(null);
    refreshPlayers(); // Refresh the list after editing
  };

  // Deep-link: use shared hook to scroll/highlight players by ?playerId=...
  useDeepLinkScrollHighlight({
    param: 'playerId',
    itemAttr: 'data-player-id',
    listSelector: '.players-grid',
    contentRef,
    ready: !loading && players.length > 0,
    offset: 80,
  });

  ;

  // Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (selectedPlayer) {
      const success = await deletePlayer(selectedPlayer.id);
      if (success) {
        setSelectedPlayer(null);
      }
    }
    setShowDeleteAlert(false);
  };

  // Get position category for color coding
  const getPositionCategory = (position: string): 'goalkeeper' | 'defender' | 'midfielder' | 'forward' => {
    const goalkeepers = ['GK'];
    const defenders = ['CB', 'RCB', 'LCB', 'SW', 'RB', 'LB', 'RWB', 'LWB', 'WB', 'FB'];
    const midfielders = ['CDM', 'RDM', 'LDM', 'CM', 'RCM', 'LCM', 'CAM', 'RAM', 'LAM', 'RM', 'LM', 'RW', 'LW', 'AM', 'DM', 'WM'];
    const forwards = ['RF', 'LF', 'CF', 'ST', 'SS'];
    
    if (goalkeepers.includes(position)) return 'goalkeeper';
    if (defenders.includes(position)) return 'defender';
    if (midfielders.includes(position)) return 'midfielder';
    if (forwards.includes(position)) return 'forward';
    return 'midfielder'; // default
  };

  // Group players by position category
  const groupPlayersByPosition = () => {
    const groups = {
      'no-position': [] as Player[],
      'goalkeeper': [] as Player[],
      'defender': [] as Player[],
      'midfielder': [] as Player[],
      'forward': [] as Player[]
    };

    players.forEach(player => {
      if (!player.preferredPosition) {
        groups['no-position'].push(player);
      } else {
        const category = getPositionCategory(player.preferredPosition);
        groups[category].push(player);
      }
    });

    return groups;
  };

  // Toggle section collapse
  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Render position-specific statistics
  const renderPositionSpecificStats = (player: Player) => {
    const positionCategory = player.preferredPosition ? getPositionCategory(player.preferredPosition) : null;
    const matches = player.stats?.matches || 0;
    const goals = player.stats?.goals || 0;
    const assists = player.stats?.assists || 0;
    const saves = player.stats?.saves || 0;
    const tackles = player.stats?.tackles || 0;
    const interceptions = player.stats?.interceptions || 0;
    const keyPasses = player.stats?.keyPasses || 0;
    const cleanSheets = player.stats?.cleanSheets || 0;
    
    // Using real data for all event-based stats, only clean sheets still needs implementation
    switch (positionCategory) {
      case 'goalkeeper':
        return (
          <>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={statsChart} />
              <span>{matches} match{matches !== 1 ? 'es' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={checkmark} />
              <span>{saves} save{saves !== 1 ? 's' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={shield} />
              <span>{cleanSheets} clean sheet{cleanSheets !== 1 ? 's' : ''}</span>
            </IonChip>
          </>
        );
      
      case 'defender':
        return (
          <>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={statsChart} />
              <span>{matches} match{matches !== 1 ? 'es' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={eye} />
              <span>{interceptions} interception{interceptions !== 1 ? 's' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={shield} />
              <span>{cleanSheets} clean sheet{cleanSheets !== 1 ? 's' : ''}</span>
            </IonChip>
          </>
        );
      
      case 'midfielder':
        return (
          <>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={statsChart} />
              <span>{matches} match{matches !== 1 ? 'es' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={trophy} />
              <span>{assists} assist{assists !== 1 ? 's' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={eye} />
              <span>{keyPasses} key pass{keyPasses !== 1 ? 'es' : ''}</span>
            </IonChip>
          </>
        );
      
      case 'forward':
        return (
          <>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={statsChart} />
              <span>{matches} match{matches !== 1 ? 'es' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={football} />
              <span>{goals} goal{goals !== 1 ? 's' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={trophy} />
              <span>{assists} assist{assists !== 1 ? 's' : ''}</span>
            </IonChip>
          </>
        );
      
      default:
        // Players without position - show generic stats
        return (
          <>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={statsChart} />
              <span>{matches} match{matches !== 1 ? 'es' : ''}</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={football} />
              <span>{goals} goal{goals !== 1 ? 's' : ''}</span>
            </IonChip>
          </>
        );
    }
  };

  // Render player card
  const renderPlayerCard = (player: Player) => {
    const currentTeam = player.currentTeam ? teams[player.currentTeam] : null;
    const positionCategory = player.preferredPosition ? getPositionCategory(player.preferredPosition) : null;
    
    return (
        <IonCol size="12" sizeMd="6" sizeLg="4" key={player.id}>
          <div className="player-card-wrapper">
          <IonCard className={`player-card ${positionCategory ? `player-card-${positionCategory}` : 'player-card-default'}`}
            data-player-id={player.id}
            tabIndex={-1}
          >
          {/* Position stripe */}
          <div className="player-position-stripe"></div>
          
          <IonCardContent className="player-card-content">
            <div className="player-header">
              <div className="player-info">
                <div className="player-name-section">
                  {player.squadNumber && (
                    <div className="player-jersey-number">
                      {player.squadNumber}
                    </div>
                  )}
                  <h3 className="player-name">{player.name}</h3>
                </div>
                {player.preferredPosition && (
                  <p className="player-position">{player.preferredPosition}</p>
                )}
              </div>
              <div className="player-actions">
                <IonButton
                  fill="clear"
                  size="small"
                  className="player-menu-button"
                  onClick={(e) => handlePlayerEllipsesClick(e, player)}
                >
                  <IonIcon icon={ellipsisVertical} />
                </IonButton>
              </div>
            </div>

            <div className="player-details">
              {currentTeam && (
                <div className="player-team-info">
                  <IonChip className="player-team-chip" color="medium">
                    <IonIcon icon={people} />
                    <span>{currentTeam.name}</span>
                  </IonChip>
                </div>
              )}
              
              <div className="player-stats">
                {renderPositionSpecificStats(player)}
              </div>
            </div>
          </IonCardContent>
          </IonCard>
          </div>
        </IonCol>
    );
  };

  // Render section header
  const renderSectionHeader = (sectionKey: string, title: string, count: number, icon: string) => {
    const isCollapsed = collapsedSections[sectionKey];
    
    return (
      <div className="position-section-header" onClick={() => toggleSection(sectionKey)}>
        <div className="section-header-content">
          <IonIcon icon={icon} className="section-icon" />
          <h3 className="section-title">{title} ({count})</h3>
        </div>
        <IonIcon 
          icon={isCollapsed ? chevronDown : chevronUp} 
          className="section-chevron"
        />
      </div>
    );
  };

  // Render position section
  const renderPositionSection = (sectionKey: string, title: string, players: Player[], icon: string) => {
    if (players.length === 0) return null; // Don't show empty sections
    
    const isCollapsed = collapsedSections[sectionKey];
    
    return (
      <div key={sectionKey} className="position-section">
        {renderSectionHeader(sectionKey, title, players.length, icon)}
        {!isCollapsed && (
      <IonGrid className="section-grid players-grid">
        <IonRow>
              {players.map(renderPlayerCard)}
            </IonRow>
          </IonGrid>
        )}
      </div>
    );
  };

  // Render loading skeleton
  const renderPlayerSkeleton = (index: number) => (
    <IonCol size="12" sizeMd="6" sizeLg="4" key={`skeleton-${index}`}>
      <IonCard className="player-card player-skeleton">
        {/* Position stripe for skeleton */}
        <div className="player-position-stripe"></div>
        
        <IonCardContent className="player-skeleton-content">
          <div className="skeleton-header">
            <IonSkeletonText animated className="skeleton-jersey" />
            <IonSkeletonText animated className="skeleton-name" />
          </div>
          <IonSkeletonText animated className="skeleton-position" />
          <IonSkeletonText animated className="skeleton-team" />
        </IonCardContent>
      </IonCard>
    </IonCol>
  );

  return (
    <IonPage className="page" data-theme="player">
      <PageHeader onNavigate={navigate} />
      
      <IonContent ref={contentRef}>
        <GuestBanner teamId={selectedTeamFilter || undefined} />
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent
            pullingIcon={refresh}
            pullingText="Pull to refresh players"
            refreshingSpinner="circles"
            refreshingText="Loading players..."
          />
        </IonRefresher>

        {/* Header Section */}
        <div className="players-header">
          <div className="players-title-section">
            <div className="page-header-with-color">
              <h1 className="players-main-title">Players</h1>
            </div>
            <p className="players-subtitle">
              Manage individual player profiles and track their progress.
              {total > 0 && (
                <span className="players-count"> {total} player{total !== 1 ? 's' : ''} registered</span>
              )}
            </p>
          </div>

          <div className="search-container players-search-with-filter">
            <IonSearchbar
              value={searchText}
              onIonInput={(e) => setSearchText(e.detail.value!)}
              placeholder="Search players by name..."
              showClearButton="focus"
              className="players-search"
            />
            {showSpinner && (
              <div className={`search-loading ${showSpinner ? 'visible' : ''}`}>
                <IonSpinner name="dots" />
              </div>
            )}
            <div className="team-filter-inline team-filter-inline-rounded">
              <IonButton className="team-filter-button" color="indigo" fill="outline" size="small" onClick={openTeamSelector}>
                <IonIcon icon={people} slot="start" />
                {selectedTeamNames.length > 0 ? `${selectedTeamNames.length} team${selectedTeamNames.length !== 1 ? 's' : ''}` : 'Filter by team'}
                <IonIcon icon={chevronDown} slot="end" />
              </IonButton>
            </div>
          </div>

          {/* Team Filter Chip (secondary clear option) */}
          {selectedTeamFilter && (
            <div className="filter-chips">
              <IonChip color="primary" outline onClick={clearTeamFilter}>
                <IonIcon icon={people} />
                <span>{teamFilterName}</span>
                <IonIcon icon={close} />
              </IonChip>
            </div>
          )}
        </div>

        {/* Players Grid */}
        <div className="players-content">
          {loading && players.length === 0 ? (
            <IonGrid>
              <IonRow>
                {Array.from({ length: 6 }, (_, index) => renderPlayerSkeleton(index))}
              </IonRow>
            </IonGrid>
          ) : players.length > 0 ? (
            <div className="players-sections">
              {(() => {
                const groupedPlayers = groupPlayersByPosition();
                return (
                  <>
                    {renderPositionSection('no-position', 'Position Not Set', groupedPlayers['no-position'], person)}
                    {renderPositionSection('goalkeeper', 'Goalkeepers', groupedPlayers['goalkeeper'], person)}
                    {renderPositionSection('defender', 'Defenders', groupedPlayers['defender'], person)}
                    {renderPositionSection('midfielder', 'Midfielders', groupedPlayers['midfielder'], person)}
                    {renderPositionSection('forward', 'Forwards', groupedPlayers['forward'], person)}
                  </>
                );
              })()}
            </div>
          ) : (
            <div className="empty-state">
              <IonIcon icon={person} className="empty-icon" />
              <h2 className="empty-title">No Players Yet</h2>
              <p className="empty-subtitle">
                {searchText && selectedTeamFilter
                  ? `No players found in "${teamFilterName}" matching "${searchText}". Try a different search term or clear filters.`
                  : searchText 
                  ? `No players found matching "${searchText}". Try a different search term.`
                  : selectedTeamFilter
                  ? `No players found in "${teamFilterName}". This team doesn't have any players assigned yet.`
                  : 'Start building your team by adding your first player. Track their progress, manage positions, and celebrate their achievements.'
                }
              </p>
              {!searchText && !selectedTeamFilter && (
                <IonButton 
                  expand="block"
                  color="indigo"
                  className="empty-action"
                  onClick={handleCreatePlayer}
                >
                  <IonIcon icon={add} slot="start" />
                  Create Your First Player
                </IonButton>
              )}
            </div>
          )}
        </div>

        {/* Floating Action Button */}
        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton 
            color="indigo"
            onClick={handleCreatePlayer}
          >
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>

        {/* Team Selection Modal */}
        <TeamSelectionModal
          isOpen={showTeamModal}
          onDidDismiss={() => setShowTeamModal(false)}
          onTeamSelect={(name, id) => {
            if (!name) {
              // Toggle No Team filter
              const next = !filterNoTeam;
              setFilterNoTeam(next);
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                if (next) url.searchParams.set('noTeam', 'true');
                else url.searchParams.delete('noTeam');
                window.history.replaceState({}, '', url.toString());
              }
              return;
            }
            if (id) {
              // Toggle selection
              const idx = selectedTeamIds.indexOf(id);
              const ids = [...selectedTeamIds];
              const names = [...selectedTeamNames];
              if (idx >= 0) {
                ids.splice(idx, 1);
                const nIdx = names.indexOf(name);
                if (nIdx >= 0) names.splice(nIdx, 1);
              } else {
                ids.push(id);
                if (!names.includes(name)) names.push(name);
              }
              setSelectedTeamIds(ids);
              setSelectedTeamNames(names);
              // Update URL
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                if (ids.length > 0) {
                  url.searchParams.set('teamIds', ids.join(','));
                } else {
                  url.searchParams.delete('teamIds');
                }
                window.history.replaceState({}, '', url.toString());
              }
            }
          }}
          selectedTeams={selectedTeamNames}
          noTeamSelected={filterNoTeam}
          noTeamLabel="Players without an active team"
          title="Filter by team"
          allowMultiple={true}
        />

        {/* Player Context Menu */}
        {showContextMenu && contextMenuAnchor && (
          <ContextMenu
            isOpen={showContextMenu}
            onClose={() => setShowContextMenu(false)}
            title={selectedPlayer?.name || ''}
            anchorElement={contextMenuAnchor}
            items={playerContextItems}
            onAction={handlePlayerContextAction}
            className="player-theme"
          />
        )}

        {/* Delete Confirmation Alert */}
        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Delete Player"
          message={`Are you sure you want to delete ${selectedPlayer?.name}? This action cannot be undone.`}
          buttons={[
            {
              text: 'Cancel',
              role: 'cancel'
            },
            {
              text: 'Delete',
              role: 'destructive',
              handler: handleDeleteConfirm
            }
          ]}
        />

        {/* Create Player Modal */}
        <CreatePlayerModal
          isOpen={createModalOpen}
          onDidDismiss={handleCloseCreateModal}
          mode="create"
        />

        {/* Edit Player Modal */}
        <CreatePlayerModal
          isOpen={editModalOpen}
          onDidDismiss={handleCloseEditModal}
          editPlayer={editPlayer}
          mode="edit"
        />
      </IonContent>
    </IonPage>
  );
};

export default PlayersPage;
