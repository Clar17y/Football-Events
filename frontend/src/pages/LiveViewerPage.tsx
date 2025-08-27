import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IonPage, IonContent, IonHeader, IonToolbar, IonTitle, IonChip, IonLabel, IonText, IonList, IonItem } from '@ionic/react';
import viewerApi from '../services/api/viewerApi';

interface LiveViewerPageProps {
  onNavigate?: (pageOrUrl: string) => void;
  matchId: string;
}

type Summary = {
  matchId: string;
  status: string;
  currentPeriod?: number | null;
  currentPeriodType?: string | null;
  score: { home: number; away: number };
  homeTeam?: { id: string; name: string } | null;
  awayTeam?: { id: string; name: string } | null;
  kickoffTime?: string | null;
};

type Period = { id: string; periodNumber: number; periodType: string; startedAt?: string | null; endedAt?: string | null; durationSeconds?: number | null };
type EventItem = { id: string; kind: string; teamId?: string | null; playerId?: string | null; periodNumber?: number | null; clockMs?: number; sentiment?: number; createdAt?: string | null };

const LiveViewerPage: React.FC<LiveViewerPageProps> = ({ onNavigate, matchId }) => {
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [connected, setConnected] = useState<boolean>(false);
  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef<number>(0);

  // Read viewer token from URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const t = url.searchParams.get('view');
    setToken(t);
  }, []);

  // Load initial snapshot via REST then open SSE
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!matchId || !token) return;
      try {
        const [s, p, e] = await Promise.all([
          viewerApi.getSummary(matchId, token),
          viewerApi.getPeriods(matchId, token),
          viewerApi.getEvents(matchId, token),
        ]);
        if (cancelled) return;
        setSummary(s);
        setPeriods(p);
        setEvents(e);
      } catch (err) {
        console.error('Failed to load viewer snapshot', err);
      }
      openSSE();
    };
    const openSSE = () => {
      if (!token) return;
      try {
        esRef.current?.close();
        const es = viewerApi.openEventSource(matchId, token);
        esRef.current = es;
        es.onopen = () => { setConnected(true); retryRef.current = 0; };
        es.onerror = () => {
          setConnected(false);
          es.close();
          // backoff reconnect
          const attempt = Math.min(5, (retryRef.current || 0) + 1);
          retryRef.current = attempt;
          setTimeout(openSSE, attempt * 1000);
        };
        es.addEventListener('snapshot', (ev: MessageEvent) => {
          try {
            const data = JSON.parse(ev.data);
            setSummary(data.summary);
            setPeriods(data.periods || []);
            setEvents(data.events || []);
          } catch {}
        });
        es.addEventListener('event_created', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data); setEvents(prev => [...prev, d.event]); } catch {}
        });
        es.addEventListener('event_deleted', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data); setEvents(prev => prev.filter(e => e.id !== d.id)); } catch {}
        });
        es.addEventListener('period_started', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data); setPeriods(prev => [...prev, d.period]); } catch {}
        });
        es.addEventListener('period_ended', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data); setPeriods(prev => prev.map(p => p.id === d.period.id ? d.period : p)); } catch {}
        });
        es.addEventListener('state_changed', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data); setSummary(prev => prev ? { ...prev, ...d } : prev); } catch {}
        });
      } catch (e) {
        console.error('SSE error', e);
      }
    };
    load();
    return () => { cancelled = true; esRef.current?.close(); };
  }, [matchId, token]);

  const teamNames = useMemo(() => ({
    home: summary?.homeTeam?.name || 'Home',
    away: summary?.awayTeam?.name || 'Away',
  }), [summary]);

  const statusLabel = useMemo(() => {
    const st = summary?.status || 'SCHEDULED';
    if (st === 'LIVE') return 'LIVE';
    if (st === 'PAUSED') return 'PAUSED';
    if (st === 'COMPLETED') return 'FT';
    return st;
  }, [summary]);

  const timeline = useMemo(() => {
    const markers: any[] = [];
    for (const p of periods) {
      if (p.startedAt) markers.push({ type: 'period_started', at: p.startedAt, period: p });
      if (p.endedAt) markers.push({ type: 'period_ended', at: p.endedAt, period: p });
    }
    const gameplay = events.map(e => ({ type: 'event', at: e.createdAt || '', event: e }));
    return [...markers, ...gameplay].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }, [periods, events]);

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Live Viewer</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <IonChip color={summary?.status === 'LIVE' && connected ? 'danger' : 'medium'}>
            <IonLabel>{statusLabel}{connected ? '' : ' · Reconnecting'}</IonLabel>
          </IonChip>
          <IonText>
            <strong>{teamNames.home}</strong> {summary?.score?.home ?? 0} - {summary?.score?.away ?? 0} <strong>{teamNames.away}</strong>
          </IonText>
        </div>
        <IonList>
          {timeline.map((item, idx) => (
            <IonItem key={idx}>
              <IonLabel>
                {item.type === 'event' ? (
                  <div>
                    <strong>{item.event.kind}</strong>
                    {item.event.playerId ? ` · Player ${item.event.playerId}` : ''}
                    {typeof item.event.clockMs === 'number' ? ` · ${Math.floor((item.event.clockMs || 0)/60000)}'` : ''}
                  </div>
                ) : (
                  <div>
                    <strong>{item.type === 'period_started' ? 'Period started' : 'Period ended'}</strong>
                    {` · ${item.period.periodType} ${item.period.periodNumber}`}
                  </div>
                )}
              </IonLabel>
            </IonItem>
          ))}
        </IonList>
      </IonContent>
    </IonPage>
  );
};

export default LiveViewerPage;

