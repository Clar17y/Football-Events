import React, { useState, useEffect } from 'react';
import {
  IonModal, IonContent, IonList, IonItem, IonLabel, IonChip,
  IonHeader, IonToolbar, IonButtons, IonButton, IonTextarea, IonIcon
} from '@ionic/react';
import { mic, micOff } from 'ionicons/icons';
import { useMatchContext } from '../contexts/MatchContext';
import { db } from '../db/indexedDB';
import { useSpeechToText } from '../utils/useSpeechToText';
import type { Player, Team } from '../types/index';

// Temporary interface for components that expect players array
interface TeamWithPlayers extends Team {
  players: Player[];
}
import './GoalModal.css';
type Step =
  | 'team'
  | 'goalType'    // for teams with NO player list
  | 'scorer'      // player list of scoring team
  | 'assist'      // player list of scoring team
  | 'oppScorer'   // player list of other team
  | 'oppAssist'   // player list of scoring team
  | 'notes';

interface Props {
  isOpen: boolean;
  onDidDismiss: () => void;
  matchId: string;
  seasonId: string;
  period: number;
  ourTeam: TeamWithPlayers;
  oppTeam: TeamWithPlayers;
}

var ownGoalFlag = false; // global flag to track if the goal is an own goal

/* ———————————————————————————————————————————————— */

const GoalModal: React.FC<Props> = ({
  isOpen, onDidDismiss, matchId, seasonId, period,
  ourTeam, oppTeam
}) => {
  /* context / clock */
  const { clock } = useMatchContext();
  const elapsedMs =
    clock.running
      ? clock.offset_ms + Date.now() - (clock.start_ts ?? 0)
      : clock.offset_ms;

  /* modal state */
  const [step, setStep]       = useState<Step>('team');
  const [team, setTeam]       = useState<TeamWithPlayers | null>(null);
  const [scorer, setScorer]   = useState<Player | null | 'none'>(null);
  const [assist, setAssist]   = useState<Player | null | 'none'>(null);
  const [notes, setNotes]     = useState('');
  const { recognising, startDictation } = useSpeechToText(
    (text) => setNotes(n => n + ' ' + text)
  );

  /* ——— reset state whenever modal closes ——— */
  useEffect(() => {
    if (!isOpen) {
      setStep('team'); setTeam(null); setScorer(null);
      setAssist(null); setNotes('');
    }
  }, [isOpen]);

  /* ——— speech-to-text helper (now using centralized hook) ——— */

  /* ——— final write ——— */
  const saveGoal = async (
    targetTeam: TeamWithPlayers,
    scorerId: string | null,
    assistId: string | null,
    ownGoalFlag: boolean
  ) => {
    try {
      const kind = ownGoalFlag ? 'own_goal' : 'goal';
      
      const payload = {
        kind: kind as 'goal' | 'own_goal',
        match_id: matchId,
        season_id: seasonId,
        created: Date.now(),
        period_number: period,
        clock_ms: elapsedMs,
        team_id: targetTeam.id,
        player_id: scorerId || 'unknown',
        sentiment: ownGoalFlag ? -2 : 2, // Default sentiment
        notes: assistId ? `${notes} (Assist: ${assistId})` : notes,
      };

      const result = await db.addEvent(payload);
      if (!result.success) {
        throw new Error(result.error || 'Failed to save goal');
      }

      console.log('Goal saved to IndexedDB');
      onDidDismiss();
      ownGoalFlag = false; // reset the global flag
    } catch (error) {
      console.error('Failed to save goal:', error);
      alert('Failed to save goal. Please try again.');
    }
  };

  /* ——— click handlers ——— */
  const chooseTeam = (t: TeamWithPlayers) => {
    setTeam(t);
    if (t.players.length === 0) {
      setStep('goalType');          // Goal or Own Goal
    } else {
      setStep('scorer');            // regular player / own goal list
    }
  };

  const finish = () => {
    const assistId = assist ? (assist as Player).id : null;
    const scorerId = scorer ? (scorer as Player).id : null;
    if (ownGoalFlag) { 
        team!.id = team!.id === ourTeam.id ? oppTeam.id : ourTeam.id; // switch teams for own goal
    }
    saveGoal(team!, scorerId, assistId, ownGoalFlag);
  };

  /* ——— breadcrumb chips ——— */
  const Crumb = ({ label, go }: { label: string; go: () => void }) => (
    <IonChip onClick={go} color="light" style={{ marginRight: 4 }}>
      {label}
    </IonChip>
  );
  const CrumbGoal = team?.id === oppTeam.id ? 'Opp Goal' : 'Goal';
  const crumbBar = (
    <>
      <Crumb label={CrumbGoal} go={() => setStep('team')} />
      {scorer && <Crumb label={scorer === 'none'? 'Own Goal' : scorer.full_name} go={() => setStep('scorer')} />}
      {assist && assist !== 'none' && (
        <Crumb label={(assist as Player).full_name} go={() => setStep('assist')} />
      )}
    </>
  );

  /* ——— render lists ——— */
  /* GoalType list for empty-roster team ---------------------- */
    const renderGoalType = () => (
        <IonList>
        <IonItem button onClick={() => { /* normal goal */ setScorer(null); setAssist(null); setStep('notes'); }}>
            <IonLabel>Goal</IonLabel>
        </IonItem>
        <IonItem button onClick={() => { /* own goal */ setStep('oppScorer'); ownGoalFlag = true; }}>
            <IonLabel color="danger">Own Goal</IonLabel>
        </IonItem>
        </IonList>
    );
  
  const renderTeam = () => (
    <IonList>
      {[ourTeam, oppTeam].map(t => (
        <IonItem key={t.id} button onClick={() => chooseTeam(t)}>
          <IonLabel>{t.name}</IonLabel>
        </IonItem>
      ))}
    </IonList>
  );
  const renderScorer = () => {
    if (!team) return renderTeam();
    return (
        <IonList>
        {team!.players.map(p => (
            <IonItem key={p.id} button onClick={() => { setScorer(p); setStep('assist'); }}>
            <IonLabel>{p.full_name}</IonLabel>
            </IonItem>
        ))}
        <IonItem button onClick={() => {setStep('oppScorer'); ownGoalFlag = true; }}>
            <IonLabel color="danger">Own Goal</IonLabel>
        </IonItem>
        </IonList>
    );
  };
  const renderOppScorer = () => {
    if (!team) return renderTeam();
    const opp = team!.id === ourTeam.id ? oppTeam : ourTeam;
    return (
      <IonList>
        {opp.players.length === 0 && (
          <IonItem button onClick={() => { setScorer(null); setStep('oppAssist'); }}>
            <IonLabel>Unknown Player</IonLabel>
          </IonItem>
        )}
        {opp.players.map(p => (
          <IonItem key={p.id} button onClick={() => { setScorer(p); setStep('oppAssist'); }}>
            <IonLabel>{p.full_name}</IonLabel>
          </IonItem>
        ))}
      </IonList>
    );
  };
  const renderAssist = () => {
    if (!team) return renderTeam();
        return (
        <IonList>
        <IonItem button onClick={() => { setAssist('none'); setStep('notes'); }}>
            <IonLabel>No Assister</IonLabel>
        </IonItem>
        {team!.players.map(p => (
            <IonItem key={p.id} button onClick={() => { setAssist(p); setStep('notes'); }}>
            <IonLabel>{p.full_name}</IonLabel>
            </IonItem>
        ))}
        </IonList>
    );
  };
  const renderOppAssist = renderAssist;
  const renderNotes = () => (
    <>
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
      <IonButton expand="block" color="success" onClick={finish}>
        Save
      </IonButton>
    </>
  );

  /* ——— main render ——— */
  const body = {
    team:      renderTeam(),
    goalType:  renderGoalType(),
    scorer:    renderScorer(),
    assist:    renderAssist(),
    oppScorer: renderOppScorer(),
    oppAssist: renderOppAssist(),
    notes:     renderNotes()
  }[step];

  const safeBody =
  (!team && step !== 'team') ? renderTeam() : body;

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDidDismiss} animated canDismiss={true}>
      <IonHeader translucent>
        <IonToolbar>
          <IonButtons slot="start">
            {crumbBar}
          </IonButtons>
          <IonButtons slot="end">
            <IonButton onClick={onDidDismiss}>Close</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className={`fade-${step}`} fullscreen>
        {safeBody}
      </IonContent>
    </IonModal>
  );
};

export default GoalModal;
