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
import { add, person } from 'ionicons/icons';
import './PageStyles.css';

interface PlayersPageProps {
  onNavigate?: (page: string) => void;
}

const PlayersPage: React.FC<PlayersPageProps> = ({ onNavigate }) => {
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
          <div className="page-header-with-color" style={{ backgroundColor: 'var(--ion-color-indigo)' }}>
            <h1 className="page-main-title">Players</h1>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <IonIcon 
            icon={person} 
            className="page-icon"
            style={{ fontSize: '4rem', marginBottom: '1rem' }} 
          />
          <h2 className="page-title">Player Management</h2>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            Manage individual player profiles, track progress, and maintain detailed player records.
          </p>
          
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Coming Soon</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              Player management interface will include:
              <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
                <li>Add players to teams</li>
                <li>Player profile management</li>
                <li>Track individual statistics</li>
                <li>Position preferences</li>
                <li>Player development notes</li>
                <li>Fair play time tracking</li>
              </ul>
            </IonCardContent>
          </IonCard>
        </div>

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton color="indigo">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default PlayersPage;