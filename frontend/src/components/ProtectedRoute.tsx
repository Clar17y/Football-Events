import React from 'react';
import { Route, Redirect } from 'react-router-dom';
import { IonSpinner, IonContent, IonPage } from '@ionic/react';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  component: React.ComponentType<any>;
  exact?: boolean;
  path: string;
  [key: string]: any;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  component: Component, 
  ...rest 
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            flexDirection: 'column'
          }}>
            <IonSpinner name="crescent" />
            <p style={{ marginTop: '16px', color: 'var(--ion-color-medium)' }}>
              Loading...
            </p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <Route
      {...rest}
      render={(props) =>
        isAuthenticated ? (
          <Component {...props} />
        ) : (
          <Redirect
            to={{
              pathname: '/login',
              state: { from: props.location }
            }}
          />
        )
      }
    />
  );
};

export default ProtectedRoute;