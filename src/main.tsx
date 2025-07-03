import React from 'react';
import ReactDOM from 'react-dom/client';
import { IonApp } from '@ionic/react';
import App from './App';
import { registerSW } from './serviceWorkerRegistration';

import { MatchProvider } from './contexts/MatchContext';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastContainer } from './components/ui/Toast';
import { exposeDevUtilities } from './db/utils';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
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
      <ToastProvider>
        <MatchProvider>
          <IonApp>
            <App />
            <ToastContainer />
          </IonApp>
        </MatchProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
