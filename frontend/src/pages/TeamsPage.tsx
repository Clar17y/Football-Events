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
  refresh
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import CreateTeamModal from '../components/CreateTeamModal';
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

  const handleTeamAction = (team: Team, action: string) => {
    setSelectedTeam(team);
    setShowActionSheet(false);
    
    switch (action) {
      case 'edit':
        // TODO: Open edit team modal
        console.log('Edit team:', team.name);
        break;
      case 'delete':
        setShowDeleteAlert(true);
        break;
      case 'players':
        // TODO: Navigate to team players
        console.log('View players for:', team.name);
        break;
      case 'stats':
        // TODO: Navigate to team stats
        console.log('View stats for:', team.name);
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

  const renderTeamCard = (team: Team) => (
    <IonCol size="12" sizeMd="6" sizeLg="4" key={team.id}>
      <IonCard className="team-card">
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
              onClick={() => {
                setSelectedTeam(team);
                setShowActionSheet(true);
              }}
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
    <IonPage>
      <PageHeader onNavigate={navigate} />
      
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
            <div className="page-header-with-color" style={{ backgroundColor: 'var(--ion-color-teal)' }}>
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
            color="teal"
            onClick={() => setShowCreateModal(true)}
          >
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>

        {/* Team Actions Sheet */}
        <IonActionSheet
          isOpen={showActionSheet}
          onDidDismiss={() => setShowActionSheet(false)}
          header={selectedTeam?.name}
          buttons={[
            {
              text: 'Edit Team',
              icon: pencil,
              handler: () => handleTeamAction(selectedTeam!, 'edit')
            },
            {
              text: 'View Players',
              icon: personAdd,
              handler: () => handleTeamAction(selectedTeam!, 'players')
            },
            {
              text: 'Team Statistics',
              icon: statsChart,
              handler: () => handleTeamAction(selectedTeam!, 'stats')
            },
            {
              text: 'Delete Team',
              icon: trash,
              role: 'destructive',
              handler: () => handleTeamAction(selectedTeam!, 'delete')
            },
            {
              text: 'Cancel',
              role: 'cancel'
            }
          ]}
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
          onDidDismiss={() => setShowCreateModal(false)}
        />
      </IonContent>
    </IonPage>
  );
};

export default TeamsPage;