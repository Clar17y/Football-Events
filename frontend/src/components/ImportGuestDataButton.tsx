import React, { useEffect, useState } from 'react';
import { IonButton } from '@ionic/react';
import ImportPromptModal from './ImportPromptModal';
import { useAuth } from '../contexts/AuthContext';

const ImportGuestDataButton: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [needsImport, setNeedsImport] = useState(false);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    try {
      const { hasGuestData } = await import('../services/importService');
      const v = await hasGuestData();
      setNeedsImport(Boolean(v));
    } catch {
      setNeedsImport(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setNeedsImport(false);
      setOpen(false);
      return;
    }
    refresh();
  }, [isAuthenticated]);

  useEffect(() => {
    const onNeeded = () => refresh();
    const onCompleted = () => { setOpen(false); refresh(); };
    window.addEventListener('import:needed', onNeeded as EventListener);
    window.addEventListener('import:completed', onCompleted as EventListener);
    window.addEventListener('auth:loggedin', onNeeded as EventListener);
    return () => {
      window.removeEventListener('import:needed', onNeeded as EventListener);
      window.removeEventListener('import:completed', onCompleted as EventListener);
      window.removeEventListener('auth:loggedin', onNeeded as EventListener);
    };
  }, []);

  if (!isAuthenticated || !needsImport) return null;

  return (
    <>
      <IonButton size="small" color="warning" onClick={() => setOpen(true)}>
        Import Guest Data
      </IonButton>
      <ImportPromptModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default ImportGuestDataButton;

