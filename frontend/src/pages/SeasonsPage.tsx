import React from 'react';
import { 
  IonPage, 
  IonContent,
  IonIcon,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonFab,
  IonFabButton
} from '@ionic/react';
import PageHeader from '../components/PageHeader';
import { add, calendar } from 'ionicons/icons';
import './PageStyles.css';

interface SeasonsPageProps {
  onNavigate?: (page: string) => void;
}

const SeasonsPage: React.FC<SeasonsPageProps> = ({ onNavigate }) => {
  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  return (
    <IonPage>
      <PageHeader onNavigate={navigate} />
      
      <IonContent className="ion-padding">
        <div className="page-header-section">
          <div className="page-header-with-color" style={{ backgroundColor: 'var(--ion-color-primary)' }}>
            <h1 className="page-main-title">Seasons</h1>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <IonIcon 
            icon={calendar} 
            className="page-icon"
            style={{ fontSize: '4rem', marginBottom: '1rem' }} 
          />
          <h2 className="page-title">Season Management</h2>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            Create and manage your football seasons. Organize your teams and track progress throughout the year.
          </p>
          
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Coming Soon</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              Season management interface will include:
              <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
                <li>Create new seasons</li>
                <li>Set season dates and duration</li>
                <li>Manage season settings</li>
                <li>View season statistics</li>
              </ul>
            </IonCardContent>
          </IonCard>
        </div>

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton color="primary">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default SeasonsPage;