import React, { useEffect, useState } from 'react';
import { IonModal, IonContent, IonHeader, IonToolbar, IonTitle, IonButton, IonText, IonProgressBar, IonButtons } from '@ionic/react';
import { getGuestDataSummary, runImport } from '../services/importService';

interface ImportPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ImportPromptModal: React.FC<ImportPromptModalProps> = ({ isOpen, onClose }) => {
  const [summary, setSummary] = useState<{ seasons: number; teams: number; players: number; matches: number; events: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ step: string; done: number; total: number } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      const s = await getGuestDataSummary();
      setSummary(s);
    })();
  }, [isOpen]);

  const start = async () => {
    setRunning(true);
    setDone(false);
    setProgress({ step: 'Starting', done: 0, total: 1 });
    try {
      await runImport((p) => setProgress(p));
      setDone(true);
      try { window.dispatchEvent(new CustomEvent('import:completed')); } catch {}
    } catch (e) {
      // noop; progress UI handles state
    } finally {
      setRunning(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.5} breakpoints={[0, 0.5, 0.75]}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Import your guest data</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {summary && (
          <IonText color="medium" style={{ display: 'block', marginBottom: 16 }}>
            <p>Found: {summary.seasons} seasons, {summary.teams} teams, {summary.players} players, {summary.matches} matches, {summary.events} events</p>
          </IonText>
        )}
        {running && (
          <div style={{ marginBottom: 16 }}>
            <IonText>{progress?.step || 'Importing…'}</IonText>
            <IonProgressBar type="indeterminate" style={{ marginTop: 8 }} />
          </div>
        )}
        {done && (
          <IonText color="success" style={{ display: 'block', marginBottom: 16 }}>
            <p>Import complete. Your data is now linked to your account.</p>
          </IonText>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <IonButton fill="outline" onClick={onClose}>Close</IonButton>
          <IonButton onClick={start} disabled={running || done || !summary || (summary.seasons+summary.teams+summary.players+summary.matches+summary.events)===0}>Import now</IonButton>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default ImportPromptModal;
