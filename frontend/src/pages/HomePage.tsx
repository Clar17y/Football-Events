import React, { useEffect, useMemo, useState, useRef } from 'react';
import { formatPeriodFormat } from '../utils/formatters';
import {
  IonPage,
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonCard,
  IonCardContent,
  IonIcon,
  IonButton,
  IonGrid,
  IonRow,
  IonCol,
  IonChip,
  IonLabel,
  IonButtons
} from '@ionic/react';
import {
  trophy,
  people,
  person,
  calendar,
  statsChart,
  play,
  ribbon,
  football,
  chevronDown,
  chevronUp,
  warningOutline
} from 'ionicons/icons';
// useHistory removed - using state-based navigation
import ThemeToggle from '../components/ThemeToggle';
import { useGlobalStats } from '../hooks/useGlobalStats';
import { useAuth } from '../contexts/AuthContext';
import { useOwnedDiscovery, isOwnedDiscoveryRow } from '../hooks/useOwnedDiscovery';
import UserProfile from '../components/UserProfile';
import ImportGuestDataButton from '../components/ImportGuestDataButton';
import GuestBanner from '../components/GuestBanner';
import { useToast } from '../contexts/ToastContext';
import OfflineSyncIndicator from '../components/OfflineSyncIndicator';
import './HomePage.css';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/en-gb';
import { matchesApi, type QuickStartPayload } from '../services/api/matchesApi';
import { createLocalQuickMatch } from '../services/guestQuickMatch';
import { canCreateMatch } from '../utils/quotas';
import { getAuthUserId } from '../utils/network';
import { authApi } from '../services/api/authApi';
import { CONNECTED_RECOVERY_MESSAGE } from '../services/api/authFailure';
import CreateTeamModal from '../components/CreateTeamModal';
import RecentActivity from '../components/RecentActivity';
import { bootstrapOwnedTeams } from '../services/ownedTeamBootstrap';

interface HomePageProps {
  onNavigate?: (page: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { user, isAuthenticated, recoveryMessage } = useAuth();
  const retainedSubject = getAuthUserId();
  const accountRecoveryRequired = !!recoveryMessage || (!!authApi.isAuthenticated?.() && (!user || user.id !== retainedSubject));
  const discovery = useOwnedDiscovery();
  const currentOwnerId = discovery.ownerId;
  useEffect(() => {
    let cancelled = false;
    if (isAuthenticated && user?.id === currentOwnerId && !accountRecoveryRequired && currentOwnerId) {
      void bootstrapOwnedTeams(currentOwnerId, () => !cancelled && discovery.isCurrent())
        .catch(error => { if (!cancelled && discovery.isCurrent()) console.warn('Failed to load managed teams:', error); });
    }
    return () => { cancelled = true; };
  }, [discovery.sessionKey, isAuthenticated, user?.id, currentOwnerId, accountRecoveryRequired]);
  const { showInfo } = useToast();
  const { stats, loading, error, fromCache, lastUpdated } = useGlobalStats();
  const displayIdentity = `${discovery.sessionKey}:${isAuthenticated ? user?.id ?? '' : 'guest'}`;
  const displayIdentityRef = useRef(displayIdentity);
  displayIdentityRef.current = displayIdentity;
  const [displayNameResult, setDisplayNameResult] = useState<{ identity: string; name: string } | null>(null);
  const displayName = displayNameResult?.identity === displayIdentity ? displayNameResult.name : null;

  // Settings belong to the requesting identity, including while an old request finishes.
  useEffect(() => {
    let cancelled = false;
    setDisplayNameResult(null);
    const fetchDisplayName = async () => {
      if (!isAuthenticated || !user || user.id !== currentOwnerId) return;
      try {
        const { authApi } = await import('../services/api/authApi');
        const response = await authApi.getSettings();
        if (!cancelled && displayIdentityRef.current === displayIdentity && discovery.isCurrent() && response.success && response.data?.display_name) {
          setDisplayNameResult({ identity: displayIdentity, name: response.data.display_name });
        }
      } catch (error) {
        console.warn('Failed to fetch user settings:', error);
      }
    };
    fetchDisplayName();
    return () => { cancelled = true; };
  }, [displayIdentity, isAuthenticated, user?.id, currentOwnerId]);

  // Helper to get defaults from app settings (same as CreateMatchModal)
  const getAppSettingsDefaults = () => {
    try {
      const saved = localStorage.getItem('matchmaster_app_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          durationMinutes: parsed.defaultDurationMins || 50,
          periodFormat: (parsed.defaultPeriodFormat || 'quarter') as 'quarter' | 'half' | 'whole'
        };
      }
    } catch { }
    return { durationMinutes: 50, periodFormat: 'quarter' as 'quarter' | 'half' | 'whole' };
  };

  // Quick Start state
  const appDefaults = getAppSettingsDefaults();
  const teamsLoading = discovery.loading;
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [myTeamId, setMyTeamId] = useState<string>('');
  const currentTeams = useMemo(() => discovery.teams.filter(team => !team.isOpponent), [discovery.teams]);
  const [opponentOptions, setOpponentOptions] = useState<string[]>([]);
  const { searchText: opponentText, setSearchText: setOpponentText, showSpinner: opponentLoading } = useDebouncedSearch({
    delay: 250,
    minLength: 2,
    onSearch: async (term: string) => {
      if (!discovery.isCurrent() || !term) { setOpponentOptions([]); return; }
      setOpponentOptions(discovery.teams.filter(team => team.isOpponent &&
        team.name.toLowerCase().includes(term.trim().toLowerCase())).map(team => team.name));
    }
  });
  const [isHome, setIsHome] = useState<boolean>(true);
  const [kickoffDate, setKickoffDate] = useState<Dayjs | null>(() => dayjs());
  const [kickoffTime, setKickoffTime] = useState<Dayjs | null>(() => dayjs());
  const [durationMinutes, setDurationMinutes] = useState<number>(appDefaults.durationMinutes);
  const [periodFormat, setPeriodFormat] = useState<'quarter' | 'half' | 'whole'>(appDefaults.periodFormat);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [quickStartError, setQuickStartError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const defaultsKey = 'quick_start_defaults_v1';
  const selectedTeamRef = useRef<string>('');

  // Hook into local matches and states for direct LIVE/PAUSED resume
  const { matches: localMatches, matchStates: localMatchStates, teams: allLocalTeams } = discovery;

  const liveMatchesToResume = useMemo(() => {
    const statesMap = new Map((localMatchStates || []).map(s => [s.matchId, s]));
    return (localMatches || []).filter(m => {
      const st = statesMap.get(m.id);
      return st?.status === 'LIVE' || st?.status === 'PAUSED';
    }).map(m => {
      const st = statesMap.get(m.id);
      return {
        ...m,
        status: st?.status as 'LIVE' | 'PAUSED'
      };
    });
  }, [localMatches, localMatchStates]);

  const saveTeamPreference = (teamId: string) => {
    try {
      if (teamId) {
        localStorage.setItem(defaultsKey, JSON.stringify({ teamId, ownerId: currentOwnerId }));
      }
    } catch {
      // Storage failure must not break the task
    }
  };

  const handleTeamChange = (newTeamId: string) => {
    if (newTeamId && !currentTeams.some(team => team.id === newTeamId)) return;
    selectedTeamRef.current = newTeamId;
    setMyTeamId(newTeamId);
    saveTeamPreference(newTeamId);
  };

  useEffect(() => {
    // Load saved team preference from quick start defaults
    try {
      const raw = localStorage.getItem(defaultsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.teamId === 'string' && parsed.teamId.trim()) {
          selectedTeamRef.current = parsed.teamId.trim();
          setMyTeamId(parsed.teamId.trim());
        }
      }
    } catch {
      // Storage failure must not break the task
    }
  }, []);

  useEffect(() => {
    setShowCreateTeam(false);
    setQuickStartError(null);
    setOpponentOptions([]);
  }, [discovery.sessionKey]);

  useEffect(() => {
    if (teamsLoading) return;
    const candidate = currentTeams.find(team => team.id === selectedTeamRef.current) || currentTeams[0];
    selectedTeamRef.current = candidate?.id || '';
    setMyTeamId(candidate?.id || '');
    if (candidate) saveTeamPreference(candidate.id);
  }, [currentTeams, teamsLoading, currentOwnerId]);

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const navigationCards = [
    {
      title: 'Matches',
      subtitle: 'Schedule & results',
      icon: trophy,
      route: '/matches'
    },
    {
      title: 'Teams',
      subtitle: 'Team management',
      icon: people,
      route: '/teams'
    },
    {
      title: 'Players',
      subtitle: 'Player profiles',
      icon: person,
      route: '/players'
    },
    {
      title: 'Live Match',
      subtitle: 'Manage your match day',
      icon: play,
      route: '/live'
    },
    {
      title: 'Lineup Management',
      subtitle: 'Create team formations',
      icon: football,
      route: '/lineup-management'
    },
    {
      title: 'Seasons',
      subtitle: 'Manage your seasons',
      icon: calendar,
      route: '/seasons'
    },
    {
      title: 'Awards',
      subtitle: 'Recognition system',
      icon: ribbon,
      route: '/awards'
    },
    {
      title: 'Statistics',
      subtitle: 'Performance insights',
      icon: statsChart,
      route: '/statistics'
    }
  ];

  // Generate quick stats from API data or show loading/fallback
  const quickStats = [
    {
      label: 'Active Teams',
      value: loading ? '...' : (stats?.active_teams?.toString() || '0'),
      color: 'success' as const
    },
    {
      label: 'Total Players',
      value: loading ? '...' : (stats?.total_players?.toString() || '0'),
      color: 'warning' as const
    },
    {
      label: 'Matches Played',
      value: loading ? '...' : (stats?.matches_played?.toString() || '0'),
      color: 'primary' as const
    },
    {
      label: 'Live Now',
      value: loading ? '...' : (stats?.active_matches?.toString() || '0'),
      color: 'danger' as const
    }
  ];

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="home-toolbar">
          <IonTitle className="home-title">
            <div
              className="title-container"
              onClick={() => navigate(user ? 'home' : 'home')}
              style={{ cursor: 'pointer' }}
              title={user ? 'Go to Dashboard' : 'Back to Home'}
            >
              <IonIcon icon={football} className="title-icon" />
              <span>MatchMaster</span>
            </div>
          </IonTitle>
          <IonButtons slot="end" style={{ gap: 8 }}>
            <OfflineSyncIndicator />
            <ImportGuestDataButton />
            <ThemeToggle />
            <UserProfile onNavigate={navigate} />
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent className="home-content">
        <div className="home-matchday-heading">
          <h1>Match day</h1>
          <p>
            {!isAuthenticated && !accountRecoveryRequired
              ? 'Guest mode · Recordings stay on this device. Limits apply.'
              : 'Start a new match or pick up where you left off.'}
          </p>
        </div>

        {/* Live Matches Direct Resume Section */}
        {liveMatchesToResume.length > 0 && (
          <div className="home-live-matches-section">
            <h3 className="home-section-heading">
              <IonIcon icon={play} className="home-forest-icon" />
              <span>In-Progress Matches</span>
            </h3>
            <div className="home-live-matches-grid">
              {liveMatchesToResume.map(match => {
                const homeName = allLocalTeams.find(t => t.id === match.homeTeamId)?.name || 'Home';
                const awayName = allLocalTeams.find(t => t.id === match.awayTeamId)?.name || 'Away';
                return (
                  <IonCard key={match.id} className="home-live-match-card" style={{ margin: 0 }}>
                    <IonCardContent className="home-live-match-content">
                      <div>
                        <div className="home-live-match-teams">
                          {homeName} vs {awayName}
                        </div>
                        <div className="home-live-match-meta">
                          Status: <span style={{ fontWeight: 700, color: match.status === 'LIVE' ? 'var(--touchline-forest, #12392d)' : 'var(--touchline-muted, #56645d)' }}>{match.status}</span>
                          {match.competition ? ` • ${match.competition}` : ''}
                        </div>
                      </div>
                      <IonButton
                        size="small"
                        className="home-resume-btn"
                        onClick={() => { if (discovery.canAccessMatch(match.id)) navigate(`/live/${match.id}`); }}
                        style={{ minHeight: '44px' }}
                      >
                        Resume Match
                      </IonButton>
                    </IonCardContent>
                  </IonCard>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Start Card - Top Priority for Fast Recording */}
        <div className="home-quickstart-container">
          <IonCard className="nav-card home-quickstart-card" style={{ margin: 0 }}>
            <IonCardContent className="nav-card-content">
              <div className="home-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem', marginBottom: '0.75rem' }}>
                  <IonIcon icon={play} className="nav-card-icon home-forest-icon" style={{ fontSize: '1.75rem' }} />
                  <div>
                    <h2 className="nav-card-title" style={{ margin: 0, fontSize: '1.25rem' }}>Quick Match Start</h2>
                    <p className="nav-card-subtitle" style={{ margin: 0, fontSize: '0.85rem' }}>Start recording your child's football match immediately</p>
                  </div>
                </div>
              </div>

              {accountRecoveryRequired && <div className="quickstart-error-banner" role="alert">{recoveryMessage || CONNECTED_RECOVERY_MESSAGE}</div>}
              {quickStartError && !accountRecoveryRequired && (
                <div className="quickstart-error-banner" role="alert">
                  <IonIcon icon={warningOutline} style={{ fontSize: '1.25rem', flexShrink: 0 }} />
                  <span>{quickStartError}</span>
                </div>
              )}

              <div className="form-grid quickstart-grid" style={{ display: 'grid', gap: '0.75rem' }}>
                {/* My Team */}
                <div className="form-row">
                  <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>
                    Team
                  </label>
                  <div>
                    {currentTeams.length > 0 ? (
                      <Autocomplete
                        options={currentTeams}
                        getOptionLabel={(opt) => opt.name}
                        value={currentTeams.find(t => t.id === myTeamId) || null}
                        onChange={(_, val) => handleTeamChange(val?.id || '')}
                        loading={teamsLoading}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Select team"
                            size="small"
                            className="quickstart-input"
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                            InputProps={{
                              ...params.InputProps,
                              endAdornment: (
                                <>
                                  {teamsLoading ? <CircularProgress color="inherit" size={16} /> : null}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        fullWidth
                      />
                    ) : (
                      <IonButton expand="block" disabled={accountRecoveryRequired || teamsLoading} onClick={() => setShowCreateTeam(true)} style={{ minHeight: '44px' }}>
                        {teamsLoading ? 'Loading teams…' : 'Create Team'}
                      </IonButton>
                    )}
                  </div>
                </div>

                {/* Opponent (Optional) */}
                <div className="form-row">
                  <label className="form-label" style={{ fontWeight: 700, marginBottom: 4, display: 'block' }}>
                    Opponent <span style={{ fontWeight: 400, color: 'var(--grassroots-text-secondary)' }}>(Optional)</span>
                  </label>
                  <Autocomplete
                    freeSolo
                    options={opponentOptions}
                    loading={opponentLoading}
                    inputValue={opponentText}
                    onInputChange={(_, value) => setOpponentText(value)}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Leave blank for Unknown Opponent"
                        size="small"
                        className="quickstart-input"
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                        InputProps={{
                          ...params.InputProps,
                          endAdornment: (
                            <>
                              {opponentLoading ? <CircularProgress color="inherit" size={16} /> : null}
                              {params.InputProps.endAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                    fullWidth
                  />
                  <div className="quickstart-field-hint">
                    You can record without the opponent's name.
                  </div>
                </div>

                {/* Optional Details Toggle Button */}
                <div>
                  <p className="quickstart-field-hint">
                    {isHome ? 'Home' : 'Away'} · {durationMinutes} minutes · {formatPeriodFormat(periodFormat)}
                  </p>
                  <button
                    type="button"
                    className="quickstart-details-toggle"
                    aria-expanded={showDetails}
                    onClick={() => setShowDetails(prev => !prev)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--grassroots-surface-variant, #cbd5e1)',
                      borderRadius: '8px',
                      padding: '0.5rem 0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      color: 'var(--grassroots-text-primary)'
                    }}
                  >
                    <span>{showDetails ? 'Hide match details' : 'More match details (Venue, Periods, Duration, Kickoff)'}</span>
                    <IonIcon icon={showDetails ? chevronUp : chevronDown} />
                  </button>
                </div>

                {/* Collapsible Match Details */}
                {showDetails && (
                  <div style={{ display: 'grid', gap: '0.75rem', padding: '0.5rem 0', borderTop: '1px solid var(--grassroots-surface-variant)' }}>
                    {/* Venue + Periods side-by-side */}
                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                      {/* Venue */}
                      <div>
                        <label className="form-label" style={{ fontWeight: 700, marginBottom: 4, display: 'block' }}>Venue</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <IonButton fill={isHome ? 'solid' : 'outline'} color="primary" onClick={() => setIsHome(true)} style={{ minHeight: '44px' }}>Home</IonButton>
                          <IonButton fill={!isHome ? 'solid' : 'outline'} color="medium" onClick={() => setIsHome(false)} style={{ minHeight: '44px' }}>Away</IonButton>
                        </div>
                      </div>
                      <div>
                        <label className="form-label" style={{ fontWeight: 700, marginBottom: 4, display: 'block' }}>Periods</label>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <IonButton fill={periodFormat === 'quarter' ? 'solid' : 'outline'} color="primary" onClick={() => setPeriodFormat('quarter')} style={{ minHeight: '44px' }}>{formatPeriodFormat('quarter')}</IonButton>
                          <IonButton fill={periodFormat === 'half' ? 'solid' : 'outline'} color="primary" onClick={() => setPeriodFormat('half')} style={{ minHeight: '44px' }}>{formatPeriodFormat('half')}</IonButton>
                          <IonButton fill={periodFormat === 'whole' ? 'solid' : 'outline'} color="primary" onClick={() => setPeriodFormat('whole')} style={{ minHeight: '44px' }}>{formatPeriodFormat('whole')}</IonButton>
                        </div>
                      </div>
                    </div>

                    {/* Duration */}
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Duration (mins: 1-200)</label>
                      <input
                        className="form-input quickstart-input"
                        type="number"
                        min={1}
                        max={200}
                        value={durationMinutes}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setDurationMinutes(Number.isNaN(val) ? 0 : val);
                        }}
                        style={{ width: '100%', minHeight: '44px' }}
                      />
                    </div>

                    {/* Kickoff */}
                    <div className="form-row">
                      <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Kickoff</label>
                      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="en-gb">
                        <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: '1fr 1fr' }}>
                          <DatePicker
                            label="Date"
                            value={kickoffDate}
                            onChange={(newVal) => setKickoffDate(newVal)}
                            slotProps={{ textField: { fullWidth: true, className: 'quickstart-input' } }}
                          />
                          <TimePicker
                            label="Time"
                            value={kickoffTime}
                            onChange={(newVal) => setKickoffTime(newVal)}
                            slotProps={{ textField: { fullWidth: true, className: 'quickstart-input' } }}
                          />
                        </div>
                      </LocalizationProvider>
                    </div>
                  </div>
                )}

                {/* Action Button */}
                <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <IonButton
                    color="primary"
                    className={`quickstart-start-btn${liveMatchesToResume.length > 0 ? ' quickstart-start-btn-secondary' : ''}`}
                    fill={liveMatchesToResume.length > 0 ? 'outline' : 'solid'}
                    disabled={accountRecoveryRequired || submitting || teamsLoading || !currentTeams.some(team => team.id === myTeamId)}
                    onClick={async () => {
                      if (accountRecoveryRequired || !discovery.isCurrent() || !currentTeams.some(team => team.id === myTeamId)) return;
                      if (isSubmittingRef.current) return;
                      isSubmittingRef.current = true;
                      setSubmitting(true);
                      setQuickStartError(null);

                      try {
                        const validatedDuration = Number(durationMinutes);
                        if (!Number.isInteger(validatedDuration) || validatedDuration < 1 || validatedDuration > 200) {
                          setQuickStartError('Please enter a whole number between 1 and 200 minutes.');
                          return;
                        }

                        // Build kickoff ISO from local date and time without timezone subtracting offset
                        const d = kickoffDate && kickoffDate.isValid() ? kickoffDate : dayjs();
                        const t = kickoffTime && kickoffTime.isValid() ? kickoffTime : dayjs();
                        const mergedLocal = d.hour(t.hour()).minute(t.minute()).second(0).millisecond(0);
                        const kickoffIso = mergedLocal.toDate().toISOString();

                        const opponentNameResolved = opponentText?.trim() || 'Unknown Opponent';

                        if (!user) {
                          // Guest: create local quick match with quota verification
                          const allowed = await canCreateMatch();
                          if (!discovery.isCurrent()) return;
                          if (!allowed.ok) {
                            const refusalMsg = allowed.reason || 'Guest limit reached: 1 match';
                            setQuickStartError(refusalMsg);
                            showInfo?.(refusalMsg);
                            return;
                          }
                          const payload: QuickStartPayload = {
                            myTeamId,
                            opponentName: opponentNameResolved,
                            isHome,
                            kickoffTime: kickoffIso,
                            durationMinutes: validatedDuration,
                            periodFormat
                          };
                          const local = await createLocalQuickMatch(payload as any);
                          if (local?.id) {
                            if (discovery.isCurrent()) onNavigate?.(`/live/${local.id}`);
                          } else {
                            throw new Error('Could not create match locally.');
                          }
                        } else {
                          const payload: QuickStartPayload = {
                            myTeamId,
                            opponentName: opponentNameResolved,
                            isHome,
                            kickoffTime: kickoffIso,
                            durationMinutes: validatedDuration,
                            periodFormat
                          };
                          const match = await matchesApi.quickStart(payload);
                          const id = (match as any).id || (match as any).match_id;
                          if (id) {
                            if (discovery.isCurrent()) onNavigate?.(`/live/${id}`);
                          } else {
                            throw new Error('Could not create match.');
                          }
                        }
                      } catch (err: any) {
                        console.error('Quick start failed', err);
                        const errorMsg = err?.message || 'Failed to start match. Please try again.';
                        setQuickStartError(errorMsg);
                      } finally {
                        isSubmittingRef.current = false;
                        setSubmitting(false);
                      }
                    }}
                  >
                    Start Live Match
                  </IonButton>
                </div>

                <CreateTeamModal
                  key={discovery.sessionKey}
                  isOpen={showCreateTeam && !accountRecoveryRequired && !!currentOwnerId}
                  onDidDismiss={() => setShowCreateTeam(false)}
                  onCreated={(team) => {
                    if (!discovery.isCurrent() || !isOwnedDiscoveryRow(team, currentOwnerId) || team.isOpponent) return;
                    selectedTeamRef.current = team.id;
                    setMyTeamId(team.id);
                    saveTeamPreference(team.id);
                    setShowCreateTeam(false);
                  }}
                />
              </div>
            </IonCardContent>
          </IonCard>
        </div>

        {/* A quiet greeting and honest community totals for remembered accounts. */}
        {user && <div className="hero-section">
          <div className="hero-content">
            <h2 className="hero-title">
              {`Welcome back, ${displayName || user.first_name || 'Coach'}!`}
            </h2>
            <p className="hero-subtitle">
              Manage your teams, track player progress, and create memorable moments
            </p>
          </div>
          {isAuthenticated && <p className="hero-subtitle community-label">Across the MatchMaster community</p>}
          {isAuthenticated && <div className="hero-stats">
            {quickStats.map((stat, index) => (
              <IonChip key={index} color={stat.color} className="stat-chip">
                <IonLabel>
                  <div className="stat-value">{stat.value}</div>
                  <div className="stat-label">{stat.label}</div>
                </IonLabel>
              </IonChip>
            ))}
          </div>}

          {isAuthenticated && fromCache && lastUpdated && (
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--grassroots-text-tertiary)', marginTop: '0.5rem' }}>
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </div>
          )}

          {isAuthenticated && error && (
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--grassroots-danger)', marginTop: '0.5rem' }}>
              Using offline data
            </div>
          )}
        </div>}

        {/* Navigation Grid */}
        <nav className="navigation-section home-navigation" aria-label="Your football">
          <h2 className="home-section-heading">Your football</h2>
          <IonGrid className="navigation-grid">
            <IonRow>
              {navigationCards.map((card, index) => (
                <IonCol size="12" sizeMd="6" sizeLg="4" key={index}>
                  <div className="nav-card-wrapper">
                    <IonCard
                      className="nav-card"
                      button={card.route !== '#'}
                      onClick={() => {
                        if (card.route === '#') return;

                        // Convert route to page name
                        const pageName = card.route.replace('/', '');

                        // Check if route requires authentication (align with AppRoutes)
                        // Only 'awards' and 'statistics' require auth; others are guest-accessible
                        const protectedRoutes = ['awards', 'statistics'];
                        if (protectedRoutes.includes(pageName) && !user) {
                          // Redirect to login for protected routes
                          navigate('login');
                        } else {
                          navigate(pageName);
                        }
                      }}
                    >
                      <IonCardContent className="nav-card-content">
                        <div className="nav-card-header">
                          <IonIcon
                            icon={card.icon}
                            className="nav-card-icon"
                          />
                          <div className="nav-card-text">
                            <h3 className="nav-card-title">{card.title}</h3>
                            <p className="nav-card-subtitle">{card.subtitle}</p>
                          </div>
                        </div>
                        {(card.title === 'Statistics') && (
                          <IonChip color="medium" className="coming-soon-chip">
                            <IonLabel>Coming Soon</IonLabel>
                          </IonChip>
                        )}
                        {!user && ['Awards', 'Statistics'].includes(card.title) && (
                          <IonChip color="primary" className="login-required-chip">
                            <IonLabel>Sign In Required</IonLabel>
                          </IonChip>
                        )}
                      </IonCardContent>
                    </IonCard>
                  </div>
                </IonCol>
              ))}
            </IonRow>
          </IonGrid>
        </nav>

        {/* Recent Activity Section */}
        <div className="activity-section">
          <RecentActivity onNavigate={navigate} limit={20} days={30} />
        </div>

        {/* Upgrade / Account Access (quiet secondary area) */}
        <div className="home-guest-account-section">
          <GuestBanner />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default HomePage;
