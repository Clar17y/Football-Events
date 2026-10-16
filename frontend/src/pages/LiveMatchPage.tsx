import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  IonPage,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  IonText,
  IonModal,
} from '@ionic/react';
import {
  chevronForwardOutline,
  chevronDownOutline,
  chevronUpOutline,
  footballOutline,
  alertCircleOutline,
  shieldCheckmarkOutline,
  swapHorizontalOutline,
  optionsOutline,
  shirtOutline,
  pauseOutline,
  playOutline,
  peopleOutline,
  ellipsisHorizontalOutline,
  settingsOutline,
  square,
} from 'ionicons/icons';
import PageHeader from '../components/PageHeader';
import { getGuestId } from '../utils/guest';
import { getAuthUserId } from '../utils/network';
import { CONNECTED_RECOVERY_MESSAGE } from '../services/api/authFailure';
import { GUEST_LIMITS } from '../utils/quotas';
import {
  reconstructClock,
  uniquePeriods,
  regularPeriodCount,
  periodLengthMs,
  periodOffsetMs,
  actualPlayedSeconds,
  activePlayedSeconds,
  endedPlayedSeconds,
  formatLiveClock,
  timestampMs,
} from '../utils/liveMatchTiming';
import {
  captureRecordingDraft,
  isCurrentDraft,
  recordingNotes,
  readRecordingPeriod,
  type RecordingDraft,
} from '../utils/liveRecordingDraft';
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

type QuickEventKind =
  | 'goal'
  | 'assist'
  | 'key_pass'
  | 'save'
  | 'interception'
  | 'tackle'
  | 'foul'
  | 'penalty'
  | 'free_kick'
  | 'ball_out'
  | 'own_goal'
  | 'formation_change'
  | 'yellow_card'
  | 'red_card'
  | 'corner'
  | 'offside'
  | 'shot_on_target'
  | 'shot_off_target'
  | 'clearance'
  | 'block'
  | 'cross'
  | 'header';

type RosterItem = { id: string; name: string; squadNumber?: number; preferredPosition?: string };
type PeriodType = 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';

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
  event?: MatchEvent;
};

const LiveMatchPage: React.FC<LiveMatchPageProps> = ({ onNavigate, matchId }) => {
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
  const renderContext = { ...contextRef.current };

  const contextIsCurrent = (context: { matchId?: string; identity: string; revision: number }) =>
    contextRef.current.mounted &&
    contextRef.current.matchId === context.matchId &&
    contextRef.current.identity === context.identity &&
    contextRef.current.revision === context.revision;

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

  // Local-first sources of truth
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

  // UI state for Touchline options
  const [selectedTeam, setSelectedTeam] = useState<'home' | 'away'>('home');
  const [showMoreEvents, setShowMoreEvents] = useState(false);
  const [trackedPlayerId, setTrackedPlayerId] = useState<string | null>(null);
  const [showTrackedPlayerModal, setShowTrackedPlayerModal] = useState(false);
  const [trackedPlayerSearch, setTrackedPlayerSearch] = useState('');
  const [trackedRosterLoading, setTrackedRosterLoading] = useState(false);
  const [trackedRosterError, setTrackedRosterError] = useState<string | null>(null);
  const [trackedRosterVersion, setTrackedRosterVersion] = useState(0);
  const trackedPickerContextRef = useRef<{ matchId?: string; identity: string; revision: number; teamId: string } | null>(null);

  // Events & draft states
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
  const [roster, setRoster] = useState<Array<RosterItem>>([]);
  const [rosterCache, setRosterCache] = useState<Record<string, Array<RosterItem>>>({});
  const [onPitchByTeam, setOnPitchByTeam] = useState<Record<string, Set<string>>>({});
  const [hasDefaultLineup, setHasDefaultLineup] = useState<Record<string, boolean>>({});
  const [rosterLoading, setRosterLoading] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [sentiment, setSentiment] = useState<number>(0);
  const [addingEvent, setAddingEvent] = useState(false);
  const addingEventRef = useRef(false);
  const [eventFeed, setEventFeed] = useState<FeedItem[]>([]);
  const eventFeedRef = useRef(eventFeed);
  eventFeedRef.current = eventFeed;
  const [playerNameMap, setPlayerNameMap] = useState<Record<string, string>>({});

  // Load upcoming matches
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
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
          } else {
            setUpcoming([]);
          }
        } else {
          const [upcomingList, recentList] = await Promise.all([
            matchesApi.getUpcoming(20),
            matchesApi.getRecent(10)
          ]);
          if (cancelled) return;
          const combined: Record<string, Match> = {};
          [...(upcomingList || []), ...(recentList || [])].filter(m => isCurrentOwnedMatch(m, actorOwnerId)).forEach(m => {
            combined[m.id] = m;
          });
          const list = Object.values(combined).sort((a, b) =>
            new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
          );
          setUpcoming(list);
          if (!selectedId && list.length > 0) {
            try {
              const matchIds = list.map(m => m.id);
              const states = await matchesApi.getMatchStates(1, 100, matchIds);
              if (cancelled) return;
              const statesMap = new Map((states.data || []).map((s: any) => [s.matchId, s]));
              const nonCompleted = list.find(m => {
                const state = statesMap.get(m.id);
                return state?.status !== 'COMPLETED';
              });
              setSelectedId(nonCompleted ? nonCompleted.id : list[0].id);
            } catch {
              if (cancelled) return;
              setSelectedId(list[0].id);
            }
          }
        }
      } catch (e: any) {
        console.warn('Failed to load matches', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isAuthenticated, identity, actorOwnerId, accountRecoveryRequired, selectedId]);

  // Query active viewer link
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isAuthenticated || !selectedId) return;
      try {
        const links = await matchesApi.getActiveViewerLinks(selectedId);
        if (cancelled) return;
        setActiveShareCode(links.length > 0 ? links[0].code : null);
      } catch { }
    };
    run();
    return () => { cancelled = true; };
  }, [isAuthenticated, identity, selectedId]);

  // Read viewer token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('view');
    const c = params.get('code');
    if (t) { setViewerToken(t); setViewerParam('view'); }
    else if (c) { setViewerToken(c); setViewerParam('code'); }
  }, []);

  // Apply resolved local snapshot
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
    setAppliedLocalSnapshot({
      matchId: selectedId, identity, state: localMatchStateRecord,
      periods: localPeriodRecords, match: localMatchRecord, version: localReadVersion,
    });
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

  // Capture hydration before request
  useEffect(() => {
    let cancelled = false;
    const fetchLive = async () => {
      if (!selectedId || viewerToken || !isAuthenticated || !user?.id) return;
      const hydrationContext = { ...contextRef.current };
      const hydrationIsCurrent = () => !cancelled && contextIsCurrent(hydrationContext);
      try {
        const token = await captureLiveMatchHydration(selectedId);
        if (!token || !hydrationIsCurrent()) return;
        const [state, periods, events, remoteMatch] = await Promise.all([
          matchesApi.getMatchState(selectedId).catch(error => {
            if (error instanceof ApiRequestError && error.status === 404) return null;
            throw error;
          }),
          matchesApi.getMatchPeriods(selectedId),
          eventsApi.getByMatch(selectedId),
          matchesApi.getRemoteMatchSnapshot(selectedId),
        ]);
        if (!hydrationIsCurrent()) return;
        if (!state && (periods.length || events.length)) return;
        const restoredState = state || {
          matchId: selectedId, status: 'SCHEDULED', totalElapsedSeconds: 0,
          createdByUserId: token.ownerId, createdAt: new Date().toISOString(), isDeleted: false,
        } as MatchState;
        const importSnapshot = () => applyLiveMatchHydration(token, { match: remoteMatch, state: restoredState, periods, events }, (serverState, canonicalPeriods, match, now) => {
          if (!hydrationIsCurrent()) throw new Error('Match hydration context changed');
          const timerMs = reconstructClock(serverState, canonicalPeriods, match, now);
          return { timerMs, totalElapsedSeconds: actualPlayedSeconds(timerMs, match, canonicalPeriods) };
        }, hydrationIsCurrent);
        if (state) await importSnapshot();
        else await db.transaction('rw', db.matches, db.matchState, db.matchPeriods, db.events, async () => {
          const parent = await db.matches.get(selectedId);
          if (!parent || parent.homeScore !== 0 || parent.awayScore !== 0 || await db.matchState.get(selectedId) ||
              (await db.matchPeriods.where('matchId').equals(selectedId).toArray()).length ||
              (await db.events.where('matchId').equals(selectedId).toArray()).length) return;
          if (hydrationIsCurrent()) await importSnapshot();
        });
      } catch { }
    };
    void fetchLive();
    return () => { cancelled = true; };
  }, [isAuthenticated, identity, user?.id, selectedId, viewerToken, restoreVersion]);

  // Viewer mode SSE
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
          const check = await viewerApi.checkToken(selectedId, { name: viewerParam!, value: viewerToken! });
          if (!check.ok && (check.status === 401 || check.status === 403)) {
            setViewerExpired(true);
            try { (window as any).__toastApi?.current?.showError?.('Viewer link expired. Please ask the coach for a new link.'); } catch { }
            return;
          }
          const attempt = (retryRef.current || 0) + 1;
          retryRef.current = attempt;
          const delay = Math.min(30000, Math.pow(2, Math.min(attempt, 6)) * 1000);
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
                id: 'viewer', matchId: s.matchId, status: s.status,
                currentPeriod: s.currentPeriod || undefined,
                currentPeriodType: s.currentPeriodType || undefined,
                totalElapsedSeconds: s.totalElapsedSeconds || 0,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                createdByUserId: '', isDeleted: false,
              } as any);
              const feedEvents: FeedItem[] = (data.events || []).map((ev: any) => ({
                id: ev.id, kind: 'event', label: labelForEvent(ev.kind),
                createdAt: new Date(ev.createdAt || Date.now()), periodNumber: ev.periodNumber || undefined,
                periodType: ev.periodType || readRecordingPeriod(ev.notes)?.periodType,
                clockMs: ev.clockMs || 0, teamId: ev.teamId || undefined,
                playerId: ev.playerId || undefined, sentiment: ev.sentiment || 0, event: ev,
              }));
              const systemFromPeriods: FeedItem[] = (data.periods || []).flatMap((p: any) => {
                const out: FeedItem[] = [];
                if (p.startedAt) out.push({ id: `ps-${p.id}`, kind: 'system', label: periodStartLabel(p), createdAt: new Date(p.startedAt), periodNumber: p.periodNumber });
                if (p.endedAt) out.push({ id: `pe-${p.id}`, kind: 'system', label: periodEndLabel(p), createdAt: new Date(p.endedAt), periodNumber: p.periodNumber });
                return out;
              });
              setEventFeed(sortFeed([...feedEvents, ...systemFromPeriods]));
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

  useEffect(() => {
    if (matchId) setSelectedId(matchId);
  }, [matchId]);

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
    if (localMatchRecord && localMatchRecord.id === selectedId) {
      return { ...details, ...localMatchRecord, homeTeam: details?.homeTeam, awayTeam: details?.awayTeam };
    }
    return listed;
  }, [currentIndex, upcoming, selectedLocalMatch, selectedId, localMatchRecord, identity, actorOwnerId, accountRecoveryRequired, parentOwnershipResolved, localParentOwned, parentOwnershipBlocked, viewerToken]);

  const readOnlyStatus = matchState?.status === 'CANCELLED' || matchState?.status === 'POSTPONED';
  const writerReady = !viewerToken && !accountRecoveryRequired && localParentOwned && !readOnlyStatus && localStateKnown &&
    (!matchState || isReplayableMatchStatus(matchState.status)) && localSnapshotReady && !!currentMatch && (!matchId || matchId === selectedId) &&
    appliedLocalSnapshot?.matchId === selectedId && appliedLocalSnapshot.identity === identity &&
    appliedLocalSnapshot.state === localMatchStateRecord && appliedLocalSnapshot.periods === localPeriodRecords &&
    appliedLocalSnapshot.match === localMatchRecord && appliedLocalSnapshot.version === localReadVersion;
  writerReadyRef.current = writerReady;
  const correctionReady = writerReady && !!matchState && !lifecycleBusy && !addingEvent && !correctionBusy &&
    !lifecycleError && !lifecycleRetryRef.current;
  const correctionReadyRef = useRef(correctionReady);
  correctionReadyRef.current = correctionReady;
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
      onNavigate?.(`/live/${next.id}`);
    }
  };

  const teamName = (team?: { name?: string } | null) => team?.name || 'TBD';

  const handleShareLink = async () => {
    try {
      if (!selectedId) return;
      const res = await matchesApi.shareViewerToken(selectedId, 480);
      let shareUrl = res.shareUrl || `${window.location.origin}/live/${selectedId}?${res.code ? `code=${encodeURIComponent(res.code)}` : `view=${encodeURIComponent(res.viewer_token)}`}`;
      try {
        const u = new URL(shareUrl, window.location.origin);
        shareUrl = u.href;
      } catch { }
      try {
        await navigator.clipboard.writeText(shareUrl);
        try { (window as any).__toastApi?.current?.showSuccess?.('Share link copied to clipboard'); } catch { }
      } catch {
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

  const regPeriodsCount = (m?: Match) => regularPeriodCount(m || {});
  const timingFormat = currentMatch || viewerSummary || {};
  const currentOpenPeriod = periods.find(p => !p.isDeleted && !p.endedAt);
  const currentStateAnchor = timestampMs(localMatchStateRecord?.lastUpdatedAt ?? localMatchStateRecord?.updatedAt ?? localMatchStateRecord?.createdAt);
  const recoverableStart = !!currentOpenPeriod && (matchState?.status === 'SCHEDULED' ||
    (matchState?.status === 'PAUSED' && localMatchStateRecord?.currentPeriodId !== currentOpenPeriod.id &&
      (currentStateAnchor ?? 0) <= (timestampMs(currentOpenPeriod.startedAt) ?? 0)));
  const lastEndedPeriod = periods.filter(p => p.endedAt).sort((a, b) =>
    (timestampMs(b.endedAt) || 0) - (timestampMs(a.endedAt) || 0))[0];
  const recoverableEnd = matchState?.status === 'LIVE' && !currentOpenPeriod && !!lastEndedPeriod;
  const endedRegularCount = periods.filter(p => p.periodType === 'REGULAR' && !!p.endedAt).length;
  const canStartPeriod = writerReady && (!matchState || matchState.status === 'SCHEDULED' || matchState.status === 'PAUSED') &&
    !recoverableEnd && (!currentOpenPeriod || recoverableStart);
  const savedPeriods = periods.filter(p => !p.isDeleted);
  const recoveringPeriod = recoverableStart ? currentOpenPeriod : undefined;
  const nextPeriodNumbers = {
    REGULAR: Math.max(0, ...savedPeriods.filter(p => (p.periodType || 'REGULAR') === 'REGULAR').map(p => p.periodNumber)) + 1,
    EXTRA_TIME: Math.max(0, ...savedPeriods.filter(p => p.periodType === 'EXTRA_TIME').map(p => p.periodNumber)) + 1,
    PENALTY_SHOOTOUT: 1,
  };
  const regularTimeEnded = endedRegularCount >= regPeriodsCount(currentMatch);
  const extraTimeEnded = savedPeriods.filter(p => p.periodType === 'EXTRA_TIME' && p.endedAt).length >= 2;
  const hasExtraTime = savedPeriods.some(p => p.periodType === 'EXTRA_TIME');
  const hasShootout = savedPeriods.some(p => p.periodType === 'PENALTY_SHOOTOUT');
  const allowedPeriodStarts: Record<PeriodType, boolean> = {
    REGULAR: canStartPeriod && (recoveringPeriod ? (recoveringPeriod.periodType || 'REGULAR') === 'REGULAR'
      : nextPeriodNumbers.REGULAR <= regPeriodsCount(currentMatch) && !hasExtraTime && !hasShootout),
    EXTRA_TIME: canStartPeriod && (recoveringPeriod ? recoveringPeriod.periodType === 'EXTRA_TIME'
      : regularTimeEnded && nextPeriodNumbers.EXTRA_TIME <= 2 && !hasShootout),
    PENALTY_SHOOTOUT: canStartPeriod && (recoveringPeriod ? recoveringPeriod.periodType === 'PENALTY_SHOOTOUT'
      : regularTimeEnded && extraTimeEnded && !hasShootout),
  };
  // Saved callbacks must use the current phase, numbering and recovery inputs.
  const periodStartSnapshot = { allowedPeriodStarts, recoveringPeriod, nextPeriodNumbers, periods: savedPeriods, timingFormat };
  const periodStartRef = useRef(periodStartSnapshot);
  periodStartRef.current = periodStartSnapshot;
  const canKickOff = allowedPeriodStarts[recoveringPeriod?.periodType || 'REGULAR'];

  const getPeriodLabel = (): string => {
    if (!viewerToken && accountRecoveryRequired) return 'Account recovery needed';
    if (!viewerToken && parentOwnershipBlocked) return 'Match unavailable';
    if (matchState?.status === 'CANCELLED') return 'Cancelled';
    if (matchState?.status === 'POSTPONED') return 'Postponed';
    if (!viewerToken && !writerReady) return 'Loading saved match…';
    const fmt = (currentMatch?.periodFormat || viewerSummary?.periodFormat || '').toLowerCase();
    const open = currentOpenPeriod;
    const latest = open || [...periods].sort((a, b) => (a.startedAt && b.startedAt ? new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime() : (b.periodNumber - a.periodNumber)))[0];
    if (matchState?.status === 'COMPLETED') return 'FT';
    if (matchState?.status === 'PAUSED' && !open) {
      if (fmt.includes('half')) {
        return endedRegularCount >= 2 ? 'Full Time' : 'Half Time';
      }
      if (fmt.includes('quarter')) return 'Quarter Break';
      return 'Break';
    }
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
    return 'Live';
  };

  const runLifecycle = async (action: () => Promise<void>) => {
    if (!writerReady || !writerReadyRef.current || contextRef.current.matchId !== selectedId ||
      !contextIsCurrent(renderContext) || lifecycleRef.current || addingEventRef.current || correctionRef.current || !selectedId) return;
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

  const startPeriod = (type: PeriodType) => {
    const snapshot = periodStartRef.current;
    const recoveringPeriod = snapshot.recoveringPeriod;
    const periodType = recoveringPeriod?.periodType || type;
    if (!canStartPeriod || !snapshot.allowedPeriodStarts[periodType] || !contextIsCurrent(renderContext) || !selectedId ||
      lifecycleRef.current || lifecycleRetryRef.current || correctionRef.current) return;
    const targetMatch = selectedId;
    const actionContext = { ...contextRef.current };
    const nextNum = recoveringPeriod?.periodNumber ?? snapshot.nextPeriodNumbers[periodType];
    const offset = periodOffsetMs(snapshot.timingFormat, { periodNumber: nextNum, periodType });
    const total = recoveringPeriod ? endedPlayedSeconds(snapshot.periods) : actualPlayedSeconds(readClock(), snapshot.timingFormat, snapshot.periods);
    const startedAt = timestampMs(recoveringPeriod?.startedAt) ?? Date.now();
    let createdPeriodId: string | undefined;
    return runLifecycle(async () => {
      const period = createdPeriodId
        ? (await matchPeriodsDataLayer.getByMatch(targetMatch)).find(p => p.id === createdPeriodId)
        : await matchPeriodsDataLayer.create({ matchId: targetMatch, periodNumber: nextNum, periodType, startedAt });
      if (!period || period.endedAt != null) throw new Error('This period has changed. Reload match controls to continue from its saved state.');
      createdPeriodId = period.id;
      lifecyclePartialRef.current = true;
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

  // Team selection management
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

  const activeTeamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
  const activeTeamRef = useRef(activeTeamId);
  activeTeamRef.current = activeTeamId;

  const closeTrackedPlayerPicker = () => {
    trackedPickerContextRef.current = null;
    setShowTrackedPlayerModal(false);
  };

  const openTrackedPlayerPicker = () => {
    if (!activeTeamId || !localParentOwned || accountRecoveryRequired || viewerToken || showPicker || addingEventRef.current) return;
    trackedPickerContextRef.current = { ...contextRef.current, teamId: activeTeamId };
    setTrackedPlayerSearch('');
    if (trackedRosterError) setTrackedRosterVersion(version => version + 1);
    setShowTrackedPlayerModal(true);
  };

  // Tracked player preference synchronization & invalidation
  useEffect(() => {
    let cancelled = false;
    const prefContext = { ...contextRef.current, teamId: activeTeamId };
    const preferenceIsCurrent = () => !cancelled && contextIsCurrent(prefContext) && activeTeamRef.current === prefContext.teamId;
    setTrackedPlayerId(null);
    setTrackedRosterError(null);
    if (!activeTeamId || !selectedId || viewerToken || accountRecoveryRequired) {
      setTrackedRosterLoading(false);
      closeTrackedPlayerPicker();
      return;
    }
    setTrackedRosterLoading(true);
    const loadTracked = async () => {
      try {
        let items = rosterCache[activeTeamId];
        if (!items) {
          const res = await teamsApi.getTeamPlayers(activeTeamId);
          items = res.data.map(p => ({ id: p.id, name: p.name, squadNumber: (p as any).squadNumber, preferredPosition: (p as any).preferredPosition }));
          if (!preferenceIsCurrent()) return;
          setRosterCache(prev => ({ ...prev, [activeTeamId]: items }));
        }
        if (!preferenceIsCurrent()) return;
        const pref = trackedPlayer(identity, activeTeamId, items);
        setTrackedPlayerId(pref);
      } catch {
        if (preferenceIsCurrent()) setTrackedRosterError('Roster unavailable. Close this sheet and try Change player again.');
      } finally {
        if (preferenceIsCurrent()) setTrackedRosterLoading(false);
      }
    };
    void loadTracked();
    return () => {
      cancelled = true;
    };
  }, [identity, selectedId, activeTeamId, viewerToken, accountRecoveryRequired, rosterCache, trackedRosterVersion]);

  const handleSelectTrackedPlayer = (playerId: string | null, captured: typeof trackedPickerContextRef.current) => {
    if (!showTrackedPlayerModal || !captured || captured !== trackedPickerContextRef.current || !contextIsCurrent(captured) || captured.teamId !== activeTeamId ||
      !localParentOwned || accountRecoveryRequired || viewerToken || addingEventRef.current) return;
    if (playerId && !(rosterCache[captured.teamId] || []).some(player => player.id === playerId)) return;
    rememberTrackedPlayer(captured.identity, captured.teamId, playerId);
    setTrackedPlayerId(playerId);
    closeTrackedPlayerPicker();
  };

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
    cancelDraft();
    closeTrackedPlayerPicker();
    setSelectedPlayerId(null);
  }, [activeTeamId]);

  useEffect(() => {
    cancelDraft(); setSelectedPlayerId(null); setRoster([]); setRosterCache({}); setOnPitchByTeam({});
    closeTrackedPlayerPicker(); setTrackedPlayerId(null);
    setSnackbarOpen(false); setLastEventId(null); setCorrectionError(null);
    lifecycleRetryRef.current = null; setLifecycleError(null);
    recoveryRefreshRef.current = null;
  }, [selectedId, identity]);

  const draftIsCurrent = (candidate: RecordingDraft) => contextRef.current.mounted &&
    isCurrentDraft(candidate, draftRef.current, contextRef.current.matchId, contextRef.current.identity);

  const openPlayerPicker = async (kind: QuickEventKind) => {
    if (!selectedId || !canAddEvents || lifecycleRef.current || lifecycleRetryRef.current || addingEventRef.current || correctionRef.current || !allowedEventKindSet.has(kind)) return;
    const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
    if (!teamId || !currentOpenPeriod) return;
    const captured = captureRecordingDraft({
      id: crypto.randomUUID(), identity, matchId: selectedId, teamId,
      teamName: (selectedTeam === 'home' ? currentMatch?.homeTeam?.name : currentMatch?.awayTeam?.name) || selectedTeam,
      periodId: currentOpenPeriod.id, periodNumber: currentOpenPeriod.periodNumber,
      periodType: currentOpenPeriod.periodType || 'REGULAR', kind, clockMs: readClock(),
    });
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
    if (!captured || !draftIsCurrent(captured) || addingEventRef.current || lifecycleRef.current || lifecycleRetryRef.current || correctionRef.current || viewerToken) return;
    if (!writerReadyRef.current) {
      setPickerError(accountRecoveryRequired ? recoveryMessage || CONNECTED_RECOVERY_MESSAGE : 'This match is not available for recording. Your play has not been saved.');
      return;
    }
    const playerId = withoutPlayer ? undefined : selectedPlayerId || undefined;
    if (playerId && !roster.some(p => p.id === playerId)) return;
    addingEventRef.current = true; setAddingEvent(true); setPickerError(null);
    try {
      const created = await eventsApi.create({
        matchId: captured.matchId, teamId: captured.teamId,
        periodNumber: captured.periodNumber, clockMs: captured.clockMs, kind: captured.kind as QuickEventKind,
        ...(playerId ? { playerId } : {}), sentiment, notes: recordingNotes(captured),
      });
      if (!draftIsCurrent(captured)) return;
      if (trackPlayer && playerId) {
        rememberTrackedPlayer(captured.identity, captured.teamId, playerId);
        setTrackedPlayerId(playerId);
      }
      setLastEventId(created.id); setLastEventKind(captured.kind as QuickEventKind);
      setLastEventSentiment(sentiment); setSnackbarOpen(true);
      setEventFeed(prev => sortFeed([{
        id: created.id, kind: 'event', label: labelForEvent(created.kind),
        createdAt: new Date(created.createdAt || Date.now()), periodNumber: captured.periodNumber,
        periodType: captured.periodType, clockMs: captured.clockMs, teamId: captured.teamId, playerId, sentiment, event: transformCreated(created),
      }, ...prev.filter(i => i.id !== created.id)]));
      cancelDraft();
    } catch (e) {
      if (draftIsCurrent(captured)) setPickerError(e instanceof Error ? e.message : 'Could not save. Your event is ready to retry.');
    } finally {
      addingEventRef.current = false;
      if (contextRef.current.mounted) setAddingEvent(false);
    }
  };

  const runCorrection = async (id: string, action: () => Promise<void>) => {
    const target = eventFeedRef.current.find(item => item.kind === 'event' && item.id === id)?.event;
    if (!correctionReady || !correctionReadyRef.current || !writerReadyRef.current || !contextIsCurrent(renderContext) ||
      viewerToken || lifecycleRef.current || lifecycleRetryRef.current || addingEventRef.current || correctionRef.current ||
      !target || target.matchId !== selectedId || target.isDeleted) return;
    correctionRef.current = true; setCorrectionBusy(true); setCorrectionError(null);
    const actionContext = renderContext;
    try { await action(); }
    catch (e) {
      if (contextIsCurrent(actionContext)) setCorrectionError(e instanceof Error ? e.message : 'Correction failed. Please retry.');
    } finally {
      correctionRef.current = false;
      if (contextRef.current.mounted) setCorrectionBusy(false);
    }
  };

  const deleteEvent = (id: string) => {
    const actionContext = renderContext;
    return runCorrection(id, async () => {
      await eventsApi.delete(id);
      if (!contextIsCurrent(actionContext)) return;
      setEventFeed(prev => prev.filter(item => item.id !== id));
      if (lastEventId === id) { setSnackbarOpen(false); setLastEventId(null); setLastEventKind(null); }
    });
  };

  const handleSetSentiment = (delta: number) => {
    if (!lastEventId) return;
    const id = lastEventId, actionContext = renderContext;
    const next = delta === 0 ? 0 : Math.max(-3, Math.min(3, lastEventSentiment + delta));
    if (next === lastEventSentiment) return;
    return runCorrection(id, async () => {
      await eventsApi.update(id, { sentiment: next });
      if (!contextIsCurrent(actionContext)) return;
      setLastEventSentiment(next);
      setEventFeed(prev => prev.map(item => item.id === id ? { ...item, sentiment: next, event: item.event ? { ...item.event, sentiment: next } : undefined } : item));
    });
  };

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

  const labelForEvent = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

  const loadEvents = useCallback(async () => {
    if (!selectedId || viewerToken) return;
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

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    setShowLineupModal(false);
  }, [selectedId, identity, lineupReady]);

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

  const calculatedScore = useMemo(() => {
    const m = currentMatch || (viewerTeams ? ({ homeTeamId: viewerTeams.homeId, awayTeamId: viewerTeams.awayId } as any) : undefined);
    return computeScore(eventFeed, m);
  }, [eventFeed, currentMatch, viewerTeams]);

  const activeRoster = activeTeamId ? rosterCache[activeTeamId] || [] : [];
  const currentTrackedObj = activeRoster.find(p => p.id === trackedPlayerId);

  const latestFeedItem = eventFeed.find(item => item.kind === 'event');
  const latestEvent = latestFeedItem?.event;
  const homeTeamName = currentMatch?.homeTeam?.name || viewerTeams?.homeName || 'Home team';
  const awayTeamName = currentMatch?.awayTeam?.name || viewerTeams?.awayName || 'Away team';
  const periodLabel = getPeriodLabel();
  const clockStatus = matchState?.status === 'LIVE' ? 'Live'
    : matchState?.status === 'PAUSED' ? (currentOpenPeriod ? 'Paused' : 'Break')
    : matchState?.status === 'COMPLETED' ? 'Completed'
    : matchState?.status === 'CANCELLED' ? 'Cancelled'
    : matchState?.status === 'POSTPONED' ? 'Postponed'
    : matchState?.status === 'SCHEDULED' ? 'Scheduled' : null;
  const showClockStatus = !!clockStatus && (viewerToken || writerReady) && periodLabel.toLowerCase() !== clockStatus.toLowerCase();
  const trackedPickerContext = trackedPickerContextRef.current;
  const trackedPickerCurrent = !!trackedPickerContext && contextIsCurrent(trackedPickerContext) &&
    trackedPickerContext.teamId === activeTeamId && localParentOwned && !accountRecoveryRequired;

  return (
    <IonPage className="live-match-page">
      <PageHeader onNavigate={onNavigate} />
      <IonContent fullscreen>
        <div className="touchline-container">
          {/* Informational and Error alerts */}
          {viewerToken && <p className="touchline-viewer-status" role="status">{viewerExpired ? 'Viewer link expired' : sseConnected ? 'Live viewer' : 'Reconnecting…'}</p>}
          {!viewerToken && accountRecoveryRequired && <div role="alert" className="live-error">{recoveryMessage || CONNECTED_RECOVERY_MESSAGE}</div>}
          {!viewerToken && parentOwnershipBlocked && <div role="alert" className="live-error">This match is not available under the current account. Open one of your saved matches or use the account that owns it.</div>}
          {!viewerToken && readOnlyStatus && <div role="status" className="live-error">This match is {matchState!.status === 'CANCELLED' ? 'cancelled' : 'postponed'}. Its saved details are available, but new plays and match controls are disabled.</div>}
          {!viewerToken && stateNeedsRestore && (
            <div role="alert" className="live-error">
              Match state needs restore. Connect to restore its saved status before recording.
              <IonButton size="small" onClick={() => setRestoreVersion(version => version + 1)}>Retry state restore</IonButton>
            </div>
          )}
          {lifecycleError && (
            <div role="alert" className="live-error">
              {lifecycleError}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {lifecyclePartialRef.current && !lifecycleOwnershipBlocked && (
                  <IonButton size="small" disabled={!writerReady || lifecycleBusy} onClick={() => { const retry = lifecycleRetryRef.current; if (retry) void runLifecycle(retry); }}>Retry match update</IonButton>
                )}
                <IonButton size="small" disabled={lifecycleBusy || stateLoading || periodsLoading} onClick={reloadMatchControls}>Reload match controls</IonButton>
              </div>
            </div>
          )}
          {(stateReadError || periodsReadError) && (
            <div role="alert" className="live-error">
              {stateReadError || periodsReadError} Reload the saved match before recording.
              <IonButton size="small" onClick={reloadMatchControls}>Reload match controls</IonButton>
            </div>
          )}
          {correctionError && <div role="alert" className="live-error">{correctionError} Your event is unchanged; try the correction again.</div>}

          {/* Default lineup warning before kickoff */}
          {!viewerToken && matchState?.status === 'SCHEDULED' && (() => {
            const teamId = selectedTeam === 'home' ? currentMatch?.homeTeamId : currentMatch?.awayTeamId;
            return teamId && hasDefaultLineup[teamId] === false ? (
              <div style={{ padding: '0 0 12px' }}>
                <div role="status" className="live-error" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                  Default lineup not set for the selected team. Set it before kickoff for smooth live management.
                </div>
              </div>
            ) : null;
          })()}

          {/* Loading state */}
          {loading && !currentMatch && !viewerToken && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '32px 0' }}>
              <IonSpinner name="crescent" />
              <IonText>Loading upcoming matches…</IonText>
            </div>
          )}

          {/* Open Scoreboard */}
          {(currentMatch || viewerToken) && (
            <div className="live-header touchline-scoreboard">
              <button
                type="button"
                className={`touchline-team-btn ${selectedTeam === 'home' ? 'touchline-team-active' : ''}`}
                onClick={() => selectTeam('home')}
                aria-label={homeTeamName}
              >
                <span className="touchline-team-name">{homeTeamName}</span>
                <span className="touchline-team-indicator" />
              </button>
              <div className="live-header-score touchline-score">
                {matchState ? `${calculatedScore.home} - ${calculatedScore.away}` : '–'}
              </div>
              <button
                type="button"
                className={`touchline-team-btn ${selectedTeam === 'away' ? 'touchline-team-active' : ''}`}
                onClick={() => selectTeam('away')}
                aria-label={awayTeamName}
              >
                <span className="touchline-team-name">{awayTeamName}</span>
                <span className="touchline-team-indicator" />
              </button>
            </div>
          )}

          {/* Open Clock & Status Row */}
          {(selectedId || currentMatch || viewerToken) && (
            <div className="touchline-clock-row">
              <div
                role="timer"
                aria-label={`Match clock ${formatLiveClock(timerMs)}`}
                className="touchline-clock-main"
              >
                {formatLiveClock(timerMs)}
              </div>
              <div className="touchline-clock-divider" />
              <div className="touchline-clock-status">
                <div className="touchline-period-name">{periodLabel}</div>
                {showClockStatus && <div className={`touchline-live-tag ${matchState?.status === 'LIVE' ? 'touchline-tag-live' : ''}`}>
                  <span className={`touchline-status-dot ${matchState?.status === 'LIVE' ? 'touchline-dot-live' : matchState?.status === 'PAUSED' ? 'touchline-dot-paused' : ''}`} />
                  <span>{clockStatus}</span>
                </div>}
              </div>

              {/* Circular Clock Action Button (Pause / Resume / Kick Off) */}
              {!viewerToken && matchState?.status !== 'COMPLETED' && !readOnlyStatus && (
                <div className="touchline-clock-action">
                  {matchState?.status === 'LIVE' && currentOpenPeriod && (
                    <button
                      type="button"
                      className="touchline-circle-action touchline-action-pause"
                      aria-label="Pause"
                      disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                      onClick={handlePause}
                    >
                      <IonIcon icon={pauseOutline} />
                      <span className="touchline-circle-label">Pause</span>
                    </button>
                  )}
                  {matchState?.status === 'PAUSED' && currentOpenPeriod && (
                    <button
                      type="button"
                      className="touchline-circle-action touchline-action-resume"
                      aria-label="Resume"
                      disabled={!writerReady || !selectedId || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                      onClick={handleResume}
                    >
                      <IonIcon icon={playOutline} />
                      <span className="touchline-circle-label">Resume</span>
                    </button>
                  )}
                  {(matchState?.status === 'SCHEDULED' || (!matchState && !currentOpenPeriod) ||
                    (matchState?.status === 'PAUSED' && !currentOpenPeriod && endedRegularCount < regPeriodsCount(currentMatch))) && (
                    <button
                      type="button"
                      className="touchline-circle-action touchline-action-kickoff"
                      aria-label="Kick Off"
                      disabled={!canKickOff || !selectedId || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                      onClick={handleKickOff}
                    >
                      <IonIcon icon={playOutline} />
                      <span className="touchline-circle-label">Kick Off</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {currentMatch && <hr className="touchline-divider" />}

          {/* Tracked Player Row */}
          {!viewerToken && currentMatch && (
            <div className="touchline-tracked-player-row">
              <div className="touchline-tracked-left">
                <div className="touchline-shirt-badge">
                  <IonIcon icon={shirtOutline} />
                  {currentTrackedObj?.squadNumber != null && (
                    <span className="touchline-shirt-num">{currentTrackedObj.squadNumber}</span>
                  )}
                </div>
                <div className="touchline-tracked-info">
                  <div className="touchline-tracked-name">
                    {currentTrackedObj?.name || 'Choose a player'}
                  </div>
                  <div className="touchline-tracked-subtitle">Tracked player</div>
                </div>
              </div>
              <button
                type="button"
                className="touchline-change-player-pill"
                disabled={!localParentOwned || accountRecoveryRequired || addingEvent || showPicker}
                onClick={openTrackedPlayerPicker}
              >
                Change player <IonIcon icon={chevronForwardOutline} />
              </button>
            </div>
          )}

          {/* Current Team Selector */}
          {!viewerToken && currentMatch && (
            <div className="touchline-current-team-wrap">
              <label htmlFor="touchline-team-select" className="touchline-field-label">Current team</label>
              <div className="touchline-team-dropdown-box">
                <IonIcon icon={peopleOutline} className="touchline-team-dropdown-icon" />
                <select
                  id="touchline-team-select"
                  className="touchline-team-dropdown-select"
                  value={selectedTeam}
                  onChange={e => selectTeam(e.target.value as 'home' | 'away')}
                  aria-label="Select current team"
                >
                  <option value="home">{teamName(currentMatch.homeTeam)}</option>
                  <option value="away">{teamName(currentMatch.awayTeam)}</option>
                </select>
                <IonIcon icon={chevronDownOutline} className="touchline-team-dropdown-arrow" />
              </div>
            </div>
          )}

          {/* Main Action - Large Goal Button */}
          {currentMatch && !viewerToken && matchState?.status !== 'COMPLETED' && (
            <div>
              <button
                type="button"
                className="touchline-btn-goal"
                aria-label="goal"
                disabled={!canAddEvents || !allowedEventKindSet.has('goal') || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                onClick={() => openPlayerPicker('goal')}
              >
                <IonIcon icon={footballOutline} className="touchline-btn-goal-icon" />
                <span className="touchline-btn-goal-text">Goal</span>
              </button>

              {/* Secondary Pairs */}
              <div className="touchline-action-pairs">
                {/* Pair 1: Assist & Foul */}
                <div className="touchline-action-pair-row">
                  <button
                    type="button"
                    className="touchline-action-btn"
                    aria-label="assist"
                    disabled={!canAddEvents || !allowedEventKindSet.has('assist') || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                    onClick={() => openPlayerPicker('assist')}
                  >
                    <IonIcon icon={swapHorizontalOutline} />
                    <span>Assist</span>
                  </button>
                  <button
                    type="button"
                    className="touchline-action-btn"
                    aria-label="foul"
                    disabled={!canAddEvents || !allowedEventKindSet.has('foul') || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                    onClick={() => openPlayerPicker('foul')}
                  >
                    <IonIcon icon={alertCircleOutline} />
                    <span>Foul</span>
                  </button>
                </div>

                {/* Pair 2: Yellow Card & Red Card */}
                <div className="touchline-action-pair-row">
                  <button
                    type="button"
                    className="touchline-action-btn"
                    aria-label="yellow card"
                    disabled={!canAddEvents || !allowedEventKindSet.has('yellow_card') || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                    onClick={() => openPlayerPicker('yellow_card')}
                  >
                    <IonIcon icon={square} className="touchline-card-yellow" />
                    <span>Yellow card</span>
                  </button>
                  <button
                    type="button"
                    className="touchline-action-btn"
                    aria-label="red card"
                    disabled={!canAddEvents || !allowedEventKindSet.has('red_card') || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                    onClick={() => openPlayerPicker('red_card')}
                  >
                    <IonIcon icon={square} className="touchline-card-red" />
                    <span>Red card</span>
                  </button>
                </div>
              </div>

              {/* More Events Disclosure */}
              <button
                type="button"
                className="touchline-more-toggle"
                aria-expanded={showMoreEvents}
                aria-controls="touchline-more-events"
                onClick={() => setShowMoreEvents(!showMoreEvents)}
              >
                <div className="touchline-more-left">
                  <div className="touchline-more-icon-badge">
                    <IonIcon icon={ellipsisHorizontalOutline} />
                  </div>
                  <span>More events</span>
                </div>
                <IonIcon icon={showMoreEvents ? chevronUpOutline : chevronForwardOutline} />
              </button>

              {showMoreEvents && (
                <div id="touchline-more-events" className="touchline-more-grid">
                  {(
                    [
                      'own_goal',
                      'penalty',
                      'free_kick',
                      'shot_on_target',
                      'shot_off_target',
                      'corner',
                      'offside',
                      'tackle',
                      'interception',
                      'clearance',
                      'block',
                      'header',
                      'cross',
                      'save',
                      'key_pass',
                      'ball_out',
                      ...(['goal', 'assist', 'foul', 'yellow_card', 'red_card'] as QuickEventKind[]).filter(kind => !allowedEventKindSet.has(kind)),
                    ] as QuickEventKind[]
                  ).map(k => {
                    const allowed = allowedEventKindSet.has(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        className="touchline-more-item-btn"
                        aria-label={`${k.replace(/_/g, ' ')}${!allowed ? ' Premium' : ''}`}
                        disabled={!canAddEvents || !allowed || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                        onClick={() => openPlayerPicker(k)}
                      >
                        <span>{labelForEvent(k)}</span>
                        {!allowed && <span className="touchline-premium-tag">Premium</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {!canAddEvents && !viewerToken && matchState?.status !== 'COMPLETED' && (
            <div style={{ textAlign: 'center', color: 'var(--touchline-muted)', fontSize: 13, margin: '8px 0 16px' }}>
              Events are available only during live play.
            </div>
          )}

          <hr className="touchline-divider" />

          {/* Latest Moment Section */}
          <section className="touchline-latest-moment-section">
            <div className="touchline-field-label">Latest moment</div>
            {latestEvent ? (
              <div className="touchline-latest-moment-card">
                <div className="touchline-moment-left">
                  <div className="touchline-moment-icon-circle">
                    <IonIcon
                      icon={
                        latestEvent.kind === 'goal' || latestEvent.kind === 'own_goal'
                          ? footballOutline
                          : latestEvent.kind === 'yellow_card' || latestEvent.kind === 'red_card' || latestEvent.kind === 'foul'
                          ? alertCircleOutline
                          : latestEvent.kind === 'save'
                          ? shieldCheckmarkOutline
                          : optionsOutline
                      }
                    />
                  </div>
                  <div className="touchline-moment-details">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="touchline-moment-time">{typeof latestEvent.clockMs === 'number' ? formatLiveClock(latestEvent.clockMs) : minuteLabel(latestEvent)}</span>
                      <span className="touchline-moment-title">{labelForEvent(latestEvent.kind)}</span>
                    </div>
                    <div className="touchline-moment-subtitle">
                      {latestEvent.playerId && playerNameMap[latestEvent.playerId]
                        ? `${playerNameMap[latestEvent.playerId]} · `
                        : ''}
                      {latestEvent.teamId === (currentMatch?.homeTeamId || viewerTeams?.homeId) ? homeTeamName : awayTeamName}
                    </div>
                  </div>
                </div>
                {!viewerToken && <div className="touchline-moment-actions">
                  <button
                    type="button"
                    className="touchline-undo-btn"
                    disabled={!correctionReady || latestEvent.matchId !== selectedId}
                    onClick={() => void deleteEvent(latestEvent.id)}
                  >
                    Undo
                  </button>
                </div>}
              </div>
            ) : (
              <div className="touchline-latest-moment-card">
                <div className="touchline-moment-subtitle">No moments recorded yet.{canAddEvents ? ' Tap Goal or an event above to start recording.' : ''}</div>
              </div>
            )}
          </section>

          {/* Full Match Timeline Disclosure */}
          <details open className="touchline-timeline-disclosure">
            <summary className="touchline-timeline-summary">
              <span>Full match timeline ({eventFeed.filter(i => i.kind === 'event').length})</span>
              <IonIcon icon={chevronDownOutline} />
            </summary>
            <div className="touchline-timeline-content">
              {selectedId ? (
                <LiveTimeline
                  feed={eventFeed as any}
                  currentMatch={currentMatch as any}
                  playerNameMap={playerNameMap}
                  showDelete={!viewerToken}
                  deleteDisabled={!correctionReady}
                  onDelete={item => { if (item.kind === 'event') void deleteEvent(item.id); }}
                  durationMinutes={currentMatch?.durationMinutes as any}
                  periodFormat={(currentMatch?.periodFormat as any) || (viewerSummary as any)?.periodFormat}
                />
              ) : (
                <IonText color="medium">Sign in to view live timeline. Public feed coming soon.</IonText>
              )}
            </div>
          </details>

          {/* Accessible Secondary Match Controls */}
          {!viewerToken && (
            <details open className="touchline-secondary-disclosure" data-testid="secondary-controls">
              <summary className="touchline-secondary-summary">
                <span>Match controls &amp; options</span>
                <IonIcon icon={settingsOutline} />
              </summary>
              <div className="touchline-secondary-content">
                {!isAuthenticated && !accountRecoveryRequired && (
                  <div className="live-guest-status">
                    Guest · {Math.max(0, GUEST_LIMITS.maxNonScoringEventsPerMatch - localEventRecords.filter(e => e.createdByUserId === identity && !['goal', 'own_goal', 'formation_change'].includes(e.kind) && !e.isDeleted).length)} non-scoring events left
                  </div>
                )}
                <div className="touchline-secondary-btn-group">
                  <IonButton
                    disabled={!lineupReady}
                    onClick={() => { if (lineupReady && writerReadyRef.current) setShowLineupModal(true); }}
                  >
                    Team Changes
                  </IonButton>

                  {(matchState?.status === 'LIVE' || (matchState?.status === 'PAUSED' && currentOpenPeriod)) && (
                    <IonButton
                      disabled={!writerReady || !selectedId || (!currentOpenPeriod && !recoverableEnd) || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                      onClick={handleEndPeriod}
                    >
                      {recoverableEnd ? 'Finish period update' : 'End Period'}
                    </IonButton>
                  )}

                  {matchState?.status === 'PAUSED' && !currentOpenPeriod && regularTimeEnded && !hasShootout && (
                    <>
                      {periods.filter(p => p.periodType === 'EXTRA_TIME' && !!p.endedAt).length < 2 ? (
                        <IonButton
                          disabled={!allowedPeriodStarts.EXTRA_TIME || !selectedId || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                          onClick={() => handleStartNextPeriod(true)}
                        >
                          Extra Time
                        </IonButton>
                      ) : (
                        <IonButton
                          disabled={!allowedPeriodStarts.PENALTY_SHOOTOUT || !selectedId || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                          onClick={handleStartPenaltyShootout}
                        >
                          Penalty Shootout
                        </IonButton>
                      )}
                    </>
                  )}

                  <IonButton
                    disabled={!writerReady || !selectedId || matchState?.status === 'SCHEDULED' || matchState?.status === 'COMPLETED' || lifecycleBusy || addingEvent || correctionBusy || !!lifecycleError}
                    color="success"
                    onClick={handleComplete}
                  >
                    Complete
                  </IonButton>
                </div>

                <div className="touchline-secondary-btn-group">
                  <IonButton
                    fill="outline"
                    size="small"
                    disabled={lifecycleBusy || currentIndex <= 0}
                    onClick={() => navigateMatch(-1)}
                  >
                    Previous match
                  </IonButton>
                  <IonButton
                    fill="outline"
                    size="small"
                    disabled={lifecycleBusy || currentIndex === -1 || currentIndex >= upcoming.length - 1}
                    onClick={() => navigateMatch(1)}
                  >
                    Next match
                  </IonButton>
                  {isAuthenticated && selectedId && (
                    <IonButton
                      fill={activeShareCode ? 'solid' : 'outline'}
                      color={activeShareCode ? 'danger' : 'medium'}
                      size="small"
                      onClick={activeShareCode ? handleUnshareLink : handleShareLink}
                    >
                      {activeShareCode ? 'Unshare' : 'Share'}
                    </IonButton>
                  )}
                </div>
              </div>
            </details>
          )}

          {/* Captured-Time Event Picker Sheet Modal */}
          <IonModal className="touchline-picker-modal" isOpen={showPicker} onDidDismiss={cancelDraft} canDismiss={!addingEvent}>
            <div className="touchline-sheet-content live-player-picker">
              <div className="touchline-sheet-header">
                <h3 className="touchline-sheet-title">{draft ? labelForEvent(draft.kind) : 'Record event'} · {draft?.teamName}</h3>
                <p className="touchline-sheet-meta">
                  Captured at {formatLiveClock(draft?.clockMs || 0)} · {draft?.periodType === 'EXTRA_TIME' ? 'Extra time' : draft?.periodType === 'PENALTY_SHOOTOUT' ? 'Shootout' : 'Period'} {draft?.periodNumber}
                </p>
              </div>

              <label htmlFor="live-roster-search" className="touchline-field-label">Find a player</label>
              <input
                id="live-roster-search"
                className="touchline-sheet-search"
                type="search"
                value={rosterSearch}
                disabled={addingEvent}
                onChange={e => setRosterSearch(e.target.value)}
                placeholder="Name or shirt number"
              />

              {rosterLoading && (
                <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                  <IonSpinner name="crescent" /> Loading roster… You can save without a player.
                </div>
              )}
              {rosterError && <p role="status" style={{ color: '#dc2626' }}>{rosterError}</p>}
              {!rosterLoading && !rosterError && !roster.length && <p>No players on this roster. Save without a player.</p>}

              <div className="touchline-sheet-roster-list live-roster-list">
                {sortRosterForPicker(roster.filter(p => `${p.name} ${p.squadNumber ?? ''}`.toLowerCase().includes(rosterSearch.toLowerCase()))).map(p => {
                  const onPitch = !!draft && !!onPitchByTeam[draft.teamId]?.has(p.id);
                  const isSelected = selectedPlayerId === p.id;
                  return (
                    <div key={p.id} className="live-roster-row touchline-roster-item-row">
                      <IonButton
                        expand="block"
                        disabled={addingEvent}
                        fill={isSelected ? 'solid' : 'outline'}
                        onClick={() => {
                          setSelectedPlayerId(isSelected ? null : p.id);
                          setTrackPlayer(false);
                        }}
                      >
                        {p.squadNumber != null ? `${p.squadNumber} · ` : ''}{p.name}
                      </IonButton>
                      <IonButton
                        className="live-roster-pitch touchline-pitch-toggle-btn"
                        size="small"
                        color={onPitch ? 'success' : 'medium'}
                        fill={onPitch ? 'solid' : 'outline'}
                        aria-pressed={onPitch}
                        aria-label={`${p.name} on pitch`}
                        disabled={addingEvent}
                        onClick={() => draft && toggleOnPitch(draft.teamId, p.id)}
                      >
                        On pitch
                      </IonButton>
                    </div>
                  );
                })}
              </div>

              <label className="live-track-player">
                <input
                  type="checkbox"
                  checked={trackPlayer}
                  disabled={!selectedPlayerId || addingEvent}
                  onChange={e => setTrackPlayer(e.target.checked)}
                />
                Remember this player for future {draft?.teamName} events
              </label>

              <details className="touchline-rating-details">
                <summary>Rate this play (optional)</summary>
                <label htmlFor="live-sentiment" className="touchline-field-label">How was the play?</label>
              <select
                id="live-sentiment"
                className="touchline-sheet-search"
                style={{ height: 44, margin: '4px 0 16px' }}
                value={sentiment}
                disabled={addingEvent}
                onChange={e => setSentiment(Number(e.target.value))}
              >
                <option value={-3}>Very poor (−3)</option>
                <option value={-2}>Poor (−2)</option>
                <option value={-1}>Needs improvement (−1)</option>
                <option value={0}>Neutral (0)</option>
                <option value={1}>Good (+1)</option>
                <option value={2}>Very good (+2)</option>
                <option value={3}>Excellent (+3)</option>
              </select>
              </details>

              {pickerError && <p role="alert" className="live-error">{pickerError} Your captured event is kept. Retry saving.</p>}

              <div className="touchline-sheet-actions live-picker-actions">
                <IonButton
                  onClick={() => confirmEventWithPicker()}
                  disabled={!writerReady || !draft || !selectedPlayerId || addingEvent || lifecycleBusy || correctionBusy || !!lifecycleError}
                >
                  {addingEvent ? 'Saving…' : pickerError ? 'Retry save' : 'Save with player'}
                </IonButton>
                <IonButton
                  fill="outline"
                  onClick={() => confirmEventWithPicker(true)}
                  disabled={!writerReady || !draft || addingEvent || lifecycleBusy || correctionBusy || !!lifecycleError}
                >
                  Save without player
                </IonButton>
                <IonButton fill="clear" onClick={cancelDraft} disabled={addingEvent}>
                  Cancel
                </IonButton>
              </div>
            </div>
          </IonModal>

          {/* Preference-Only Tracked Player Selection Modal */}
          <IonModal
            className="touchline-picker-modal"
            isOpen={showTrackedPlayerModal && trackedPickerCurrent}
            onDidDismiss={closeTrackedPlayerPicker}
          >
            <div className="touchline-sheet-content">
              <div className="touchline-sheet-header">
                <h3 className="touchline-sheet-title">Change tracked player</h3>
                <p className="touchline-sheet-meta">
                  Choose a player to track for {teamName(selectedTeam === 'home' ? currentMatch?.homeTeam : currentMatch?.awayTeam)}.
                </p>
              </div>

              <label htmlFor="tracked-player-search" className="touchline-field-label">Find a player</label>
              <input
                id="tracked-player-search"
                type="search"
                className="touchline-sheet-search"
                placeholder="Find a player..."
                value={trackedPlayerSearch}
                onChange={e => setTrackedPlayerSearch(e.target.value)}
              />

              {trackedRosterLoading && <p role="status">Loading roster…</p>}
              {trackedRosterError && <p role="alert">{trackedRosterError}</p>}
              {!trackedRosterLoading && !trackedRosterError && !activeRoster.length && <p>No players on this roster.</p>}

              <div className="touchline-sheet-roster-list">
                {activeRoster
                  .filter(p => `${p.name} ${p.squadNumber ?? ''}`.toLowerCase().includes(trackedPlayerSearch.toLowerCase()))
                  .map(p => (
                    <div key={p.id} className="touchline-roster-item-row">
                      <IonButton
                        expand="block"
                        fill={trackedPlayerId === p.id ? 'solid' : 'outline'}
                        onClick={() => handleSelectTrackedPlayer(p.id, trackedPickerContext)}
                      >
                        {p.squadNumber != null ? `${p.squadNumber} · ` : ''}{p.name}
                      </IonButton>
                    </div>
                  ))}
              </div>

              <div className="touchline-sheet-actions">
                {trackedPlayerId && (
                  <IonButton
                    fill="outline"
                    color="warning"
                    onClick={() => handleSelectTrackedPlayer(null, trackedPickerContext)}
                  >
                    Clear tracked player
                  </IonButton>
                )}
                <IonButton fill="clear" onClick={closeTrackedPlayerPicker}>
                  Cancel
                </IonButton>
              </div>
            </div>
          </IonModal>

          {/* Sentiment/Undo Feedback Snackbar */}
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 12, display: snackbarOpen ? 'flex' : 'none', justifyContent: 'center', zIndex: 1000 }}>
            <div className="live-event-feedback">
              <span style={{ fontSize: 12 }}>Event added{lastEventKind ? `: ${lastEventKind.replace('_', ' ')}` : ''}</span>
              <IonButton size="small" aria-label="Rate play lower" disabled={!correctionReady || lastEventSentiment <= -3} onClick={() => handleSetSentiment(-1)}>-</IonButton>
              <IonButton size="small" fill="solid" disabled>{lastEventSentiment}</IonButton>
              <IonButton size="small" aria-label="Rate play higher" disabled={!correctionReady || lastEventSentiment >= 3} onClick={() => handleSetSentiment(+1)}>+</IonButton>
            </div>
          </div>

          {/* Lineup Management Modal */}
          {lineupReady && (
            <LineupManagementModal
              key={`${selectedId}:${identity}`}
              canApply={(() => {
                const context = { ...contextRef.current };
                return () => lineupReadyRef.current && contextIsCurrent(context);
              })()}
              isOpen={showLineupModal}
              onClose={() => setShowLineupModal(false)}
              matchId={selectedId || ''}
              selectedTeamId={selectedTeam === 'home' ? currentMatch?.homeTeamId || '' : currentMatch?.awayTeamId || ''}
              currentMinute={Number((((timerMs || 0) / 60000)).toFixed(2))}
              onFormationChanged={() => { if (writerReadyRef.current) void loadEvents(); }}
            />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default LiveMatchPage;
