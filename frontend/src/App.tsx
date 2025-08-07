import React, { useState } from 'react';
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
import AwardsPage from './pages/AwardsPage';
import StatisticsPage from './pages/StatisticsPage';
// import MatchConsole from './pages/MatchConsole'; // Removed - will be redesigned

setupIonicReact();

const AppRoutes: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentPage, setCurrentPage] = useState('home');

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
    } else {
      // Handle simple page navigation
      setCurrentPage(pageOrUrl);
      // Clear URL parameters
      window.history.pushState({}, '', window.location.pathname);
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
          setCurrentPage('login');
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <SeasonsPage onNavigate={handleNavigation} />;
      case 'teams':
        if (!isAuthenticated) {
          setCurrentPage('login');
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <TeamsPage onNavigate={handleNavigation} />;
      case 'players':
        if (!isAuthenticated) {
          setCurrentPage('login');
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <PlayersPage onNavigate={handleNavigation} initialTeamFilter={teamFilter} />;
      case 'awards':
        if (!isAuthenticated) {
          setCurrentPage('login');
          return <LoginPage onNavigate={handleNavigation} />;
        }
        return <AwardsPage onNavigate={handleNavigation} />;
      case 'statistics':
        return <StatisticsPage onNavigate={handleNavigation} />;
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
