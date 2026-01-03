import React, { useState, useEffect } from 'react';
import {
  IonButton,
  IonIcon,
  IonPopover,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonAvatar,
  IonText,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
} from '@ionic/react';
import {
  personOutline,
  logOutOutline,
  settingsOutline,
  chevronDownOutline,
  sparkles,
} from 'ionicons/icons';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useMeLimits } from '../hooks/useMeLimits';

interface UserProfileProps {
  className?: string;
  onNavigate?: (page: string) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ className, onNavigate }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const { user, logout, isAuthenticated } = useAuth();
  const { showSuccess, showError } = useToast();
  const { planType } = useMeLimits();
  const isPremium = planType === 'premium';

  // Fetch display name from settings
  useEffect(() => {
    const fetchSettings = async () => {
      if (!isAuthenticated) return;
      try {
        const { authApi } = await import('../services/api/authApi');
        const response = await authApi.getSettings();
        if (response.success && response.data?.display_name) {
          setDisplayName(response.data.display_name);
        }
      } catch (error) {
        console.warn('Failed to fetch user settings:', error);
      }
    };
    fetchSettings();
  }, [isAuthenticated]);

  const handleLogout = async () => {
    try {
      await logout();
      showSuccess('You have been logged out successfully.');
      setIsPopoverOpen(false);
    } catch (error) {
      showError('Error logging out. Please try again.');
    }
  };

  if (!user) {
    return null;
  }

  // Helper to get the preferred display name
  const getDisplayName = () => {
    if (displayName) return displayName;
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return 'Coach';
  };

  // Get initials from display name or full name
  const getInitials = () => {
    if (displayName) {
      // For display name, take first letter of first 1-2 words
      const words = displayName.trim().split(/\s+/);
      if (words.length >= 2) {
        return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
      }
      return displayName.charAt(0).toUpperCase();
    }
    // Fallback to first_name/last_name
    const first = user.first_name?.charAt(0) || '';
    const last = user.last_name?.charAt(0) || '';
    return `${first}${last}`.toUpperCase() || 'C';
  };

  return (
    <>
      <IonButton
        fill="clear"
        className={className}
        id="user-profile-trigger"
        onClick={() => setIsPopoverOpen(true)}
      >
        <IonAvatar slot="start" style={{ width: '32px', height: '32px', marginRight: '12px' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'var(--ion-color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            {getInitials()}
          </div>
        </IonAvatar>
        <IonLabel>
          {getDisplayName()}
        </IonLabel>
        <IonIcon icon={chevronDownOutline} slot="end" />
      </IonButton>

      <IonPopover
        trigger="user-profile-trigger"
        isOpen={isPopoverOpen}
        onDidDismiss={() => setIsPopoverOpen(false)}
        showBackdrop={true}
      >
        <IonContent>
          <IonHeader>
            <IonToolbar>
              <IonTitle size="small">Account</IonTitle>
              <IonButtons slot="end">
                <IonButton
                  fill="clear"
                  onClick={() => setIsPopoverOpen(false)}
                >
                  ×
                </IonButton>
              </IonButtons>
            </IonToolbar>
          </IonHeader>

          <IonList>
            <IonItem>
              <IonAvatar slot="start">
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'var(--ion-color-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: 'bold',
                  }}
                >
                  {getInitials()}
                </div>
              </IonAvatar>
              <IonLabel>
                <h2>{getDisplayName()}</h2>
                <IonText color="medium">
                  <p>{user.email}</p>
                </IonText>
              </IonLabel>
            </IonItem>

            <IonItem
              button
              onClick={() => {
                setIsPopoverOpen(false);
                onNavigate?.('profile-settings');
              }}
            >
              <IonIcon icon={personOutline} slot="start" />
              <IonLabel>Profile Settings</IonLabel>
            </IonItem>

            {!isPremium && (
              <IonItem
                button
                onClick={() => {
                  setIsPopoverOpen(false);
                  onNavigate?.('pricing');
                }}
                style={{ '--background': 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(139, 92, 246, 0.1))' } as React.CSSProperties}
              >
                <IonIcon icon={sparkles} slot="start" color="primary" />
                <IonLabel color="primary">Upgrade to Premium</IonLabel>
              </IonItem>
            )}

            <IonItem
              button
              onClick={() => {
                setIsPopoverOpen(false);
                onNavigate?.('app-settings');
              }}
            >
              <IonIcon icon={settingsOutline} slot="start" />
              <IonLabel>App Settings</IonLabel>
            </IonItem>

            <IonItem button onClick={handleLogout} color="danger">
              <IonIcon icon={logOutOutline} slot="start" />
              <IonLabel>Sign Out</IonLabel>
            </IonItem>
          </IonList>
        </IonContent>
      </IonPopover>
    </>
  );
};

export default UserProfile;