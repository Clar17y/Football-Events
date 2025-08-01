import React, { useEffect, useState } from 'react';
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
  IonAlert
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
  shirt
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import CreatePlayerModal from '../components/CreatePlayerModal';
import ContextMenu, { type ContextMenuItem } from '../components/ContextMenu';
import { usePlayers } from '../hooks/usePlayers';
import { teamsApi } from '../services/api/teamsApi';
import type { Player, Team } from '@shared/types';
import './PageStyles.css';
import './PlayersPage.css';

interface PlayersPageProps {
  onNavigate?: (page: string) => void;
}

const PlayersPage: React.FC<PlayersPageProps> = ({ onNavigate }) => {
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
  const [searchText, setSearchText] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuAnchor, setContextMenuAnchor] = useState<HTMLElement | null>(null);
  const [teams, setTeams] = useState<Record<string, Team>>({});
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  // Load players on mount
  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

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

  // Handle search
  const handleSearch = async (value: string) => {
    setSearchText(value);
    await loadPlayers({ search: value.trim() || undefined });
  };

  // Handle refresh
  const handleRefresh = async (event: CustomEvent) => {
    await refreshPlayers();
    event.detail.complete();
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

  // Render player card
  const renderPlayerCard = (player: Player) => {
    const currentTeam = player.currentTeam ? teams[player.currentTeam] : null;
    
    return (
      <IonCol size="12" sizeMd="6" sizeLg="4" key={player.id}>
        <IonCard className="player-card">
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
                <IonChip color="medium" className="stat-chip">
                  <IonIcon icon={statsChart} />
                  <span>0 matches</span>
                </IonChip>
                <IonChip color="medium" className="stat-chip">
                  <IonIcon icon={shirt} />
                  <span>0 goals</span>
                </IonChip>
              </div>
            </div>
          </IonCardContent>
        </IonCard>
      </IonCol>
    );
  };

  // Render loading skeleton
  const renderPlayerSkeleton = (index: number) => (
    <IonCol size="12" sizeMd="6" sizeLg="4" key={`skeleton-${index}`}>
      <IonCard className="player-skeleton">
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
      
      <IonContent>
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

          <IonSearchbar
            value={searchText}
            onIonInput={(e) => handleSearch(e.detail.value!)}
            placeholder="Search players by name..."
            showClearButton="focus"
            className="players-search"
          />
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
            <IonGrid>
              <IonRow>
                {players.map(renderPlayerCard)}
              </IonRow>
            </IonGrid>
          ) : (
            <div className="empty-state">
              <IonIcon icon={person} className="empty-icon" />
              <h2 className="empty-title">No Players Yet</h2>
              <p className="empty-subtitle">
                {searchText 
                  ? `No players found matching "${searchText}". Try a different search term.`
                  : 'Start building your team by adding your first player. Track their progress, manage positions, and celebrate their achievements.'
                }
              </p>
              {!searchText && (
                <IonButton 
                  color="indigo" 
                  onClick={handleCreatePlayer}
                >
                  <IonIcon icon={add} slot="start" />
                  Add First Player
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