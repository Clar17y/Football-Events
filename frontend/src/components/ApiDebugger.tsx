/**
 * API Debugger Component
 * Helps debug API connection issues on mobile devices
 */

import React, { useState, useEffect } from 'react';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonButton,
  IonText,
  IonIcon,
  IonItem,
  IonLabel
} from '@ionic/react';
import { checkmarkCircle, closeCircle, refresh } from 'ionicons/icons';

const ApiDebugger: React.FC = () => {
  const [apiStatus, setApiStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [apiUrl, setApiUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const checkApiConnection = async () => {
    setApiStatus('checking');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://192.168.1.58:3001/api/v1';
    setApiUrl(baseUrl);

    try {
      const response = await fetch(`${baseUrl}/stats`);
      if (response.ok) {
        setApiStatus('success');
        setErrorMessage('');
      } else {
        setApiStatus('error');
        setErrorMessage(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      setApiStatus('error');
      setErrorMessage(error.message || 'Network error');
    }
  };

  useEffect(() => {
    checkApiConnection();
  }, []);

  const getStatusIcon = () => {
    switch (apiStatus) {
      case 'success':
        return <IonIcon icon={checkmarkCircle} color="success" />;
      case 'error':
        return <IonIcon icon={closeCircle} color="danger" />;
      default:
        return <IonIcon icon={refresh} />;
    }
  };

  const getStatusText = () => {
    switch (apiStatus) {
      case 'success':
        return 'API Connected Successfully';
      case 'error':
        return 'API Connection Failed';
      default:
        return 'Checking API Connection...';
    }
  };

  return (
    <IonCard style={{ margin: '16px' }}>
      <IonCardHeader>
        <IonCardTitle>API Connection Status</IonCardTitle>
      </IonCardHeader>
      <IonCardContent>
        <IonItem>
          <IonLabel>
            <h3>{getStatusText()}</h3>
            <p>API URL: {apiUrl}</p>
            {errorMessage && (
              <p style={{ color: 'var(--ion-color-danger)' }}>
                Error: {errorMessage}
              </p>
            )}
          </IonLabel>
          {getStatusIcon()}
        </IonItem>
        
        <IonButton 
          expand="block" 
          fill="outline" 
          onClick={checkApiConnection}
          style={{ marginTop: '16px' }}
        >
          <IonIcon icon={refresh} slot="start" />
          Test Connection
        </IonButton>

        <div style={{ marginTop: '16px', fontSize: '0.875rem', color: 'var(--ion-color-medium)' }}>
          <p><strong>Troubleshooting:</strong></p>
          <ul>
            <li>Make sure backend is running on your computer</li>
            <li>Check that your phone and computer are on the same WiFi</li>
            <li>Verify the IP address is correct</li>
            <li>Try restarting the frontend server</li>
          </ul>
        </div>
      </IonCardContent>
    </IonCard>
  );
};

export default ApiDebugger;