import React from 'react';
import ReactDOM from 'react-dom/client';
import { IonApp } from '@ionic/react';
import App from './App';
import MuiThemeBridge from './MuiThemeBridge';
import { registerSW } from './serviceWorkerRegistration';

// MatchProvider moved to App.tsx to be inside DatabaseProvider
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ui/Toast';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import PWAUpdateNotification from './components/PWAUpdateNotification';
import { exposeDevUtilities } from './db/utils';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import './theme/colors.css';
import './theme/typography.css';
import './index.css';

registerSW();

// Expose development utilities
exposeDevUtilities();

console.log("main.tsx booted");

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary onError={(error, errorInfo) => {
      console.error('Application Error:', error, errorInfo);
      // TODO: Log to error service when implemented
    }}>
      <ThemeProvider>
        <ToastProvider>
          <MuiThemeBridge>
            <IonApp>
              <App />
              <ToastContainer />
              <PWAInstallPrompt />
              <PWAUpdateNotification />
            </IonApp>
          </MuiThemeBridge>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
