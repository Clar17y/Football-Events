import React from 'react';
import { IonCard, IonCardContent, IonButton, IonIcon, IonText } from '@ionic/react';
import { warning, refresh, informationCircle } from 'ionicons/icons';
import type { ErrorCategory } from '../../hooks/useErrorHandler';

interface ErrorMessageProps {
  /** Error message to display */
  message: string;
  /** Error category for styling */
  category?: ErrorCategory;
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Retry button handler */
  onRetry?: () => void;
  /** Whether retry is currently in progress */
  retrying?: boolean;
  /** Additional action buttons */
  actions?: Array<{
    label: string;
    handler: () => void;
    color?: string;
  }>;
  /** Whether to show as inline message (no card wrapper) */
  inline?: boolean;
  /** Custom className */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
}

/**
 * Get color based on error category
 */
const getCategoryColor = (category: ErrorCategory): string => {
  switch (category) {
    case 'validation':
      return 'warning';
    case 'network':
      return 'primary';
    case 'database':
      return 'danger';
    case 'permission':
      return 'warning';
    case 'system':
      return 'danger';
    case 'user':
      return 'medium';
    default:
      return 'danger';
  }
};

/**
 * Get icon based on error category
 */
const getCategoryIcon = (category: ErrorCategory) => {
  switch (category) {
    case 'validation':
    case 'permission':
    case 'user':
      return informationCircle;
    case 'network':
    case 'database':
    case 'system':
    default:
      return warning;
  }
};

/**
 * Error Message Component
 * 
 * Displays error messages with appropriate styling and actions
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  category = 'system',
  showRetry = false,
  onRetry,
  retrying = false,
  actions = [],
  inline = false,
  className,
  style
}) => {
  const color = getCategoryColor(category);
  const icon = getCategoryIcon(category);

  const content = (
    <div 
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        ...style
      }}
    >
      {/* Error message with icon */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px'
      }}>
        <IonIcon 
          icon={icon} 
          color={color}
          style={{ 
            fontSize: '20px',
            marginTop: '2px',
            flexShrink: 0
          }}
        />
        <IonText color={color}>
          <p style={{ 
            margin: 0,
            lineHeight: '1.4'
          }}>
            {message}
          </p>
        </IonText>
      </div>

      {/* Action buttons */}
      {(showRetry || actions.length > 0) && (
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          justifyContent: 'flex-start'
        }}>
          {showRetry && onRetry && (
            <IonButton
              size="small"
              fill="outline"
              color={color}
              onClick={onRetry}
              disabled={retrying}
            >
              <IonIcon icon={refresh} slot="start" />
              {retrying ? 'Retrying...' : 'Retry'}
            </IonButton>
          )}
          
          {actions.map((action, index) => (
            <IonButton
              key={index}
              size="small"
              fill="outline"
              color={action.color || 'medium'}
              onClick={action.handler}
            >
              {action.label}
            </IonButton>
          ))}
        </div>
      )}
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <IonCard style={{ margin: '16px 0' }}>
      <IonCardContent>
        {content}
      </IonCardContent>
    </IonCard>
  );
};

/**
 * Inline Error Message for forms
 */
interface InlineErrorProps {
  message?: string;
  show?: boolean;
  color?: string;
}

export const InlineError: React.FC<InlineErrorProps> = ({
  message,
  show = true,
  color = 'danger'
}) => {
  if (!show || !message) {
    return null;
  }

  return (
    <IonText color={color}>
      <p style={{ 
        margin: '4px 0 0 0',
        fontSize: '12px',
        lineHeight: '1.3'
      }}>
        {message}
      </p>
    </IonText>
  );
};

/**
 * Error Boundary Fallback Component
 */
interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
  context?: string;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  resetError,
  context
}) => (
  <ErrorMessage
    message={
      context 
        ? `Something went wrong in ${context}. Please try again.`
        : 'Something went wrong. Please try again.'
    }
    category="system"
    showRetry={true}
    onRetry={resetError}
    actions={[
      {
        label: 'Reload Page',
        handler: () => window.location.reload(),
        color: 'medium'
      }
    ]}
  />
);

/**
 * Network Error Component
 */
interface NetworkErrorProps {
  onRetry?: () => void;
  retrying?: boolean;
}

export const NetworkError: React.FC<NetworkErrorProps> = ({
  onRetry,
  retrying = false
}) => (
  <ErrorMessage
    message="Unable to connect to the server. Please check your internet connection."
    category="network"
    showRetry={!!onRetry}
    onRetry={onRetry}
    retrying={retrying}
  />
);

/**
 * Validation Error Component
 */
interface ValidationErrorProps {
  errors: string[];
  onDismiss?: () => void;
}

export const ValidationError: React.FC<ValidationErrorProps> = ({
  errors,
  onDismiss
}) => (
  <ErrorMessage
    message={
      errors.length === 1 
        ? errors[0]
        : `Please fix the following issues:\n${errors.map(e => `• ${e}`).join('\n')}`
    }
    category="validation"
    actions={onDismiss ? [{
      label: 'Dismiss',
      handler: onDismiss,
      color: 'medium'
    }] : []}
    inline={true}
  />
);

export default ErrorMessage;