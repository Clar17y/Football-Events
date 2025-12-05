import React, { useEffect, useState, useRef } from 'react';
import { IonChip, IonLabel, IonIcon } from '@ionic/react';
import { cloudOffline, cloudUpload, checkmarkCircle, cloudDone } from 'ionicons/icons';
import type { SyncProgress } from '../services/syncService';

const POLL_MS = 3000;

/**
 * Show toast notification for sync completion
 * Requirements: 4.4 - Show toast when sync completes
 */
function showSyncCompleteToast(syncedCount: number): void {
  try {
    if (syncedCount > 0) {
      (window as any).__toastApi?.current?.showSuccess?.(
        `Synced ${syncedCount} item${syncedCount === 1 ? '' : 's'} to server`
      );
    }
  } catch {
    // Ignore errors in non-browser environments
  }
}

/**
 * Show toast notification when going offline
 * Requirements: 4.1 - Display visual indicator showing offline status
 */
function showOfflineToast(): void {
  try {
    (window as any).__toastApi?.current?.showWarning?.(
      'You are offline - changes will be saved locally'
    );
  } catch {
    // Ignore errors in non-browser environments
  }
}

/**
 * Show toast notification when coming back online
 * Requirements: 4.3 - Show sync progress indicator when coming back online
 */
function showOnlineToast(): void {
  try {
    (window as any).__toastApi?.current?.showInfo?.(
      'Back online - syncing your changes...'
    );
  } catch {
    // Ignore errors in non-browser environments
  }
}

/**
 * OfflineSyncIndicator Component
 * 
 * Shows offline status when navigator.onLine is false
 * Shows sync progress when coming back online
 * Uses existing sync icon in header
 * 
 * Requirements: 4.1, 4.3 - Show offline status and sync progress
 */
const OfflineSyncIndicator: React.FC = () => {
  const [pending, setPending] = useState<number>(0);
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncedCount, setLastSyncedCount] = useState<number>(0);
  const previousPendingRef = useRef<number>(0);
  const wasOfflineRef = useRef<boolean>(false);

  const refresh = async () => {
    try {
      // Use syncService to get accurate pending counts across all tables
      const { syncService } = await import('../services/syncService');
      const progress = await syncService.getPendingCounts();
      const newPending = progress.total;
      
      // Track if we just completed a sync (pending went from >0 to 0)
      if (previousPendingRef.current > 0 && newPending === 0 && online) {
        // Sync completed - show toast
        showSyncCompleteToast(previousPendingRef.current);
        setLastSyncedCount(previousPendingRef.current);
        setSyncing(false);
      } else if (newPending > 0 && online) {
        setSyncing(true);
      }
      
      previousPendingRef.current = newPending;
      setPending(newPending);
    } catch {
      setPending(0);
    }
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    
    // Handle online event
    // Requirements: 4.3 - Show sync progress when coming back online
    const onOnline = () => {
      setOnline(true);
      if (wasOfflineRef.current) {
        showOnlineToast();
        wasOfflineRef.current = false;
      }
      setSyncing(true);
      refresh();
    };
    
    // Handle offline event
    // Requirements: 4.1 - Display visual indicator showing offline status
    const onOffline = () => {
      setOnline(false);
      wasOfflineRef.current = true;
      showOfflineToast();
      setSyncing(false);
    };
    
    const onAnyChange = () => refresh();
    
    // Handle sync:progress events from syncService
    // Requirements: 4.3 - Track sync progress
    const onSyncProgress = (event: CustomEvent<SyncProgress>) => {
      const progress = event.detail;
      setPending(progress.total);
      if (progress.synced > 0) {
        setLastSyncedCount(progress.synced);
      }
      if (progress.total === 0 && progress.synced > 0) {
        setSyncing(false);
        showSyncCompleteToast(progress.synced);
      } else if (progress.total > 0) {
        setSyncing(true);
      }
    };
    
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('guest:changed', onAnyChange as EventListener);
    window.addEventListener('sync:status', onAnyChange as EventListener);
    window.addEventListener('sync:progress', onSyncProgress as EventListener);
    
    // Initialize wasOfflineRef based on current state
    wasOfflineRef.current = !navigator.onLine;
    
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('guest:changed', onAnyChange as EventListener);
      window.removeEventListener('sync:status', onAnyChange as EventListener);
      window.removeEventListener('sync:progress', onSyncProgress as EventListener);
    };
  }, []);

  // Offline state - show warning chip
  // Requirements: 4.1 - Display visual indicator showing offline status
  if (!online) {
    return (
      <IonChip color="warning" style={{ height: 22 }}>
        <IonIcon icon={cloudOffline} />
        <IonLabel style={{ fontSize: 12 }}>Offline</IonLabel>
      </IonChip>
    );
  }

  // Syncing state - show progress
  // Requirements: 4.3 - Show sync progress indicator
  if (pending > 0 || syncing) {
    return (
      <IonChip color="tertiary" style={{ height: 22 }}>
        <IonIcon icon={cloudUpload} />
        <IonLabel style={{ fontSize: 12 }}>
          {pending > 0 ? `Syncing ${pending}` : 'Syncing...'}
        </IonLabel>
      </IonChip>
    );
  }

  // All synced state
  // Requirements: 4.4 - Show confirmation that data has been synced
  return (
    <IonChip color="success" style={{ height: 22 }}>
      <IonIcon icon={checkmarkCircle} />
      <IonLabel style={{ fontSize: 12 }}>All synced</IonLabel>
    </IonChip>
  );
};

export default OfflineSyncIndicator;

