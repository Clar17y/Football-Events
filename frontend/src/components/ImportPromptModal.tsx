import React, { useEffect, useState } from 'react';
import { IonModal, IonCard, IonCardContent, IonButton, IonText, IonProgressBar } from '@ionic/react';
import { hasGuestData, getGuestDataSummary, runImport } from '../services/importService';

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
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonCard style={{ margin: 16 }}>
        <IonCardContent>
          <h2 style={{ marginTop: 0 }}>Import your guest data</h2>
          {summary && (
            <IonText color="medium" style={{ display: 'block', marginBottom: 8 }}>
              Found: {summary.seasons} seasons, {summary.teams} teams, {summary.players} players, {summary.matches} matches, {summary.events} events
            </IonText>
          )}
          {running && (
            <div style={{ marginBottom: 8 }}>
              <IonText>{progress?.step || 'Importing…'}</IonText>
              <IonProgressBar type="indeterminate" style={{ marginTop: 8 }} />
            </div>
          )}
          {done && (
            <IonText color="success" style={{ display: 'block', marginBottom: 8 }}>
              Import complete. Your data is now linked to your account.
            </IonText>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <IonButton fill="outline" onClick={onClose}>Close</IonButton>
            <IonButton onClick={start} disabled={running || done || !summary || (summary.seasons+summary.teams+summary.players+summary.matches+summary.events)===0}>Import now</IonButton>
          </div>
        </IonCardContent>
      </IonCard>
    </IonModal>
  );
};

export default ImportPromptModal;
