import React, { useEffect, useState } from 'react';
import { IonButton, IonIcon, IonText } from '@ionic/react';
import { downloadOutline, closeOutline } from 'ionicons/icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

/**
 * PWAInstallPrompt Component
 *
 * Shows an install prompt when the app can be installed as a PWA.
 * Handles the beforeinstallprompt event and provides UI for installation.
 */
const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check if user previously dismissed the prompt
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Save the event for later use
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
      // Show success toast
      try {
        (window as any).__toastApi?.current?.showSuccess?.('App installed successfully!');
      } catch {}
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      // Show the install prompt
      await deferredPrompt.prompt();

      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
      } else {
        console.log('[PWA] User dismissed the install prompt');
      }
    } catch (error) {
      console.error('[PWA] Install prompt error:', error);
    } finally {
      // Clear the deferred prompt - it can only be used once
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDeferredPrompt(null);
    // Remember dismissal for 7 days
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Don't render if already installed or no prompt available
  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        backgroundColor: 'var(--ion-color-primary)',
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
            Install Grassroots App
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, opacity: 0.9 }}>
            Add to your home screen for quick access
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
          onClick={handleInstallClick}
        >
          <IonIcon slot="start" icon={downloadOutline} />
          Install
        </IonButton>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
