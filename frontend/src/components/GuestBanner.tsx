import React, { useEffect, useState } from 'react';
import { IonChip, IonLabel, IonButton } from '@ionic/react';
import { isGuest, getGuestId } from '../utils/guest';
import { GUEST_LIMITS, canAddEvent, canChangeFormation } from '../utils/quotas';
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
          .where('createdByUserId')
          .equals(guestId)
          .and(t => !t.isDeleted && !t.isOpponent)
          .count();
        const matches = await db.matches.where('createdByUserId').equals(guestId).and(m => !m.isDeleted).count();
        let players: number | undefined = undefined;
        if (teamId) {
          players = await db.players.where('currentTeam').equals(teamId).and(p => p.createdByUserId === guestId && !p.isDeleted).count();
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
    <IonChip color={color as any}>
      <IonLabel>{label}: {value}</IonLabel>
    </IonChip>
  );

  const teamsLabel = `${counts.teams}/${GUEST_LIMITS.maxTeams}`;
  const matchesLabel = `${counts.matches}/${GUEST_LIMITS.maxMatches}`;
  const playersLabel = counts.players == null ? undefined : `${counts.players}/${GUEST_LIMITS.maxPlayersPerTeam}`;
  const eventsLabel = counts.nonScoringEvents == null ? undefined : `${counts.nonScoringEvents}/${GUEST_LIMITS.maxNonScoringEventsPerMatch}`;
  const formsLabel = counts.formations == null ? undefined : `${counts.formations}/${GUEST_LIMITS.maxFormationChangesPerMatch}`;

  return (
    <aside className="guest-banner" aria-label="Guest mode">
      <div className="guest-banner-summary">
        <p>Guest mode <span>· On this device</span></p>
        <IonButton fill="clear" size="small" onClick={() => setShowSignup(true)}>Sign up</IonButton>
      </div>
      <details className="guest-banner-limits">
        <summary>Limits</summary>
        <div className="guest-banner-counts">
          {chip('Teams', teamsLabel, counts.teams >= GUEST_LIMITS.maxTeams ? 'warning' : 'medium')}
          {chip('Matches', matchesLabel, counts.matches >= GUEST_LIMITS.maxMatches ? 'warning' : 'medium')}
          {playersLabel && chip('Players', playersLabel, counts.players! >= GUEST_LIMITS.maxPlayersPerTeam ? 'warning' : 'medium')}
          {eventsLabel && chip('Non‑scoring Events', eventsLabel, (counts.nonScoringEvents! >= GUEST_LIMITS.maxNonScoringEventsPerMatch ? 'warning' : 'medium'))}
          {formsLabel && chip('Formation Changes', formsLabel, (counts.formations! >= GUEST_LIMITS.maxFormationChangesPerMatch ? 'warning' : 'medium'))}
        </div>
        <p>Create a free account to remove limits.</p>
      </details>
      <SignupPromptModal isOpen={showSignup} onClose={() => setShowSignup(false)} />
    </aside>
  );
};

export default GuestBanner;
