import React, { Component, ErrorInfo, ReactNode } from 'react';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon } from '@ionic/react';
import { warning, refresh } from 'ionicons/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * 
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log to error service
    import('../services/errorService').then(({ errorService }) => {
      errorService.logError({
        category: 'system',
        severity: 'critical',
        retryable: false,
        userMessage: 'A critical error occurred in the application',
        technicalMessage: error.message,
        context: 'ErrorBoundary',
        timestamp: Date.now()
      }, error.stack, { errorInfo });
    });
  }

  handleRetry = () => {
    // Reset error state to retry rendering
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = () => {
    // Reload the entire page as last resort
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div style={{ 
          padding: '20px', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center',
          minHeight: '50vh'
        }}>
          <IonCard style={{ maxWidth: '500px', width: '100%' }}>
            <IonCardHeader>
              <IonCardTitle style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                color: 'var(--ion-color-danger)'
              }}>
                <IonIcon icon={warning} />
                Something went wrong
              </IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <p style={{ marginBottom: '20px' }}>
                We're sorry, but something unexpected happened. You can try refreshing 
                the page or contact support if the problem persists.
              </p>
              
              {/* Show error details in development */}
              {import.meta.env.DEV && this.state.error && (
                <details style={{ 
                  marginBottom: '20px',
                  padding: '10px',
                  background: 'var(--ion-color-light)',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                    Error Details (Development Only)
                  </summary>
                  <pre style={{ 
                    marginTop: '10px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}

              <div style={{ 
                display: 'flex', 
                gap: '10px', 
                justifyContent: 'center',
                flexWrap: 'wrap'
              }}>
                <IonButton 
                  color="primary" 
                  onClick={this.handleRetry}
                  style={{ minWidth: '120px' }}
                >
                  <IonIcon icon={refresh} slot="start" />
                  Try Again
                </IonButton>
                <IonButton 
                  color="medium" 
                  fill="outline"
                  onClick={this.handleReload}
                  style={{ minWidth: '120px' }}
                >
                  Reload Page
                </IonButton>
              </div>
            </IonCardContent>
          </IonCard>
        </div>
      );
    }

    // No error, render children normally
    return this.props.children;
  }
}

/**
 * Hook-based wrapper for functional components
 */
export const withErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) => {
  return (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
};

export default ErrorBoundary;