import React from 'react';
import { IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Redirect } from 'react-router-dom';

// Import all pages
import HomePage from './pages/HomePage';
import SeasonsPage from './pages/SeasonsPage';
import TeamsPage from './pages/TeamsPage';
import PlayersPage from './pages/PlayersPage';
import AwardsPage from './pages/AwardsPage';
import StatisticsPage from './pages/StatisticsPage';
import MatchConsole from './pages/MatchConsole';

setupIonicReact();

const App: React.FC = () => (
  <IonReactRouter>
    <IonRouterOutlet>
      {/* Home page - new beautiful landing */}
      <Route exact path="/home" component={HomePage} />
      
      {/* Main application pages */}
      <Route exact path="/seasons" component={SeasonsPage} />
      <Route exact path="/teams" component={TeamsPage} />
      <Route exact path="/players" component={PlayersPage} />
      <Route exact path="/awards" component={AwardsPage} />
      <Route exact path="/statistics" component={StatisticsPage} />
      
      {/* Live match console */}
      <Route exact path="/match" component={MatchConsole} />
      
      {/* Default redirect to home */}
      <Redirect exact from="/" to="/home" />
    </IonRouterOutlet>
  </IonReactRouter>
);

export default App;
