import React, { useMemo, useState } from 'react';
import {
  IonPage,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonButton,
  IonIcon,
  IonText,
  IonAlert,
} from '@ionic/react';
import { refreshOutline, trashOutline, downloadOutline, arrowUpCircleOutline } from 'ionicons/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import PageHeader from '../components/PageHeader';
import { db } from '../db/indexedDB';
import type { DbSyncFailure } from '../db/schema';
import { syncService } from '../services/syncService';
import { getCurrentUserId } from '../utils/network';

interface SyncIssuesPageProps {
  onNavigate?: (page: string) => void;
}

const QUOTA_REASON_CODES = new Set(['QUOTA_EXCEEDED', 'FEATURE_LOCKED']);

function downloadJson(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function resolveTable(tableName: string): keyof typeof db | null {
  const map: Record<string, keyof typeof db> = {
    seasons: 'seasons',
    teams: 'teams',
    players: 'players',
    playerTeams: 'playerTeams',
    player_teams: 'playerTeams',
    matches: 'matches',
    lineup: 'lineup',
    defaultLineups: 'defaultLineups',
    default_lineups: 'defaultLineups',
    events: 'events',
    matchPeriods: 'matchPeriods',
    matchState: 'matchState',
  };

  return map[tableName] ?? null;
}

const SyncIssuesPage: React.FC<SyncIssuesPageProps> = ({ onNavigate }) => {
  const [confirmDiscard, setConfirmDiscard] = useState<DbSyncFailure | null>(null);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);
  const [showUpgradeInfo, setShowUpgradeInfo] = useState(false);

  const blocked = useLiveQuery(async () => {
    try {
      if (!db.syncFailures) return [];
      const rows = await db.syncFailures.toArray();
      return rows
        .filter((r) => r.permanent)
        .sort((a, b) => (b.lastAttemptAt || 0) - (a.lastAttemptAt || 0));
    } catch {
      return [];
    }
  }, []);

  const hasQuotaIssues = useMemo(() => {
    return (blocked || []).some((f) => f.reasonCode && QUOTA_REASON_CODES.has(f.reasonCode));
  }, [blocked]);

  const retryNow = async (failure: DbSyncFailure) => {
    try {
      await db.syncFailures.update([failure.table, failure.recordId], {
        permanent: false,
        attemptCount: 0,
        nextRetryAt: Date.now(),
      });
    } catch {}

    try {
      await syncService.flushOnce();
    } catch {}
  };

  const retryAll = async () => {
    const failures = blocked || [];
    for (const failure of failures) {
      try {
        await db.syncFailures.update([failure.table, failure.recordId], {
          permanent: false,
          attemptCount: 0,
          nextRetryAt: Date.now(),
        });
      } catch {}
    }

    try {
      await syncService.flushOnce();
    } catch {}
  };

  const exportOne = async (failure: DbSyncFailure) => {
    const tableKey = resolveTable(failure.table);
    let record: unknown = null;
    try {
      if (tableKey) {
        const table: any = (db as any)[tableKey];
        record = await table?.get?.(failure.recordId);
      }
    } catch {}

    downloadJson(`sync-issue_${failure.table}_${failure.recordId}.json`, { failure, record });
  };

  const exportAll = async () => {
    const failures = blocked || [];
    const items: Array<{ failure: DbSyncFailure; record: unknown }> = [];

    for (const failure of failures) {
      const tableKey = resolveTable(failure.table);
      let record: unknown = null;
      try {
        if (tableKey) {
          const table: any = (db as any)[tableKey];
          record = await table?.get?.(failure.recordId);
        }
      } catch {}
      items.push({ failure, record });
    }

    downloadJson(`sync-issues_${Date.now()}.json`, items);
  };

  const discardLocalChange = async (
    failure: DbSyncFailure,
    opts?: { triggerSync?: boolean; suppressAuthToast?: boolean }
  ) => {
    const tableKey = resolveTable(failure.table);
    const authUserId = getCurrentUserId();

    try {
      if (!tableKey) {
        await db.syncFailures.delete([failure.table, failure.recordId]);
        return;
      }

      const table: any = (db as any)[tableKey];
      const record = await table?.get?.(failure.recordId);
      if (!record) {
        await db.syncFailures.delete([failure.table, failure.recordId]);
        return;
      }

      // Match state is derived/ephemeral; deleting locally is the safest discard.
      if (tableKey === 'matchState') {
        await table.delete(failure.recordId);
        await db.syncFailures.delete([failure.table, failure.recordId]);
        return;
      }

      const previouslySynced = Boolean((record as any).syncedAt);

      if (!previouslySynced) {
        await table.delete(failure.recordId);
        await db.syncFailures.delete([failure.table, failure.recordId]);
        return;
      }

      if (!authUserId) {
        if (!opts?.suppressAuthToast) {
          try {
            (window as any).__toastApi?.current?.showError?.('Please sign in to discard previously-synced items.');
          } catch {}
        }
        return;
      }

      if (typeof (record as any).isDeleted === 'boolean') {
        await table.update(failure.recordId, {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedByUserId: authUserId,
          synced: false,
        });
      } else {
        await table.delete(failure.recordId);
      }

      await db.syncFailures.delete([failure.table, failure.recordId]);
    } catch (err) {
      console.error('[SyncIssues] discard failed:', err);
    } finally {
      if (opts?.triggerSync !== false) {
        try {
          await syncService.flushOnce();
        } catch {}
      }
    }
  };

  const discardAll = async () => {
    const failures = blocked || [];
    const authUserId = getCurrentUserId();

    for (const failure of failures) {
      await discardLocalChange(failure, { triggerSync: false, suppressAuthToast: true });
    }

    if (!authUserId) {
      try {
        (window as any).__toastApi?.current?.showError?.('Please sign in to discard previously-synced items.');
      } catch {}
    }

    try {
      await syncService.flushOnce();
    } catch {}
  };

  return (
    <IonPage>
      <PageHeader onNavigate={onNavigate} showBackButton backDestination="home" />
      <IonContent className="ion-padding">
        <IonCard>
          <IonCardHeader>
            <IonCardTitle>Sync Issues</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <IonText color="medium">
              <p>
                These items were permanently blocked from syncing (for example due to invalid payloads, access issues, or plan limits).
              </p>
            </IonText>

            {hasQuotaIssues && (
              <div style={{ marginTop: 12 }}>
                <IonButton size="small" onClick={() => setShowUpgradeInfo(true)}>
                  <IonIcon icon={arrowUpCircleOutline} slot="start" />
                  Upgrade to Premium
                </IonButton>
              </div>
            )}

            {blocked && blocked.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <IonButton size="small" fill="outline" onClick={retryAll}>
                  <IonIcon icon={refreshOutline} slot="start" />
                  Retry All
                </IonButton>
                <IonButton size="small" fill="outline" color="danger" onClick={() => setConfirmDiscardAll(true)}>
                  <IonIcon icon={trashOutline} slot="start" />
                  Discard All
                </IonButton>
                <IonButton size="small" fill="outline" onClick={exportAll}>
                  <IonIcon icon={downloadOutline} slot="start" />
                  Export All JSON
                </IonButton>
              </div>
            )}
          </IonCardContent>
        </IonCard>

        <IonList inset>
          {(blocked || []).length === 0 ? (
            <IonItem>
              <IonLabel>
                <h2>No sync issues</h2>
                <p>All local changes are eligible to sync.</p>
              </IonLabel>
            </IonItem>
          ) : (
            (blocked || []).map((failure) => (
              <IonItem key={`${failure.table}:${failure.recordId}`}>
                <IonLabel>
                  <h2>
                    {failure.table}{' '}
                    <IonBadge color={failure.reasonCode && QUOTA_REASON_CODES.has(failure.reasonCode) ? 'warning' : 'medium'}>
                      {failure.reasonCode || `HTTP_${failure.lastStatus || 'ERR'}`}
                    </IonBadge>
                  </h2>
                  <p style={{ wordBreak: 'break-all' }}>{failure.recordId}</p>
                  {failure.lastError ? <p>{failure.lastError}</p> : null}
                </IonLabel>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <IonButton size="small" fill="clear" onClick={() => retryNow(failure)} title="Retry now">
                    <IonIcon icon={refreshOutline} />
                  </IonButton>
                  <IonButton size="small" fill="clear" onClick={() => setConfirmDiscard(failure)} title="Discard local change">
                    <IonIcon icon={trashOutline} />
                  </IonButton>
                  <IonButton size="small" fill="clear" onClick={() => exportOne(failure)} title="Export JSON">
                    <IonIcon icon={downloadOutline} />
                  </IonButton>
                </div>
              </IonItem>
            ))
          )}
        </IonList>

        <IonAlert
          isOpen={!!confirmDiscard}
          header="Discard local change?"
          message="If this item was never synced, discarding deletes it locally. If it was previously synced, discarding marks it as deleted and will sync the deletion to the server when possible."
          onDidDismiss={() => setConfirmDiscard(null)}
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Discard',
              role: 'destructive',
              handler: async () => {
                if (confirmDiscard) await discardLocalChange(confirmDiscard);
                setConfirmDiscard(null);
              },
            },
          ]}
        />

        <IonAlert
          isOpen={confirmDiscardAll}
          header="Discard all local changes?"
          message="This will discard all blocked items. Never-synced items will be deleted locally. Previously-synced items will be marked deleted and synced to the server when possible."
          onDidDismiss={() => setConfirmDiscardAll(false)}
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Discard All',
              role: 'destructive',
              handler: async () => {
                await discardAll();
                setConfirmDiscardAll(false);
              },
            },
          ]}
        />

        <IonAlert
          isOpen={showUpgradeInfo}
          header="Premium"
          message="Premium is £3.99/month or £35/year. This build exposes plan limits, but billing UI is not implemented yet."
          onDidDismiss={() => setShowUpgradeInfo(false)}
          buttons={['OK']}
        />
      </IonContent>
    </IonPage>
  );
};

export default SyncIssuesPage;
