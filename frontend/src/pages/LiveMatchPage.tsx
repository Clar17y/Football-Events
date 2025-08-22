import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import './LiveMatchPage.css';
import matchesApi from '../services/api/matchesApi';
import eventsApi from '../services/api/eventsApi';
import teamsApi from '../services/api/teamsApi';
import { useAuth } from '../contexts/AuthContext';
import type { MatchState, MatchPeriod, Event as MatchEvent } from '@shared/types';
import type { Match } from '@shared/types';

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

  // Live state
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [periods, setPeriods] = useState<MatchPeriod[]>([]);
  const [timerMs, setTimerMs] = useState<number>(0);
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  // Load upcoming matches for switcher
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await matchesApi.getUpcoming(20);
        if (cancelled) return;
        setUpcoming(list || []);
        // If no explicit matchId, select nearest upcoming
        if (!selectedId && list && list.length > 0) {
          setSelectedId(list[0].id);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load upcoming matches');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Load server match state + periods when a match is selected (authorized only)
  useEffect(() => {
    let cancelled = false;
    const fetchLive = async () => {
      if (!isAuthenticated || !selectedId) {
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
  }, [isAuthenticated, selectedId]);

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

  const teamName = (team?: { name?: string } | null) => team?.name || 'TBD';

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

    // Fallbacks for paused/no open period
    if (matchState?.status === 'PAUSED') {
      if (fmt.includes('half')) {
        // Between halves or after 2nd half
        return endedRegularCount >= 2 ? 'Full Time' : 'Half Time';
      }
      if (fmt.includes('quarter')) {
        return 'Quarter Break';
      }
      return 'Break';
    }
    if (matchState?.status === 'COMPLETED') return 'FT';
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
      if (matchState?.status === 'PAUSED') {
        // Start next regular period and resume
        await matchesApi.startPeriod(selectedId, 'regular' as any);
        const p = await matchesApi.getMatchPeriods(selectedId);
        setPeriods(p);
        const st = await matchesApi.resumeMatch(selectedId);
        setMatchState(st);
        const base = computeBaseMs(st, p);
        setTimerMs(base);
        startTicking();
        // System feed: Kick Off period N
        const pn = st.currentPeriod || currentPeriodNumber();
        pushSystem(`Kick Off — Period ${pn}`, pn);
      } else {
        const state = await matchesApi.startMatch(selectedId);
        setMatchState(state);
        // Refresh periods; first period should be created by backend
        const p = await matchesApi.getMatchPeriods(selectedId);
        setPeriods(p);
        const base = computeBaseMs(state, p);
        setTimerMs(base);
        startTicking();
        const pn = 1;
        pushSystem('Match Kick Off', pn);
      }
    } catch (e) {
      // noop toast placeholder
      console.error('Kick off failed', e);
    }
  };
  const handlePause = async () => {
    if (!selectedId) return;
    try {
      const state = await matchesApi.pauseMatch(selectedId);
      setMatchState(state);
      // Compute final base from state
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
      await matchesApi.endPeriod(selectedId, currentOpenPeriod.id);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      stopTicking();
      setTimerMs(0);
      // Determine label based on format
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
      const periodType = extraTime ? 'extra_time' : 'regular';
      await matchesApi.startPeriod(selectedId, periodType as any);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      setTimerMs(0);
      // Resume match if needed
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
      await matchesApi.startPeriod(selectedId, 'penalty_shootout' as any);
      const p = await matchesApi.getMatchPeriods(selectedId);
      setPeriods(p);
      // No timer for shootout; keep paused state
      pushSystem('Penalty Shootout', undefined);
    } catch (e) {
      console.error('Start penalty shootout failed', e);
    }
  };
  const handleComplete = async () => {
    if (!selectedId) return;
    try {
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
  const canAddEvents = !!(isAuthenticated && matchState?.status === 'LIVE' && currentOpenPeriod && selectedId);

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
      const created = await eventsApi.create(payload);
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
      if (lastEventId) await eventsApi.delete(lastEventId);
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
      const next = delta === 0
        ? 0
        : Math.max(-3, Math.min(3, lastEventSentiment + delta));
      if (next === lastEventSentiment) return; // avoid redundant PUTs
      await eventsApi.update(lastEventId, { sentiment: next });
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

  // Load initial timeline when auth + match selected
  useEffect(() => {
    const run = async () => {
      if (!isAuthenticated || !selectedId) { setEventFeed([]); return; }
      try {
        const list = await eventsApi.getByMatch(selectedId);
        const feed: FeedItem[] = (list as any as MatchEvent[]).map(ev => ({ id: ev.id, kind: 'event', label: labelForEvent(ev.kind), createdAt: new Date(ev.createdAt), periodNumber: ev.periodNumber ?? undefined, clockMs: ev.clockMs ?? undefined, teamId: ev.teamId ?? undefined, playerId: ev.playerId ?? undefined, sentiment: ev.sentiment, event: ev }));
        setEventFeed(sortFeed(feed));
        // Preload rosters for both teams to resolve player names
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
  }, [isAuthenticated, selectedId]);

  return (
    <IonPage>
      <PageHeader onNavigate={onNavigate} />
      <IonContent fullscreen>
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
              {!loading && !error && currentMatch && (
                <IonCard>
                  <IonCardContent>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <IonButton fill="clear" onClick={() => navigateMatch(-1)} disabled={currentIndex <= 0}>
                        <IonIcon icon={chevronBackOutline} />
                      </IonButton>

                      <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                          <div style={{ minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 18, fontWeight: 700 }}>
                            {teamName(currentMatch.homeTeam)}
                          </div>
                          <div style={{ fontSize: 22, fontWeight: 800 }}>
                            {matchState?.status === 'SCHEDULED' ? 'vs' : `${computeScore(eventFeed, currentMatch).home} - ${computeScore(eventFeed, currentMatch).away}`}
                          </div>
                          <div style={{ minWidth: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 18, fontWeight: 700 }}>
                            {teamName(currentMatch.awayTeam)}
                          </div>
                        </div>
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {matchState && (
                            <IonChip color={
                              matchState.status === 'LIVE' ? 'success' :
                              matchState.status === 'PAUSED' ? 'warning' :
                              matchState.status === 'COMPLETED' ? 'tertiary' : 'medium'
                            } style={{ height: 22 }}>
                              <IonLabel style={{ fontSize: 12 }}>{matchState.status}</IonLabel>
                            </IonChip>
                          )}
                          <span style={{ fontSize: 12, opacity: 0.7 }}>
                            {currentMatch.venue || 'Venue TBC'} • {currentMatch.competition || 'Competition'}
                          </span>
                        </div>
                      </div>

                      <IonButton fill="clear" onClick={() => navigateMatch(1)} disabled={currentIndex === -1 || currentIndex >= upcoming.length - 1}>
                        <IonIcon icon={chevronForwardOutline} />
                      </IonButton>
                    </div>
                  </IonCardContent>
                </IonCard>
              )}
              {!loading && !error && !currentMatch && (
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

          {/* Controls area (enabled only for authenticated users) */}
          <IonRow>
            <IonCol size="12">
              <IonCard>
                <IonCardContent>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(timerMs).toISOString().substr(14, 5)}
                      </div>
                      <IonText color="medium" style={{ fontSize: 14, fontWeight: 600 }}>
                        {getPeriodLabel()}
                      </IonText>
                      {getStoppageMmSs() && (
                        <IonChip color="warning" style={{ height: 18 }}>
                          <IonLabel style={{ fontSize: 12 }}>{getStoppageMmSs()}</IonLabel>
                        </IonChip>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {/* Primary context-aware action */}
                      {(() => {
                        // Determine label/handler based on state and periods
                        const regCount = regPeriodsCount(currentMatch);
                        const extraEnded = periods.filter(p => p.periodType === 'EXTRA_TIME' && !!p.endedAt).length;
                        const inPaused = matchState?.status === 'PAUSED';
                        const inScheduled = matchState?.status === 'SCHEDULED';
                        if (inScheduled) {
                          return <IonButton disabled={!isAuthenticated || !selectedId} onClick={handleKickOff}>Kick Off</IonButton>;
                        }
                        if (inPaused) {
                          if (!currentOpenPeriod) {
                            if (endedRegularCount < regCount) {
                              return <IonButton disabled={!isAuthenticated || !selectedId} onClick={handleKickOff}>Kick Off</IonButton>;
                            }
                            if (extraEnded < 2) {
                              return <IonButton disabled={!isAuthenticated || !selectedId} onClick={() => handleStartNextPeriod(true)}>Extra Time</IonButton>;
                            }
                            return <IonButton disabled={!isAuthenticated || !selectedId} onClick={handleStartPenaltyShootout}>Penalty Shootout</IonButton>;
                          }
                        }
                        // Default fallback hidden
                        return null;
                      })()}

                      {/* Toggle Pause/Resume (only show one) */}
                      {matchState?.status === 'LIVE' && (
                        <IonButton onClick={handlePause} disabled={!isAuthenticated}>Pause</IonButton>
                      )}
                      {matchState?.status === 'PAUSED' && currentOpenPeriod && (
                        <IonButton onClick={handleResume} disabled={!isAuthenticated}>Resume</IonButton>
                      )}

                      {/* End Period only visible when paused and a period is open */}
                      {matchState?.status === 'PAUSED' && currentOpenPeriod && (
                        <IonButton onClick={handleEndPeriod} disabled={!isAuthenticated}>End Period</IonButton>
                      )}

                      <IonButton disabled={!isAuthenticated || matchState?.status === 'SCHEDULED'} color="success" onClick={handleComplete}>Complete</IonButton>
                    </div>
                    {!isAuthenticated && (
                      <IonText color="medium" style={{ textAlign: 'center' }}>
                        Read-only viewer. Sign in to control the match.
                      </IonText>
                    )}
                  </div>
                </IonCardContent>
              </IonCard>
            </IonCol>
          </IonRow>
        </IonGrid>
        {/* Events Quick Add */}
        {currentMatch && (
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
                      <IonButton fill={pinned.has(p.id) ? 'solid' : 'outline'} size="small" style={{ marginLeft: 'auto' }} onClick={() => {
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
                        {pinned.has(p.id) ? 'On‑pitch' : 'Pin'}
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

        {/* Timeline */}
        <div style={{ padding: '12px 16px' }}>
          <IonCard>
            <IonCardContent>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Live Timeline</div>
              {isAuthenticated && selectedId ? (
                renderTimeline()
              ) : (
                <IonText color="medium">Sign in to view live timeline. Public feed coming soon.</IonText>
              )}
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default LiveMatchPage;
