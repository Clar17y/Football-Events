import React from 'react';
import { IonButton, IonChip, IonIcon, IonLabel } from '@ionic/react';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';

export interface LiveHeaderProps {
  homeName: string;
  awayName: string;
  status?: string;
  homeScore?: number;
  awayScore?: number;
  venue?: string | null;
  competition?: string | null;
  showPrev?: boolean;
  showNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  showShare?: boolean;
  onShare?: () => void;
  shareLabel?: string;
  shareColor?: string;
  showReconnect?: boolean;
}

const LiveHeader: React.FC<LiveHeaderProps> = ({
  homeName,
  awayName,
  status,
  homeScore,
  awayScore,
  venue,
  competition,
  showPrev,
  showNext,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  showShare,
  onShare,
  shareLabel,
  shareColor,
  showReconnect,
}) => {
  const statusColor =
    status === 'LIVE' ? 'success' : status === 'PAUSED' ? 'warning' : status === 'COMPLETED' ? 'tertiary' : 'medium';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      {showPrev && (
        <IonButton fill="clear" onClick={onPrev} disabled={!!prevDisabled}>
          <IonIcon icon={chevronBackOutline} />
        </IonButton>
      )}

      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 18, fontWeight: 700 }}>
            {homeName}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            {status === 'SCHEDULED' || status === undefined ? 'vs' : `${homeScore ?? 0} - ${awayScore ?? 0}`}
          </div>
          <div style={{ minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 18, fontWeight: 700 }}>
            {awayName}
          </div>
        </div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          {status && (
            <IonChip color={statusColor as any} style={{ height: 22 }}>
              <IonLabel style={{ fontSize: 12 }}>{status}</IonLabel>
            </IonChip>
          )}
          {showReconnect && (
            <IonChip color={'medium'} style={{ height: 22 }}>
              <IonLabel style={{ fontSize: 12 }}>Reconnecting…</IonLabel>
            </IonChip>
          )}
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {venue || 'Venue TBC'} • {competition || 'Competition'}
          </span>
          {showShare && (
            <IonButton size="small" onClick={onShare} color={shareColor as any} fill={shareColor ? 'solid' : 'outline'}>
              {shareLabel || 'Share'}
            </IonButton>
          )}
        </div>
      </div>

      {showNext && (
        <IonButton fill="clear" onClick={onNext} disabled={!!nextDisabled}>
          <IonIcon icon={chevronForwardOutline} />
        </IonButton>
      )}
    </div>
  );
};

export default LiveHeader;
