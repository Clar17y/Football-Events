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
import { arrowBack, add, ribbon } from 'ionicons/icons';
import { useHistory } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';
import './PageStyles.css';

const AwardsPage: React.FC = () => {
  const history = useHistory();

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar color="success">
          <IonButton 
            fill="clear" 
            slot="start" 
            onClick={() => history.goBack()}
            style={{ color: 'white' }}
          >
            <IonIcon icon={arrowBack} />
          </IonButton>
          <IonTitle>Awards</IonTitle>
          <ThemeToggle slot="end" />
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="ion-padding">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <IonIcon 
            icon={ribbon} 
            className="page-icon"
            style={{ fontSize: '4rem', marginBottom: '1rem' }} 
          />
          <h2 className="page-title">Awards & Recognition</h2>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            Celebrate achievements and recognize outstanding performances with our awards system.
          </p>
          
          <IonCard>
            <IonCardHeader>
              <IonCardTitle>Coming Soon</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              Awards management interface will include:
              <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
                <li>Season-long awards</li>
                <li>Match-specific awards</li>
                <li>Player of the match</li>
                <li>Most improved player</li>
                <li>Team spirit awards</li>
                <li>Custom award categories</li>
              </ul>
            </IonCardContent>
          </IonCard>
        </div>

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton color="success">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default AwardsPage;