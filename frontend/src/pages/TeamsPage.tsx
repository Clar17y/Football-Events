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
import { arrowBack, add, people } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import './PageStyles.css';

const TeamsPage: React.FC = () => {
  const history = useHistory();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="secondary">
          <IonButton 
            fill="clear" 
            slot="start" 
            onClick={() => history.goBack()}
            style={{ color: 'white' }}
          >
            <IonIcon icon={arrowBack} />
          </IonButton>
          <IonTitle>Teams</IonTitle>
          <ThemeToggle slot="end" />
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="ion-padding">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <IonIcon 
            icon={people} 
            className="page-icon"
            style={{ fontSize: '4rem', marginBottom: '1rem' }} 
          />
          <h2 className="page-title">Team Management</h2>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            Create and manage your teams. Set team colors, manage rosters, and track team performance.
          </p>
          
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Coming Soon</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              Team management interface will include:
              <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
                <li>Create and edit teams</li>
                <li>Set team colors and branding</li>
                <li>Manage team rosters</li>
                <li>View team statistics</li>
                <li>Team formation setup</li>
              </ul>
            </IonCardContent>
          </IonCard>
        </div>

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton color="secondary">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default TeamsPage;