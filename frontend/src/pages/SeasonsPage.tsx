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
import { arrowBack, add, calendar } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import './PageStyles.css';

const SeasonsPage: React.FC = () => {
  const history = useHistory();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="primary">
          <IonButton 
            fill="clear" 
            slot="start" 
            onClick={() => history.goBack()}
            style={{ color: 'white' }}
          >
            <IonIcon icon={arrowBack} />
          </IonButton>
          <IonTitle>Seasons</IonTitle>
          <ThemeToggle slot="end" />
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="ion-padding">
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