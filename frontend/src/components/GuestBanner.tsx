import React, { useEffect, useState } from 'react';
import { IonCard, IonCardContent, IonChip, IonLabel, IonText, IonButton } from '@ionic/react';
import { isGuest, getGuestId } from '../utils/guest';
import { GUEST_LIMITS, canAddEvent, canChangeFormation } from '../utils/guestQuota';
import SignupPromptModal from './SignupPromptModal';

interface GuestBannerProps {
  teamId?: string;
  matchId?: string;
}

const GuestBanner: React.FC<GuestBannerProps> = ({ teamId, matchId }) => {
  const [counts, setCounts] = useState<{ teams: number; matches: number; players?: number; nonScoringEvents?: number; formations?: number }>({ teams: 0, matches: 0 });
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    if (!isGuest()) return;
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const { db } = await import('../db/indexedDB');
        const guestId = getGuestId();
        const teams = await db.teams
          .where('created_by_user_id')
          .equals(guestId)
          .and(t => !t.is_deleted && (t as any).is_opponent !== true)
          .count();
        const matches = await db.matches.where('created_by_user_id').equals(guestId).and(m => !m.is_deleted).count();
        let players: number | undefined = undefined;
        if (teamId) {
          players = await db.players.where('current_team').equals(teamId).and(p => p.created_by_user_id === guestId && !p.is_deleted).count();
        }
        let nonScoringEvents: number | undefined = undefined;
        let formations: number | undefined = undefined;
        if (matchId) {
          // Count non-scoring via quota helper (derive remaining to compute used)
          const canEv = await canAddEvent(matchId, 'assist');
          nonScoringEvents = canEv.ok ? (GUEST_LIMITS.maxNonScoringEventsPerMatch - (canEv as any).remaining) : GUEST_LIMITS.maxNonScoringEventsPerMatch;
          const canForm = await canChangeFormation(matchId);
          formations = canForm.ok ? (GUEST_LIMITS.maxFormationChangesPerMatch - (canForm as any).remaining) : GUEST_LIMITS.maxFormationChangesPerMatch;
        }
        if (!cancelled) setCounts({ teams, matches, players, nonScoringEvents, formations });
      } catch (e: any) {
        const innerName = e?.inner?.name || e?.cause?.name;
        const msg = e?.message || e?.inner?.message || '';
        if (
          e?.name === 'DatabaseClosedError' ||
          e?.name === 'UpgradeError' ||
          innerName === 'UpgradeError' ||
          (typeof msg === 'string' && msg.includes('changing primary key'))
        ) {
          try {
            const { db } = await import('../db/indexedDB');
            await db.forceReset();
            // Retry once after reset
            return fetchCounts();
          } catch {}
        }
        // Silently ignore other errors for guest banner
      }
    };

    fetchCounts();
    const onChanged = () => { fetchCounts(); };
    window.addEventListener('guest:changed', onChanged as EventListener);
    return () => { cancelled = true; window.removeEventListener('guest:changed', onChanged as EventListener); };
  }, [teamId, matchId]);

  if (!isGuest()) return null;

  const chip = (label: string, value: string, color?: string) => (
    <IonChip color={color as any} style={{ height: 22 }}>
      <IonLabel style={{ fontSize: 12 }}>{label}: {value}</IonLabel>
    </IonChip>
  );

  const teamsLabel = `${counts.teams}/${GUEST_LIMITS.maxTeams}`;
  const matchesLabel = `${counts.matches}/${GUEST_LIMITS.maxMatches}`;
  const playersLabel = counts.players == null ? undefined : `${counts.players}/${GUEST_LIMITS.maxPlayersPerTeam}`;
  const eventsLabel = counts.nonScoringEvents == null ? undefined : `${counts.nonScoringEvents}/${GUEST_LIMITS.maxNonScoringEventsPerMatch}`;
  const formsLabel = counts.formations == null ? undefined : `${counts.formations}/${GUEST_LIMITS.maxFormationChangesPerMatch}`;

  return (
    <IonCard style={{ margin: '8px 12px', border: '1px dashed var(--ion-color-medium)' }}>
      <IonCardContent style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <IonText color="medium" style={{ fontWeight: 600 }}>Guest Mode</IonText>
        {chip('Teams', teamsLabel, counts.teams >= GUEST_LIMITS.maxTeams ? 'warning' : 'medium')}
        {chip('Matches', matchesLabel, counts.matches >= GUEST_LIMITS.maxMatches ? 'warning' : 'medium')}
        {playersLabel && chip('Players', playersLabel, counts.players! >= GUEST_LIMITS.maxPlayersPerTeam ? 'warning' : 'medium')}
        {eventsLabel && chip('Non‑scoring Events', eventsLabel, (counts.nonScoringEvents! >= GUEST_LIMITS.maxNonScoringEventsPerMatch ? 'warning' : 'medium'))}
        {formsLabel && chip('Formation Changes', formsLabel, (counts.formations! >= GUEST_LIMITS.maxFormationChangesPerMatch ? 'warning' : 'medium'))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <IonText color="medium" style={{ fontSize: 12 }}>Create a free account to remove limits</IonText>
          <IonButton size="small" onClick={() => setShowSignup(true)}>Sign Up</IonButton>
        </div>
        <SignupPromptModal isOpen={showSignup} onClose={() => setShowSignup(false)} />
      </IonCardContent>
    </IonCard>
  );
};

export default GuestBanner;
