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
import { getGuestId } from '../utils/guest';
import { getAuthUserId } from '../utils/network';
import { CONNECTED_RECOVERY_MESSAGE } from '../services/api/authFailure';
import { GUEST_LIMITS } from '../utils/quotas';
import { reconstructClock, uniquePeriods, regularPeriodCount, periodLengthMs, periodOffsetMs, actualPlayedSeconds, activePlayedSeconds, endedPlayedSeconds, formatLiveClock, timestampMs } from '../utils/liveMatchTiming';
import { captureRecordingDraft, isCurrentDraft, recordingNotes, readRecordingPeriod, type RecordingDraft } from '../utils/liveRecordingDraft';
import { trackedPlayer, rememberTrackedPlayer } from '../utils/liveRecordingPreferences';
import LiveTimeline from '../components/live/LiveTimeline';
import LineupManagementModal from '../components/lineup/LineupManagementModal';
import { defaultLineupsApi } from '../services/api/defaultLineupsApi';
import formationsApi from '../services/api/formationsApi';
import './LiveMatchPage.css';
import matchesApi from '../services/api/matchesApi';
import { ApiRequestError } from '../services/api/baseApi';
import viewerApi from '../services/api/viewerApi';
import eventsApi from '../services/api/eventsApi';
import teamsApi from '../services/api/teamsApi';
import { useAuth } from '../contexts/AuthContext';
import type { MatchState, MatchPeriod, Event as MatchEvent } from '@shared/types';
import type { DbMatch } from '../db/schema';
import type { Match } from '@shared/types';
import { getLocalMatch } from '../services/guestQuickMatch';
import { authApi } from '../services/api/authApi';
import { useInitialSync } from '../hooks/useInitialSync';
import { useLocalEvents, useLocalMatch, useLocalMatchPeriods, useLocalMatchState } from '../hooks/useLocalData';
import { useMeLimits } from '../hooks/useMeLimits';
import { matchStateDataLayer, matchPeriodsDataLayer, isCurrentOwnedMatch, isReplayableMatchStatus } from '../services/dataLayer';
import { db } from '../db/indexedDB';
import { captureLiveMatchHydration, applyLiveMatchHydration } from '../services/liveMatchHydration';

interface LiveMatchPageProps {
  onNavigate?: (pageOrUrl: string) => void;
  matchId?: string;
}

const LiveMatchPage: React.FC<LiveMatchPageProps> = ({ onNavigate, matchId }) => {
  // Trigger initial sync from server for authenticated users
  useInitialSync();
  const { allowedEventKinds } = useMeLimits();
  const allowedEventKindSet = useMemo(() => new Set(allowedEventKinds), [allowedEventKinds]);

  const [upcoming, setUpcoming] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>(matchId);
  const { isAuthenticated, user, recoveryMessage } = useAuth();
  const retainedSubject = getAuthUserId();
  const accountRecoveryRequired = !!recoveryMessage || (authApi.isAuthenticated() && (!user || user.id !== retainedSubject));
  const actorOwnerId = accountRecoveryRequired ? undefined : isAuthenticated ? user?.id : getGuestId();
  const identity = accountRecoveryRequired ? `recovery:${retainedSubject || 'account'}` : isAuthenticated ? `user:${actorOwnerId || ''}` : actorOwnerId || '';
  const contextRef = useRef({ matchId: selectedId, identity, mounted: true, revision: 0 });
  if (contextRef.current.matchId !== selectedId || contextRef.current.identity !== identity) contextRef.current.revision += 1;
  contextRef.current.matchId = selectedId;
  contextRef.current.identity = identity;
  const contextIsCurrent = (context: { matchId?: string; identity: string; revision: number }) =>
    contextRef.current.mounted && contextRef.current.matchId === context.matchId &&
    contextRef.current.identity === context.identity && contextRef.current.revision === context.revision;
  const lifecycleRef = useRef(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const lifecycleRetryRef = useRef<(() => Promise<void>) | null>(null);
  const lifecyclePartialRef = useRef(false);
  const [localReadVersion, setLocalReadVersion] = useState(0);
  const [restoreVersion, setRestoreVersion] = useState(0);
  const recoveryRefreshRef = useRef<{ matchId?: string; identity: string; revision: number; ownershipError: boolean } | null>(null);
  const writerReadyRef = useRef(false);
  const [viewerToken, setViewerToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') || params.get('code');
  });
  const [viewerParam, setViewerParam] = useState<'view' | 'code' | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.has('view') ? 'view' : params.has('code') ? 'code' : null;
  });
  const esRef = useRef<EventSource | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const prevStatusRef = useRef<string | null>(null);
  const [viewerExpired, setViewerExpired] = useState(false);
  const retryRef = useRef<number>(0);

  // Live state
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [periods, setPeriods] = useState<MatchPeriod[]>([]);
  const periodsRef = useRef(periods);
  periodsRef.current = periods;
  const viewerFormatRef = useRef<{ periodFormat?: string | null; durationMinutes?: number | null }>({});
  const [timerMs, setTimerState] = useState<number>(0);
  const clockRef = useRef({ base: 0, anchor: Date.now(), running: false });
  const readClock = () => clockRef.current.base + (clockRef.current.running ? Math.max(0, Date.now() - clockRef.current.anchor) : 0);
  const setTimerMs = (value: number) => {
    clockRef.current.base = value;
    clockRef.current.anchor = Date.now();
    setTimerState(value);
  };
  const timerRef = useRef<number | null>(null);

  // Local-first sources of truth (skip in viewer mode)
  const [selectedLocalMatch, setSelectedLocalMatch] = useState<{ match?: Match & Partial<Pick<DbMatch, 'synced' | 'syncedAt'>> & { syncAttempted?: boolean }; matchId: string; identity: string }>();
  const localQueryId = viewerToken || accountRecoveryRequired ? undefined : selectedId;
  const { match: localMatchRecord } = useLocalMatch(localQueryId);
  const { matchState: localMatchStateRecord, loading: stateLoading, loadedMatchId: stateMatchId, error: stateReadError } = useLocalMatchState(localQueryId, localReadVersion);
  const { periods: localPeriodRecords, loading: periodsLoading, loadedMatchId: periodsMatchId, error: periodsReadError } = useLocalMatchPeriods(localQueryId, localReadVersion);
  const { events: localEventRecords, loading: eventsLoading } = useLocalEvents(viewerToken ? undefined : selectedId);
  const parentOwnershipResolved = selectedLocalMatch?.identity === identity && selectedLocalMatch.matchId === selectedId;
  const localParentOwned = !!actorOwnerId && parentOwnershipResolved && selectedLocalMatch?.match?.id === selectedId &&
    isCurrentOwnedMatch(selectedLocalMatch.match, actorOwnerId) &&
    !!localMatchRecord && isCurrentOwnedMatch(localMatchRecord, actorOwnerId);
  const parentOwnershipBlocked = !viewerToken && !accountRecoveryRequired && !!selectedId &&
    ((localMatchRecord?.id === selectedId && !!localMatchRecord.createdByUserId && localMatchRecord.createdByUserId !== actorOwnerId) || (parentOwnershipResolved && !localParentOwned));
  const localSnapshotReady = !accountRecoveryRequired && localParentOwned && !!selectedId && localMatchRecord?.id === selectedId &&
    !stateLoading && !periodsLoading && stateMatchId === selectedId && periodsMatchId === selectedId &&
    !stateReadError && !periodsReadError;
  // Only a never-synced raw owned parent proves legacy device-local creation.
  const localStateKnown = !!localMatchStateRecord || (!!actorOwnerId &&
    selectedLocalMatch?.match?.synced === false && selectedLocalMatch.match.homeScore === 0 &&
    selectedLocalMatch.match.awayScore === 0 && !selectedLocalMatch.match.syncedAt &&
    !selectedLocalMatch.match.syncAttempted && !eventsLoading && isCurrentOwnedMatch(selectedLocalMatch.match, actorOwnerId) &&
    localPeriodRecords.every(period => isCurrentOwnedMatch(period, actorOwnerId)) &&
    localEventRecords.every(event => isCurrentOwnedMatch(event, actorOwnerId)));
  const stateNeedsRestore = localSnapshotReady && !localStateKnown;
  const [appliedLocalSnapshot, setAppliedLocalSnapshot] = useState<{
    matchId: string; identity: string; state: typeof localMatchStateRecord;
    periods: typeof localPeriodRecords; match: typeof localMatchRecord; version: number;
  }>();
  const [viewerTeams, setViewerTeams] = useState<{ homeId?: string; awayId?: string; homeName?: string; awayName?: string } | null>(null);
  const [viewerSummary, setViewerSummary] = useState<{ competition?: string | null; venue?: string | null; periodFormat?: string | null; durationMinutes?: number | null } | null>(null);
  const [activeShareCode, setActiveShareCode] = useState<string | null>(null);
  const [localMatches, setLocalMatches] = useState<Match[]>([]);

  // Load upcoming matches for switcher (skip in viewer mode)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Skip fetching upcoming when using viewer token (public)
      const params = new URLSearchParams(window.location.search);
      const hasViewer = params.has('view') || params.has('code');
      if (hasViewer) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setUpcoming([]);
      setLocalMatches([]);
      if (accountRecoveryRequired || !actorOwnerId) { setLoading(false); return; }
      try {
        if (!isAuthenticated) {
          // Guest: load local matches for selection and optionally selected match
          try {
            const [up, recent] = await Promise.all([
              matchesApi.getUpcoming(20).catch(() => []),
              matchesApi.getRecent(10).catch(() => [])
            ]);
            const combined: Record<string, Match> = {} as any;
            if (cancelled) return;
            [...up, ...recent].filter(m => isCurrentOwnedMatch(m, actorOwnerId)).forEach((m: any) => { combined[m.id] = m; });
            setLocalMatches(Object.values(combined));
          } catch { }
          if (selectedId) {
            const m = await getLocalMatch(selectedId);
            if (cancelled) return;
            setUpcoming(m && isCurrentOwnedMatch(m, actorOwnerId) ? [m] : []);
            // Try to hydrate local live state snapshot

          } else {
            setUpcoming([]);
          }
        } else {
          // Load both upcoming AND recent matches (for today's matches)
          const [upcomingList, recentList] = await Promise.all([
            matchesApi.getUpcoming(20),
            matchesApi.getRecent(10)
          ]);
          if (cancelled) return;

          // Combine and deduplicate by ID
          const combined: Record<string, Match> = {};
          [...(upcomingList || []), ...(recentList || [])].filter(m => isCurrentOwnedMatch(m, actorOwnerId)).forEach(m => {
            combined[m.id] = m;
          });
          const list = Object.values(combined).sort((a, b) =>
            new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
          );

          setUpcoming(list);
          // If no explicit matchId, prioritize non-COMPLETED matches
          if (!selectedId && list.length > 0) {
            try {
              // Fetch match states to determine completion status
              const matchIds = list.map(m => m.id);
              const states = await matchesApi.getMatchStates(1, 100, matchIds);
              if (cancelled) return;
              const statesMap = new Map((states.data || []).map((s: any) => [s.matchId, s]));

              // Find first match that isn't COMPLETED
              const nonCompleted = list.find(m => {
                const state = statesMap.get(m.id);
                return state?.status !== 'COMPLETED';
              });

              // Use non-completed match if found, otherwise fall back to first match
              setSelectedId(nonCompleted ? nonCompleted.id : list[0].id);
            } catch {
              if (cancelled) return;
              // If fetching states fails, fall back to first match
              setSelectedId(list[0].id);
            }
          }
        }
      } catch (e: any) {
        // Local-first: errors are rare, just log them
        console.warn('Failed to load matches', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAuthenticated, identity, actorOwnerId, accountRecoveryRequired, selectedId]);

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
  }, [isAuthenticated, identity, selectedId]);

  // Read viewer token or code from URL (if present)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('view');
    const c = params.get('code');
    if (t) { setViewerToken(t); setViewerParam('view'); }
    else if (c) { setViewerToken(c); setViewerParam('code'); }
  }, []);

  // Apply a matching, resolved local state/period snapshot together before recording.
  useEffect(() => {
    if (viewerToken || lifecycleRef.current) return;
    if (!selectedId || !localSnapshotReady || !localMatchRecord || !localStateKnown) {
      setAppliedLocalSnapshot(undefined);
      setMatchState(null);
      setPeriods([]);
      stopTicking();
      setTimerMs(0);
      return;
    }
    const localPeriods = uniquePeriods(localPeriodRecords);
    const ps: MatchPeriod[] = localPeriods.map(p => ({
      id: p.id,
      matchId: selectedId,
      periodNumber: p.periodNumber,
      periodType: p.periodType,
      startedAt: p.startedAt ? new Date(p.startedAt).toISOString() : undefined,
      endedAt: p.endedAt ? new Date(p.endedAt).toISOString() : undefined,
      durationSeconds: p.durationSeconds,
      createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
      createdByUserId: p.createdByUserId || 'system',
      isDeleted: p.isDeleted || false,
    }));
    setPeriods(ps);
    const status = localMatchStateRecord?.status || 'SCHEDULED';
    const open = localPeriods.find(p => !p.endedAt);
    const last = localPeriods[localPeriods.length - 1];
    const periodNumber = open?.periodNumber || last?.periodNumber || 1;
    const running = status === 'LIVE';
    const base = reconstructClock(localMatchStateRecord, localPeriods, localMatchRecord);
    setTimerMs(base);
    setMatchState({
      id: 'local-state', matchId: selectedId, status,
      currentPeriod: periodNumber, currentPeriodId: localMatchStateRecord?.currentPeriodId,
      totalElapsedSeconds: actualPlayedSeconds(base, localMatchRecord, localPeriods),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    } as any);

    if (running && open) startTicking();
    else stopTicking();
    setAppliedLocalSnapshot({ matchId: selectedId, identity, state: localMatchStateRecord,
      periods: localPeriodRecords, match: localMatchRecord, version: localReadVersion });
    const recovery = recoveryRefreshRef.current;
    if (recovery && contextIsCurrent(recovery)) {
      recoveryRefreshRef.current = null;
      const owned = localParentOwned &&
        (!localMatchStateRecord || localMatchStateRecord.createdByUserId === actorOwnerId) &&
        localPeriods.every(period => period.createdByUserId === actorOwnerId);
      if (!recovery.ownershipError || owned) {
        lifecycleRetryRef.current = null;
        setLifecycleError(null);
      }
    }
  }, [localMatchStateRecord, localPeriodRecords, localMatchRecord, localSnapshotReady, selectedId,
    identity, viewerToken, localReadVersion, lifecycleBusy, actorOwnerId, localStateKnown]);

  // Capture the durable recording revision before any server request begins.
  useEffect(() => {
    let cancelled = false;
    const fetchLive = async () => {
      if (!selectedId || viewerToken || !isAuthenticated || !user?.id) return;
      const hydrationContext = { ...contextRef.current };
      const hydrationIsCurrent = () => !cancelled && contextIsCurrent(hydrationContext);
      try {
        const token = await captureLiveMatchHydration(selectedId);
        if (!token || !hydrationIsCurrent()) return;
        const [state, periods, events] = await Promise.all([
          matchesApi.getMatchState(selectedId).catch(error => {
            if (error instanceof ApiRequestError && error.status === 404) return null;
            throw error;
          }), matchesApi.getMatchPeriods(selectedId), eventsApi.getByMatch(selectedId),
        ]);
        if (!hydrationIsCurrent()) return;
        if (!state && (periods.length || events.length)) return;
        const restoredState = state || {
          matchId: selectedId, status: 'SCHEDULED', totalElapsedSeconds: 0,
          createdByUserId: token.ownerId, createdAt: new Date().toISOString(), isDeleted: false,
        } as MatchState;
        const importSnapshot = () => applyLiveMatchHydration(token, { state: restoredState, periods, events }, (serverState, canonicalPeriods, match, now) => {
          if (!hydrationIsCurrent()) throw new Error('Match hydration context changed');
          const timerMs = reconstructClock(serverState, canonicalPeriods, match, now);
          return { timerMs, totalElapsedSeconds: actualPlayedSeconds(timerMs, match, canonicalPeriods) };
        });
        if (state) await importSnapshot();
        else await db.transaction('rw', db.matches, db.matchState, db.matchPeriods, db.events, async () => {
          // Absence is proof only when both cloud and durable local history are empty.
          const parent = await db.matches.get(selectedId);
          if (!parent || parent.homeScore !== 0 || parent.awayScore !== 0 || await db.matchState.get(selectedId) ||
              (await db.matchPeriods.where('matchId').equals(selectedId).toArray()).length ||
              (await db.events.where('matchId').equals(selectedId).toArray()).length) return;
          if (hydrationIsCurrent()) await importSnapshot();
        });
      } catch {
        // The resolved local snapshot remains the recording source when a pull fails.
      }
    };
    void fetchLive();
    return () => { cancelled = true; };
  }, [isAuthenticated, identity, user?.id, selectedId, viewerToken, restoreVersion]);
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
            try { (window as any).__toastApi?.current?.showError?.('Viewer link expired. Please ask the coach for a new link.'); } catch { }
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
              viewerFormatRef.current = s;
              periodsRef.current = uniquePeriods(data.periods || []);
              setPeriods(periodsRef.current);
              setViewerTeams({ homeId: s.homeTeam?.id, awayId: s.awayTeam?.id, homeName: s.homeTeam?.name, awayName: s.awayTeam?.name });
              setViewerSummary({ competition: s.competition, venue: s.venue, periodFormat: s.periodFormat, durationMinutes: s.durationMinutes });
              setMatchState({
                id: 'viewer',
                matchId: s.matchId,
                status: s.status,
                currentPeriod: s.currentPeriod || undefined,
                currentPeriodType: s.currentPeriodType || undefined,
                totalElapsedSeconds: s.totalElapsedSeconds || 0,
                matchStartedAt: undefined,
                matchEndedAt: undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdByUserId: '',
                isDeleted: false,
              } as any);
              // Build initial feed
              const feedEvents: FeedItem[] = (data.events || []).map((ev: any) => ({
                id: ev.id,
                kind: 'event',
                label: labelForEvent(ev.kind),
                createdAt: new Date(ev.createdAt || Date.now()),
                periodNumber: ev.periodNumber || undefined,
                periodType: ev.periodType || readRecordingPeriod(ev.notes)?.periodType,
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
              const base = reconstructClock(s, periodsRef.current, s);
              setTimerMs(base);
              if (s.status === 'LIVE') startTicking(); else stopTicking();
              prevStatusRef.current = s.status || null;
            }
          } catch { }
        });
        es.addEventListener('event_created', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data);
            const e = d.event;
            setEventFeed(prev => sortFeed([{ id: e.id, kind: 'event', label: labelForEvent(e.kind), createdAt: new Date(e.createdAt || Date.now()), periodNumber: e.periodNumber || undefined, periodType: e.periodType || readRecordingPeriod(e.notes)?.periodType || inferPeriodType(new Date(e.createdAt || Date.now())), clockMs: e.clockMs || 0, teamId: e.teamId || undefined, playerId: e.playerId || undefined, sentiment: e.sentiment || 0, event: e }, ...prev]));
          } catch { }
        });
        // formation_changed SSE is no longer used; we persist a formation_change event and handle via event_created
        es.addEventListener('event_deleted', (ev: MessageEvent) => {
          try { const d = JSON.parse(ev.data); setEventFeed(prev => prev.filter(i => i.id !== d.id)); } catch { }
        });
        es.addEventListener('period_started', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data);
            periodsRef.current = uniquePeriods([...periodsRef.current, d.period]);
            setPeriods(periodsRef.current);
            const expectedStartMs = periodOffsetMs(viewerFormatRef.current, d.period);
            stopTicking(); setTimerMs(expectedStartMs); startTicking();
            setEventFeed(prev => sortFeed([{ id: `ps-${d.period.id}`, kind: 'system', label: periodStartLabel(d.period), createdAt: new Date(), periodNumber: d.period.periodNumber }, ...prev]));
          } catch { }
        });
        es.addEventListener('period_ended', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data);
            periodsRef.current = periodsRef.current.map(p => p.id === d.period.id ? { ...p, ...d.period } : p);
            setPeriods(periodsRef.current);
            const expectedEndMs = periodOffsetMs(viewerFormatRef.current, d.period) + Math.max(0, d.period.durationSeconds || 0) * 1000;
            setTimerMs(expectedEndMs);
            // Update match state if provided (status changed to PAUSED)
            if (d.matchState) {
              setMatchState(prev => prev ? { ...prev, status: d.matchState.status, totalElapsedSeconds: d.matchState.totalElapsedSeconds } as any : prev);
            }
            stopTicking();
            setEventFeed(prev => sortFeed([{ id: `pe-${d.period.id}`, kind: 'system', label: periodEndLabel(d.period), createdAt: new Date(), periodNumber: d.period.periodNumber }, ...prev]));
          } catch { }
        });
        es.addEventListener('state_changed', (ev: MessageEvent) => {
          try {
            const d = JSON.parse(ev.data);
            setMatchState(prev => prev ? ({ ...prev, ...d }) as any : prev as any);
            if (typeof d.totalElapsedSeconds === 'number') {
              setTimerMs(reconstructClock({ ...d, updatedAt: d.updatedAt || Date.now() }, periodsRef.current, viewerFormatRef.current));
            }
            if (d.status === 'LIVE') startTicking(); else stopTicking();
            const prev = prevStatusRef.current;
            if (prev && prev !== d.status) {
              if (d.status === 'PAUSED') setEventFeed(prevFeed => sortFeed([{ id: `sys-${Date.now()}-paused`, kind: 'system', label: 'Paused', createdAt: new Date(), periodNumber: d.currentPeriod }, ...prevFeed]));
              if (d.status === 'LIVE' && prev === 'PAUSED') setEventFeed(prevFeed => sortFeed([{ id: `sys-${Date.now()}-resumed`, kind: 'system', label: 'Resumed', createdAt: new Date(), periodNumber: d.currentPeriod }, ...prevFeed]));
              if (d.status === 'COMPLETED') setEventFeed(prevFeed => sortFeed([{ id: `sys-${Date.now()}-ft`, kind: 'system', label: 'Full Time', createdAt: new Date(), periodNumber: d.currentPeriod }, ...prevFeed]));
            }
            prevStatusRef.current = d.status;
          } catch { }
        });
      } catch { }
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
          createdAt: new Date().toISOString(), isDeleted: false,
        } as any);
        setViewerTeams({ homeId: summary.homeTeam?.id, awayId: summary.awayTeam?.id, homeName: summary.homeTeam?.name, awayName: summary.awayTeam?.name });
        viewerFormatRef.current = summary as any;
        setViewerSummary({ competition: summary.competition, venue: summary.venue, periodFormat: (summary as any).periodFormat, durationMinutes: (summary as any).durationMinutes });
      } catch { }
      openSSE();
    };
    load();
    return () => { cancelled = true; esRef.current?.close(); };
  }, [selectedId, viewerToken, viewerParam, viewerExpired]);

  const startTicking = () => {
    if (clockRef.current.running) return;
    clockRef.current.running = true;
    clockRef.current.anchor = Date.now();
    timerRef.current = window.requestAnimationFrame(tick);
  };
  const stopTicking = () => {
    const current = readClock();
    clockRef.current = { base: current, anchor: Date.now(), running: false };
    if (timerRef.current != null) window.cancelAnimationFrame(timerRef.current);
    timerRef.current = null;
  };
  const tick = () => {
    if (!clockRef.current.running) return;
    setTimerState(readClock());
    timerRef.current = window.requestAnimationFrame(tick);
  };
  useEffect(() => {
    contextRef.current.mounted = true;
    return () => { contextRef.current.mounted = false; stopTicking(); draftRef.current = null; };
  }, []);

  // Ensure local state tracks prop updates (e.g., navigating to another /live/:id)
  useEffect(() => {
    if (matchId) setSelectedId(matchId);
  }, [matchId]);

  // Resolve names for the selected local match independently of the match switcher.
  useEffect(() => {
    let cancelled = false;
    const syncUpcomingForGuest = async () => {
      setSelectedLocalMatch(undefined);
      if (!selectedId || viewerToken || accountRecoveryRequired) return;
      try {
        const m = await getLocalMatch(selectedId);
        if (cancelled) return;
        setSelectedLocalMatch({ match: m || undefined, matchId: selectedId, identity });
      } catch {
        if (!cancelled) setSelectedLocalMatch({ matchId: selectedId, identity });
      }
    };
    syncUpcomingForGuest();
    return () => { cancelled = true; };
  }, [identity, selectedId, viewerToken, localMatchRecord?.updatedAt, localMatchRecord?.createdByUserId, localMatchRecord?.synced, accountRecoveryRequired]);

  const currentIndex = useMemo(() => {
    return upcoming.findIndex(m => m.id === selectedId);
  }, [upcoming, selectedId]);

  const currentMatch = useMemo(() => {
    if (!viewerToken && (accountRecoveryRequired || !actorOwnerId || parentOwnershipBlocked)) return undefined;
    const candidate = currentIndex >= 0 ? upcoming[currentIndex] : undefined;
    const listed = candidate && actorOwnerId && isCurrentOwnedMatch(candidate, actorOwnerId) ? candidate : undefined;
    const details = parentOwnershipResolved && selectedLocalMatch?.match?.id === selectedId && localParentOwned ? selectedLocalMatch.match : listed;
    if (localMatchRecord && localMatchRecord.id === selectedId) return { ...details, ...localMatchRecord,
      homeTeam: details?.homeTeam, awayTeam: details?.awayTeam };
    return listed;
  }, [currentIndex, upcoming, selectedLocalMatch, selectedId, localMatchRecord, identity, actorOwnerId, accountRecoveryRequired, parentOwnershipResolved, localParentOwned, parentOwnershipBlocked, viewerToken]);
  const readOnlyStatus = matchState?.status === 'CANCELLED' || matchState?.status === 'POSTPONED';
  const writerReady = !viewerToken && !accountRecoveryRequired && localParentOwned && !readOnlyStatus && localStateKnown &&
    (!matchState || isReplayableMatchStatus(matchState.status)) && localSnapshotReady && !!currentMatch && (!matchId || matchId === selectedId) &&
    appliedLocalSnapshot?.matchId === selectedId && appliedLocalSnapshot.identity === identity &&
    appliedLocalSnapshot.state === localMatchStateRecord && appliedLocalSnapshot.periods === localPeriodRecords &&
    appliedLocalSnapshot.match === localMatchRecord && appliedLocalSnapshot.version === localReadVersion;
  writerReadyRef.current = writerReady;
  const lineupReady = writerReady && matchState?.status !== 'COMPLETED';
  const lineupReadyRef = useRef(lineupReady);
  lineupReadyRef.current = lineupReady;
  const lifecycleOwnershipBlocked = /belongs to another|access denied|permission/i.test(lifecycleError || '');

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
      } catch { }
      try {
        await navigator.clipboard.writeText(shareUrl);
        try { (window as any).__toastApi?.current?.showSuccess?.('Share link copied to clipboard'); } catch { }
      } catch {
        // Fallback prompt
        const ok = window.prompt('Copy this share link:', shareUrl);
        if (ok !== null) { try { (window as any).__toastApi?.current?.showSuccess?.('Share link ready'); } catch { } }
      }
      if (res.code) setActiveShareCode(res.code);
    } catch (e: any) {
      try { (window as any).__toastApi?.current?.showError?.(e?.message || 'Failed to create share link'); } catch { }
    }
  };

  const handleUnshareLink = async () => {
    try {
      if (!selectedId) return;
      await matchesApi.revokeViewerToken(selectedId, activeShareCode || undefined);
      setActiveShareCode(null);
      try { (window as any).__toastApi?.current?.showSuccess?.('Viewer link revoked'); } catch { }
    } catch (e: any) {
      try { (window as any).__toastApi?.current?.showError?.(e?.message || 'Failed to revoke link'); } catch { }
    }
  };

  const regPeriodsCount = (m?: Match) => {
    return regularPeriodCount(m || {});
  };
  const currentOpenPeriod = periods.find(p => !p.isDeleted && !p.endedAt);
  const currentStateAnchor = timestampMs(localMatchStateRecord?.lastUpdatedAt ?? localMatchStateRecord?.updatedAt ?? localMatchStateRecord?.createdAt);
  const recoverableStart = !!currentOpenPeriod && (matchState?.status === 'SCHEDULED' ||
    (matchState?.status === 'PAUSED' && localMatchStateRecord?.currentPeriodId !== currentOpenPeriod.id &&
      (currentStateAnchor ?? 0) <= (timestampMs(currentOpenPeriod.startedAt) ?? 0)));
  const lastEndedPeriod = periods.filter(p => p.endedAt).sort((a, b) =>
    (timestampMs(b.endedAt) || 0) - (timestampMs(a.endedAt) || 0))[0];
  const recoverableEnd = matchState?.status === 'LIVE' && !currentOpenPeriod && !!lastEndedPeriod;
  const endedRegularCount = periods.filter(p => p.periodType === 'REGULAR' && !!p.endedAt).length;
  const isFinalRegulationEnded = endedRegularCount >= regPeriodsCount(currentMatch);

  const getPeriodLabel = (): string => {
    if (!viewerToken && accountRecoveryRequired) return 'Account recovery needed';
    if (!viewerToken && parentOwnershipBlocked) return 'Match unavailable';
    if (matchState?.status === 'CANCELLED') return 'Cancelled';
    if (matchState?.status === 'POSTPONED') return 'Postponed';
    if (!viewerToken && !writerReady) return 'Loading saved match…';
    const fmt = (currentMatch?.periodFormat || '').toLowerCase();
    const open = currentOpenPeriod;
    const latest = open || [...periods].sort((a, b) => (a.startedAt && b.startedAt ? new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime() : (b.periodNumber - a.periodNumber)))[0];
    // Completed always wins
    if (matchState?.status === 'COMPLETED') return 'FT';
    // If paused and no open period, show break/half time
    if (matchState?.status === 'PAUSED') {
      if (open) return 'Paused';
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

  const timingFormat = currentMatch || viewerSummary || {};
  const getPerPeriodMs = () => periodLengthMs(timingFormat, currentOpenPeriod?.periodType);
  const getStoppageMmSs = (): string | null => {
    if (!currentOpenPeriod || currentOpenPeriod.periodType === 'PENALTY_SHOOTOUT') return null;
    const end = periodOffsetMs(timingFormat, currentOpenPeriod) + getPerPeriodMs();
    return timerMs > end ? `+${formatLiveClock(timerMs - end)}` : null;
  };

  const runLifecycle = async (action: () => Promise<void>) => {
    if (!writerReady || !writerReadyRef.current || contextRef.current.matchId !== selectedId ||
      contextRef.current.identity !== identity || lifecycleRef.current || addingEventRef.current || !selectedId) return;
    lifecycleRef.current = true;
    setLifecycleBusy(true);
    setLifecycleError(null);
    if (action !== lifecycleRetryRef.current) lifecyclePartialRef.current = false;
    lifecycleRetryRef.current = action;
    const actionContext = { ...contextRef.current };
    try {
      await action();
      if (contextIsCurrent(actionContext)) lifecycleRetryRef.current = null;
    } catch (e) {
      if (contextIsCurrent(actionContext)) {
        const message = e instanceof Error ? e.message : 'Match update failed. Reload match controls to continue.';
        setLifecycleError(/belongs to another|access denied|permission/i.test(message)
          ? `${message} Sign in with the account that owns this match, or open one of your saved matches.` : message);
      }
    } finally {
      lifecycleRef.current = false;
      if (contextRef.current.mounted) setLifecycleBusy(false);
    }
  };
  const startPeriod = (type: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT') => {
    if (!writerReady || !selectedId || lifecycleRef.current || lifecycleRetryRef.current || matchState?.status === 'COMPLETED') return;
    if (currentOpenPeriod && !recoverableStart) return;
    const recoveringPeriod = recoverableStart ? currentOpenPeriod : undefined;
    const periodType = recoveringPeriod?.periodType || type;
    const targetMatch = selectedId;
    const actionContext = { ...contextRef.current };
    const nextNum = recoveringPeriod?.periodNumber ?? (periodType === 'PENALTY_SHOOTOUT' ? 1 : Math.max(0, ...periods.filter(p => (p.periodType || 'REGULAR') === periodType).map(p => p.periodNumber)) + 1);
    const offset = periodOffsetMs(timingFormat, { periodNumber: nextNum, periodType });
    const total = recoveringPeriod ? endedPlayedSeconds(periods) : actualPlayedSeconds(readClock(), timingFormat, periods);
    const startedAt = timestampMs(recoveringPeriod?.startedAt) ?? Date.now();
    let createdPeriodId: string | undefined;
    return runLifecycle(async () => {
      const period = createdPeriodId
        ? (await matchPeriodsDataLayer.getByMatch(targetMatch)).find(p => p.id === createdPeriodId)
        : await matchPeriodsDataLayer.create({ matchId: targetMatch, periodNumber: nextNum, periodType, startedAt });
      if (!period || period.endedAt != null) throw new Error('This period has changed. Reload match controls to continue from its saved state.');
      createdPeriodId = period.id;
      lifecyclePartialRef.current = true;
      // Retry the same logical period after a partial create/upsert failure.
      const base = offset + Math.max(0, Date.now() - period.startedAt);
      if (!contextIsCurrent(actionContext)) return;
      await matchStateDataLayer.upsert(targetMatch, { status: 'LIVE', currentPeriodId: period.id, timerMs: base, totalElapsedSeconds: total + Math.floor((base - offset) / 1000) });
      if (!contextIsCurrent(actionContext)) return;
      const p = { ...period, startedAt: new Date(period.startedAt).toISOString(), createdAt: new Date(period.createdAt).toISOString() } as MatchPeriod;
      setPeriods(prev => uniquePeriods([...prev, p]));
      setMatchState({ id: 'local-state', matchId: targetMatch, status: 'LIVE', currentPeriod: nextNum, currentPeriodId: period.id, totalElapsedSeconds: total } as any);
      stopTicking(); setTimerMs(base); startTicking();
      pushSystem(periodType === 'PENALTY_SHOOTOUT' ? 'Penalty Shootout' : periodType === 'EXTRA_TIME' ? `Extra Time Kick Off — ET${nextNum}` : `Kick Off — Period ${nextNum}`, nextNum);
    });
  };
  const handleKickOff = () => startPeriod('REGULAR');
  const handleStartNextPeriod = (extraTime = false) => startPeriod(extraTime ? 'EXTRA_TIME' : 'REGULAR');
  const handleStartPenaltyShootout = () => startPeriod('PENALTY_SHOOTOUT');
  const changeRunning = (status: 'LIVE' | 'PAUSED') => {
    if (!selectedId || !currentOpenPeriod || lifecycleRetryRef.current) return;
    if (status === 'LIVE' && recoverableStart) return startPeriod(currentOpenPeriod.periodType || 'REGULAR');
    if ((status === 'LIVE' && matchState?.status !== 'PAUSED') || (status === 'PAUSED' && matchState?.status !== 'LIVE')) return;
    const targetMatch = selectedId;
    const actionContext = { ...contextRef.current };
    const capturedClock = readClock();
    const total = actualPlayedSeconds(capturedClock, timingFormat, periods);
    return runLifecycle(async () => {
      await matchStateDataLayer.upsert(targetMatch, { status, timerMs: capturedClock, totalElapsedSeconds: total });
      if (!contextIsCurrent(actionContext)) return;
      stopTicking(); setTimerMs(capturedClock);
      setMatchState(prev => prev ? { ...prev, status, totalElapsedSeconds: total } : prev);
      if (status === 'LIVE') startTicking();
      pushSystem(status === 'LIVE' ? 'Resumed' : 'Paused', currentOpenPeriod.periodNumber);
    });
  };
  const handlePause = () => changeRunning('PAUSED');
  const handleResume = () => changeRunning('LIVE');
  const finishPeriod = (complete: boolean) => {
    if (!selectedId || lifecycleRetryRef.current || matchState?.status === 'COMPLETED' || matchState?.status === 'SCHEDULED') return;
    if (!complete && !currentOpenPeriod && !recoverableEnd) return;
    const targetMatch = selectedId;
    const actionContext = { ...contextRef.current };
    const capturedClock = recoverableEnd && lastEndedPeriod
      ? periodOffsetMs(timingFormat, lastEndedPeriod) + Math.max(0, lastEndedPeriod.durationSeconds || 0) * 1000 : readClock();
    const endedAt = Date.now();
    const duration = activePlayedSeconds(capturedClock, timingFormat, currentOpenPeriod);
    const total = actualPlayedSeconds(capturedClock, timingFormat, periods);
    const open = currentOpenPeriod;
    let periodEnded = false;
    return runLifecycle(async () => {
      if (open && !periodEnded) {
        await matchPeriodsDataLayer.endPeriod(open.id, endedAt, duration);
        periodEnded = true;
        lifecyclePartialRef.current = true;
      } else if (periodEnded) {
        const currentPeriods = await matchPeriodsDataLayer.getByMatch(targetMatch);
        if (currentPeriods.some(p => p.endedAt == null)) throw new Error('Another period is active. Reload match controls to continue from its saved state.');
      }
      if (!contextIsCurrent(actionContext)) return;
      await matchStateDataLayer.upsert(targetMatch, { status: complete ? 'COMPLETED' : 'PAUSED', currentPeriodId: undefined, timerMs: capturedClock, totalElapsedSeconds: total });
      if (!contextIsCurrent(actionContext)) return;
      setPeriods(prev => prev.map(p => p.id === open?.id ? { ...p, endedAt: new Date(endedAt).toISOString(), durationSeconds: duration } : p));
      setMatchState(prev => prev ? { ...prev, status: complete ? 'COMPLETED' : 'PAUSED', totalElapsedSeconds: total } : prev);
      stopTicking(); setTimerMs(capturedClock);
      if (open) pushSystem(periodEndLabel(open), open.periodNumber);
    });
  };
  const handleEndPeriod = () => finishPeriod(false);
  const handleComplete = () => finishPeriod(true);
  const reloadMatchControls = () => {
    if (viewerToken || lifecycleRef.current || addingEventRef.current || !selectedId) return;
    recoveryRefreshRef.current = { ...contextRef.current, ownershipError: lifecycleOwnershipBlocked };
    setLocalReadVersion(version => version + 1);
  };

  // ========== Events Quick Add ==========
  type QuickEventKind = 'goal' | 'assist' | 'key_pass' | 'save' | 'interception' | 'tackle' | 'foul' | 'penalty' | 'free_kick' | 'ball_out' | 'own_goal' | 'formation_change' | 'yellow_card' | 'red_card' | 'corner' | 'offside' | 'shot_on_target' | 'shot_off_target' | 'clearance' | 'block' | 'cross' | 'header';
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  const teamSelectionContext = useRef<{ key: string; initialized: boolean; manual: boolean }>();
  const teamSelectionKey = `${identity}:${selectedId || ''}`;
  if (teamSelectionContext.current?.key !== teamSelectionKey) teamSelectionContext.current = { key: teamSelectionKey, initialized: false, manual: false };
  useEffect(() => {
    const selection = teamSelectionContext.current!;
    if (selection.manual || selection.initialized) return;
    setSelectedTeam('home');
    if (!currentMatch) return;
    const home = currentMatch.homeTeam;
    const away = currentMatch.awayTeam;
    if (home?.isOpponent === undefined || away?.isOpponent === undefined) return;
    const homeManaged = !home.isOpponent && home.createdByUserId === actorOwnerId;
    const awayManaged = !away.isOpponent && away.createdByUserId === actorOwnerId;
    setSelectedTeam(awayManaged && home.isOpponent && !homeManaged ? 'away' : 'home');
    selection.initialized = true;
  }, [teamSelectionKey, currentMatch, actorOwnerId]);
  const selectTeam = (team: 'home' | 'away') => {
    teamSelectionContext.current!.manual = true;
    setSelectedTeam(team);
  };
  const [showLineupModal, setShowLineupModal] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastEventKind, setLastEventKind] = useState<QuickEventKind | null>(null);
  const [lastEventSentiment, setLastEventSentiment] = useState<number>(0);
  const [showPicker, setShowPicker] = useState(false);
  const [draft, setDraft] = useState<RecordingDraft | null>(null);
  const draftRef = useRef<RecordingDraft | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterSearch, setRosterSearch] = useState('');
  const [trackPlayer, setTrackPlayer] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const correctionRef = useRef(false);
  type RosterItem = { id: string; name: string; squadNumber?: number; preferredPosition?: string };
  const [roster, setRoster] = useState<Array<RosterItem>>([]);
  const [rosterCache, setRosterCache] = useState<Record<string, Array<RosterItem>>>({});
  // Players the parent has marked as on the pitch, listed first in the picker.
  const [onPitchByTeam, setOnPitchByTeam] = useState<Record<string, Set<string>>>({});
  const [hasDefaultLineup, setHasDefaultLineup] = useState<Record<string, boolean>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<number>(0);
  const [addingEvent, setAddingEvent] = useState(false);
  const addingEventRef = useRef(false);
  type FeedItem = {
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
    event?: MatchEvent; // original when kind === 'event'
  };
  const [eventFeed, setEventFeed] = useState<FeedItem[]>([]);
  const [playerNameMap, setPlayerNameMap] = useState<Record<string, string>>({});

  const currentPeriodNumber = () => currentOpenPeriod?.periodNumber || matchState?.currentPeriod || 1;
  const canAddEvents = !!(writerReady && matchState?.status === 'LIVE' && currentOpenPeriod && selectedId);

  const sortRosterForPicker = (list: RosterItem[]) => {
    const pinned = (draft && onPitchByTeam[draft.teamId]) || new Set<string>();
    const byNumberThenName = (a: RosterItem, b: RosterItem) =>
      (a.squadNumber ?? Number.MAX_SAFE_INTEGER) - (b.squadNumber ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
    return [...list.filter(p => pinned.has(p.id)).sort(byNumberThenName), ...list.filter(p => !pinned.has(p.id)).sort(byNumberThenName)];
  };
  const toggleOnPitch = (teamId: string, playerId: string) => setOnPitchByTeam(prev => {
    const set = new Set(prev[teamId] || []);
    if (set.has(playerId)) set.delete(playerId); else set.add(playerId);
    return { ...prev, [teamId]: set };
  });
  useEffect(() => {
    let cancelled = false;
    const hId = currentMatch?.homeTeamId, aId = currentMatch?.awayTeamId;
    setHasDefaultLineup({});
    if (viewerToken || (!hId && !aId)) return;
    void Promise.all([
      hId ? defaultLineupsApi.getDefaultLineup(hId).catch(() => undefined) : undefined,
      aId ? defaultLineupsApi.getDefaultLineup(aId).catch(() => undefined) : undefined,
    ]).then(([home, away]) => {
      if (cancelled) return;
      // Undefined means the lookup failed; only a confirmed absence shows the warning.
      const map: Record<string, boolean> = {};
      if (hId && home !== undefined) map[hId] = !!home;
      if (aId && away !== undefined) map[aId] = !!away;
      setHasDefaultLineup(map);
    });
    return () => { cancelled = true; };
  }, [currentMatch?.homeTeamId, currentMatch?.awayTeamId, viewerToken]);
  const cancelDraft = () => {
    draftRef.current = null;
    setDraft(null); setShowPicker(false); setPickerError(null);
  };
  useEffect(() => {
    cancelDraft(); setSelectedPlayerId(null); setRoster([]); setRosterCache({}); setOnPitchByTeam({});
    setSnackbarOpen(false); setLastEventId(null); setCorrectionError(null);
    lifecycleRetryRef.current = null; setLifecycleError(null);
    recoveryRefreshRef.current = null;
  }, [selectedId, identity]);
  const draftIsCurrent = (candidate: RecordingDraft) => contextRef.current.mounted &&
    isCurrentDraft(candidate, draftRef.current, contextRef.current.matchId, contextRef.current.identity);

  const openPlayerPicker = async (kind: QuickEventKind) => {
    if (!selectedId || !canAddEvents || lifecycleRef.current || lifecycleRetryRef.current || addingEventRef.current || !allowedEventKindSet.has(kind)) return;
    const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
    if (!teamId || !currentOpenPeriod) return;
    const captured = captureRecordingDraft({ id: crypto.randomUUID(), identity, matchId: selectedId, teamId,
      teamName: (selectedTeam === 'home' ? currentMatch?.homeTeam?.name : currentMatch?.awayTeam?.name) || selectedTeam,
      periodId: currentOpenPeriod.id, periodNumber: currentOpenPeriod.periodNumber,
      periodType: currentOpenPeriod.periodType || 'REGULAR', kind, clockMs: readClock() });
    draftRef.current = captured; setDraft(captured);
    setRosterLoading(true); setShowPicker(true); setRoster([]); setSelectedPlayerId(null);
    setSentiment(0); setPickerError(null); setRosterError(null); setRosterSearch(''); setTrackPlayer(false);
    try {
      const cached = rosterCache[teamId];
      const items: RosterItem[] = cached || (await teamsApi.getTeamPlayers(teamId)).data.map(p => ({ id: p.id, name: p.name, squadNumber: (p as any).squadNumber }));
      if (!draftIsCurrent(captured)) return;
      setRoster(items); setRosterCache(prev => ({ ...prev, [teamId]: items }));
      const remembered = trackedPlayer(identity, teamId, items);
      setSelectedPlayerId(remembered); setTrackPlayer(!!remembered);
    } catch {
      if (draftIsCurrent(captured)) setRosterError('Roster unavailable. You can still save without a player.');
    } finally {
      if (draftIsCurrent(captured)) setRosterLoading(false);
    }
  };
  const confirmEventWithPicker = async (withoutPlayer = false) => {
    const captured = draftRef.current;
    if (!captured || !draftIsCurrent(captured) || addingEventRef.current || viewerToken) return;
    if (!writerReadyRef.current) {
      setPickerError(accountRecoveryRequired ? recoveryMessage || CONNECTED_RECOVERY_MESSAGE : 'This match is not available for recording. Your play has not been saved.');
      return;
    }
    const playerId = withoutPlayer ? undefined : selectedPlayerId || undefined;
    if (playerId && !roster.some(p => p.id === playerId)) return;
    addingEventRef.current = true; setAddingEvent(true); setPickerError(null);
    try {
      const created = await eventsApi.create({ matchId: captured.matchId, teamId: captured.teamId,
        periodNumber: captured.periodNumber, clockMs: captured.clockMs, kind: captured.kind as QuickEventKind,
        ...(playerId ? { playerId } : {}), sentiment, notes: recordingNotes(captured) });
      if (!draftIsCurrent(captured)) return;
      rememberTrackedPlayer(captured.identity, captured.teamId, trackPlayer && playerId ? playerId : null);
      setLastEventId(created.id); setLastEventKind(captured.kind as QuickEventKind);
      setLastEventSentiment(sentiment); setSnackbarOpen(true);
      setEventFeed(prev => sortFeed([{ id: created.id, kind: 'event', label: labelForEvent(created.kind),
        createdAt: new Date(created.createdAt || Date.now()), periodNumber: captured.periodNumber,
        periodType: captured.periodType, clockMs: captured.clockMs, teamId: captured.teamId, playerId, sentiment, event: transformCreated(created) }, ...prev.filter(i => i.id !== created.id)]));
      cancelDraft();
    } catch (e) {
      if (draftIsCurrent(captured)) setPickerError(e instanceof Error ? e.message : 'Could not save. Your event is ready to retry.');
    } finally {
      addingEventRef.current = false;
      if (contextRef.current.mounted) setAddingEvent(false);
    }
  };
  const runCorrection = async (action: () => Promise<void>) => {
    if (viewerToken || correctionRef.current) return;
    correctionRef.current = true; setCorrectionBusy(true); setCorrectionError(null);
    const actionContext = { ...contextRef.current };
    try { await action(); }
    catch (e) {
      if (contextIsCurrent(actionContext)) setCorrectionError(e instanceof Error ? e.message : 'Correction failed. Please retry.');
    } finally {
      correctionRef.current = false;
      if (contextRef.current.mounted) setCorrectionBusy(false);
    }
  };
  const deleteEvent = (id: string) => {
    const actionContext = { ...contextRef.current };
    return runCorrection(async () => {
      await eventsApi.delete(id);
      if (!contextIsCurrent(actionContext)) return;
      setEventFeed(prev => prev.filter(item => item.id !== id));
      if (lastEventId === id) { setSnackbarOpen(false); setLastEventId(null); setLastEventKind(null); }
    });
  };
  const handleUndoLast = () => lastEventId ? deleteEvent(lastEventId) : undefined;
  const handleSetSentiment = (delta: number) => {
    if (!lastEventId) return;
    const id = lastEventId, actionContext = { ...contextRef.current };
    const next = delta === 0 ? 0 : Math.max(-3, Math.min(3, lastEventSentiment + delta));
    if (next === lastEventSentiment) return;
    return runCorrection(async () => {
      await eventsApi.update(id, { sentiment: next });
      if (!contextIsCurrent(actionContext)) return;
      setLastEventSentiment(next);
      setEventFeed(prev => prev.map(item => item.id === id ? { ...item, sentiment: next, event: item.event ? { ...item.event, sentiment: next } : undefined } : item));
    });
  };

  // ===== Timeline helpers =====
  const transformCreated = (ev: any): MatchEvent => ({
    id: ev.id,
    matchId: ev.matchId,
    createdAt: new Date(ev.createdAt || Date.now()).toISOString(),
    kind: ev.kind,
    periodNumber: ev.periodNumber ?? undefined,
    clockMs: ev.clockMs ?? undefined,
    teamId: ev.teamId ?? undefined,
    playerId: ev.playerId ?? undefined,
    notes: ev.notes,
    sentiment: typeof ev.sentiment === 'number' ? ev.sentiment : 0,
    createdByUserId: ev.createdByUserId || 'system',
    isDeleted: !!ev.isDeleted,
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
    if (!viewerToken && localParentOwned && match?.id === selectedId &&
        Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore) &&
        match.homeScore! >= 0 && match.awayScore! >= 0) {
      return { home: match.homeScore!, away: match.awayScore! };
    }
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
  const labelForEvent = (k: string) => k.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
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
                <IonIcon icon={(() => {
                  const iconMap: Record<string, string> = {
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
                  };
                  return iconMap[item.event?.kind || ''] || optionsOutline;
                })()} />
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

  // Load/refresh timeline (skip for viewers - they get events via SSE)
  const loadEvents = useCallback(async () => {
    if (!selectedId) return;
    // Viewers get events from SSE snapshot - don't overwrite with empty data
    if (viewerToken) return;
    if (!currentMatch || !localParentOwned || accountRecoveryRequired) {
      setEventFeed([]);
      setPlayerNameMap({});
      return;
    }
    const feedContext = { ...contextRef.current };
    try {
      const feed: FeedItem[] = (localEventRecords || []).map((e: any) => {
        const createdAt = new Date(e.createdAt || Date.now());
        const ev: MatchEvent = {
          id: String(e.id || crypto.randomUUID()),
          matchId: selectedId,
          createdAt,
          kind: e.kind,
          periodNumber: e.periodNumber || undefined,
          clockMs: e.clockMs || 0,
          teamId: e.teamId || undefined,
          playerId: e.playerId || undefined,
          notes: e.notes,
          sentiment: typeof e.sentiment === 'number' ? e.sentiment : 0,
          updatedAt: e.updatedAt ? new Date(e.updatedAt).toISOString() : undefined,
          createdByUserId: e.createdByUserId,
          deletedAt: e.deletedAt ? new Date(e.deletedAt).toISOString() : undefined,
          deletedByUserId: e.deletedByUserId,
          isDeleted: !!e.isDeleted,
        } as any;

        return {
          id: ev.id,
          kind: 'event',
          label: labelForEvent(ev.kind),
          createdAt,
          periodNumber: ev.periodNumber ?? undefined,
          periodType: readRecordingPeriod(e.notes)?.periodType || inferPeriodType(createdAt),
          clockMs: ev.clockMs ?? 0,
          teamId: ev.teamId ?? undefined,
          playerId: ev.playerId ?? undefined,
          sentiment: ev.sentiment ?? 0,
          event: ev,
        };
      });

      const systemFromPeriods: FeedItem[] = periods.flatMap((p: any) => {
        const out: FeedItem[] = [];
        if (p.startedAt) out.push({ id: `ps-${p.id}`, kind: 'system', label: periodStartLabel(p), createdAt: new Date(p.startedAt), periodNumber: p.periodNumber, periodType: p.periodType });
        if (p.endedAt) out.push({ id: `pe-${p.id}`, kind: 'system', label: periodEndLabel(p), createdAt: new Date(p.endedAt), periodNumber: p.periodNumber, periodType: p.periodType });
        return out;
      });

      setEventFeed(sortFeed([...feed, ...systemFromPeriods]));
      // Preload roster names (works in guest via teamsApi fallback)
      const hId = currentMatch?.homeTeamId; const aId = currentMatch?.awayTeamId;
      const promises: Promise<any>[] = [];
      if (hId) promises.push(teamsApi.getTeamPlayers(hId));
      if (aId) promises.push(teamsApi.getTeamPlayers(aId));
      const results = await Promise.all(promises);
      const map: Record<string, string> = {};
      results.forEach(res => (res?.data || []).forEach((p: any) => { map[p.id] = p.name; }));
      if (contextIsCurrent(feedContext)) setPlayerNameMap(map);
    } catch (e) {
      console.warn('Failed to load events', e);
    }
  }, [currentMatch, localEventRecords, periods, selectedId, viewerToken, identity, localParentOwned, accountRecoveryRequired]);

  // UseEffect to load events when dependencies change
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setShowLineupModal(false);
  }, [selectedId, identity, lineupReady]);

  // Prefetch current formation for selected match to make Team Changes modal instant
  useEffect(() => {
    if (selectedId && isAuthenticated) {
      formationsApi.prefetch(selectedId).catch(() => { });
    }
  }, [selectedId, isAuthenticated]);

  const inferPeriodType = (dt: Date | null): 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | undefined => {
    if (!dt) return undefined;
    const t = dt.getTime();
    for (const p of periods) {
      const start = p.startedAt ? new Date(p.startedAt).getTime() : undefined;
      const end = p.endedAt ? new Date(p.endedAt).getTime() : undefined;
      if (start != null && t >= start && (end == null || t <= end)) {
        return p.periodType;
      }
    }
    return undefined;
  };

  return (
    <IonPage className="live-match-page">
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
        {!isAuthenticated && !accountRecoveryRequired && !viewerToken && (
          <div className="live-guest-status">
            Guest · saved on this device · {Math.max(0, GUEST_LIMITS.maxNonScoringEventsPerMatch - localEventRecords.filter(e => e.createdByUserId === identity && !['goal', 'own_goal', 'formation_change'].includes(e.kind) && !e.isDeleted).length)} non-scoring events left
          </div>
        )}
        {!viewerToken && accountRecoveryRequired && <div role="alert" className="live-error">{recoveryMessage || CONNECTED_RECOVERY_MESSAGE}</div>}
        {!viewerToken && parentOwnershipBlocked && <div role="alert" className="live-error">This match is not available under the current account. Open one of your saved matches or use the account that owns it.</div>}
        {!viewerToken && readOnlyStatus && <div role="status" className="live-error">This match is {matchState!.status === 'CANCELLED' ? 'cancelled' : 'postponed'}. Its saved details are available, but new plays and match controls are disabled.</div>}
        {!viewerToken && stateNeedsRestore && <div role="alert" className="live-error">Match state needs restore. Connect to restore its saved status before recording.
          <IonButton onClick={() => setRestoreVersion(version => version + 1)}>Retry state restore</IonButton>
        </div>}
        {lifecycleError && <div role="alert" className="live-error">{lifecycleError}
          {lifecyclePartialRef.current && !lifecycleOwnershipBlocked && <IonButton disabled={!writerReady || lifecycleBusy} onClick={() => { const retry = lifecycleRetryRef.current; if (retry) void runLifecycle(retry); }}>Retry match update</IonButton>}
          <IonButton disabled={lifecycleBusy || stateLoading || periodsLoading} onClick={reloadMatchControls}>Reload match controls</IonButton>
        </div>}
        {(stateReadError || periodsReadError) && <div role="alert" className="live-error">{stateReadError || periodsReadError} Reload the saved match before recording.<IonButton onClick={reloadMatchControls}>Reload match controls</IonButton></div>}
        {correctionError && <div role="alert" className="live-error">{correctionError} Your event is unchanged; try the correction again.</div>}
        <IonGrid fixed>
          <IonRow>
            <IonCol size="12">
              {loading && !currentMatch && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <IonSpinner name="crescent" />
                  <IonText>Loading upcoming matches…</IonText>
                </div>
              )}
              {(currentMatch || viewerToken) && (
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
                      prevDisabled={lifecycleBusy || currentIndex <= 0}
                      nextDisabled={lifecycleBusy || currentIndex === -1 || currentIndex >= upcoming.length - 1}
                      showShare={!!(isAuthenticated && selectedId && !viewerToken)}
                      onShare={activeShareCode ? handleUnshareLink : handleShareLink}
                      shareLabel={activeShareCode ? 'Unshare' : 'Share'}
                      shareColor={activeShareCode ? 'danger' : undefined}
                      showReconnect={!!(viewerToken && !sseConnected)}
                    />
                  </IonCardContent>
                </IonCard>
              )}
              {!loading && !currentMatch && !viewerToken && (
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
                            return <IonButton disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || !!lifecycleError} onClick={handleKickOff}>Kick Off</IonButton>;
                          }
                          if (inPaused) {
                            if (!currentOpenPeriod) {
                              if (endedRegularCount < regCount) {
                                return <IonButton disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || !!lifecycleError} onClick={handleKickOff}>Kick Off</IonButton>;
                              }
                              if (extraEnded < 2) {
                                return <IonButton disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || !!lifecycleError} onClick={() => handleStartNextPeriod(true)}>Extra Time</IonButton>;
                              }
                              return <IonButton disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || !!lifecycleError} onClick={handleStartPenaltyShootout}>Penalty Shootout</IonButton>;
                            }
                          }
                          if (matchState?.status === 'LIVE') {
                            return <IonButton disabled={!writerReady || !selectedId || (!currentOpenPeriod && !recoverableEnd) || lifecycleBusy || addingEvent || !!lifecycleError} onClick={handleEndPeriod}>{recoverableEnd ? 'Finish period update' : 'End Period'}</IonButton>;
                          }
                          return null;
                        })()}

                        {/* Toggle Pause/Resume (only show one) */}
                        {matchState?.status === 'LIVE' && currentOpenPeriod && (
                          <IonButton onClick={handlePause} disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || !!lifecycleError}>Pause</IonButton>
                        )}
                        {matchState?.status === 'PAUSED' && currentOpenPeriod && (
                          <IonButton onClick={handleResume} disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || !!lifecycleError}>Resume</IonButton>
                        )}

                        {/* End Period only visible when paused and a period is open */}
                        {matchState?.status === 'PAUSED' && currentOpenPeriod && (
                          <IonButton onClick={handleEndPeriod} disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || !!lifecycleError}>End Period</IonButton>
                        )}

                        <IonButton disabled={!writerReady || !selectedId || matchState?.status === 'SCHEDULED' || lifecycleBusy || addingEvent || !!lifecycleError} color="success" onClick={handleComplete}>Complete</IonButton>
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
          <div className="live-recording-actions">
            {/* Team selector */}
            <div className="team-toggle">
              <IonButton className="team-btn" size="default" fill={selectedTeam === 'home' ? 'solid' : 'outline'} onClick={() => selectTeam('home')}>
                {teamName(currentMatch.homeTeam)}
              </IonButton>
              <IonButton className="team-btn" size="default" fill={selectedTeam === 'away' ? 'solid' : 'outline'} onClick={() => selectTeam('away')}>
                {teamName(currentMatch.awayTeam)}
              </IonButton>
            </div>


            {/* Scoring group (goals/assists) - rose color */}
            <div className="event-grid event-section">
              {(['goal', 'own_goal', 'assist'] as QuickEventKind[]).map(k => {
                const iconMap: Record<string, string> = {
                  goal: footballOutline,
                  own_goal: footballOutline,
                  assist: swapHorizontalOutline || arrowForwardOutline,
                };
                const allowed = allowedEventKindSet.has(k);
                return (
                  <IonButton
                    key={k}
                    aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                    size="default"
                    fill={allowed ? 'solid' : 'outline'}
                    className={`event-btn event-btn--rose${!allowed ? ' event-btn--locked' : ''}`}
                    onClick={() => openPlayerPicker(k)}
                    disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || !!lifecycleError}
                    style={!allowed ? { opacity: 0.5 } : undefined}
                  >
                    <IonIcon slot="start" icon={iconMap[k] || footballOutline} />
                    <span className="event-btn-label">
                      <span className="event-btn-name" lang="en">{k.replace(/_/g, ' ')}</span>
                      {!allowed && <span className="event-btn-premium">Premium</span>}
                    </span>
                  </IonButton>
                );
              })}
            </div>

            {/* Cards and fouls - amber/warning color */}
            <div className="event-grid event-section">
              {(['yellow_card', 'red_card', 'foul'] as QuickEventKind[]).map(k => {
                const allowed = allowedEventKindSet.has(k);
                return (
                  <IonButton
                    key={k}
                    aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                    size="default"
                    fill={allowed ? 'solid' : 'outline'}
                    className={`event-btn event-btn--amber${!allowed ? ' event-btn--locked' : ''}`}
                    onClick={() => openPlayerPicker(k)}
                    disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || !!lifecycleError}
                    style={!allowed ? { opacity: 0.5 } : undefined}
                  >
                    <IonIcon slot="start" icon={alertCircleOutline} />
                    <span className="event-btn-label">
                      <span className="event-btn-name" lang="en">{k.replace(/_/g, ' ')}</span>
                      {!allowed && <span className="event-btn-premium">Premium</span>}
                    </span>
                  </IonButton>
                );
              })}
            </div>

            {/* Core set pieces - emerald color */}
            <div className="event-grid event-section">
              {(['penalty', 'free_kick'] as QuickEventKind[]).map(k => {
                const iconMap: Record<string, string> = {
                  penalty: flagOutline,
                  free_kick: flashOutline,
                };
                const allowed = allowedEventKindSet.has(k);
                return (
                  <IonButton
                    key={k}
                    aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                    size="default"
                    fill={allowed ? 'solid' : 'outline'}
                    className={`event-btn event-btn--emerald${!allowed ? ' event-btn--locked' : ''}`}
                    onClick={() => openPlayerPicker(k)}
                    disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || !!lifecycleError}
                    style={!allowed ? { opacity: 0.5 } : undefined}
                  >
                    <IonIcon slot="start" icon={iconMap[k] || flagOutline} />
                    <span className="event-btn-label">
                      <span className="event-btn-name" lang="en">{k.replace(/_/g, ' ')}</span>
                      {!allowed && <span className="event-btn-premium">Premium</span>}
                    </span>
                  </IonButton>
                );
              })}
            </div>

            {/* Shots group - indigo color */}
            <div className="event-grid event-section">
              {(['shot_on_target', 'shot_off_target'] as QuickEventKind[]).map(k => {
                const allowed = allowedEventKindSet.has(k);
                return (
                  <IonButton
                    key={k}
                    aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                    size="default"
                    fill={allowed ? 'solid' : 'outline'}
                    className={`event-btn event-btn--indigo${!allowed ? ' event-btn--locked' : ''}`}
                    onClick={() => openPlayerPicker(k)}
                    disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || !!lifecycleError}
                    style={!allowed ? { opacity: 0.5 } : undefined}
                  >
                    <IonIcon slot="start" icon={footballOutline} />
                    <span className="event-btn-label">
                      <span className="event-btn-name" lang="en">{k.replace(/_/g, ' ')}</span>
                      {!allowed && <span className="event-btn-premium">Premium</span>}
                    </span>
                  </IonButton>
                );
              })}
            </div>

            {/* Additional decisions - emerald color */}
            <div className="event-grid event-section">
              {(['corner', 'offside'] as QuickEventKind[]).map(k => {
                const iconMap: Record<string, string> = {
                  corner: flagOutline,
                  offside: flagOutline,
                };
                const allowed = allowedEventKindSet.has(k);
                return (
                  <IonButton
                    key={k}
                    aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                    size="default"
                    fill={allowed ? 'solid' : 'outline'}
                    className={`event-btn event-btn--emerald${!allowed ? ' event-btn--locked' : ''}`}
                    onClick={() => openPlayerPicker(k)}
                    disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || !!lifecycleError}
                    style={!allowed ? { opacity: 0.5 } : undefined}
                  >
                    <IonIcon slot="start" icon={iconMap[k] || flagOutline} />
                    <span className="event-btn-label">
                      <span className="event-btn-name" lang="en">{k.replace(/_/g, ' ')}</span>
                      {!allowed && <span className="event-btn-premium">Premium</span>}
                    </span>
                  </IonButton>
                );
              })}
            </div>

            {/* Defensive actions - indigo color */}
            <div className="event-grid event-section">
              {(['tackle', 'interception', 'clearance', 'block', 'header', 'cross'] as QuickEventKind[]).map(k => {
                const iconMap: Record<string, string> = {
                  tackle: bodyOutline,
                  interception: handLeftOutline || shieldOutline,
                  clearance: shieldOutline,
                  block: shieldOutline,
                  header: bodyOutline,
                  cross: arrowForwardOutline,
                };
                const allowed = allowedEventKindSet.has(k);
                return (
                  <IonButton
                    key={k}
                    aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                    size="default"
                    fill={allowed ? 'solid' : 'outline'}
                    className={`event-btn event-btn--indigo${!allowed ? ' event-btn--locked' : ''}`}
                    onClick={() => openPlayerPicker(k)}
                    disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || !!lifecycleError}
                    style={!allowed ? { opacity: 0.5 } : undefined}
                  >
                    <IonIcon slot="start" icon={iconMap[k] || shieldOutline} />
                    <span className="event-btn-label">
                      <span className="event-btn-name" lang="en">{k.replace(/_/g, ' ')}</span>
                      {!allowed && <span className="event-btn-premium">Premium</span>}
                    </span>
                  </IonButton>
                );
              })}
            </div>

            {/* Other - GK saves, key passes, ball out */}
            <div className="event-grid event-section">
              {(['save', 'key_pass', 'ball_out'] as QuickEventKind[]).map(k => {
                const iconMap: Record<string, string> = {
                  save: shieldCheckmarkOutline,
                  key_pass: navigateOutline || arrowForwardOutline,
                  ball_out: exitOutline,
                };
                const allowed = allowedEventKindSet.has(k);
                return (
                  <IonButton
                    key={k}
                    aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                    size="default"
                    fill={allowed ? 'solid' : 'outline'}
                    className={`event-btn event-btn--amber${!allowed ? ' event-btn--locked' : ''}`}
                    onClick={() => openPlayerPicker(k)}
                    disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || !!lifecycleError}
                    style={!allowed ? { opacity: 0.5 } : undefined}
                  >
                    <IonIcon slot="start" icon={iconMap[k] || optionsOutline} />
                    <span className="event-btn-label">
                      <span className="event-btn-name" lang="en">{k.replace(/_/g, ' ')}</span>
                      {!allowed && <span className="event-btn-premium">Premium</span>}
                    </span>
                  </IonButton>
                );
              })}
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
        <IonModal isOpen={showPicker} onDidDismiss={cancelDraft} canDismiss={!addingEvent}>
          <div className="live-player-picker">
            <h3>{draft ? labelForEvent(draft.kind) : 'Record event'} · {draft?.teamName}</h3>
            <p>Captured at {formatLiveClock(draft?.clockMs || 0)} · {draft?.periodType === 'EXTRA_TIME' ? 'Extra time' : draft?.periodType === 'PENALTY_SHOOTOUT' ? 'Shootout' : 'Period'} {draft?.periodNumber}</p>
            <label htmlFor="live-roster-search">Find a player</label>
            <input id="live-roster-search" type="search" value={rosterSearch} disabled={addingEvent} onChange={e => setRosterSearch(e.target.value)} placeholder="Name or shirt number" />
            {rosterLoading && <div role="status"><IonSpinner name="crescent" /> Loading roster… You can save without a player.</div>}
            {rosterError && <p role="status">{rosterError}</p>}
            {!rosterLoading && !rosterError && !roster.length && <p>No players on this roster. Save without a player.</p>}
            <div className="live-roster-list">
              {sortRosterForPicker(roster.filter(p => `${p.name} ${p.squadNumber ?? ''}`.toLowerCase().includes(rosterSearch.toLowerCase()))).map(p => {
                const onPitch = !!draft && !!onPitchByTeam[draft.teamId]?.has(p.id);
                return (
                  <div key={p.id} className="live-roster-row">
                    <IonButton expand="block" disabled={addingEvent} fill={selectedPlayerId === p.id ? 'solid' : 'outline'} onClick={() => { setSelectedPlayerId(selectedPlayerId === p.id ? null : p.id); setTrackPlayer(false); }}>
                      {p.squadNumber != null ? `${p.squadNumber} · ` : ''}{p.name}
                    </IonButton>
                    <IonButton className="live-roster-pitch" size="small" color={onPitch ? 'success' : 'medium'} fill={onPitch ? 'solid' : 'outline'}
                      aria-pressed={onPitch} aria-label={`${p.name} on pitch`} disabled={addingEvent} onClick={() => draft && toggleOnPitch(draft.teamId, p.id)}>
                      On pitch
                    </IonButton>
                  </div>
                );
              })}
              {!!roster.length && !roster.some(p => `${p.name} ${p.squadNumber ?? ''}`.toLowerCase().includes(rosterSearch.toLowerCase())) && <p>No matching players.</p>}
            </div>
            <label className="live-track-player"><input type="checkbox" checked={trackPlayer} disabled={!selectedPlayerId || addingEvent} onChange={e => setTrackPlayer(e.target.checked)} /> Track this player for {draft?.teamName}</label>
            <label htmlFor="live-sentiment">How was the play?</label>
            <select id="live-sentiment" value={sentiment} disabled={addingEvent} onChange={e => setSentiment(Number(e.target.value))}>
              <option value={-3}>Very poor (−3)</option><option value={-2}>Poor (−2)</option><option value={-1}>Needs improvement (−1)</option><option value={0}>Neutral (0)</option><option value={1}>Good (+1)</option><option value={2}>Very good (+2)</option><option value={3}>Excellent (+3)</option>
            </select>
            {pickerError && <p role="alert">{pickerError} Your captured event is kept. Retry saving.</p>}
            <div className="live-picker-actions">
              <IonButton onClick={() => confirmEventWithPicker()} disabled={!writerReady || !draft || !selectedPlayerId || addingEvent}>{addingEvent ? 'Saving…' : pickerError ? 'Retry save' : 'Save with player'}</IonButton>
              <IonButton fill="outline" onClick={() => confirmEventWithPicker(true)} disabled={!writerReady || !draft || addingEvent}>Save without player</IonButton>
              <IonButton fill="clear" onClick={cancelDraft} disabled={addingEvent}>Cancel</IonButton>
            </div>
          </div>
        </IonModal>

        {/* Sentiment/Undo Snackbar */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 12, display: snackbarOpen ? 'flex' : 'none', justifyContent: 'center' }}>
          <div className="live-event-feedback">
            <span style={{ fontSize: 12 }}>Event added{lastEventKind ? `: ${lastEventKind.replace('_', ' ')}` : ''}</span>
            <IonButton size="small" aria-label="Rate play lower" disabled={correctionBusy || lastEventSentiment <= -3} onClick={() => handleSetSentiment(-1)}>-</IonButton>
            <IonButton size="small" fill="solid" disabled>{lastEventSentiment}</IonButton>
            <IonButton size="small" aria-label="Rate play higher" disabled={correctionBusy || lastEventSentiment >= 3} onClick={() => handleSetSentiment(+1)}>+</IonButton>
            <IonButton size="small" color="light" disabled={correctionBusy} onClick={handleUndoLast}>Undo</IonButton>
          </div>
        </div>

        {/* Warning: default lineup missing before kickoff */}
        {!viewerToken && matchState?.status === 'SCHEDULED' && (() => {
          const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
          return teamId && hasDefaultLineup[teamId] === false ? (
            <div style={{ padding: '0 16px 12px' }}>
              <IonCard color="warning">
                <IonCardContent>
                  <IonText>Default lineup not set for the selected team. Set it before kickoff for smooth live management.</IonText>
                </IonCardContent>
              </IonCard>
            </div>
          ) : null;
        })()}

        {/* Team Changes button */}
        {!viewerToken && (
          <div style={{ padding: '0 16px 12px' }}>
            <IonButton disabled={!lineupReady} onClick={() => { if (lineupReady && writerReadyRef.current) setShowLineupModal(true); }}>Team Changes</IonButton>
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
                  showDelete={!viewerToken}
                  deleteDisabled={correctionBusy}
                  onDelete={item => { if (item.kind === 'event') void deleteEvent(item.id); }}
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
      {lineupReady && <LineupManagementModal
        key={`${selectedId}:${identity}`}
        canApply={(() => { const context = { ...contextRef.current }; return () => lineupReadyRef.current && contextIsCurrent(context); })()}
        isOpen={showLineupModal}
        onClose={() => setShowLineupModal(false)}
        matchId={selectedId || ''}
        selectedTeamId={selectedTeam === 'home' ? currentMatch?.homeTeamId || '' : currentMatch?.awayTeamId || ''}
        currentMinute={Number((((timerMs || 0) / 60000)).toFixed(2))}
        onFormationChanged={() => { if (writerReadyRef.current) void loadEvents(); }}
      />}
    </IonPage>
  );
};

export default LiveMatchPage;
