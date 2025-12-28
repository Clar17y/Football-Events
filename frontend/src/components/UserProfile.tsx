import React, { useState } from 'react';
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

interface UserProfileProps {
  className?: string;
  onNavigate?: (page: string) => void;
}

const UserProfile: React.FC<UserProfileProps> = ({ className, onNavigate }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { user, logout } = useAuth();
  const { showSuccess, showError } = useToast();

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

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
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
            {getInitials(user.first_name || '', user.last_name || '')}
          </div>
        </IonAvatar>
        <IonLabel>
          {user.first_name} {user.last_name}
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
                  {getInitials(user.first_name || '', user.last_name || '')}
                </div>
              </IonAvatar>
              <IonLabel>
                <h2>{user.first_name} {user.last_name}</h2>
                <IonText color="medium">
                  <p>{user.email}</p>
                </IonText>
              </IonLabel>
            </IonItem>

            <IonItem button>
              <IonIcon icon={personOutline} slot="start" />
              <IonLabel>Profile Settings</IonLabel>
            </IonItem>

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

            <IonItem button>
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