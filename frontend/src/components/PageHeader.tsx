/**
 * Reusable Page Header Component
 * Provides consistent MatchMaster branding across all pages
 */

import React from 'react';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButton,
  IonIcon,
  IonButtons
} from '@ionic/react';
import { arrowBackOutline, football } from 'ionicons/icons';
import ThemeToggle from './ThemeToggle';
import OfflineSyncIndicator from './OfflineSyncIndicator';
import ImportGuestDataButton from './ImportGuestDataButton';

interface PageHeaderProps {
  onNavigate?: (page: string) => void;
  showBackButton?: boolean;
  backDestination?: string;
  showThemeToggle?: boolean;
  additionalButtons?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ 
  onNavigate,
  showBackButton = true,
  backDestination = 'home',
  showThemeToggle = true,
  additionalButtons
}) => {
  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  return (
    <IonHeader>
      <IonToolbar className="home-toolbar">
        {showBackButton && (
          <IonButtons slot="start">
            <IonButton fill="clear" onClick={() => navigate(backDestination)}>
              <IonIcon icon={arrowBackOutline} />
            </IonButton>
          </IonButtons>
        )}
        
        <IonTitle className="home-title">
          <div className="title-container" onClick={() => navigate('home')} style={{ cursor: 'pointer' }}>
            <IonIcon icon={football} className="title-icon" />
            <span>MatchMaster</span>
          </div>
        </IonTitle>
        
        <IonButtons slot="end" style={{ gap: 8 }}>
          <OfflineSyncIndicator />
          <ImportGuestDataButton />
          {additionalButtons}
          {showThemeToggle && <ThemeToggle />}
        </IonButtons>
      </IonToolbar>
    </IonHeader>
  );
};

export default PageHeader;
