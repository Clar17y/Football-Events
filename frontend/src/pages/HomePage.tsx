import React, { useEffect, useMemo, useState, useRef } from 'react';
import { DatabaseStatus } from '../components/DatabaseStatus';
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
  football
} from 'ionicons/icons';
// useHistory removed - using state-based navigation
import ThemeToggle from '../components/ThemeToggle';
import { useGlobalStats } from '../hooks/useGlobalStats';
import { useAuth } from '../contexts/AuthContext';
import UserProfile from '../components/UserProfile';
import ImportGuestDataButton from '../components/ImportGuestDataButton';
import GuestBanner from '../components/GuestBanner';
import { useToast } from '../contexts/ToastContext';
import OfflineSyncIndicator from '../components/OfflineSyncIndicator';
import './HomePage.css';
import { teamsApi } from '../services/api/teamsApi';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import { useDebouncedSearch } from '../hooks/useDebouncedSearch';
import dayjs, { Dayjs } from 'dayjs';
import { matchesApi, type QuickStartPayload } from '../services/api/matchesApi';
import { createLocalQuickMatch } from '../services/guestQuickMatch';
import { canCreateMatch } from '../utils/guestQuota';
import CreateTeamModal from '../components/CreateTeamModal';
import RecentActivity from '../components/RecentActivity';
import type { Team } from '@shared/types';

interface HomePageProps {
  onNavigate?: (page: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { showInfo } = useToast();
  const { stats, loading, error, fromCache, lastUpdated } = useGlobalStats();

  // Quick Start state
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [myTeamId, setMyTeamId] = useState<string>('');
  const [opponentOptions, setOpponentOptions] = useState<string[]>([]);
  const { searchText: opponentText, setSearchText: setOpponentText, showSpinner: opponentLoading } = useDebouncedSearch({
    delay: 250,
    minLength: 2,
    onSearch: async (term: string) => {
      if (!term) { setOpponentOptions([]); return; }
      try {
        const list = await teamsApi.getOpponentTeams(term.trim());
        setOpponentOptions(list.map(t => t.name));
      } catch {
        setOpponentOptions([]);
      }
    }
  });
  const [isHome, setIsHome] = useState<boolean>(true);
  const defaultKickoffIso = useMemo(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString(), []);
  const [kickoffDate, setKickoffDate] = useState<Dayjs | null>(dayjs(defaultKickoffIso));
  const [kickoffTime, setKickoffTime] = useState<Dayjs | null>(dayjs(defaultKickoffIso));
  const [durationMinutes, setDurationMinutes] = useState<number>(50);
  const [periodFormat, setPeriodFormat] = useState<'quarter' | 'half' | 'whole'>('quarter');
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const defaultsKey = 'quick_start_defaults_v1';
  const loadDefaults = useRef(() => {
    try {
      const raw = localStorage.getItem(defaultsKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.teamId) setMyTeamId(parsed.teamId);
      if (parsed.durationMinutes) setDurationMinutes(parsed.durationMinutes);
      if (parsed.periodFormat) setPeriodFormat(parsed.periodFormat);
    } catch { }
  });

  useEffect(() => {
    loadDefaults.current();
  }, []);

  useEffect(() => {
    // load user's teams for dropdown
    const load = async () => {
      try {
        setTeamsLoading(true);
        const res = await teamsApi.getTeams({ page: 1, limit: 100 });
        setTeams(res.data || []);
        if (res.data && res.data.length && !myTeamId) {
          setMyTeamId(res.data[0].id);
        }
      } finally {
        setTeamsLoading(false);
      }
    };
    load();
  }, [user]);

  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const navigationCards = [
    {
      title: 'Live Match',
      subtitle: 'Manage your match day',
      icon: play,
      color: 'amber',
      route: '/live',
      description: 'Live match console for event tracking'
    },
    {
      title: 'Matches',
      subtitle: 'Schedule & results',
      icon: trophy,
      color: 'secondary',
      route: '/matches',
      description: 'Schedule matches and track results'
    },
    {
      title: 'Lineup Management',
      subtitle: 'Create team formations',
      icon: football,
      color: 'sky',
      route: '/lineup-management',
      description: 'Create and manage default team lineups with visual pitch interface'
    },
    {
      title: 'Players',
      subtitle: 'Player profiles',
      icon: person,
      color: 'indigo',
      route: '/players',
      description: 'Track individual player progress'
    },
    {
      title: 'Teams',
      subtitle: 'Team management',
      icon: people,
      color: 'teal',
      route: '/teams',
      description: 'Manage your teams and rosters'
    },
    {
      title: 'Awards',
      subtitle: 'Recognition system',
      icon: ribbon,
      color: 'rose',
      route: '/awards',
      description: 'Celebrate achievements and milestones'
    },
    {
      title: 'Seasons',
      subtitle: 'Manage your seasons',
      icon: calendar,
      color: 'primary',
      route: '/seasons',
      description: 'Create and organize your football seasons'
    },
    {
      title: 'Statistics',
      subtitle: 'Performance insights',
      icon: statsChart,
      color: 'purple',
      route: '/statistics',
      description: 'Coming soon - detailed analytics'
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
        <GuestBanner />
        {/* Hero Section */}
        <div className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">
              {user ? `Welcome back, ${user.first_name || 'Coach'}!` : 'Welcome to MatchMaster!'}
            </h1>
            <p className="hero-subtitle">
              {user
                ? 'Manage your teams, track player progress, and create memorable moments'
                : 'The ultimate grassroots football management platform. Sign in to unlock full team management features!'
              }
            </p>
          </div>
          <div className="hero-stats">
            {quickStats.map((stat, index) => (
              <IonChip key={index} color={stat.color} className="stat-chip">
                <IonLabel>
                  <div className="stat-value">{stat.value}</div>
                  <div className="stat-label">{stat.label}</div>
                </IonLabel>
              </IonChip>
            ))}
          </div>

          {fromCache && lastUpdated && (
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--grassroots-text-tertiary)', marginTop: '0.5rem' }}>
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </div>
          )}

          {/* Call to action for non-authenticated users */}
          {!user && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <IonButton
                color="primary"
                size="default"
                onClick={() => navigate('login')}
              >
                Sign In to Get Started
              </IonButton>
              <div style={{ marginTop: '0.5rem' }}>
                <IonButton
                  fill="clear"
                  size="small"
                  onClick={() => navigate('register')}
                >
                  New here? Create an account
                </IonButton>
              </div>
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--grassroots-danger)', marginTop: '0.5rem' }}>
              Using offline data
            </div>
          )}
        </div>


        {/* Navigation Grid */}
        <div className="navigation-section">
          <IonGrid className="navigation-grid">
            {(
              <IonRow style={{ justifyContent: 'center', marginBottom: '0.5rem' }}>
                <IonCol size="12" sizeMd="6" sizeLg="4">
                  <div className="nav-card-wrapper">
                    <IonCard className="nav-card nav-card-amber">
                      <IonCardContent className="nav-card-content">
                        <div className="nav-card-header" style={{ cursor: 'pointer' }} onClick={() => setCollapsed(prev => !prev)}>
                          <IonIcon icon={play} className="nav-card-icon" color="amber" />
                          <div className="nav-card-text">
                            <h3 className="nav-card-title">Quick Start</h3>
                            <p className="nav-card-subtitle">{collapsed ? 'Click here to get started…' : 'Create a match and start recording events'}</p>
                          </div>
                        </div>

                        <div className="form-grid quickstart-grid" style={{ display: collapsed ? 'none' : 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>

                          {/* My Team */}
                          <div className="form-row">
                            <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>My Team</label>
                            <div>
                              {teams.length > 0 ? (
                                <Autocomplete
                                  options={teams}
                                  getOptionLabel={(opt) => opt.name}
                                  value={teams.find(t => t.id === myTeamId) || null}
                                  onChange={(_, val) => setMyTeamId(val?.id || '')}
                                  loading={teamsLoading}
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Select your team"
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
                                <IonButton expand="block" onClick={() => setShowCreateTeam(true)}>Create Team</IonButton>
                              )}
                            </div>
                          </div>

                          {/* Opponent */}
                          <div className="form-row">
                            <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Opponent Team</label>
                            <Autocomplete
                              freeSolo
                              options={opponentOptions}
                              loading={opponentLoading}
                              inputValue={opponentText}
                              onInputChange={(_, value) => setOpponentText(value)}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  placeholder="Opponent team"
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
                          </div>

                          {/* Venue + Periods side-by-side */}
                          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
                            {/* Venue */}
                            <div>
                              <label className="form-label" style={{ fontWeight: 700, marginBottom: 4, display: 'block' }}>Venue</label>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <IonButton fill={isHome ? 'solid' : 'outline'} color="primary" onClick={() => setIsHome(true)}>Home</IonButton>
                                <IonButton fill={!isHome ? 'solid' : 'outline'} color="medium" onClick={() => setIsHome(false)}>Away</IonButton>
                              </div>
                            </div>
                            <div>
                              <label className="form-label" style={{ fontWeight: 700, marginBottom: 4, display: 'block' }}>Periods</label>
                              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <IonButton fill={periodFormat === 'quarter' ? 'solid' : 'outline'} color="primary" onClick={() => setPeriodFormat('quarter')}>Quarters</IonButton>
                                <IonButton fill={periodFormat === 'half' ? 'solid' : 'outline'} color="primary" onClick={() => setPeriodFormat('half')}>Halves</IonButton>
                                <IonButton fill={periodFormat === 'whole' ? 'solid' : 'outline'} color="primary" onClick={() => setPeriodFormat('whole')}>Whole</IonButton>
                              </div>
                            </div>
                          </div>

                          {/* Duration */}
                          <div className="form-row">
                            <label className="form-label" style={{ fontWeight: 700, marginBottom: 6, display: 'block' }}>Duration (mins)</label>
                            <input
                              className="form-input quickstart-input"
                              type="number"
                              min={1}
                              max={200}
                              value={durationMinutes}
                              onChange={(e) => setDurationMinutes(Number(e.target.value) || 0)}
                              style={{ width: '100%' }}
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

                          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <IonButton
                              color="primary"
                              disabled={submitting || !myTeamId || !opponentText.trim()}
                              onClick={async () => {
                                try {
                                  setSubmitting(true);
                                  if (!user) {
                                    // Guest: create local quick match
                                    const allowed = await canCreateMatch();
                                    if (!allowed.ok) {
                                      showInfo?.(allowed.reason || 'Guest limit reached: 1 match');
                                      return;
                                    }
                                    const payload: QuickStartPayload = {
                                      myTeamId,
                                      opponentName: opponentText.trim(),
                                      isHome,
                                      kickoffTime: (() => { const d = kickoffDate || dayjs(); const t = kickoffTime || dayjs(); const merged = d.hour(t.hour()).minute(t.minute()).second(0).millisecond(0); return merged.toDate().toISOString(); })(),
                                      durationMinutes,
                                      periodFormat
                                    };
                                    const local = await createLocalQuickMatch(payload as any);
                                    if (local?.id) onNavigate?.(`/live/${local.id}`);
                                  } else {
                                    const payload: QuickStartPayload = {
                                      myTeamId,
                                      opponentName: opponentText.trim(),
                                      isHome,
                                      kickoffTime: (() => { const d = kickoffDate || dayjs(); const t = kickoffTime || dayjs(); const merged = d.hour(t.hour()).minute(t.minute()).second(0).millisecond(0); return merged.toDate().toISOString(); })(),
                                      durationMinutes,
                                      periodFormat
                                    };
                                    const match = await matchesApi.quickStart(payload);
                                    const id = (match as any).id || (match as any).match_id;
                                    if (id) {
                                      onNavigate?.(`/live/${id}`);
                                    }
                                  }
                                } catch (err) {
                                  console.error('Quick start failed', err);
                                } finally {
                                  setSubmitting(false);
                                }
                              }}
                            >
                              Start Live Match
                            </IonButton>

                          </div>

                          <CreateTeamModal
                            isOpen={showCreateTeam}
                            onDidDismiss={() => setShowCreateTeam(false)}
                            onCreated={(team) => {
                              setTeams(prev => {
                                const exists = prev.some(t => t.id === team.id);
                                return exists ? prev.map(t => (t.id === team.id ? team : t)) : [team, ...prev];
                              });
                              setMyTeamId(team.id);
                              setShowCreateTeam(false);
                            }}
                          />
                        </div>
                      </IonCardContent>
                    </IonCard>
                  </div>
                </IonCol>
              </IonRow>
            )}

            <IonRow>
              {navigationCards.map((card, index) => (
                <IonCol size="12" sizeMd="6" sizeLg="4" key={index}>
                  <div className="nav-card-wrapper">
                    <IonCard
                      className={`nav-card nav-card-${card.color}`}
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
                            color={card.color}
                          />
                          <div className="nav-card-text">
                            <h3 className="nav-card-title">{card.title}</h3>
                            <p className="nav-card-subtitle">{card.subtitle}</p>
                          </div>
                        </div>
                        <p className="nav-card-description">{card.description}</p>
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
        </div>

        {/* Recent Activity Section */}
        {user && (
          <div className="activity-section">
            <RecentActivity onNavigate={navigate} limit={10} days={30} />
          </div>
        )}
      </IonContent>
    </IonPage>
  );
};

export default HomePage;
