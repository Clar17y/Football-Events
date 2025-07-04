import React from 'react';
import { IonSpinner, IonText } from '@ionic/react';

interface LoadingSpinnerProps {
  /** Loading message to display */
  message?: string;
  /** Size of the spinner */
  size?: 'small' | 'default' | 'large';
  /** Color of the spinner */
  color?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'danger' | 'light' | 'medium' | 'dark';
  /** Whether to show as overlay */
  overlay?: boolean;
  /** Custom className */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
}

/**
 * Loading Spinner Component
 * 
 * Displays a loading spinner with optional message and overlay functionality
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message,
  size = 'default',
  color = 'primary',
  overlay = false,
  className,
  style
}) => {
  const spinnerSize = size === 'small' ? 'lines-small' : size === 'large' ? 'lines' : 'lines';

  const content = (
    <div 
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '20px',
        ...style
      }}
    >
      <IonSpinner 
        name={spinnerSize} 
        color={color}
        style={{
          width: size === 'small' ? '20px' : size === 'large' ? '40px' : '30px',
          height: size === 'small' ? '20px' : size === 'large' ? '40px' : '30px'
        }}
      />
      {message && (
        <IonText color="medium">
          <p style={{ 
            margin: 0, 
            textAlign: 'center',
            fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px'
          }}>
            {message}
          </p>
        </IonText>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}>
        <div style={{
          backgroundColor: 'var(--ion-background-color, white)',
          borderRadius: '8px',
          padding: '20px',
          minWidth: '200px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)'
        }}>
          {content}
        </div>
      </div>
    );
  }

  return content;
};

/**
 * Inline Loading Spinner for buttons and small spaces
 */
interface InlineLoadingProps {
  size?: 'small' | 'default';
  color?: string;
  className?: string;
}

export const InlineLoading: React.FC<InlineLoadingProps> = ({
  size = 'small',
  color = 'primary',
  className
}) => (
  <IonSpinner 
    name="lines-small"
    color={color}
    className={className}
    style={{
      width: size === 'small' ? '16px' : '20px',
      height: size === 'small' ? '16px' : '20px'
    }}
  />
);

/**
 * Loading state wrapper component
 */
interface LoadingWrapperProps {
  loading: boolean;
  message?: string;
  overlay?: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const LoadingWrapper: React.FC<LoadingWrapperProps> = ({
  loading,
  message,
  overlay = false,
  children,
  fallback
}) => {
  if (loading) {
    return fallback || (
      <LoadingSpinner 
        message={message} 
        overlay={overlay}
      />
    );
  }

  return <>{children}</>;
};

/**
 * Hook for managing loading state
 */
export const useLoading = (initialState = false) => {
  const [loading, setLoading] = React.useState(initialState);

  const withLoading = React.useCallback(
    async (operation: () => Promise<any>): Promise<any> => {
      setLoading(true);
      try {
        const result = await operation();
        return result;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    loading,
    setLoading,
    withLoading
  };
};

export default LoadingSpinner;