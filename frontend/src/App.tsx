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

  console.log('AppRoutes: isLoading =', isLoading, 'isAuthenticated =', isAuthenticated);

  if (isLoading) {
    console.log('AppRoutes: Showing loading screen');
    return <div>Loading...</div>;
  }

  console.log('AppRoutes: Rendering page:', currentPage);

  // Simple page navigation without router
  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'login':
        return <LoginPage onNavigate={setCurrentPage} />;
      case 'register':
        return <RegisterPage onNavigate={setCurrentPage} />;
      case 'seasons':
        if (!isAuthenticated) {
          setCurrentPage('login');
          return <LoginPage onNavigate={setCurrentPage} />;
        }
        return <SeasonsPage onNavigate={setCurrentPage} />;
      case 'teams':
        if (!isAuthenticated) {
          setCurrentPage('login');
          return <LoginPage onNavigate={setCurrentPage} />;
        }
        return <TeamsPage onNavigate={setCurrentPage} />;
      case 'players':
        if (!isAuthenticated) {
          setCurrentPage('login');
          return <LoginPage onNavigate={setCurrentPage} />;
        }
        return <PlayersPage onNavigate={setCurrentPage} />;
      case 'awards':
        if (!isAuthenticated) {
          setCurrentPage('login');
          return <LoginPage onNavigate={setCurrentPage} />;
        }
        return <AwardsPage onNavigate={setCurrentPage} />;
      case 'statistics':
        return <StatisticsPage onNavigate={setCurrentPage} />;
      case 'home':
      default:
        return <HomePage onNavigate={setCurrentPage} />;
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
