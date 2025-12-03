import React, { useEffect, useState } from 'react';
import {
  IonModal,
  IonButton,
  IonIcon,
  IonText,
  IonProgressBar
} from '@ionic/react';
import { close, cloudUpload, checkmarkCircle } from 'ionicons/icons';
import { getGuestDataSummary, runImport } from '../services/importService';
import './PromptModal.css';

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

  const hasData = summary && (summary.seasons + summary.teams + summary.players + summary.matches + summary.events) > 0;

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onClose}
      className="prompt-modal"
    >
      <div className="prompt-container">
        <div className="prompt-header">
          <h2 className="prompt-title">Import Your Guest Data</h2>
          <IonButton
            fill="clear"
            onClick={onClose}
            className="prompt-close"
          >
            <IonIcon icon={close} />
          </IonButton>
        </div>

        <div className="prompt-content">
          {summary && hasData && (
            <IonText color="medium">
              <p className="prompt-message">
                Found: {summary.seasons} seasons, {summary.teams} teams, {summary.players} players, {summary.matches} matches, {summary.events} events
              </p>
            </IonText>
          )}

          {running && (
            <div className="prompt-progress">
              <IonText className="prompt-progress-text">
                {progress?.step || 'Importing…'}
              </IonText>
              <IonProgressBar type="indeterminate" />
            </div>
          )}

          {done && (
            <IonText className="prompt-success">
              <IonIcon icon={checkmarkCircle} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              Import complete! Reloading page to refresh data...
            </IonText>
          )}

          <div className="prompt-buttons">
            <IonButton
              expand="block"
              onClick={start}
              disabled={running || done || !hasData}
            >
              <IonIcon icon={cloudUpload} slot="start" />
              Import Now
            </IonButton>
            <IonButton
              expand="block"
              fill="outline"
              onClick={onClose}
            >
              {done ? 'Close' : 'Cancel'}
            </IonButton>
          </div>
        </div>
      </div>
    </IonModal>
  );
};

export default ImportPromptModal;
