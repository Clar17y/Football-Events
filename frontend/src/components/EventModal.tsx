import React, { useState } from 'react';
import {
  IonModal, IonContent, IonList, IonItem, IonLabel, IonSelect, IonSelectOption,
  IonHeader, IonToolbar, IonButtons, IonButton, IonTextarea, IonTitle, IonIcon
} from '@ionic/react';
import { mic, micOff } from 'ionicons/icons';
import { useMatchContext } from '../contexts/MatchContext';
import { db } from '../db/indexedDB';
import { useSpeechToText } from '../utils/useSpeechToText';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useRetry } from '../hooks/useRetry';
import { useToast } from '../contexts/ToastContext';
import { useLoading, InlineLoading } from './ui/LoadingSpinner';
import { InlineError } from './ui/ErrorMessage';
import type { Player, Team, TeamWithPlayers } from '@shared/types';
import type { EventKind } from '../types/events';
import { SENTIMENT_OPTIONS } from '../types/index';

interface EventModalProps {
  isOpen: boolean;
  onDidDismiss: () => void;
  eventKind: EventKind;
  team: TeamWithPlayers;
  matchId: string;
  seasonId: string;
  period: number;
  defaultPlayerId?: string;
  onEventSaved?: (event: { kind: string; team: string; player: string; ts: number }) => void;
}

const EventModal: React.FC<EventModalProps> = ({
  isOpen, onDidDismiss, eventKind, team, matchId, seasonId, period, defaultPlayerId, onEventSaved
}) => {
  const { clock } = useMatchContext();
  const elapsedMs = clock.running
    ? clock.offsetMs + Date.now() - (clock.startTs ?? 0)
    : clock.offsetMs;

  const [playerId, setPlayerId] = useState<string>(defaultPlayerId || '');
  const [sentiment, setSentiment] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const { recognising, startDictation } = useSpeechToText(
    (text) => setNotes(n => n + ' ' + text));

  // Error handling and loading
  const { handleError } = useErrorHandler({ context: 'EventModal' });
  const { loading, withLoading } = useLoading();
  const { executeWithRetry } = useRetry({
    maxAttempts: 3,
    initialDelayMs: 1000
  });
  const { showSuccess } = useToast();

  // Validation function
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!playerId) {
      errors.playerId = 'Please select a player';
    }

    if (notes && notes.length > 500) {
      errors.notes = 'Notes are too long (maximum 500 characters)';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveEvent = async () => {
    // Clear previous validation errors
    setValidationErrors({});

    // Validate form
    if (!validateForm()) {
      return;
    }

    const saveOperation = async () => {
      const event = {
        kind: eventKind,
        team: team.id,
        player: playerId,
        ts: elapsedMs,
      };

      const eventData = {
        kind: eventKind,
        matchId: matchId,
        periodNumber: period,
        clockMs: elapsedMs,
        teamId: team.id,
        playerId: playerId,
        sentiment,
        notes,
        createdAt: new Date().toISOString(),
        createdByUserId: 'local-user', // Should ideally come from auth
        isDeleted: false
      };

      const result = await db.addEnhancedEvent(eventData);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save event');
      }

      return { result, event };
    };

    try {
      const data = await withLoading(async () => {
        return await executeWithRetry(saveOperation);
      });

      if (data) {
        const { event } = data;
        showSuccess('Event saved successfully');
        if (onEventSaved) onEventSaved(event);
        onDidDismiss();

        // Reset form
        setPlayerId('');
        setSentiment(0);
        setNotes('');
        setValidationErrors({});
      }
    } catch (error) {
      handleError(error as Error, () => saveEvent());
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDidDismiss}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{eventKind.replace('_', ' ').toUpperCase()}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onDidDismiss}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          <IonItem>
            <IonLabel position="stacked">Player</IonLabel>
            <IonSelect
              interface="popover"
              value={playerId}
              placeholder="Select player"
              onIonChange={e => setPlayerId(e.detail.value)}
            >
              {team.players.map((p: Player) => (
                <IonSelectOption key={p.id} value={p.id}>{p.name}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          {validationErrors.playerId && (
            <InlineError message={validationErrors.playerId} />
          )}
          <IonItem>
            <IonLabel position="stacked">Sentiment</IonLabel>
            <IonSelect
              interface="popover"
              value={sentiment}
              placeholder="Select sentiment"
              onIonChange={e => setSentiment(Number(e.detail.value))}
            >
              {SENTIMENT_OPTIONS.map(s => (
                <IonSelectOption key={s.value} value={s.value}>{s.label}</IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>
          <IonItem lines="none">
            <IonLabel position="stacked">Notes (optional)</IonLabel>
            <IonTextarea
              value={notes}
              onIonInput={e => setNotes(e.detail.value!)}
              rows={3}
            />
            <IonButton slot="end" fill="clear" onClick={startDictation}>
              <IonIcon slot="icon-only" icon={recognising ? micOff : mic} />
            </IonButton>
          </IonItem>
          {validationErrors.notes && (
            <InlineError message={validationErrors.notes} />
          )}
        </IonList>
        <IonButton
          expand="block"
          color="success"
          onClick={saveEvent}
          disabled={loading || !playerId}
        >
          {loading ? (
            <>
              <InlineLoading />
              <span style={{ marginLeft: '8px' }}>Saving...</span>
            </>
          ) : (
            'Save'
          )}
        </IonButton>
      </IonContent>
    </IonModal>
  );
};

export default EventModal;