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
  IonAlert
} from '@ionic/react';
import { 
  add, 
  calendar, 
  ellipsisVertical,
  pencil,
  trash,
  statsChart,
  refresh,
  refreshOutline,
  trophy,
  time
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import CreateSeasonModal from '../components/CreateSeasonModal';
import SeasonContextMenu from '../components/SeasonContextMenu';
import { useSeasons } from '../hooks/useSeasons';
import type { Season } from '@shared/types';
import './PageStyles.css';
import './SeasonsPage.css';

interface SeasonsPageProps {
  onNavigate?: (page: string) => void;
}

const SeasonsPage: React.FC<SeasonsPageProps> = ({ onNavigate }) => {
  const {
    seasons,
    loading,
    error,
    total,
    loadSeasons,
    deleteSeason,
    clearError
  } = useSeasons();

  const [searchText, setSearchText] = useState('');
  const [selectedSeason, setSelectedSeason] = useState<Season | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadSeasons();
  }, [loadSeasons]);

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    loadSeasons({ search: text.trim() || undefined });
  };

  const handleRefresh = async (event: CustomEvent) => {
    await loadSeasons();
    event.detail.complete();
  };

  const handleSeasonAction = (action: string) => {
    if (!selectedSeason) return;
    
    switch (action) {
      case 'edit':
        setShowEditModal(true);
        break;
      case 'delete':
        setShowDeleteAlert(true);
        break;
      case 'stats':
        console.log('View stats for:', selectedSeason.name);
        setSelectedSeason(null);
        break;
    }
  };

  const handleDeleteSeason = async () => {
    if (selectedSeason) {
      await deleteSeason(selectedSeason.id);
      setSelectedSeason(null);
    }
    setShowDeleteAlert(false);
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startFormatted} - ${endFormatted}`;
  };

  const renderSeasonCard = (season: Season) => {
    const isActive = season.isActive;
    const statusColor = isActive ? 'success' : 'medium';
    
    return (
      <IonCol size="12" sizeMd="6" sizeLg="4" key={season.id}>
        <IonCard className={`season-card ${isActive ? 'season-card-active' : 'season-card-inactive'}`}>
          {/* Season status indicator */}
          <div className={`season-status-bar ${isActive ? 'active' : 'inactive'}`}></div>
          
          <IonCardHeader>
            <div className="season-card-header">
              <div className="season-info">
                <IonCardTitle className="season-name">{season.name}</IonCardTitle>
                <div className="season-dates">
                  <IonIcon icon={calendar} />
                  <span>{formatDateRange(season.startDate, season.endDate)}</span>
                </div>
              </div>
              <IonButton 
                fill="clear" 
                size="small"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setContextMenuPosition({
                    x: rect.right - 200,
                    y: rect.bottom + 5
                  });
                  setSelectedSeason(season);
                  setContextMenuOpen(true);
                }}
                className="season-ellipses-button"
              >
                <IonIcon icon={ellipsisVertical} />
              </IonButton>
            </div>
          </IonCardHeader>
          
          <IonCardContent>
            <div className="season-stats">
              <IonChip color={statusColor} className="status-chip">
                <IonIcon icon={isActive ? trophy : time} />
                <span>{isActive ? 'Active' : 'Completed'}</span>
              </IonChip>
              <IonChip color="medium" className="stat-chip">
                <IonIcon icon={statsChart} />
                <span>0 matches</span>
              </IonChip>
            </div>
          </IonCardContent>
        </IonCard>
      </IonCol>
    );
  };

  const renderEmptyState = () => (
    <div className="empty-state">
      <IonIcon icon={calendar} className="empty-icon" />
      <h3 className="empty-title">No Seasons Yet</h3>
      <p className="empty-subtitle">
        Create your first season to start organizing matches and tracking progress.
      </p>
      <IonButton 
        expand="block" 
        color="primary" 
        className="empty-action"
        onClick={() => setShowCreateModal(true)}
      >
        <IonIcon icon={add} slot="start" />
        Create Your First Season
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
                <IonSkeletonText animated style={{ width: '70%' }} />
                <IonSkeletonText animated style={{ width: '50%' }} />
              </IonCardHeader>
              <IonCardContent>
                <IonSkeletonText animated style={{ width: '60%' }} />
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
      <PageHeader 
        onNavigate={navigate}
        additionalButtons={
          <IonButton 
            fill="clear" 
            onClick={() => loadSeasons()}
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
            pullingText="Pull to refresh seasons"
            refreshingSpinner="circles"
            refreshingText="Loading seasons..."
          />
        </IonRefresher>

        <div className="seasons-header">
          <div className="seasons-title-section">
            <div className="page-header-with-color" style={{ backgroundColor: 'var(--ion-color-primary)' }}>
              <h1 className="seasons-main-title">Seasons</h1>
            </div>
            <p className="seasons-subtitle">
              {total > 0 ? `${total} season${total !== 1 ? 's' : ''}` : 'Manage your football seasons'}
            </p>
          </div>
          
          <IonSearchbar
            value={searchText}
            onIonInput={(e) => handleSearch(e.detail.value!)}
            placeholder="Search seasons..."
            showClearButton="focus"
            className="seasons-search"
          />
        </div>

        <div className="seasons-content">
          {loading && seasons.length === 0 ? (
            renderLoadingSkeleton()
          ) : seasons.length === 0 && !loading ? (
            renderEmptyState()
          ) : (
            <IonGrid>
              <IonRow>
                {seasons.map(renderSeasonCard)}
              </IonRow>
            </IonGrid>
          )}
        </div>

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton 
            color="primary"
            onClick={() => setShowCreateModal(true)}
          >
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>

        {/* Season Context Menu */}
        <SeasonContextMenu
          isOpen={contextMenuOpen}
          onClose={() => {
            setContextMenuOpen(false);
          }}
          season={selectedSeason}
          position={contextMenuPosition}
          onAction={handleSeasonAction}
        />

        {/* Delete Confirmation Alert */}
        <IonAlert
          isOpen={showDeleteAlert}
          onDidDismiss={() => setShowDeleteAlert(false)}
          header="Delete Season"
          message={`Are you sure you want to delete "${selectedSeason?.name}"? This action cannot be undone.`}
          buttons={[
            {
              text: 'Cancel',
              role: 'cancel'
            },
            {
              text: 'Delete',
              role: 'destructive',
              handler: handleDeleteSeason
            }
          ]}
        />

        {/* Create Season Modal */}
        <CreateSeasonModal
          isOpen={showCreateModal}
          onDidDismiss={() => {
            setShowCreateModal(false);
            loadSeasons();
          }}
        />

        {/* Edit Season Modal */}
        <CreateSeasonModal
          isOpen={showEditModal}
          onDidDismiss={() => {
            setShowEditModal(false);
            setSelectedSeason(null);
            loadSeasons();
          }}
          editSeason={selectedSeason}
          mode="edit"
        />
      </IonContent>
    </IonPage>
  );
};

export default SeasonsPage;