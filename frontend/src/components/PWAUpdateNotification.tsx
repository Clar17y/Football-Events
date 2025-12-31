import React, { useEffect, useState } from 'react';
import { IonButton, IonIcon, IonText } from '@ionic/react';
import { refreshOutline, closeOutline } from 'ionicons/icons';

/**
 * PWAUpdateNotification Component
 *
 * Shows a notification when a new version of the app is available.
 * Listens for service worker updates and prompts the user to refresh.
 */
const PWAUpdateNotification: React.FC = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdates = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;

        // Check for waiting worker on load
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdate(true);
        }

        // Listen for new updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            // When the new worker is installed and waiting
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowUpdate(true);
            }
          });
        });
      } catch (error) {
        console.error('[PWA] Error checking for updates:', error);
      }
    };

    // Small delay to not interfere with initial load
    const timeoutId = setTimeout(checkForUpdates, 1000);

    return () => clearTimeout(timeoutId);
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;

    // Tell the waiting service worker to skip waiting
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    // Listen for the new service worker to take control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Reload the page to use the new version
      window.location.reload();
    }, { once: true });

    setShowUpdate(false);
  };

  const handleDismiss = () => {
    setShowUpdate(false);
    // Don't clear waitingWorker - user might want to update later
  };

  if (!showUpdate) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: 16,
        right: 16,
        backgroundColor: 'var(--ion-color-tertiary)',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 9999,
      }}
    >
      <div style={{ flex: 1 }}>
        <IonText color="light">
          <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
            Update Available
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, opacity: 0.9 }}>
            A new version is ready. Refresh to update.
          </p>
        </IonText>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <IonButton
          fill="clear"
          size="small"
          color="light"
          onClick={handleDismiss}
          style={{ '--padding-start': '8px', '--padding-end': '8px' }}
        >
          <IonIcon slot="icon-only" icon={closeOutline} />
        </IonButton>
        <IonButton
          fill="solid"
          size="small"
          color="light"
          onClick={handleUpdate}
        >
          <IonIcon slot="start" icon={refreshOutline} />
          Refresh
        </IonButton>
      </div>
    </div>
  );
};

export default PWAUpdateNotification;
