import React from 'react';
import { IonChip, IonLabel, IonText } from '@ionic/react';

export interface PeriodClockProps {
  timerMs: number;
  periodLabel: string;
  stoppageLabel?: string | null;
}

const formatTimer = (ms: number): string => {
  if (!ms || ms < 0) ms = 0;
  return new Date(ms).toISOString().substr(14, 5);
};

const PeriodClock: React.FC<PeriodClockProps> = ({ timerMs, periodLabel, stoppageLabel }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>
        {formatTimer(timerMs)}
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

