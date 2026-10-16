/**
 * Reusable Page Header Component
 * Provides consistent MatchMaster branding and honest save status across all pages
 */

import React, { useId, useState } from 'react';
import {
  IonHeader,
  IonToolbar,
  IonButton,
  IonIcon,
  IonPopover
} from '@ionic/react';
import { arrowBackOutline, ellipsisHorizontal } from 'ionicons/icons';
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
  const [menuEvent, setMenuEvent] = useState<Event>();
  // Ionic interpolates this ID into selectors without CSS escaping.
  const menuId = `page-options-${useId().replace(/:/g, '')}`;

  const handleBack = () => {
    // Use browser history if available, otherwise fall back to destination
    if (window.history.length > 1) {
      window.history.back();
    } else if (onNavigate) {
      onNavigate(backDestination);
    }
  };

  return (
    <IonHeader className="page-header">
      <IonToolbar className="home-toolbar">
        <div className={`page-header-layout${showBackButton ? '' : ' without-back'}`}>
          {showBackButton && (
            <IonButton
              fill="clear"
              onClick={handleBack}
              aria-label="Go back"
              className="header-back-button"
            >
              <IonIcon icon={arrowBackOutline} aria-hidden="true" />
            </IonButton>
          )}
          <button
            type="button"
            className="page-header-brand"
            onClick={() => onNavigate?.('home')}
            aria-label="MatchMaster, go to home"
          >
            MatchMaster
          </button>
          <div className="page-header-status" role="status" aria-live="polite" aria-atomic="true">
            <OfflineSyncIndicator />
          </div>
          <IonButton
            fill="clear"
            className="header-more-button"
            aria-label="More options"
            aria-haspopup="dialog"
            aria-expanded={Boolean(menuEvent)}
            aria-controls={menuId}
            onClick={event => setMenuEvent(event.nativeEvent)}
          >
            <IonIcon icon={ellipsisHorizontal} aria-hidden="true" />
          </IonButton>
        </div>
      </IonToolbar>
      <ImportGuestDataButton />
      <IonPopover
        id={menuId}
        className="page-header-options"
        isOpen={Boolean(menuEvent)}
        event={menuEvent}
        onDidDismiss={() => setMenuEvent(undefined)}
        keepContentsMounted
        htmlAttributes={{ 'aria-label': 'Page options' }}
      >
        <div className="page-header-options-content" onClick={() => setMenuEvent(undefined)}>
          {showThemeToggle && (
            <div className="page-header-theme-option">
              <span>Appearance</span>
              <ThemeToggle />
            </div>
          )}
          {additionalButtons}
        </div>
      </IonPopover>
    </IonHeader>
  );
};

export default PageHeader;
