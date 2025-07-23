/**
 * Mobile Debugger Component
 * Shows console logs directly on the mobile screen for debugging
 */

import React, { useState, useEffect } from 'react';
import {
  IonFab,
  IonFabButton,
  IonIcon,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonItem,
  IonLabel
} from '@ionic/react';
import { bug, close, trash, refresh } from 'ionicons/icons';

interface LogEntry {
  timestamp: string;
  level: 'log' | 'error' | 'warn' | 'info';
  message: string;
}

const MobileDebugger: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    // Override console methods to capture logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    const addLog = (level: LogEntry['level'], args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      
      setLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString(),
        level,
        message
      }].slice(-50)); // Keep only last 50 logs
    };

    console.log = (...args) => {
      originalLog.apply(console, args);
      addLog('log', args);
    };

    console.error = (...args) => {
      originalError.apply(console, args);
      addLog('error', args);
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      addLog('warn', args);
    };

    console.info = (...args) => {
      originalInfo.apply(console, args);
      addLog('info', args);
    };

    // Catch unhandled errors
    const handleError = (event: ErrorEvent) => {
      addLog('error', [`Unhandled Error: ${event.error?.message || event.message}`]);
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      addLog('error', [`Unhandled Promise Rejection: ${event.reason}`]);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    // Initial log
    console.log('Mobile Debugger initialized');

    return () => {
      // Restore original console methods
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
      
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const clearLogs = () => {
    setLogs([]);
  };

  const testAPI = async () => {
    try {
      console.log('Testing API connection...');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/stats`);
      console.log('API Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('API Response data:', data);
      } else {
        console.error('API Error:', response.statusText);
      }
    } catch (error: any) {
      console.error('Network Error:', error.message);
    }
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error': return '#ff4444';
      case 'warn': return '#ffaa00';
      case 'info': return '#44aaff';
      default: return '#ffffff';
    }
  };

  return (
    <>
      {/* Debug FAB - Only show in development and on mobile */}
      {import.meta.env.DEV && /Mobi|Android/i.test(navigator.userAgent) && (
        <IonFab vertical="bottom" horizontal="start" slot="fixed">
          <IonFabButton 
            size="small" 
            color="warning"
            onClick={() => setIsOpen(true)}
          >
            <IonIcon icon={bug} />
          </IonFabButton>
        </IonFab>
      )}

      {/* Debug Modal */}
      <IonModal isOpen={isOpen} onDidDismiss={() => setIsOpen(false)}>
        <IonHeader>
          <IonToolbar color="dark">
            <IonTitle>Mobile Debug Console</IonTitle>
            <IonButton 
              fill="clear" 
              slot="end" 
              onClick={() => setIsOpen(false)}
            >
              <IonIcon icon={close} />
            </IonButton>
          </IonToolbar>
        </IonHeader>
        
        <IonContent style={{ '--background': '#000000' }}>
          <div style={{ padding: '10px' }}>
            <div style={{ marginBottom: '10px' }}>
              <IonButton 
                size="small" 
                fill="outline" 
                onClick={clearLogs}
                style={{ marginRight: '10px' }}
              >
                <IonIcon icon={trash} slot="start" />
                Clear
              </IonButton>
              <IonButton 
                size="small" 
                fill="outline" 
                onClick={testAPI}
              >
                <IonIcon icon={refresh} slot="start" />
                Test API
              </IonButton>
            </div>

            <div style={{ 
              fontFamily: 'monospace', 
              fontSize: '12px',
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #333',
              padding: '10px',
              backgroundColor: '#111'
            }}>
              {logs.length === 0 ? (
                <div style={{ color: '#666' }}>No logs yet...</div>
              ) : (
                logs.map((log, index) => (
                  <div 
                    key={index}
                    style={{ 
                      color: getLogColor(log.level),
                      marginBottom: '5px',
                      borderLeft: `3px solid ${getLogColor(log.level)}`,
                      paddingLeft: '8px'
                    }}
                  >
                    <strong>[{log.timestamp}]</strong> {log.message}
                  </div>
                ))
              )}
            </div>

            <div style={{ marginTop: '20px', color: '#666', fontSize: '12px' }}>
              <div>API URL: {import.meta.env.VITE_API_URL}</div>
              <div>Environment: {import.meta.env.MODE}</div>
              <div>User Agent: {navigator.userAgent.substring(0, 50)}...</div>
            </div>
          </div>
        </IonContent>
      </IonModal>
    </>
  );
};

export default MobileDebugger;