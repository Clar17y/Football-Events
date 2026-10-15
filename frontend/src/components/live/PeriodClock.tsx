import React from 'react';
import { IonChip, IonLabel, IonText } from '@ionic/react';
import { formatLiveClock } from '../../utils/liveMatchTiming';

export interface PeriodClockProps {
  timerMs: number;
  periodLabel: string;
  stoppageLabel?: string | null;
}

const PeriodClock: React.FC<PeriodClockProps> = ({ timerMs, periodLabel, stoppageLabel }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div role="timer" aria-label={`Match clock ${formatLiveClock(timerMs)}`} style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatLiveClock(timerMs)}
      </div>
      <IonText color="medium" style={{ fontSize: 14, fontWeight: 600 }}>
        {periodLabel}
      </IonText>
      {stoppageLabel && (
        <IonChip color="warning" style={{ height: 18 }}>
          <IonLabel style={{ fontSize: 12 }}>{stoppageLabel}</IonLabel>
        </IonChip>
      )}
    </div>
  );
};

export default PeriodClock;

