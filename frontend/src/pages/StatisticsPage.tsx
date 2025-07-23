import React from 'react';
import { 
  IonPage, 
  IonContent,
  IonIcon,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
} from '@ionic/react';
import PageHeader from '../components/PageHeader';
import { statsChart, trendingUp, trophy, time } from 'ionicons/icons'
import './PageStyles.css';

interface StatisticsPageProps {
  onNavigate?: (page: string) => void;
}

const StatisticsPage: React.FC<StatisticsPageProps> = ({ onNavigate }) => {
  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  return (
    <IonPage>
      <PageHeader onNavigate={navigate} />
      
      <IonContent className="ion-padding">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <IonIcon 
            icon={statsChart} 
            className="page-icon"
            style={{ fontSize: '4rem', marginBottom: '1rem' }} 
          />
          <h2 className="page-title">Performance Analytics</h2>
          <p className="page-subtitle" style={{ marginBottom: '2rem' }}>
            Comprehensive statistics and insights to track team and player performance over time.
          </p>
          
          <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
            <IonCard>
              <IonCardHeader>
                <IonCardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <IonIcon icon={trendingUp} color="primary" />
                  Team Performance
                </IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                Track wins, losses, goals scored, and defensive performance across seasons.
              </IonCardContent>
            </IonCard>

            <IonCard>
              <IonCardHeader>
                <IonCardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <IonIcon icon={trophy} color="success" />
                  Player Analytics
                </IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                Individual player statistics, development tracking, and performance metrics.
              </IonCardContent>
            </IonCard>

            <IonCard>
              <IonCardHeader>
                <IonCardTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <IonIcon icon={time} color="tertiary" />
                  Playing Time
                </IonCardTitle>
              </IonCardHeader>
              <IonCardContent>
                Fair play time tracking and rotation analysis for youth development.
              </IonCardContent>
            </IonCard>
          </div>

          <IonCard>
            <IonCardContent>
              <h3 className="page-title">Future Features</h3>
              <ul style={{ textAlign: 'left', marginTop: '1rem' }}>
                <li>Interactive charts and graphs</li>
                <li>Season comparison tools</li>
                <li>Player development tracking</li>
                <li>Team formation analysis</li>
                <li>Match performance insights</li>
                <li>Export reports for parents</li>
              </ul>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default StatisticsPage;