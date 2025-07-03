import React from 'react';
import { IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Redirect } from 'react-router-dom';
import MatchConsole from './pages/MatchConsole';

setupIonicReact();

const App: React.FC = () => (
  <IonReactRouter>
    <IonRouterOutlet>
      <Route exact path="/match" component={MatchConsole} />
      <Redirect exact from="/" to="/match" />
    </IonRouterOutlet>
  </IonReactRouter>
);

export default App;
