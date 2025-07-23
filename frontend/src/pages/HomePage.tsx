import React from 'react';
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
import './HomePage.css';

interface HomePageProps {
  onNavigate?: (page: string) => void;
}

const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { stats, loading, error, fromCache } = useGlobalStats();
  
  const navigate = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    }
  };

  const navigationCards = [
    {
      title: 'Seasons',
      subtitle: 'Manage your seasons',
      icon: calendar,
      color: 'primary',
      route: '/seasons',
      description: 'Create and organize your football seasons'
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
      title: 'Players',
      subtitle: 'Player profiles',
      icon: person,
      color: 'indigo',
      route: '/players',
      description: 'Track individual player progress'
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
      title: 'Live Match',
      subtitle: 'Coming soon',
      icon: play,
      color: 'amber',
      route: '#',
      description: 'Live match console - being redesigned'
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
            <div className="title-container">
              <IonIcon icon={football} className="title-icon" />
              <span>MatchMaster</span>
            </div>
          </IonTitle>
          <IonButtons slot="end">
            <ThemeToggle />
            <UserProfile />
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      
      <IonContent className="home-content">
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
          
          {/* Show cache/error status for debugging */}
          {fromCache && (
            <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--grassroots-text-tertiary)', marginTop: '0.5rem' }}>
              Showing cached data
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
          <h2 className="section-title">Quick Access</h2>
          <IonGrid className="navigation-grid">
            <IonRow>
              {navigationCards.map((card, index) => (
                <IonCol size="12" sizeMd="6" sizeLg="4" key={index}>
                  <IonCard 
                    className={`nav-card nav-card-${card.color}`}
                    button={card.route !== '#'}
                    onClick={() => {
                      if (card.route === '#') return;
                      
                      // Convert route to page name
                      const pageName = card.route.replace('/', '');
                      
                      // Check if route requires authentication
                      const protectedRoutes = ['seasons', 'teams', 'players', 'awards'];
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
                      {(card.title === 'Statistics' || card.title === 'Live Match') && (
                        <IonChip color="medium" className="coming-soon-chip">
                          <IonLabel>Coming Soon</IonLabel>
                        </IonChip>
                      )}
                      {!user && ['Seasons', 'Teams', 'Players', 'Awards'].includes(card.title) && (
                        <IonChip color="primary" className="login-required-chip">
                          <IonLabel>Sign In Required</IonLabel>
                        </IonChip>
                      )}
                    </IonCardContent>
                  </IonCard>
                </IonCol>
              ))}
            </IonRow>
          </IonGrid>
        </div>

        {/* Recent Activity Section */}
        <div className="activity-section">
          <h2 className="section-title">Recent Activity</h2>
          <IonCard className="activity-card">
            <IonCardContent>
              <div className="activity-placeholder">
                <IonIcon icon={trophy} className="activity-icon" />
                <h3>No recent activity</h3>
                <p>Start by creating a season or adding teams to see activity here</p>
                <IonButton 
                  fill="outline" 
                  color="primary"
                  onClick={() => navigate('seasons')}
                >
                  Get Started
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default HomePage;