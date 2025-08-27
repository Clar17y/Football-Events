import React, { useEffect, useState } from 'react';
import './styles/Highlight.css';
import { setupIonicReact } from '@ionic/react';

// Import authentication components
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DatabaseProvider } from './contexts/DatabaseContext';
import { MatchProvider } from './contexts/MatchContext';
import ProtectedRoute from './components/ProtectedRoute';
import MobileDebugger from './components/MobileDebugger';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Import all pages
import HomePage from './pages/HomePage';
import SeasonsPage from './pages/SeasonsPage';
import TeamsPage from './pages/TeamsPage';
import PlayersPage from './pages/PlayersPage';
import MatchesPage from './pages/MatchesPage';
import AwardsPage from './pages/AwardsPage';
import StatisticsPage from './pages/StatisticsPage';
import LiveMatchPage from './pages/LiveMatchPage';
// import MatchConsole from './pages/MatchConsole'; // Removed - will be redesigned

setupIonicReact();

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState('home');
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);

  // On initial load and back/forward, parse URL path to set page state
  useEffect(() => {
    const applyLocation = () => {
      const { pathname } = window.location;
      // Normalize pathname without trailing slash
      const path = pathname.replace(/\/$/, '');
      if (path === '/live' || path === 'live') {
        setCurrentPage('live');
        setCurrentMatchId(null);
        return;
      }
      if (path.startsWith('/live/')) {
        const id = path.split('/')[2];
        setCurrentMatchId(id || null);
        setCurrentPage('live');
        return;
      }
      // Map known routes from path
      const page = path.replace(/^\//, '') || 'home';
      setCurrentPage(page);
    };

    applyLocation();
    const onPop = () => applyLocation();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Parse URL parameters for team filtering
  const parseUrlParams = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const teamId = urlParams.get('teamId');
    const teamName = urlParams.get('teamName');
    
    if (teamId && teamName) {
      return {
        teamId: teamId,
        teamName: decodeURIComponent(teamName)
      };
    }
    return null;
  };

  // Enhanced navigation handler to support URL parameters
  const handleNavigation = (pageOrUrl: string) => {
    if (pageOrUrl.includes('?')) {
      // Handle URL with parameters
      const [page, params] = pageOrUrl.split('?');
      setCurrentPage(page);
      // Update URL without page reload
      window.history.pushState({}, '', `?${params}`);
    } else if (pageOrUrl.startsWith('/live/') || pageOrUrl.startsWith('live/')) {
      // Handle live match navigation with ID: /live/:id or live/:id
      const parts = pageOrUrl.split('/');
      const id = parts[2] || parts[1];
      if (id) {
        setCurrentMatchId(id);
      }
      setCurrentPage('live');
      // Reflect in URL for shareability
      const path = pageOrUrl.startsWith('/') ? pageOrUrl : `/${pageOrUrl}`;
      window.history.pushState({}, '', path);
    } else if (pageOrUrl === '/live' || pageOrUrl === 'live') {
      // Live without explicit ID
      setCurrentMatchId(null);
      setCurrentPage('live');
      window.history.pushState({}, '', '/live');
    } else {
      // Handle simple page navigation and reflect in URL path
      setCurrentPage(pageOrUrl);
      const newPath = pageOrUrl === 'home' ? '/' : `/${pageOrUrl}`;
      window.history.pushState({}, '', newPath);
    }
  };

  console.log('AppRoutes: isLoading =', isLoading, 'isAuthenticated =', isAuthenticated);

  if (isLoading) {
    console.log('AppRoutes: Showing loading screen');
    return <div>Loading...</div>;
  }

  console.log('AppRoutes: Rendering page:', currentPage);

  // Simple page navigation without router
  const renderCurrentPage = () => {
    const teamFilter = parseUrlParams();

    switch (currentPage) {
      case 'login':
        return <LoginPage onNavigate={handleNavigation} />;
      case 'register':
        return <RegisterPage onNavigate={handleNavigation} />;
      case 'seasons':
        if (!isAuthenticated) {
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <SeasonsPage onNavigate={handleNavigation} />;
      case 'teams':
        if (!isAuthenticated) {
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <TeamsPage onNavigate={handleNavigation} />;
      case 'players':
        if (!isAuthenticated) {
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <PlayersPage onNavigate={handleNavigation} initialTeamFilter={teamFilter} />;
      case 'matches':
        if (!isAuthenticated) {
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <MatchesPage onNavigate={handleNavigation} />;
      case 'awards':
        if (!isAuthenticated) {
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <AwardsPage onNavigate={handleNavigation} />;
      case 'statistics':
        return <StatisticsPage onNavigate={handleNavigation} />;
      case 'live':
        // Pass currentMatchId (may be null to select nearest upcoming)
        return <LiveMatchPage onNavigate={handleNavigation} matchId={currentMatchId || undefined} />;
      case 'home':
      default:
        return <HomePage onNavigate={handleNavigation} />;
    }
  };

  return renderCurrentPage();
};

const App: React.FC = () => (
  <DatabaseProvider>
    <MatchProvider>
      <AuthProvider>
        <AppRoutes />
        <MobileDebugger />
      </AuthProvider>
    </MatchProvider>
  </DatabaseProvider>
);

export default App;
