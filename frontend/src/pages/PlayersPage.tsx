import React from 'react';
import { 
  IonPage, 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonFab,
  IonFabButton
} from '@ionic/react';
import { arrowBack, add, person } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import './PageStyles.css';

const PlayersPage: React.FC = () => {
  const history = useHistory();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="tertiary">
          <IonButton 
            fill="clear" 
            slot="start" 
            onClick={() => history.goBack()}
            style={{ color: 'white' }}
          >
            <IonIcon icon={arrowBack} />
          </IonButton>
          <IonTitle>Players</IonTitle>
          <ThemeToggle slot="end" />
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="ion-padding">
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
          <IonFabButton color="tertiary">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default PlayersPage;