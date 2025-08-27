import React from 'react';
import { IonButton, IonChip, IonIcon, IonLabel, IonText } from '@ionic/react';
import { 
  footballOutline,
  swapHorizontalOutline,
  navigateOutline,
  shieldCheckmarkOutline,
  handLeftOutline,
  bodyOutline,
  alertCircleOutline,
  flagOutline,
  flashOutline,
  exitOutline,
  optionsOutline,
  trashOutline,
} from 'ionicons/icons';

export type FeedItem = {
  id: string;
  kind: 'event' | 'system';
  label: string;
  createdAt: Date;
  periodNumber?: number;
  periodType?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  clockMs?: number;
  teamId?: string;
  playerId?: string | null;
  sentiment?: number;
  event?: any; // Keep generic for reuse
};

export interface LiveTimelineProps {
  feed: FeedItem[];
  currentMatch?: { homeTeamId?: string; awayTeamId?: string; homeTeam?: { name?: string }; awayTeam?: { name?: string } };
  playerNameMap?: Record<string, string>;
  emptyMessage?: string;
  showDelete?: boolean;
  onDelete?: (item: FeedItem) => void;
}

const minuteLabel = (ev: any): string => {
  if (typeof ev?.clockMs === 'number') {
    const mm = Math.floor(ev.clockMs / 60000);
    return `${mm}'`;
  }
  const d = ev?.createdAt ? new Date(ev.createdAt) : new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const LiveTimeline: React.FC<LiveTimelineProps> = ({ feed, currentMatch, playerNameMap = {}, emptyMessage, showDelete, onDelete }) => {
  if (!feed || feed.length === 0) {
    return <IonText color="medium">{emptyMessage || 'Timeline will be populated as events and match updates occur.'}</IonText>;
  }

  const groups = new Map<string, FeedItem[]>();
  for (const item of feed) {
    const type = item.periodType || 'REGULAR';
    const key = `${type}:${item.periodNumber || 1}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  const orderedPeriods = Array.from(groups.keys()).sort((a, b) => {
    const maxA = Math.max(...groups.get(a)!.map(i => i.createdAt?.getTime?.() || 0));
    const maxB = Math.max(...groups.get(b)!.map(i => i.createdAt?.getTime?.() || 0));
    return maxB - maxA;
  });

  return (
    <div>
      {orderedPeriods.map((pn) => (
          <div key={pn} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{groupTitle(pn)}</div>
          {groups.get(pn)!.map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--ion-color-step-150, rgba(0,0,0,.06))' }}>
              {item.kind === 'event' && item.event ? (
                <IonChip style={{ height: 20 }} color={chipColor(item.event.kind)}><IonLabel style={{ fontSize: 12 }}>{minuteLabel(item.event)}</IonLabel></IonChip>
              ) : (
                <IonChip style={{ height: 20 }} color="tertiary"><IonLabel style={{ fontSize: 12 }}>—</IonLabel></IonChip>
              )}
              <IonIcon icon={{
                goal: footballOutline,
                own_goal: footballOutline,
                assist: swapHorizontalOutline,
                key_pass: navigateOutline,
                save: shieldCheckmarkOutline,
                interception: handLeftOutline,
                tackle: bodyOutline,
                foul: alertCircleOutline,
                penalty: flagOutline,
                free_kick: flashOutline,
                ball_out: exitOutline,
              }[(item.event?.kind as any)] || optionsOutline} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {(() => {
                    if (item.kind === 'system') return 'Match Update';
                    const ev = item.event!;
                    const team = ev?.teamName || (ev.teamId === currentMatch?.homeTeamId ? currentMatch?.homeTeam?.name : ev.teamId === currentMatch?.awayTeamId ? currentMatch?.awayTeam?.name : 'Team');
                    const name = ev?.playerName || (ev.playerId ? playerNameMap[ev.playerId] : undefined);
                    return name ? `${team} — ${name}` : team || 'Team';
                  })()}
                </div>
              </div>
              {item.kind === 'event' && item.event && typeof item.event.sentiment === 'number' && item.event.sentiment !== 0 && (
                <IonChip style={{ height: 20 }} color={item.event.sentiment > 0 ? 'success' as any : 'warning' as any}>
                  <IonLabel style={{ fontSize: 12 }}>{item.event.sentiment > 0 ? `+${item.event.sentiment}` : item.event.sentiment}</IonLabel>
                </IonChip>
              )}
              {showDelete && item.kind === 'event' && (
                <IonButton size="small" fill="clear" color="danger" onClick={() => onDelete?.(item)} aria-label="Delete event">
                  <IonIcon icon={trashOutline} />
                </IonButton>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

function chipColor(kind?: string): any {
  switch (kind) {
    case 'goal':
    case 'assist':
    case 'key_pass':
      return 'danger'; // attacking (rose)
    case 'interception':
    case 'tackle':
    case 'foul':
      return 'tertiary'; // defender (indigo)
    case 'save':
      return 'success'; // goalkeeper (emerald)
    case 'penalty':
    case 'free_kick':
    case 'ball_out':
    case 'own_goal':
      return 'warning'; // other (amber)
    default:
      return 'medium';
  }
}

export default LiveTimeline;
function groupTitle(key: string): string {
  const [type, numStr] = key.split(':');
  const n = parseInt(numStr || '1', 10);
  if (type === 'EXTRA_TIME') return `Extra Time ${n}`;
  if (type === 'PENALTY_SHOOTOUT') return 'Penalty Shootout';
  return `Period ${n}`;
}
