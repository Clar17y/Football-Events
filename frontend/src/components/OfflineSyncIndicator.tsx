import React, { useEffect, useState } from 'react';
import { IonChip, IonLabel, IonIcon, IonText } from '@ionic/react';
import { cloudOffline, cloudUpload, checkmarkCircle } from 'ionicons/icons';

const POLL_MS = 3000;

const OfflineSyncIndicator: React.FC = () => {
  const [pending, setPending] = useState<number>(0);
  const [online, setOnline] = useState<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);

  const refresh = async () => {
    try {
      const { db } = await import('../db/indexedDB');
      const count = await db.outbox.where('synced').equals(0).count();
      setPending(count);
    } catch {
      setPending(0);
    }
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    const onOnline = () => { setOnline(true); refresh(); };
    const onOffline = () => setOnline(false);
    const onAnyChange = () => refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('guest:changed', onAnyChange as EventListener);
    window.addEventListener('sync:status', onAnyChange as EventListener);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('guest:changed', onAnyChange as EventListener);
      window.removeEventListener('sync:status', onAnyChange as EventListener);
    };
  }, []);

  if (!online) {
    return (
      <IonChip color="warning" style={{ height: 22 }}>
        <IonIcon icon={cloudOffline} />
        <IonLabel style={{ fontSize: 12 }}>Offline</IonLabel>
      </IonChip>
    );
  }

  if (pending > 0) {
    return (
      <IonChip color="tertiary" style={{ height: 22 }}>
        <IonIcon icon={cloudUpload} />
        <IonLabel style={{ fontSize: 12 }}>Syncing {pending}</IonLabel>
      </IonChip>
    );
  }

  return (
    <IonChip color="success" style={{ height: 22 }}>
      <IonIcon icon={checkmarkCircle} />
      <IonLabel style={{ fontSize: 12 }}>All synced</IonLabel>
    </IonChip>
  );
};

export default OfflineSyncIndicator;

