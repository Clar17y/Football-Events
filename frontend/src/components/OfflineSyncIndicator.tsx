import React, { useEffect, useState, useRef } from 'react';
import { IonChip, IonLabel, IonIcon } from '@ionic/react';
import { cloudOffline, cloudUpload, checkmarkCircle, alertCircle, timeOutline } from 'ionicons/icons';
import type { SyncProgress } from '../services/syncService';
import { useAuth } from '../contexts/AuthContext';

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
  const { isAuthenticated, user } = useAuth();
  const [statusKnown, setStatusKnown] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const refreshVersionRef = useRef(0);
  const [pending, setPending] = useState<number>(0);
  const [eligible, setEligible] = useState<number>(0);
  const [blocked, setBlocked] = useState<number>(0);
  const [nextRetryAtMs, setNextRetryAtMs] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncedCount, setLastSyncedCount] = useState<number>(0);
  const previousPendingRef = useRef<number>(0);
  const wasOfflineRef = useRef<boolean>(false);

  const goToSyncIssues = () => {
    try {
      window.history.pushState({}, '', '/sync-issues');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {}
  };

  const refresh = async () => {
    const version = ++refreshVersionRef.current;
    try {
      // Use syncService to get accurate pending counts across all tables
      const { syncService } = await import('../services/syncService');
      const progress = await syncService.getPendingCounts();
      if (version !== refreshVersionRef.current) return;
      setStatusKnown(true);
      setStatusError(false);
      const newPending = progress.total;
      const newEligible = progress.eligible;
      const newBlocked = progress.blocked;
      
      // Track if we just completed a sync (pending went from >0 to 0)
      if (previousPendingRef.current > 0 && newPending === 0 && newBlocked === 0 && navigator.onLine) {
        // Sync completed - show toast
        showSyncCompleteToast(previousPendingRef.current);
        setLastSyncedCount(previousPendingRef.current);
        setSyncing(false);
      } else if (newPending > 0 && newEligible > 0 && navigator.onLine) {
        setSyncing(true);
      } else {
        setSyncing(false);
      }
      
      previousPendingRef.current = newPending;
      setPending(newPending);
      setEligible(newEligible);
      setBlocked(newBlocked);
      setNextRetryAtMs(progress.nextRetryAtMs ?? null);
    } catch {
      if (version !== refreshVersionRef.current) return;
      setStatusKnown(false);
      setStatusError(true);
      setPending(0);
      setEligible(0);
      setBlocked(0);
      setNextRetryAtMs(null);
    }
  };

  useEffect(() => {
    setStatusKnown(false);
    setStatusError(false);
    previousPendingRef.current = 0;
    if (isAuthenticated) refresh();
    const id = isAuthenticated ? window.setInterval(refresh, POLL_MS) : undefined;
    
    // Handle online event
    // Requirements: 4.3 - Show sync progress when coming back online
    const onOnline = () => {
      setOnline(true);
      if (wasOfflineRef.current && isAuthenticated) {
        showOnlineToast();
        wasOfflineRef.current = false;
      }
      setSyncing(isAuthenticated);
      if (isAuthenticated) refresh();
    };
    
    // Handle offline event
    // Requirements: 4.1 - Display visual indicator showing offline status
    const onOffline = () => {
      setOnline(false);
      wasOfflineRef.current = true;
      if (isAuthenticated) showOfflineToast();
      setSyncing(false);
    };
    
    const onAnyChange = () => { if (isAuthenticated) refresh(); };
    
    // Handle sync:progress events from syncService
    // Requirements: 4.3 - Track sync progress
    const onSyncProgress = (event: CustomEvent<SyncProgress>) => {
      if (!isAuthenticated) return;
      ++refreshVersionRef.current;
      setStatusKnown(true);
      setStatusError(false);
      const progress = event.detail;
      setPending(progress.total);
      setEligible(progress.eligible);
      setBlocked(progress.blocked);
      setNextRetryAtMs(progress.nextRetryAtMs ?? null);
      if (progress.synced > 0) {
        setLastSyncedCount(progress.synced);
      }
      if (progress.total === 0 && progress.synced > 0 && progress.blocked === 0) {
        setSyncing(false);
        showSyncCompleteToast(progress.synced);
      } else if (progress.total > 0 && progress.eligible > 0) {
        setSyncing(true);
      } else {
        setSyncing(false);
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
      ++refreshVersionRef.current;
      if (id !== undefined) window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('guest:changed', onAnyChange as EventListener);
      window.removeEventListener('sync:status', onAnyChange as EventListener);
      window.removeEventListener('sync:progress', onSyncProgress as EventListener);
    };
  }, [isAuthenticated, user?.id]);

  if (!isAuthenticated) {
    return (
      <IonChip className="offline-sync-indicator guest" title="Guest recordings stay on this device. Sign in to sync across devices.">
        <IonIcon icon={cloudOffline} aria-hidden="true" />
        <IonLabel>On this device</IonLabel>
      </IonChip>
    );
  }

  // Offline state - show warning chip
  // Requirements: 4.1 - Display visual indicator showing offline status
  if (!online) {
    return (
      <IonChip className="offline-sync-indicator offline">
        <IonIcon icon={cloudOffline} aria-hidden="true" />
        <IonLabel>Offline</IonLabel>
      </IonChip>
    );
  }

  if (!statusKnown) {
    return (
      <IonChip className="offline-sync-indicator checking">
        <IonIcon icon={timeOutline} aria-hidden="true" />
        <IonLabel>{statusError ? 'Sync status unavailable' : 'Checking sync'}</IonLabel>
      </IonChip>
    );
  }

  // Quarantined/permanent failures
  if (blocked > 0) {
    return (
      <button
        type="button"
        className="offline-sync-indicator actionable issues"
        aria-label={`View ${blocked} sync issue${blocked === 1 ? '' : 's'}`}
        onClick={goToSyncIssues}
      >
        <IonIcon icon={alertCircle} aria-hidden="true" />
        <IonLabel>
          Issues {blocked}
        </IonLabel>
      </button>
    );
  }

  // Syncing state - show progress
  // Requirements: 4.3 - Show sync progress indicator
  if (pending > 0 || syncing) {
    if (pending > 0 && eligible === 0) {
      const label = (() => {
        if (!nextRetryAtMs) return 'Retrying later';
        const diffMs = nextRetryAtMs - Date.now();
        if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Retrying later';
        const minutes = Math.ceil(diffMs / 60_000);
        if (minutes <= 1) return 'Retry in <1m';
        if (minutes < 60) return `Retry in ${minutes}m`;
        const hours = Math.ceil(minutes / 60);
        return `Retry in ${hours}h`;
      })();
      return (
        <IonChip className="offline-sync-indicator waiting">
          <IonIcon icon={timeOutline} aria-hidden="true" />
          <IonLabel>{label}</IonLabel>
        </IonChip>
      );
    }
    return (
      <IonChip className="offline-sync-indicator syncing">
        <IonIcon icon={cloudUpload} aria-hidden="true" />
        <IonLabel>
          {pending > 0 ? `Syncing ${pending}` : 'Syncing...'}
        </IonLabel>
      </IonChip>
    );
  }

  // All synced state
  // Requirements: 4.4 - Show confirmation that data has been synced
  return (
    <IonChip className="offline-sync-indicator synced">
      <IonIcon icon={checkmarkCircle} aria-hidden="true" />
      <IonLabel>All synced</IonLabel>
    </IonChip>
  );
};

export default OfflineSyncIndicator;

