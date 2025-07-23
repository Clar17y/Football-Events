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
import { add, ribbon } from 'ionicons/icons';
import './PageStyles.css';

interface AwardsPageProps {
  onNavigate?: (page: string) => void;
}

const AwardsPage: React.FC<AwardsPageProps> = ({ onNavigate }) => {
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
          <div className="page-header-with-color" style={{ backgroundColor: 'var(--ion-color-rose)' }}>
            <h1 className="page-main-title">Awards</h1>
          </div>
        </div>
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
          <IonFabButton color="rose">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default AwardsPage;