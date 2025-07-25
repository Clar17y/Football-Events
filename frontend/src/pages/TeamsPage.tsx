import React, { useEffect, useState } from 'react';
import { 
  IonPage, 
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
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
  people, 
  ellipsisVertical,
  pencil,
  trash,
  personAdd,
  statsChart,
  refresh,
  refreshOutline
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import CreateTeamModal from '../components/CreateTeamModal';
import TeamContextMenu from '../components/TeamContextMenu';
import { useTeams } from '../hooks/useTeams';
import type { Team } from '@shared/types';
import './PageStyles.css';
import './TeamsPage.css';

interface TeamsPageProps {
  onNavigate?: (page: string) => void;
}

const TeamsPage: React.FC<TeamsPageProps> = ({ onNavigate }) => {
  const {
    teams,
    loading,
    error,
    total,
    loadTeams,
    deleteTeam,
    clearError
  } = useTeams();

  const [searchText, setSearchText] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    loadTeams({ search: text.trim() || undefined });
  };

  const handleRefresh = async (event: CustomEvent) => {
    await loadTeams();
    event.detail.complete();
  };

  const handleTeamAction = (action: string) => {
    if (!selectedTeam) return;
    
    switch (action) {
      case 'edit':
        setShowEditModal(true);
        break;
      case 'delete':
        setShowDeleteAlert(true);
        break;
      case 'players':
        // TODO: Navigate to team players
        console.log('View players for:', selectedTeam.name);
        setSelectedTeam(null); // Clear after action
        break;
      case 'stats':
        // TODO: Navigate to team stats
        console.log('View stats for:', selectedTeam.name);
        setSelectedTeam(null); // Clear after action
        break;
    }
  };

  const handleDeleteTeam = async () => {
    if (selectedTeam) {
      await deleteTeam(selectedTeam.id);
      setSelectedTeam(null);
    }
    setShowDeleteAlert(false);
  };

  const renderTeamCard = (team: Team) => {
    // Generate dynamic styles for team colors
    const hasTeamColors = team.homeKitPrimary && team.homeKitSecondary;
    const primaryColor = team.homeKitPrimary || 'var(--theme-primary, var(--ion-color-teal))';
    const secondaryColor = team.homeKitSecondary || 'var(--theme-primary-tint, var(--ion-color-teal-tint))';
    
    const teamCardStyle = hasTeamColors ? {
      '--team-primary': primaryColor,
      '--team-secondary': secondaryColor,
    } as React.CSSProperties : {};

    return (
      <IonCol size="12" sizeMd="6" sizeLg="4" key={team.id}>
        <IonCard 
          className={`team-card ${hasTeamColors ? 'team-card-with-colors' : 'team-card-default'}`}
          style={teamCardStyle}
        >
          {/* Team color stripes */}
          <div className="team-color-stripes">
            <div className="stripe stripe-primary" style={{ backgroundColor: primaryColor }}></div>
            <div className="stripe stripe-secondary" style={{ backgroundColor: secondaryColor }}></div>
          </div>
          
          <IonCardHeader>
          <div className="team-card-header">
            <div className="team-info">
              <IonCardTitle className="team-name">{team.name}</IonCardTitle>
              <div className="team-colors">
                {team.homeKitPrimary && (
                  <div 
                    className="color-dot home-primary" 
                    style={{ backgroundColor: team.homeKitPrimary }}
                    title={`Home Primary: ${team.homeKitPrimary}`}
                  />
                )}
                {team.homeKitSecondary && (
                  <div 
                    className="color-dot home-secondary" 
                    style={{ backgroundColor: team.homeKitSecondary }}
                    title={`Home Secondary: ${team.homeKitSecondary}`}
                  />
                )}
                {team.awayKitPrimary && (
                  <div 
                    className="color-dot away-primary" 
                    style={{ backgroundColor: team.awayKitPrimary }}
                    title={`Away Primary: ${team.awayKitPrimary}`}
                  />
                )}
                {team.awayKitSecondary && (
                  <div 
                    className="color-dot away-secondary" 
                    style={{ backgroundColor: team.awayKitSecondary }}
                    title={`Away Secondary: ${team.awayKitSecondary}`}
                  />
                )}
              </div>
            </div>
            <IonButton 
              fill="clear" 
              size="small"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setContextMenuPosition({
                  x: rect.right - 200, // Position menu to the left of the button
                  y: rect.bottom + 5   // Position menu below the button
                });
                setSelectedTeam(team);
                setContextMenuOpen(true);
              }}
              className="team-ellipses-button"
            >
              <IonIcon icon={ellipsisVertical} />
            </IonButton>
          </div>
        </IonCardHeader>
        <IonCardContent>
          <div className="team-stats">
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={people} />
              <span>0 players</span>
            </IonChip>
            <IonChip color="medium" className="stat-chip">
              <IonIcon icon={statsChart} />
              <span>0 matches</span>
            </IonChip>
          </div>
          {team.logoUrl && (
            <div className="team-logo">
              <img src={team.logoUrl} alt={`${team.name} logo`} />
            </div>
          )}
        </IonCardContent>
      </IonCard>
    </IonCol>
    );
  };

  const renderEmptyState = () => (
    <div className="empty-state">
      <IonIcon icon={people} className="empty-icon" />
      <h3 className="empty-title">No Teams Yet</h3>
      <p className="empty-subtitle">
        Create your first team to start managing players, matches, and statistics.
      </p>
      <IonButton 
        expand="block" 
        color="secondary" 
        className="empty-action"
        onClick={() => setShowCreateModal(true)}
      >
        <IonIcon icon={add} slot="start" />
        Create Your First Team
      </IonButton>
    </div>
  );

  const renderLoadingSkeleton = () => (
    <IonGrid>
      <IonRow>
        {[1, 2, 3, 4].map((i) => (
          <IonCol size="12" sizeMd="6" sizeLg="4" key={i}>
            <IonCard>
              <IonCardHeader>
                <IonSkeletonText animated style={{ width: '60%' }} />
              </IonCardHeader>
              <IonCardContent>
                <IonSkeletonText animated style={{ width: '80%' }} />
                <IonSkeletonText animated style={{ width: '40%' }} />
              </IonCardContent>
            </IonCard>
          </IonCol>
        ))}
      </IonRow>
    </IonGrid>
  );

  return (
    <IonPage className="page" data-theme="team">
      <PageHeader 
        onNavigate={navigate}
        additionalButtons={
          <IonButton 
            fill="clear" 
            onClick={() => loadTeams()}
            style={{ color: 'white' }}
            disabled={loading}
          >
            <IonIcon icon={refreshOutline} />
          </IonButton>
        }
      />
      
      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent
            pullingIcon={refresh}
            pullingText="Pull to refresh teams"
            refreshingSpinner="circles"
            refreshingText="Loading teams..."
          />
        </IonRefresher>

        <div className="teams-header">
          <div className="teams-title-section">
            <div className="page-header-with-color" style={{ backgroundColor: 'var(--theme-primary, var(--ion-color-teal))' }}>
              <h1 className="teams-main-title">Teams</h1>
            </div>
            <p className="teams-subtitle">
              {total > 0 ? `${total} team${total !== 1 ? 's' : ''}` : 'Manage your teams and players'}
            </p>
          </div>
          
          <IonSearchbar
            value={searchText}
            onIonInput={(e) => handleSearch(e.detail.value!)}
            placeholder="Search teams..."
            showClearButton="focus"
            className="teams-search"
          />
        </div>

        <div className="teams-content">
          {loading && teams.length === 0 ? (
            renderLoadingSkeleton()
          ) : teams.length === 0 && !loading ? (
            renderEmptyState()
          ) : (
            <IonGrid>
              <IonRow>
                {teams.map(renderTeamCard)}
              </IonRow>
            </IonGrid>
          )}
        </div>

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton 
            style={{ 
              '--background': 'var(--theme-primary, var(--ion-color-teal))',
              '--background-activated': 'var(--theme-primary-shade, var(--ion-color-teal-shade))',
              '--color': 'var(--theme-on-primary, white)'
            } as React.CSSProperties}
            onClick={() => setShowCreateModal(true)}
          >
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>

        {/* Team Context Menu */}
        <TeamContextMenu
          isOpen={contextMenuOpen}
          onClose={() => {
            setContextMenuOpen(false);
            // Don't clear selectedTeam here - let individual actions handle it
          }}
          team={selectedTeam}
          position={contextMenuPosition}
          onAction={handleTeamAction}
        />

        {/* Delete Confirmation Alert */}
        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Delete Team"
          message={`Are you sure you want to delete "${selectedTeam?.name}"? This action cannot be undone.`}
          buttons={[
            {
              text: 'Cancel',
              role: 'cancel'
            },
            {
              text: 'Delete',
              role: 'destructive',
              handler: handleDeleteTeam
            }
          ]}
        />

        {/* Create Team Modal */}
        <CreateTeamModal
          isOpen={showCreateModal}
          onDidDismiss={() => {
            setShowCreateModal(false);
            // Auto-refresh teams list after creating a team
            loadTeams();
          }}
        />

        {/* Edit Team Modal */}
        <CreateTeamModal
          isOpen={showEditModal}
          onDidDismiss={() => {
            setShowEditModal(false);
            setSelectedTeam(null);
            // Auto-refresh teams list after editing a team
            loadTeams();
          }}
          editTeam={selectedTeam}
          mode="edit"
        />
      </IonContent>
    </IonPage>
  );
};

export default TeamsPage;