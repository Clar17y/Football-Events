import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  IonPage,
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
  IonButton,
  IonIcon,
  IonSpinner,
  IonText,
  IonCard,
  IonCardContent,
  IonChip,
  IonLabel,
  IonModal,
} from '@ionic/react';
import { 
  chevronBackOutline, 
  chevronForwardOutline, 
  football,
  footballOutline,
  bodyOutline,
  alertCircleOutline,
  shieldOutline,
  shieldCheckmarkOutline,
  flashOutline,
  flagOutline,
  navigateOutline,
  exitOutline,
  swapHorizontalOutline,
  trendingUpOutline,
  optionsOutline,
  arrowForwardOutline,
  handLeftOutline,
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import LiveHeader from '../components/live/LiveHeader';
import PeriodClock from '../components/live/PeriodClock';
import GuestBanner from '../components/GuestBanner';
import LiveTimeline from '../components/live/LiveTimeline';
import { defaultLineupsApi } from '../services/api/defaultLineupsApi';
import LineupManagementModal from '../components/lineup/LineupManagementModal';
import formationsApi from '../services/api/formationsApi';
import './LiveMatchPage.css';
import matchesApi from '../services/api/matchesApi';
import viewerApi from '../services/api/viewerApi';
import eventsApi from '../services/api/eventsApi';
import teamsApi from '../services/api/teamsApi';
import { useAuth } from '../contexts/AuthContext';
import type { MatchState, MatchPeriod, Event as MatchEvent } from '@shared/types';
import type { Match } from '@shared/types';
import { getLocalMatch } from '../services/guestQuickMatch';
import { authApi } from '../services/api/authApi';

interface LiveMatchPageProps {
  onNavigate?: (pageOrUrl: string) => void;
  matchId?: string;
}

const LiveMatchPage: React.FC<LiveMatchPageProps> = ({ onNavigate, matchId }) => {
  const [upcoming, setUpcoming] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(matchId);
  const { isAuthenticated } = useAuth();
  const [viewerToken, setViewerToken] = useState<string | null>(null);
  const [viewerParam, setViewerParam] = useState<'view' | 'code' | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const [viewerExpired, setViewerExpired] = useState(false);
  const retryRef = useRef<number>(0);

  // Live state
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [periods, setPeriods] = useState<MatchPeriod[]>([]);
  const [timerMs, setTimerMs] = useState<number>(0);
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const [viewerTeams, setViewerTeams] = useState<{ homeId?: string; awayId?: string; homeName?: string; awayName?: string } | null>(null);
  const [viewerSummary, setViewerSummary] = useState<{ competition?: string | null; venue?: string | null } | null>(null);
  const [activeShareCode, setActiveShareCode] = useState<string | null>(null);
  const [localMatches, setLocalMatches] = useState<Match[]>([]);

  // Load upcoming matches for switcher (skip in viewer mode)
  // Helper to hydrate guest live state snapshot
  const hydrateGuestState = useCallback(async (matchId: string) => {
    try {
      const { db } = await import('../db/indexedDB');
      const rec = await db.settings.get(`local_live_state:${matchId}`);
      if (!rec?.value) return;
      const parsed = JSON.parse(rec.value);
      const ps: MatchPeriod[] = (parsed.periods || []).map((p: any) => ({
        id: p.id,
        matchId,
        periodNumber: p.periodNumber,
        periodType: (p.periodType || 'REGULAR') as any,
        startedAt: p.startedAt ? new Date(p.startedAt) : undefined,
        endedAt: p.endedAt ? new Date(p.endedAt) : undefined,
        durationSeconds: p.durationSeconds
      }));
      setPeriods(ps);
      const running = parsed.status === 'LIVE';
      const lastPeriod = ps.find(p => !p.endedAt) || ps[ps.length - 1];
      let base = parsed.timerMs || 0;
      if (running && lastPeriod?.startedAt) {
        base += Math.max(0, Date.now() - new Date(lastPeriod.startedAt).getTime());
      }
      setTimerMs(base);
      setMatchState({
        id: 'local-state',
        matchId,
        status: parsed.status || 'NOT_STARTED',
        currentPeriod: lastPeriod?.periodNumber || 1,
        totalElapsedSeconds: Math.floor(base / 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);
      if (running) startTicking();
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Skip fetching upcoming when using viewer token (public)
      const params = new URLSearchParams(window.location.search);
      const hasViewer = params.has('view') || params.has('code');
      if (hasViewer) {
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (!isAuthenticated) {
          // Guest: load local matches for selection and optionally selected match
          try {
            const [up, recent] = await Promise.all([
              matchesApi.getUpcoming(20).catch(() => []),
              matchesApi.getRecent(10).catch(() => [])
            ]);
            const combined: Record<string, Match> = {} as any;
            [...up, ...recent].forEach((m: any) => { combined[m.id] = m; });
            setLocalMatches(Object.values(combined));
          } catch {}
          if (selectedId) {
            const m = await getLocalMatch(selectedId);
            if (cancelled) return;
            setUpcoming(m ? [m] : []);
            // Try to hydrate local live state snapshot
            await hydrateGuestState(selectedId);
          } else {
            setUpcoming([]);
          }
        } else {
          const list = await matchesApi.getUpcoming(20);
          if (cancelled) return;
          setUpcoming(list || []);
          // If no explicit matchId, select nearest upcoming
          if (!selectedId && list && list.length > 0) {
            setSelectedId(list[0].id);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load upcoming matches');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [hydrateGuestState]);

  // Re-hydrate guest state when selecting a local match from the list
  useEffect(() => {
    if (!isAuthenticated && selectedId) {
      hydrateGuestState(selectedId);
    }
  }, [isAuthenticated, selectedId, hydrateGuestState]);

  // Query active viewer link on load (for creator UI state)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isAuthenticated || !selectedId) return;
      try {
        const links = await matchesApi.getActiveViewerLinks(selectedId);
        console.log('Active viewer links', links);
        if (cancelled) return;
        setActiveShareCode(links.length > 0 ? links[0].code : null);
      } catch {
        // ignore
      }
    };
    run();
    return () => { cancelled = true; };
  }, [isAuthenticated, selectedId]);

  // Read viewer token or code from URL (if present)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('view');
    const c = params.get('code');
    if (t) { setViewerToken(t); setViewerParam('view'); }
    else if (c) { setViewerToken(c); setViewerParam('code'); }
  }, []);

  // Load server match state + periods when a match is selected (authorized only)
  useEffect(() => {
    let cancelled = false;
    const fetchLive = async () => {
      if (!isAuthenticated || !selectedId || viewerToken) {
        setMatchState(null);
        setPeriods([]);
        return;
      }
      try {
        const [stateResp, periodsResp] = await Promise.all([
          matchesApi.getMatchState(selectedId),
          matchesApi.getMatchPeriods(selectedId),
        ]);
        if (cancelled) return;
        setMatchState(stateResp);
        setPeriods(periodsResp);
        const base = computeBaseMs(stateResp, periodsResp);
        setTimerMs(base);
        if (stateResp.status === 'LIVE') {
          startTicking();
        } else {
          stopTicking();
        }
      } catch (e) {
        if (!cancelled) {
          // silently ignore for viewers; show read-only
          setMatchState(null);
          setPeriods([]);
          stopTicking();
        }
      }
    };
    fetchLive();
    return () => { cancelled = true; };
  }, [isAuthenticated, selectedId, viewerToken]);

  // Viewer mode: load snapshot and open SSE
  useEffect(() => {
    let cancelled = false;
    const openSSE = () => {
      if (!selectedId || !viewerToken || !viewerParam) return;
      if (viewerExpired) return;
      try {
        esRef.current?.close();
        const es = viewerApi.openEventSource(selectedId, { name: viewerParam, value: viewerToken });
        esRef.current = es;
        es.onopen = () => { setSseConnected(true); retryRef.current = 0; };
        es.onerror = async () => {
          setSseConnected(false);
          es.close();
          // Check token validity once; if expired, stop retrying and inform user
          const check = await viewerApi.checkToken(selectedId, { name: viewerParam!, value: viewerToken! });
          if (!check.ok && (check.status === 401 || check.status === 403)) {
            setViewerExpired(true);
            try { (window as any).__toastApi?.current?.showError?.('Viewer link expired. Please ask the coach for a new link.'); } catch {}
            return; // do not retry
          }
          // Exponential backoff retry
          const attempt = (retryRef.current || 0) + 1;
          retryRef.current = attempt;
          const delay = Math.min(30000, Math.pow(2, Math.min(attempt, 6)) * 1000); // 2s,4s,8s,... up to 30s
          setTimeout(openSSE, delay);
        };
        es.addEventListener('snapshot', (ev: MessageEvent) => {
          try {
            const data = JSON.parse(ev.data);
            if (!cancelled) {
              const s = data.summary as any;
              setPeriods(data.periods || []);
              setViewerTeams({ homeId: s.homeTeam?.id, awayId: s.awayTeam?.id, homeName: s.homeTeam?.name, awayName: s.awayTeam?.name });
              setViewerSummary({ competition: s.competition, venue: s.venue, periodFormat: s.periodFormat });
              setMatchState({
                id: 'viewer',
                matchId: s.matchId,
                status: s.status,
                currentPeriod: s.currentPeriod || undefined,
                currentPeriodType: s.currentPeriodType || undefined,
                totalElapsedSeconds: s.totalElapsedSeconds || 0,
                matchStartedAt: undefined,
                matchEndedAt: undefined,
                createdAt: new Date(),
                updatedAt: new Date(),
                created_by_user_id: '',
                is_deleted: false,
              } as any);
              // Build initial feed
              const feedEvents: FeedItem[] = (data.events || []).map((ev: any) => ({
                id: ev.id,
                kind: 'event',
                label: labelForEvent(ev.kind),
                createdAt: new Date(ev.createdAt || Date.now()),
                periodNumber: ev.periodNumber || undefined,
                periodType: ev.periodType || undefined,
                clockMs: ev.clockMs || 0,
                teamId: ev.teamId || undefined,
                playerId: ev.playerId || undefined,
                sentiment: ev.sentiment || 0,
                event: ev,
              }));
              // System items from existing periods
              const systemFromPeriods: FeedItem[] = (data.periods || []).flatMap((p: any) => {
                const out: FeedItem[] = [];
                if (p.startedAt) out.push({ id: `ps-${p.id}`, kind: 'system', label: periodStartLabel(p), createdAt: new Date(p.startedAt), periodNumber: p.periodNumber });
                if (p.endedAt) out.push({ id: `pe-${p.id}`, kind: 'system', label: periodEndLabel(p), createdAt: new Date(p.endedAt), periodNumber: p.periodNumber });
                return out;
              });
              setEventFeed(sortFeed([...feedEvents, ...systemFromPeriods]));
              // Compute base and control clock
              const base = computeBaseMs({
                status: s.status,
                currentPeriod: s.currentPeriod,
              } as any, data.periods || []);
              setTimerMs(base);
              if (s.status === 'LIVE') startTicking(); else stopTicking();
              prevStatusRef.current = s.status || null;
            }
          } catch {}
        });
        es.addEventListener('event_created', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data);
            const e = d.event;
            setEventFeed(prev => sortFeed([{ id: e.id, kind: 'event', label: labelForEvent(e.kind), createdAt: new Date(e.createdAt || Date.now()), periodNumber: e.periodNumber || undefined, periodType: e.periodType || inferPeriodType(new Date(e.createdAt || Date.now())), clockMs: e.clockMs || 0, teamId: e.teamId || undefined, playerId: e.playerId || undefined, sentiment: e.sentiment || 0, event: e }, ...prev]));
          } catch {}
        });
        // formation_changed SSE is no longer used; we persist a formation_change event and handle via event_created
        es.addEventListener('event_deleted', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data); setEventFeed(prev => prev.filter(i => i.id !== d.id)); } catch {}
        });
        es.addEventListener('period_started', (ev: MessageEvent) => {
          try { 
            const d = JSON.parse(ev.data); 
            setPeriods(prev => [...prev, d.period]); 
            setTimerMs(0);
            startTicking();
            setEventFeed(prev => sortFeed([{ id: `ps-${d.period.id}`, kind: 'system', label: periodStartLabel(d.period), createdAt: new Date(), periodNumber: d.period.periodNumber }, ...prev]));
          } catch {}
        });
        es.addEventListener('period_ended', (ev: MessageEvent) => {
          try { 
            const d = JSON.parse(ev.data); 
            setPeriods(prev => prev.map(p => p.id === d.period.id ? d.period : p)); 
            stopTicking();
            setTimerMs(0);
            setEventFeed(prev => sortFeed([{ id: `pe-${d.period.id}`, kind: 'system', label: periodEndLabel(d.period), createdAt: new Date(), periodNumber: d.period.periodNumber }, ...prev]));
          } catch {}
        });
        es.addEventListener('state_changed', (ev: MessageEvent) => {
          try { 
            const d = JSON.parse(ev.data); 
            setMatchState(prev => prev ? ({ ...prev, ...d }) as any : prev as any);
            if (typeof d.totalElapsedSeconds === 'number') {
              // Recompute base from totalElapsedSeconds and current ended periods
              const endedMs = (periods || []).reduce((acc, p: any) => acc + ((p.endedAt && p.durationSeconds) ? p.durationSeconds * 1000 : 0), 0);
              const base = Math.max(0, d.totalElapsedSeconds * 1000 - endedMs);
              setTimerMs(base);
            }
            if (d.status === 'LIVE') startTicking(); else stopTicking();
            const prev = prevStatusRef.current;
            if (prev && prev !== d.status) {
              if (d.status === 'PAUSED') setEventFeed(prevFeed => sortFeed([{ id: `sys-${Date.now()}-paused`, kind: 'system', label: 'Paused', createdAt: new Date(), periodNumber: d.currentPeriod }, ...prevFeed]));
              if (d.status === 'LIVE' && prev === 'PAUSED') setEventFeed(prevFeed => sortFeed([{ id: `sys-${Date.now()}-resumed`, kind: 'system', label: 'Resumed', createdAt: new Date(), periodNumber: d.currentPeriod }, ...prevFeed]));
              if (d.status === 'COMPLETED') setEventFeed(prevFeed => sortFeed([{ id: `sys-${Date.now()}-ft`, kind: 'system', label: 'Full Time', createdAt: new Date(), periodNumber: d.currentPeriod }, ...prevFeed]));
            }
            prevStatusRef.current = d.status;
          } catch {}
        });
      } catch {}
    };
    const load = async () => {
      if (!selectedId || !viewerToken || !viewerParam) return;
      if (viewerExpired) return;
      try {
        const [summary] = await Promise.all([
          viewerApi.getSummary(selectedId, { name: viewerParam, value: viewerToken }),
        ]);
        if (cancelled) return;
        setMatchState({
          id: 'viewer', matchId: summary.matchId, status: summary.status,
          currentPeriod: summary.currentPeriod || undefined, currentPeriodType: summary.currentPeriodType || undefined,
          createdAt: new Date(), is_deleted: false,
        } as any);
        setViewerTeams({ homeId: summary.homeTeam?.id, awayId: summary.awayTeam?.id, homeName: summary.homeTeam?.name, awayName: summary.awayTeam?.name });
        setViewerSummary({ competition: summary.competition, venue: summary.venue, periodFormat: (summary as any).periodFormat });
      } catch {}
      openSSE();
    };
    load();
    return () => { cancelled = true; esRef.current?.close(); };
  }, [selectedId, viewerToken, viewerParam, viewerExpired]);

  const computeBaseMs = (state: MatchState | null, list: MatchPeriod[]): number => {
    if (!state) return 0;
    const endedMs = list.reduce((acc, p) => acc + (p.endedAt && p.durationSeconds ? p.durationSeconds * 1000 : 0), 0);
    let base = (state.totalElapsedSeconds || 0) * 1000 - endedMs;
    if (base <= 0) {
      const open = list.find(p => !p.endedAt && p.startedAt);
      if (open && state.status === 'LIVE') {
        base = Math.max(0, Date.now() - new Date(open.startedAt as any).getTime());
      } else {
        base = 0;
      }
    }
    return Math.max(0, base);
  };

  // Timer controls
  const startTicking = () => {
    if (timerRef.current) return;
    lastTickRef.current = performance.now();
    timerRef.current = window.requestAnimationFrame(tick);
  };
  const stopTicking = () => {
    if (timerRef.current) {
      window.cancelAnimationFrame(timerRef.current);
      timerRef.current = null;
    }
    lastTickRef.current = null;
  };
  const tick = (now: number) => {
    if (lastTickRef.current == null) {
      lastTickRef.current = now;
    }
    const delta = now - (lastTickRef.current || now);
    lastTickRef.current = now;
    setTimerMs((prev) => prev + delta);
    timerRef.current = window.requestAnimationFrame(tick);
  };
  useEffect(() => () => stopTicking(), []);

  // Ensure local state tracks prop updates (e.g., navigating to another /live/:id)
  useEffect(() => {
    if (matchId) setSelectedId(matchId);
  }, [matchId]);

  // For guests: when selectedId changes, load that local match into the upcoming list
  useEffect(() => {
    let cancelled = false;
    const syncUpcomingForGuest = async () => {
      if (isAuthenticated) return; // only for guests
      if (!selectedId) { setUpcoming([]); return; }
      try {
        const m = await getLocalMatch(selectedId);
        if (cancelled) return;
        setUpcoming(m ? [m] : []);
      } catch {
        if (!cancelled) setUpcoming([]);
      }
    };
    syncUpcomingForGuest();
    return () => { cancelled = true; };
  }, [isAuthenticated, selectedId]);

  const currentIndex = useMemo(() => {
    return upcoming.findIndex(m => m.id === selectedId);
  }, [upcoming, selectedId]);

  const currentMatch = useMemo(() => {
    if (currentIndex >= 0) return upcoming[currentIndex];
    return undefined;
  }, [currentIndex, upcoming]);

  const navigateMatch = (delta: number) => {
    if (upcoming.length === 0) return;
    if (currentIndex === -1) return;
    const nextIndex = Math.min(Math.max(currentIndex + delta, 0), upcoming.length - 1);
    const next = upcoming[nextIndex];
    if (next) {
      setSelectedId(next.id);
      // Reflect in URL via parent handler
      onNavigate?.(`/live/${next.id}`);
    }
  };

  const teamName = (team?: { name?: string } | null) => team?.name || viewerTeams?.homeName || 'TBD';

  const handleShareLink = async () => {
    try {
      if (!selectedId) return;
      const res = await matchesApi.shareViewerToken(selectedId, 480);
      // Normalize to absolute URL (server should send absolute using FRONTEND_URL/origin)
      let shareUrl = res.shareUrl || `${window.location.origin}/live/${selectedId}?${res.code ? `code=${encodeURIComponent(res.code)}` : `view=${encodeURIComponent(res.viewer_token)}`}`;
      try {
        const u = new URL(shareUrl, window.location.origin);
        shareUrl = u.href;
      } catch {}
      try {
        await navigator.clipboard.writeText(shareUrl);
        try { (window as any).__toastApi?.current?.showSuccess?.('Share link copied to clipboard'); } catch {}
      } catch {
        // Fallback prompt
        const ok = window.prompt('Copy this share link:', shareUrl);
        if (ok !== null) { try { (window as any).__toastApi?.current?.showSuccess?.('Share link ready'); } catch {} }
      }
      if (res.code) setActiveShareCode(res.code);
    } catch (e: any) {
      try { (window as any).__toastApi?.current?.showError?.(e?.message || 'Failed to create share link'); } catch {}
    }
  };

  const handleUnshareLink = async () => {
    try {
      if (!selectedId) return;
      await matchesApi.revokeViewerToken(selectedId, activeShareCode || undefined);
      setActiveShareCode(null);
      try { (window as any).__toastApi?.current?.showSuccess?.('Viewer link revoked'); } catch {}
    } catch (e: any) {
      try { (window as any).__toastApi?.current?.showError?.(e?.message || 'Failed to revoke link'); } catch {}
    }
  };

  const regPeriodsCount = (m?: Match) => {
    const fmt = (m?.periodFormat || '').toLowerCase();
    if (fmt.includes('half')) return 2;
    if (fmt.includes('quarter')) return 4;
    if (fmt.includes('whole')) return 1;
    return 2;
  };
  const currentOpenPeriod = periods.find(p => !p.endedAt);
  const endedRegularCount = periods.filter(p => p.periodType === 'REGULAR' && !!p.endedAt).length;
  const isFinalRegulationEnded = endedRegularCount >= regPeriodsCount(currentMatch);

  const getPeriodLabel = (): string => {
    const fmt = (currentMatch?.periodFormat || '').toLowerCase();
    const open = currentOpenPeriod;
    const latest = open || [...periods].sort((a, b) => (a.startedAt && b.startedAt ? new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime() : (b.periodNumber - a.periodNumber)))[0];
    // Completed always wins
    if (matchState?.status === 'COMPLETED') return 'FT';
    // If paused and no open period, show break/half time
    if (matchState?.status === 'PAUSED') {
      if (fmt.includes('half')) {
        return endedRegularCount >= 2 ? 'Full Time' : 'Half Time';
      }
      if (fmt.includes('quarter')) return 'Quarter Break';
      return 'Break';
    }
    // Scheduled, no periods yet
    if (!open && (!latest || !latest.startedAt)) {
      return matchState?.status === 'SCHEDULED' ? 'Pre‑Kickoff' : 'Break';
    }

    const type = (open?.periodType || latest?.periodType) as ('REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | undefined);
    const num = (open?.periodNumber || latest?.periodNumber) || 1;

    if (type === 'REGULAR') {
      if (fmt.includes('half')) {
        return num === 1 ? '1st Half' : num === 2 ? '2nd Half' : `Half ${num}`;
      }
      if (fmt.includes('quarter')) {
        return `Q${num}`;
      }
      if (fmt.includes('whole')) {
        return 'Regulation';
      }
      return `Period ${num}`;
    }
    if (type === 'EXTRA_TIME') {
      return `ET${num}`;
    }
    if (type === 'PENALTY_SHOOTOUT') {
      return 'Penalties';
    }

    // Default fallbacks
    return 'Live';
  };

  const getPerPeriodMs = (): number => {
    const fmt = (currentMatch?.periodFormat || '').toLowerCase();
    const total = (currentMatch?.durationMinutes || 0) * 60_000;
    const open = currentOpenPeriod;
    const type = open?.periodType;
    // Heuristics: halves/quarters split evenly; whole = full; ET default 15m
    if (type === 'EXTRA_TIME') return 15 * 60_000;
    if (fmt.includes('half')) return total ? Math.round(total / 2) : 45 * 60_000;
    if (fmt.includes('quarter')) return total ? Math.round(total / 4) : 12 * 60_000;
    if (fmt.includes('whole')) return total || 90 * 60_000;
    return total || 45 * 60_000;
  };

  const getStoppageMmSs = (): string | null => {
    const perMs = getPerPeriodMs();
    if (timerMs > perMs) {
      const over = Math.max(0, timerMs - perMs);
      const mm = Math.floor(over / 60_000);
      const ss = Math.floor((over % 60_000) / 1000).toString().padStart(2, '0');
      return `+${mm}:${ss}`;
    }
    return null;
  };

  // Handlers
  const handleKickOff = async () => {
    if (!selectedId) return;
    try {
      if (!isAuthenticated) {
        // Guest: local kickoff
        const now = new Date();
        if (matchState?.status === 'PAUSED') {
          // Start next regular period and resume
          const nextNum = (periods.filter(p => p.periodType === 'REGULAR').length) + 1;
          const p = { id: `local-p-${Date.now()}`, periodNumber: nextNum, periodType: 'REGULAR' as any, startedAt: now } as any;
          setPeriods(prev => [...prev, p]);
          const st: any = { ...(matchState || {}), status: 'LIVE', currentPeriod: nextNum };
          setMatchState(st);
          setTimerMs(0);
          startTicking();
          pushSystem(`Kick Off — Period ${nextNum}`, nextNum);
          try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'start_period', periodType: 'regular' }); await addToOutbox('match_commands', `cmd-${Date.now()+1}`, 'INSERT', { matchId: selectedId, cmd: 'resume' }); } catch {}
        } else {
          // First kickoff
          const p1 = { id: `local-p-${Date.now()}`, periodNumber: 1, periodType: 'REGULAR' as any, startedAt: now } as any;
          setPeriods([p1]);
          const st: any = { id: 'local-state', matchId: selectedId, status: 'LIVE', currentPeriod: 1, totalElapsedSeconds: 0, createdAt: new Date(), updatedAt: new Date() };
          setMatchState(st);
          setTimerMs(0);
          startTicking();
          pushSystem('Match Kick Off', 1);
          // Apply default lineups locally
          try {
            const hId = currentMatch?.homeTeamId; const aId = currentMatch?.awayTeamId;
            if (hId) await defaultLineupsApi.applyDefaultToMatch(hId, selectedId);
            if (aId) await defaultLineupsApi.applyDefaultToMatch(aId, selectedId);
          } catch {}
          try { const { db } = await import('../db/indexedDB'); await db.settings.put({ key: `local_live_state:${selectedId}`, value: JSON.stringify({ status: 'LIVE', periods: [{ id: p1.id, periodType: 'REGULAR', periodNumber: 1, startedAt: now.toISOString() }], timerMs: 0, lastUpdatedAt: Date.now() }), created_at: Date.now(), updated_at: Date.now() }); } catch {}
          try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'start_match' }); await addToOutbox('match_commands', `cmd-${Date.now()+1}`, 'INSERT', { matchId: selectedId, cmd: 'start_period', periodType: 'regular' }); } catch {}
        }
        return;
      }
      // Authenticated path
      if (matchState?.status === 'PAUSED') {
        await matchesApi.startPeriod(selectedId, 'regular' as any);
        const p = await matchesApi.getMatchPeriods(selectedId);
        setPeriods(p);
        const st = await matchesApi.resumeMatch(selectedId);
        setMatchState(st);
        const base = computeBaseMs(st, p);
        setTimerMs(base);
        startTicking();
        const pn = st.currentPeriod || currentPeriodNumber();
        pushSystem(`Kick Off — Period ${pn}`, pn);
      } else {
        const state = await matchesApi.startMatch(selectedId);
        setMatchState(state);
        const p = await matchesApi.getMatchPeriods(selectedId);
        setPeriods(p);
        const base = computeBaseMs(state, p);
        setTimerMs(base);
        startTicking();
        const pn = 1;
        pushSystem('Match Kick Off', pn);
        try {
          const hId = currentMatch?.homeTeamId; const aId = currentMatch?.awayTeamId;
          if (hId) await defaultLineupsApi.applyDefaultToMatch(hId, selectedId);
          if (aId) await defaultLineupsApi.applyDefaultToMatch(aId, selectedId);
        } catch (e) {
          console.warn('Apply default lineups failed', e);
        }
      }
    } catch (e) {
      // noop toast placeholder
      console.error('Kick off failed', e);
    }
  };
  const handlePause = async () => {
    if (!selectedId) return;
    try {
      if (!isAuthenticated) {
        setMatchState(prev => prev ? ({ ...prev, status: 'PAUSED' } as any) : prev);
        stopTicking();
        pushSystem('Paused', currentPeriodNumber());
        try { const { db } = await import('../db/indexedDB'); await db.settings.put({ key: `local_live_state:${selectedId}`, value: JSON.stringify({ status: 'PAUSED', periods, timerMs, lastUpdatedAt: Date.now() }), created_at: Date.now(), updated_at: Date.now() }); } catch {}
        try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'pause' }); } catch {}
        return;
      }
      const state = await matchesApi.pauseMatch(selectedId);
      setMatchState(state);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      const base = computeBaseMs(state, p);
      setTimerMs(base);
      stopTicking();
      pushSystem('Paused', matchState?.currentPeriod || currentPeriodNumber());
    } catch (e) {
      console.error('Pause failed', e);
    }
  };
  const handleResume = async () => {
    if (!selectedId) return;
    try {
      if (!isAuthenticated) {
        setMatchState(prev => prev ? ({ ...prev, status: 'LIVE' } as any) : prev);
        startTicking();
        pushSystem('Resumed', currentPeriodNumber());
        try { const { db } = await import('../db/indexedDB'); await db.settings.put({ key: `local_live_state:${selectedId}`, value: JSON.stringify({ status: 'LIVE', periods, timerMs, lastUpdatedAt: Date.now() }), created_at: Date.now(), updated_at: Date.now() }); } catch {}
        try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'resume' }); } catch {}
        return;
      }
      const state = await matchesApi.resumeMatch(selectedId);
      setMatchState(state);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      const base = computeBaseMs(state, p);
      setTimerMs(base);
      startTicking();
      pushSystem('Resumed', state.currentPeriod || currentPeriodNumber());
    } catch (e) {
      console.error('Resume failed', e);
    }
  };
  const handleEndPeriod = async () => {
      if (!selectedId || !currentOpenPeriod) return;
      try {
        if (!isAuthenticated) {
          // Close local period
          const endedAt = new Date();
          const updatedPeriods = periods.map(p => p.id === currentOpenPeriod.id ? ({ ...p, endedAt, durationSeconds: Math.max(1, Math.round((timerMs) / 1000)) } as any) : p);
          setPeriods(updatedPeriods);
          setMatchState(prev => prev ? ({ ...prev, status: 'PAUSED', currentPeriod: currentOpenPeriod.periodNumber } as any) : { id: 'local-state', matchId: selectedId, status: 'PAUSED', currentPeriod: currentOpenPeriod.periodNumber, createdAt: new Date(), updatedAt: new Date() } as any);
          stopTicking();
          setTimerMs(0);
        const fmt = (currentMatch?.periodFormat || '').toLowerCase();
        const n = currentOpenPeriod.periodNumber;
        let txt = 'End of Period';
        if (fmt.includes('half')) txt = n === 1 ? 'End of 1st Half' : 'End of 2nd Half';
        else if (fmt.includes('quarter')) txt = `End of Q${n}`;
        else if (currentOpenPeriod.periodType === 'EXTRA_TIME') txt = `End of ET${n}`;
        pushSystem(txt, n);
        try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'end_period' }); } catch {}
        try { const { db } = await import('../db/indexedDB'); await db.settings.put({ key: `local_live_state:${selectedId}`, value: JSON.stringify({ status: 'PAUSED', periods: updatedPeriods, timerMs: 0, lastUpdatedAt: Date.now() }), created_at: Date.now(), updated_at: Date.now() }); } catch {}
        return;
      }
      await matchesApi.endPeriod(selectedId, currentOpenPeriod.id);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      stopTicking();
      setTimerMs(0);
      const fmt = (currentMatch?.periodFormat || '').toLowerCase();
      const n = currentOpenPeriod.periodNumber;
      let txt = 'End of Period';
      if (fmt.includes('half')) txt = n === 1 ? 'End of 1st Half' : 'End of 2nd Half';
      else if (fmt.includes('quarter')) txt = `End of Q${n}`;
      else if (currentOpenPeriod.periodType === 'EXTRA_TIME') txt = `End of ET${n}`;
      pushSystem(txt, n);
    } catch (e) {
      console.error('End period failed', e);
    }
  };
  const handleStartNextPeriod = async (extraTime = false) => {
      if (!selectedId) return;
      try {
        if (!isAuthenticated) {
          const now = new Date();
          const type = extraTime ? 'EXTRA_TIME' : 'REGULAR';
          const nextNum = (periods.filter(p => p.periodType === (extraTime ? 'EXTRA_TIME' : 'REGULAR')).length) + 1;
          const p = { id: `local-p-${Date.now()}`, periodNumber: nextNum, periodType: type as any, startedAt: now } as any;
          setPeriods(prev => [...prev, p]);
          setMatchState(prev => prev ? ({ ...prev, status: 'LIVE', currentPeriod: nextNum } as any) : prev);
          setTimerMs(0);
          startTicking();
          pushSystem(extraTime ? `Extra Time Kick Off — ET${nextNum}` : `Kick Off — Period ${nextNum}`, nextNum);
          try { const { db } = await import('../db/indexedDB'); await db.settings.put({ key: `local_live_state:${selectedId}`, value: JSON.stringify({ status: 'LIVE', periods: [...periods, p], timerMs: 0, lastUpdatedAt: Date.now() }), created_at: Date.now(), updated_at: Date.now() }); } catch {}
          try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'start_period', periodType: extraTime ? 'extra_time' : 'regular' }); await addToOutbox('match_commands', `cmd-${Date.now()+1}`, 'INSERT', { matchId: selectedId, cmd: 'resume' }); } catch {}
          return;
        }
      const periodType = extraTime ? 'extra_time' : 'regular';
      await matchesApi.startPeriod(selectedId, periodType as any);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      setTimerMs(0);
      const st = await matchesApi.resumeMatch(selectedId);
      setMatchState(st);
      startTicking();
      pushSystem(extraTime ? `Extra Time Kick Off — ET${(p.filter(pp=>pp.periodType==='EXTRA_TIME').length)}` : `Kick Off — Period ${(p.filter(pp=>pp.periodType==='REGULAR').length)}`, st.currentPeriod || undefined);
    } catch (e) {
      console.error('Start next period failed', e);
    }
  };
  const handleStartPenaltyShootout = async () => {
    if (!selectedId) return;
    try {
      if (!isAuthenticated) {
        pushSystem('Penalty Shootout', undefined);
        try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'start_period', periodType: 'penalty_shootout' }); } catch {}
        return;
      }
      await matchesApi.startPeriod(selectedId, 'penalty_shootout' as any);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      pushSystem('Penalty Shootout', undefined);
    } catch (e) {
      console.error('Start penalty shootout failed', e);
    }
  };
  const handleComplete = async () => {
    if (!selectedId) return;
    try {
      if (!isAuthenticated) {
        const endedAt = new Date();
        const updatedPeriods = periods.map(p => p.endedAt ? p : ({ ...p, endedAt }));
        setPeriods(updatedPeriods);
        setMatchState(prev => prev ? ({ ...prev, status: 'COMPLETED' } as any) : { id: 'local-state', matchId: selectedId, status: 'COMPLETED', currentPeriod: currentPeriodNumber(), createdAt: new Date(), updatedAt: new Date() } as any);
        stopTicking();
        try { const { addToOutbox } = await import('../db/utils'); await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', { matchId: selectedId, cmd: 'complete' }); } catch {}
        try {
          const { db } = await import('../db/indexedDB');
          await db.settings.put({
            key: `local_live_state:${selectedId}`,
            value: JSON.stringify({ status: 'COMPLETED', periods: updatedPeriods, timerMs, lastUpdatedAt: Date.now() }),
            created_at: Date.now(),
            updated_at: Date.now()
          });
        } catch {}
        return;
      }
      const state = await matchesApi.completeMatch(selectedId);
      setMatchState(state);
      stopTicking();
    } catch (e) {
      console.error('Complete failed', e);
    }
  };

  // ========== Events Quick Add ==========
  type QuickEventKind = 'goal' | 'assist' | 'key_pass' | 'save' | 'interception' | 'tackle' | 'foul' | 'penalty' | 'free_kick' | 'ball_out' | 'own_goal';
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  const [showLineupModal, setShowLineupModal] = useState(false);
  const [hasDefaultLineup, setHasDefaultLineup] = useState<Record<string, boolean>>({});
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastEventKind, setLastEventKind] = useState<QuickEventKind | null>(null);
  const [lastEventSentiment, setLastEventSentiment] = useState<number>(0);
  const [showPicker, setShowPicker] = useState(false);
  const [pendingKind, setPendingKind] = useState<QuickEventKind | null>(null);
  type RosterItem = { id: string; name: string; squadNumber?: number; preferredPosition?: string };
  const [roster, setRoster] = useState<Array<RosterItem>>([]);
  const [rosterCache, setRosterCache] = useState<Record<string, Array<RosterItem>>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<number>(0);
  const [onPitchByTeam, setOnPitchByTeam] = useState<Record<string, Set<string>>>({});
  type FeedItem = {
    id: string;
    kind: 'event' | 'system';
    label: string;
    createdAt: Date;
    periodNumber?: number;
    clockMs?: number;
    teamId?: string;
    playerId?: string | null;
    sentiment?: number;
    event?: MatchEvent; // original when kind === 'event'
  };
  const [eventFeed, setEventFeed] = useState<FeedItem[]>([]);
  const [playerNameMap, setPlayerNameMap] = useState<Record<string, string>>({});

  const currentPeriodNumber = () => currentOpenPeriod?.periodNumber || matchState?.currentPeriod || 1;
  const canAddEvents = !!(matchState?.status === 'LIVE' && currentOpenPeriod && selectedId);

  const openPlayerPicker = async (kind: QuickEventKind) => {
    if (!selectedId || !canAddEvents) return;
    const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
    if (!teamId) return;
    setRosterLoading(true);
    setShowPicker(true);
    setPendingKind(kind);
    setSelectedPlayerId(null);
    setSentiment(0);
    // Serve from cache if available; else fetch once and cache
    const cached = rosterCache[teamId];
    if (cached && cached.length) {
      setRoster(cached);
      setRosterLoading(false);
      return;
    }
    try {
      const res = await teamsApi.getTeamPlayers(teamId);
      const items: Array<RosterItem> = (res.data || []).map(p => ({ id: p.id, name: p.name, squadNumber: (p as any).squadNumber, preferredPosition: (p as any).preferredPosition }));
      setRoster(items);
      setRosterCache(prev => ({ ...prev, [teamId]: items }));
    } catch (e) {
      console.warn('Failed to load roster', e);
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  };

  const confirmEventWithPicker = async () => {
    if (!selectedId || !pendingKind) { setShowPicker(false); return; }
    try {
      const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
      const payload = {
        matchId: selectedId,
        periodNumber: currentPeriodNumber(),
        clockMs: Math.floor(timerMs),
        kind: pendingKind,
        teamId: teamId!,
        playerId: selectedPlayerId || null,
        sentiment,
      } as any;
      let created: any;
      if (!isAuthenticated) {
        // Guest: write to local outbox
        const { db } = await import('../db/indexedDB');
        const result = await db.addEvent({
          kind: payload.kind,
          match_id: payload.matchId,
          team_id: payload.teamId,
          player_id: payload.playerId,
          minute: Math.floor((payload.clockMs || 0) / 60000),
          second: Math.floor(((payload.clockMs || 0) % 60000) / 1000),
          period: payload.periodNumber,
          data: payload.notes ? { notes: payload.notes } : {},
          created: Date.now()
        });
        if (!result.success) throw new Error(result.error || 'Failed to add event');
        try { window.dispatchEvent(new CustomEvent('guest:changed')); } catch {}
        created = { id: `local-${Date.now()}`, ...payload, createdAt: new Date() };
      } else {
        created = await eventsApi.create(payload);
      }
      setLastEventId(created.id);
      setLastEventKind(pendingKind);
      setLastEventSentiment(sentiment);
      setSnackbarOpen(true);
      // Update local feed
      setEventFeed(prev => sortFeed([{ id: created.id, kind: 'event', label: labelForEvent(created.kind), createdAt: new Date(created.createdAt || Date.now()), periodNumber: created.periodNumber ?? undefined, clockMs: created.clockMs ?? undefined, teamId: created.teamId ?? undefined, playerId: selectedPlayerId, sentiment, event: transformCreated(created) }, ...prev]));
    } catch (e) {
      console.error('Failed to create event', e);
    } finally {
      setShowPicker(false);
      setPendingKind(null);
    }
  };

  const handleUndoLast = async () => {
    try {
      if (isAuthenticated && lastEventId) {
        await eventsApi.delete(lastEventId);
      }
    } catch (e) {
      console.error('Undo failed', e);
    } finally {
      setSnackbarOpen(false);
      if (lastEventId) setEventFeed(prev => prev.filter(item => item.id !== lastEventId));
      setLastEventId(null);
      setLastEventKind(null);
    }
  };

  const handleSetSentiment = async (delta: number) => {
    try {
      if (!lastEventId) return;
      // Compute next value (clamped) and short-circuit if unchanged
      const next = delta === 0 ? 0 : Math.max(-3, Math.min(3, lastEventSentiment + delta));
      if (next === lastEventSentiment) return;
      if (isAuthenticated) {
        await eventsApi.update(lastEventId, { sentiment: next });
      }
      setLastEventSentiment(next);
    } catch (e) {
      console.warn('Failed to update sentiment', e);
    }
  };

  // ===== Timeline helpers =====
  const transformCreated = (ev: any): MatchEvent => ({
    id: ev.id,
    matchId: ev.matchId || ev.match_id,
    createdAt: new Date(ev.createdAt || ev.created_at || Date.now()),
    kind: ev.kind,
    periodNumber: ev.periodNumber ?? ev.period_number ?? undefined,
    clockMs: ev.clockMs ?? ev.clock_ms ?? undefined,
    teamId: ev.teamId ?? ev.team_id ?? undefined,
    playerId: ev.playerId ?? ev.player_id ?? undefined,
    notes: ev.notes,
    sentiment: typeof ev.sentiment === 'number' ? ev.sentiment : 0,
    created_by_user_id: ev.created_by_user_id || 'system',
    is_deleted: !!ev.is_deleted,
  });
  const sortFeed = (list: FeedItem[]) => list.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const minuteLabel = (ev: MatchEvent) => {
    if (typeof ev.clockMs === 'number') {
      const mm = Math.floor(ev.clockMs / 60000);
      return `${mm}'`;
    }
    return new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const computeScore = (feed: FeedItem[], match?: Match) => {
    let home = 0, away = 0;
    const homeId = match?.homeTeamId; const awayId = match?.awayTeamId;
    for (const item of feed) {
      if (item.kind !== 'event' || !item.event) continue;
      const ev = item.event;
      if (ev.kind === 'goal') {
        if (ev.teamId === homeId) home++; else if (ev.teamId === awayId) away++;
      } else if (ev.kind === 'own_goal') {
        if (ev.teamId === homeId) away++; else if (ev.teamId === awayId) home++;
      }
    }
    return { home, away };
  };
  const labelForEvent = (k: string) => k.replace('_',' ').replace(/\b\w/g, c => c.toUpperCase());
  const pf = () => (currentMatch?.periodFormat || viewerSummary?.periodFormat || '').toLowerCase();
  const periodStartLabel = (p: any) => {
    const fmt = pf();
    if (p.periodType === 'EXTRA_TIME') return `Extra Time Kick Off — ET${p.periodNumber}`;
    if (p.periodType === 'PENALTY_SHOOTOUT') return 'Penalty Shootout';
    if (fmt.includes('half')) return p.periodNumber === 1 ? 'Kick Off — 1st Half' : 'Kick Off — 2nd Half';
    if (fmt.includes('quarter')) return `Kick Off — Q${p.periodNumber}`;
    if (fmt.includes('whole')) return 'Match Kick Off';
    return `Kick Off — Period ${p.periodNumber}`;
  };
  const periodEndLabel = (p: any) => {
    const fmt = pf();
    if (p.periodType === 'EXTRA_TIME') return `End of ET${p.periodNumber}`;
    if (p.periodType === 'PENALTY_SHOOTOUT') return 'End of Shootout';
    if (fmt.includes('half')) return p.periodNumber === 1 ? 'End of 1st Half' : 'End of 2nd Half';
    if (fmt.includes('quarter')) return `End of Q${p.periodNumber}`;
    if (fmt.includes('whole')) return 'Full Time';
    return `End of Period ${p.periodNumber}`;
  };
  const pushSystem = (label: string, periodNumber?: number) => {
    setEventFeed(prev => sortFeed([{ id: crypto.randomUUID(), kind: 'system', label, createdAt: new Date(), periodNumber }, ...prev]));
  };
  const renderTimeline = () => {
    // Group by periodNumber desc
    if (!eventFeed.length) {
      return (
        <IonText color="medium">Timeline will be populated as events and match updates occur.</IonText>
      );
    }
    const groups = new Map<number, FeedItem[]>();
    for (const item of eventFeed) {
      const pn = item.periodNumber || 1;
      if (!groups.has(pn)) groups.set(pn, []);
      groups.get(pn)!.push(item);
    }
    const orderedPeriods = Array.from(groups.keys()).sort((a, b) => b - a);
    return (
      <div>
        {orderedPeriods.map(pn => (
          <div key={pn} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Period {pn}</div>
            {groups.get(pn)!.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--ion-color-step-150, rgba(0,0,0,.06))' }}>
                {item.kind === 'event' && item.event ? (
                  <IonChip style={{ height: 20 }} color="medium"><IonLabel style={{ fontSize: 12 }}>{minuteLabel(item.event)}</IonLabel></IonChip>
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
                    {item.kind === 'event' && item.event ? labelForEvent(item.event.kind) : item.label}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {(() => {
                      if (item.kind === 'system') return 'Match Update';
                      const ev = item.event!;
                      const team = ev.teamId === currentMatch?.homeTeamId ? currentMatch?.homeTeam?.name : ev.teamId === currentMatch?.awayTeamId ? currentMatch?.awayTeam?.name : 'Team';
                      const name = ev.playerId ? playerNameMap[ev.playerId] : undefined;
                      return name ? `${team} — ${name}` : team || 'Team';
                    })()}
                  </div>
                </div>
                {item.kind === 'event' && item.event && typeof item.event.sentiment === 'number' && item.event.sentiment !== 0 && (
                  <IonChip style={{ height: 20 }} color={item.event.sentiment > 0 ? 'success' : 'warning'}>
                    <IonLabel style={{ fontSize: 12 }}>{item.event.sentiment > 0 ? `+${item.event.sentiment}` : item.event.sentiment}</IonLabel>
                  </IonChip>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  // Load/refresh timeline
  useEffect(() => {
    const run = async () => {
      if (!selectedId) return;
      try {
      if (!isAuthenticated) {
          const { db } = await import('../db/indexedDB');
          const res = await db.getMatchEvents(selectedId);
          const arr = (res.success && res.data) ? res.data : [];
          const feed: FeedItem[] = arr.map((e: any) => {
            const payload = e.data || e;
            return {
              id: String(e.id || `local-${payload.created || Date.now()}`),
              kind: 'event',
              label: labelForEvent(payload.kind),
              createdAt: new Date(payload.created || Date.now()),
              periodNumber: payload.period || undefined,
              clockMs: ((payload.minute || 0) * 60000) + ((payload.second || 0) * 1000),
              teamId: payload.team_id,
              playerId: payload.player_id,
              sentiment: payload.sentiment || 0,
              event: {
                id: String(e.id || crypto.randomUUID()),
                kind: payload.kind,
                createdAt: new Date(payload.created || Date.now()),
                clockMs: ((payload.minute || 0) * 60000) + ((payload.second || 0) * 1000),
                periodNumber: payload.period || undefined,
                teamId: payload.team_id,
                playerId: payload.player_id,
                notes: payload.notes || (payload.data ? payload.data.notes : undefined),
                sentiment: payload.sentiment || 0,
              } as any
            };
          });
          setEventFeed(sortFeed(feed));
        } else {
          const list = await eventsApi.getByMatch(selectedId);
          const feed: FeedItem[] = (list as any as MatchEvent[]).map(ev => ({ 
            id: ev.id,
            kind: 'event',
            label: labelForEvent(ev.kind),
            createdAt: new Date(ev.createdAt),
            periodNumber: ev.periodNumber ?? undefined,
            periodType: inferPeriodType(new Date(ev.createdAt)),
            clockMs: ev.clockMs ?? undefined,
            teamId: ev.teamId ?? undefined,
            playerId: ev.playerId ?? undefined,
            sentiment: ev.sentiment,
            event: ev 
          }));
          const systemFromPeriods: FeedItem[] = periods.flatMap((p: any) => {
            const out: FeedItem[] = [];
            if (p.startedAt) out.push({ id: `ps-${p.id}`, kind: 'system', label: periodStartLabel(p), createdAt: new Date(p.startedAt), periodNumber: p.periodNumber, periodType: p.periodType });
            if (p.endedAt) out.push({ id: `pe-${p.id}`, kind: 'system', label: periodEndLabel(p), createdAt: new Date(p.endedAt), periodNumber: p.periodNumber, periodType: p.periodType });
            return out;
          });
          setEventFeed(sortFeed([...feed, ...systemFromPeriods]));
        }
        // Preload roster names (works in guest via teamsApi fallback)
        const hId = currentMatch?.homeTeamId; const aId = currentMatch?.awayTeamId;
        const promises: Promise<any>[] = [];
        if (hId) promises.push(teamsApi.getTeamPlayers(hId));
        if (aId) promises.push(teamsApi.getTeamPlayers(aId));
        const results = await Promise.all(promises);
        const map: Record<string, string> = {};
        results.forEach(res => (res?.data || []).forEach((p: any) => { map[p.id] = p.name; }));
        setPlayerNameMap(map);
      } catch (e) {
        console.warn('Failed to load events', e);
      }
    };
    run();
  }, [isAuthenticated, selectedId, periods]);

  // Prefetch current formation for selected match to make Team Changes modal instant
  useEffect(() => {
    if (selectedId && isAuthenticated) {
      formationsApi.prefetch(selectedId).catch(() => {});
    }
  }, [selectedId, isAuthenticated]);

  // Check default lineups for both teams when match changes
  useEffect(() => {
    (async () => {
      try {
        const hId = currentMatch?.homeTeamId; const aId = currentMatch?.awayTeamId;
        if (!hId && !aId) return;
        const [homeDL, awayDL] = await Promise.all([
          hId ? defaultLineupsApi.getDefaultLineup(hId).catch(() => null) : Promise.resolve(null),
          aId ? defaultLineupsApi.getDefaultLineup(aId).catch(() => null) : Promise.resolve(null)
        ]);
        const map: Record<string, boolean> = {};
        if (hId) map[hId] = !!homeDL;
        if (aId) map[aId] = !!awayDL;
        setHasDefaultLineup(map);
      } catch {}
    })();
  }, [currentMatch?.homeTeamId, currentMatch?.awayTeamId]);

  const inferPeriodType = (dt: Date | null): 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | undefined => {
    if (!dt) return undefined;
    const t = dt.getTime();
    for (const p of periods) {
      const start = p.startedAt ? new Date(p.startedAt).getTime() : undefined;
      const end = p.endedAt ? new Date(p.endedAt).getTime() : undefined;
      if (start != null && t >= start && (end == null || t <= end)) {
        return p.periodType as any;
      }
    }
    return undefined;
  };

  return (
    <IonPage>
      <PageHeader onNavigate={onNavigate} />
      <IonContent fullscreen>
        {!isAuthenticated && !viewerToken && !selectedId && localMatches.length > 0 && (
          <div style={{ padding: '12px 16px' }}>
            <IonCard>
              <IonCardContent>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Your Local Matches</div>
                {localMatches.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--grassroots-surface-variant)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontWeight: 600 }}>{m.homeTeam?.name || 'Home'} vs {m.awayTeam?.name || 'Away'}</div>
                      <div style={{ fontSize: 12, color: 'var(--grassroots-text-tertiary)' }}>{new Date(m.kickoffTime).toLocaleString()}</div>
                    </div>
                    <IonButton size="small" onClick={() => { setSelectedId(m.id); onNavigate?.(`/live/${m.id}`); }}>Open</IonButton>
                  </div>
                ))}
              </IonCardContent>
            </IonCard>
          </div>
        )}
        <GuestBanner matchId={selectedId} />
        <IonGrid fixed>
          <IonRow>
            <IonCol size="12">
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IonSpinner name="crescent" />
                  <IonText>Loading upcoming matches…</IonText>
                </div>
              )}
              {error && (
                <IonText color="danger">{error}</IonText>
              )}
              {!loading && !error && (currentMatch || viewerToken) && (
                <IonCard>
                  <IonCardContent>
                    <LiveHeader
                      homeName={currentMatch?.homeTeam?.name || viewerTeams?.homeName || 'Home'}
                      awayName={currentMatch?.awayTeam?.name || viewerTeams?.awayName || 'Away'}
                      status={matchState?.status}
                      homeScore={(() => { const m = currentMatch || (viewerTeams ? ({ homeTeamId: viewerTeams.homeId, awayTeamId: viewerTeams.awayId } as any) : undefined); const sc = computeScore(eventFeed, m); return sc.home; })()}
                      awayScore={(() => { const m = currentMatch || (viewerTeams ? ({ homeTeamId: viewerTeams.homeId, awayTeamId: viewerTeams.awayId } as any) : undefined); const sc = computeScore(eventFeed, m); return sc.away; })()}
                      venue={currentMatch?.venue || viewerSummary?.venue || null}
                      competition={currentMatch?.competition || viewerSummary?.competition || null}
                      showPrev={!viewerToken}
                      showNext={!viewerToken}
                      onPrev={() => navigateMatch(-1)}
                      onNext={() => navigateMatch(1)}
                      prevDisabled={currentIndex <= 0}
                      nextDisabled={currentIndex === -1 || currentIndex >= upcoming.length - 1}
                      showShare={!!(isAuthenticated && selectedId && !viewerToken)}
                      onShare={activeShareCode ? handleUnshareLink : handleShareLink}
                      shareLabel={activeShareCode ? 'Unshare' : 'Share'}
                      shareColor={activeShareCode ? 'danger' : undefined}
                      showReconnect={!!(viewerToken && !sseConnected)}
                    />
                  </IonCardContent>
                </IonCard>
              )}
              {!loading && !error && !currentMatch && !viewerToken && (
                <IonCard>
                  <IonCardContent>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <IonIcon icon={football} />
                      <IonText>No upcoming matches found.</IonText>
                    </div>
                  </IonCardContent>
                </IonCard>
              )}
            </IonCol>
          </IonRow>

          {/* Period clock (hide when completed) */}
          {matchState?.status !== 'COMPLETED' && (
            <IonRow>
              <IonCol size="12">
                <IonCard>
                  <IonCardContent>
                    <PeriodClock timerMs={timerMs} periodLabel={getPeriodLabel()} stoppageLabel={getStoppageMmSs()} />
                  </IonCardContent>
                </IonCard>
              </IonCol>
            </IonRow>
          )}

          {/* Controls area (enabled only for authenticated users and not in viewer mode, hidden when completed) */}
          {!viewerToken && matchState?.status !== 'COMPLETED' && (
          <IonRow>
            <IonCol size="12">
              <IonCard>
                <IonCardContent>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {/* Primary context-aware action */}
                      {(() => {
                        const regCount = regPeriodsCount(currentMatch);
                        const extraEnded = periods.filter(p => p.periodType === 'EXTRA_TIME' && !!p.endedAt).length;
                        const inPaused = matchState?.status === 'PAUSED';
                        const inScheduled = matchState?.status === 'SCHEDULED' || !matchState;
                        if (inScheduled) {
                          return <IonButton disabled={!selectedId} onClick={handleKickOff}>Kick Off</IonButton>;
                        }
                        if (inPaused) {
                          if (!currentOpenPeriod) {
                            if (endedRegularCount < regCount) {
                              return <IonButton disabled={!selectedId} onClick={handleKickOff}>Kick Off</IonButton>;
                            }
                            if (extraEnded < 2) {
                              return <IonButton disabled={!selectedId} onClick={() => handleStartNextPeriod(true)}>Extra Time</IonButton>;
                            }
                            return <IonButton disabled={!selectedId} onClick={handleStartPenaltyShootout}>Penalty Shootout</IonButton>;
                          }
                        }
                        if (matchState?.status === 'LIVE') {
                          return <IonButton disabled={!selectedId || !currentOpenPeriod} onClick={handleEndPeriod}>End Period</IonButton>;
                        }
                        return null;
                      })()}

                      {/* Toggle Pause/Resume (only show one) */}
                      {matchState?.status === 'LIVE' && (
                        <IonButton onClick={handlePause} disabled={!selectedId}>Pause</IonButton>
                      )}
                      {matchState?.status === 'PAUSED' && currentOpenPeriod && (
                        <IonButton onClick={handleResume} disabled={!selectedId}>Resume</IonButton>
                      )}

                      {/* End Period only visible when paused and a period is open */}
                      {matchState?.status === 'PAUSED' && currentOpenPeriod && (
                        <IonButton onClick={handleEndPeriod} disabled={!selectedId}>End Period</IonButton>
                      )}

                      <IonButton disabled={matchState?.status === 'SCHEDULED'} color="success" onClick={handleComplete}>Complete</IonButton>
                    </div>
                    {/* Guest mode can control offline match; viewer mode handled via viewerToken guard */}
                </div>
              </IonCardContent>
            </IonCard>
          </IonCol>
        </IonRow>
        )}
        </IonGrid>
        {/* Events Quick Add (hidden when completed) */}
        {currentMatch && !viewerToken && matchState?.status !== 'COMPLETED' && (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Team selector */}
            <div className="team-toggle">
              <IonButton className="team-btn" size="default" fill={selectedTeam === 'home' ? 'solid' : 'outline'} onClick={() => setSelectedTeam('home')}>
                {teamName(currentMatch.homeTeam)}
              </IonButton>
              <IonButton className="team-btn" size="default" fill={selectedTeam === 'away' ? 'solid' : 'outline'} onClick={() => setSelectedTeam('away')}>
                {teamName(currentMatch.awayTeam)}
              </IonButton>
            </div>

            {/* Attacking group (forwards color) */}
            <div className="event-grid event-section">
              {(['goal','assist','key_pass'] as QuickEventKind[]).map(k => (
                <IonButton key={k} size="default" fill="solid" className="event-btn event-btn--rose" onClick={() => openPlayerPicker(k)} disabled={!canAddEvents}>
                  <IonIcon slot="start" icon={{
                    goal: footballOutline,
                    own_goal: footballOutline,
                    assist: swapHorizontalOutline || arrowForwardOutline,
                    key_pass: navigateOutline || arrowForwardOutline,
                  }[k as any] || footballOutline} />
                  {k.replace('_',' ')}
                </IonButton>
              ))}
            </div>

            {/* Defender group (defender color) */}
            <div className="event-grid event-section">
              {(['interception','tackle','foul'] as QuickEventKind[]).map(k => (
                <IonButton key={k} size="default" fill="solid" className="event-btn event-btn--indigo" onClick={() => openPlayerPicker(k)} disabled={!canAddEvents}>
                  <IonIcon slot="start" icon={{
                    interception: handLeftOutline || shieldOutline,
                    tackle: bodyOutline,
                    foul: alertCircleOutline,
                  }[k as any] || shieldOutline} />
                  {k.replace('_',' ')}
                </IonButton>
              ))}
            </div>

            {/* Goalkeeper group (goalkeeper color) */}
            <div className="event-grid event-section">
              {(['save'] as QuickEventKind[]).map(k => (
                <IonButton key={k} size="default" fill="solid" className="event-btn event-btn--emerald" onClick={() => openPlayerPicker(k)} disabled={!canAddEvents}>
                  <IonIcon slot="start" icon={shieldCheckmarkOutline} />
                  {k.replace('_',' ')}
                </IonButton>
              ))}
            </div>

            {/* Other group (midfielder/amber) */}
            <div className="event-grid event-section">
              {(['penalty','free_kick','ball_out','own_goal'] as QuickEventKind[]).map(k => (
                <IonButton key={k} size="default" fill="solid" className="event-btn event-btn--amber" onClick={() => openPlayerPicker(k)} disabled={!canAddEvents}>
                  <IonIcon slot="start" icon={{
                    penalty: flagOutline,
                    free_kick: flashOutline,
                    ball_out: exitOutline,
                    own_goal: footballOutline,
                  }[k as any] || optionsOutline} />
                  {k.replace('_',' ')}
                </IonButton>
              ))}
            </div>

            {!canAddEvents && (
              <IonText color="medium" style={{ display: 'block', textAlign: 'center', marginTop: 4 }}>
                Events are available only during live play.
              </IonText>
            )}
          </div>
        )}

        {/* Completed note */}
        {matchState?.status === 'COMPLETED' && (
          <div style={{ padding: '0 16px 12px' }}>
            <IonCard>
              <IonCardContent>
                <IonText color="medium">Match completed.</IonText>
              </IonCardContent>
            </IonCard>
          </div>
        )}

        {/* Player Picker Modal */}
        <IonModal isOpen={showPicker} onDidDismiss={() => setShowPicker(false)}>
          <div style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Select Player</h3>
            {rosterLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IonSpinner name="crescent" />
                <IonText>Loading roster…</IonText>
              </div>
            ) : (
              <div style={{ maxHeight: 320, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--ion-color-step-150, rgba(0,0,0,.1))' }}>
                {(() => {
                  const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
                  const pinned = teamId && onPitchByTeam[teamId] ? onPitchByTeam[teamId] : new Set<string>();
                  const byNumberThenName = (a: RosterItem, b: RosterItem) => {
                    const an = a.squadNumber ?? Number.MAX_SAFE_INTEGER;
                    const bn = b.squadNumber ?? Number.MAX_SAFE_INTEGER;
                    if (an !== bn) return an - bn;
                    return a.name.localeCompare(b.name);
                  };
                  const pinnedList = roster.filter(p => pinned.has(p.id)).sort(byNumberThenName);
                  const others = roster.filter(p => !pinned.has(p.id)).sort(byNumberThenName);
                  const list = [...pinnedList, ...others];
                  return list.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--ion-color-step-150, rgba(0,0,0,.05))' }}>
                      <IonButton fill={selectedPlayerId === p.id ? 'solid' : 'outline'} size="small" onClick={() => setSelectedPlayerId(selectedPlayerId === p.id ? null : p.id)}>
                        {p.squadNumber ? `${p.squadNumber} ` : ''}{p.name}
                      </IonButton>
                      <IonButton color={pinned.has(p.id) ? 'success' : 'danger'} fill={pinned.has(p.id) ? 'solid' : 'outline'} size="small" style={{ marginLeft: 'auto' }} onClick={() => {
                        const teamId2 = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
                        if (!teamId2) return;
                        setOnPitchByTeam(prev => {
                          const copy: Record<string, Set<string>> = { ...prev };
                          const set = new Set(copy[teamId2] || []);
                          if (set.has(p.id)) set.delete(p.id); else set.add(p.id);
                          copy[teamId2] = set;
                          return copy;
                        });
                      }}>
                        Substitute
                      </IonButton>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Sentiment selector */}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 6 }}>
              {[-3,-2,-1,0,1,2,3].map(v => (
                <IonButton key={v} size="small" fill={sentiment === v ? 'solid' : 'outline'} onClick={() => setSentiment(v)}>
                  {v}
                </IonButton>
              ))}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <IonButton onClick={confirmEventWithPicker} disabled={!pendingKind}>Add</IonButton>
              <IonButton fill="outline" onClick={() => setShowPicker(false)}>Cancel</IonButton>
            </div>
            <IonText color="medium" style={{ display: 'block', textAlign: 'center', marginTop: 4, fontSize: 12 }}>
              Tip: Leave player unselected to save without a player.
            </IonText>
          </div>
        </IonModal>

        {/* Sentiment/Undo Snackbar */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 12, display: snackbarOpen ? 'flex' : 'none', justifyContent: 'center' }}>
          <div style={{ background: 'var(--ion-color-step-50, rgba(0,0,0,.7))', color: '#fff', borderRadius: 9999, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>Event added{lastEventKind ? `: ${lastEventKind.replace('_',' ')}` : ''}</span>
            <IonButton size="small" disabled={lastEventSentiment <= -3} onClick={() => handleSetSentiment(-1)}>-</IonButton>
            <IonButton size="small" fill="solid" disabled>{lastEventSentiment}</IonButton>
            <IonButton size="small" disabled={lastEventSentiment >= 3} onClick={() => handleSetSentiment(+1)}>+</IonButton>
            <IonButton size="small" color="light" onClick={handleUndoLast}>Undo</IonButton>
          </div>
        </div>

        {/* Warning: default lineup missing before kickoff */}
        {matchState?.status === 'SCHEDULED' && (() => {
          const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
          const missing = teamId ? !hasDefaultLineup[teamId] : false;
          return missing ? (
            <div style={{ padding: '0 16px 12px' }}>
              <IonCard color="warning">
                <IonCardContent>
                  <IonText>Default lineup not set for selected team. Set it before kickoff for smooth live management.</IonText>
                </IonCardContent>
              </IonCard>
            </div>
          ) : null;
        })()}

        {/* Team Changes button */}
        {!viewerToken && (
          <div style={{ padding: '0 16px 12px' }}>
            <IonButton onClick={() => setShowLineupModal(true)}>Team Changes</IonButton>
          </div>
        )}

        {/* Timeline */}
        <div style={{ padding: '12px 16px' }}>
          <IonCard>
            <IonCardContent>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Live Timeline</div>
              {selectedId ? (
                <LiveTimeline 
                  feed={eventFeed as any} 
                  currentMatch={currentMatch as any} 
                  playerNameMap={playerNameMap}
                  showDelete={!!(isAuthenticated && !viewerToken)}
                  onDelete={(item) => {
                    if (item.kind !== 'event') return;
                    (async () => {
                      try {
                        if (isAuthenticated) {
                          await eventsApi.delete(item.id);
                        }
                        setEventFeed(prev => prev.filter(i => i.id !== item.id));
                        try { (window as any).__toastApi?.current?.showSuccess?.('Event deleted'); } catch {}
                      } catch (e: any) {
                        try { (window as any).__toastApi?.current?.showError?.(e?.message || 'Failed to delete event'); } catch {}
                      }
                    })();
                  }}
                  durationMinutes={currentMatch?.durationMinutes as any}
                  periodFormat={(currentMatch?.periodFormat as any) || (viewerSummary as any)?.periodFormat}
                />
              ) : (
                <IonText color="medium">Sign in to view live timeline. Public feed coming soon.</IonText>
              )}
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
      {/* Lineup Management Modal */}
      <LineupManagementModal 
        isOpen={showLineupModal}
        onClose={() => setShowLineupModal(false)}
        matchId={selectedId || ''}
        selectedTeamId={selectedTeam === 'home' ? currentMatch?.homeTeamId || '' : currentMatch?.awayTeamId || ''}
        currentMinute={Number((((timerMs || 0) / 60000)).toFixed(2))}
      />
    </IonPage>
  );
};

export default LiveMatchPage;
