import React from 'react';
import { IonToast, IonButton, IonIcon } from '@ionic/react';
import { close, checkmark, informationCircle, warning, alert } from 'ionicons/icons';
import { useToast, ToastMessage, ToastSeverity } from '../../contexts/ToastContext';

/**
 * Get icon for toast severity
 */
const getToastIcon = (severity: ToastSeverity) => {
  switch (severity) {
    case 'success':
      return checkmark;
    case 'info':
      return informationCircle;
    case 'warning':
      return warning;
    case 'error':
      return alert;
    default:
      return informationCircle;
  }
};

/**
 * Get color for toast severity
 */
const getToastColor = (severity: ToastSeverity) => {
  switch (severity) {
    case 'success':
      return 'success';
    case 'info':
      return 'primary';
    case 'warning':
      return 'warning';
    case 'error':
      return 'danger';
    default:
      return 'medium';
  }
};

/**
 * Individual Toast Component
 */
interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const handleDismiss = () => {
    onDismiss(toast.id);
  };

  const handleActionClick = () => {
    if (toast.action) {
      toast.action.handler();
      // Optionally dismiss after action
      handleDismiss();
    }
  };

  return (
    <IonToast
      isOpen={true}
      message={toast.message}
      duration={toast.duration || 0}
      color={getToastColor(toast.severity)}
      icon={getToastIcon(toast.severity)}
      onDidDismiss={handleDismiss}
      buttons={[
        // Action button if provided
        ...(toast.action ? [{
          text: toast.action.label,
          role: 'action',
          handler: handleActionClick
        }] : []),
        // Dismiss button if dismissible
        ...(toast.dismissible ? [{
          text: 'Dismiss',
          role: 'cancel',
          handler: handleDismiss
        }] : [])
      ]}
      position="top"
      translucent={true}
    />
  );
};

/**
 * Toast Container Component
 * 
 * Renders all active toasts from the ToastContext
 */
export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useToast();

  return (
    <>
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={dismissToast}
        />
      ))}
    </>
  );
};

/**
 * Custom Toast Component for more complex layouts
 */
interface CustomToastProps {
  isOpen: boolean;
  message: string;
  severity: ToastSeverity;
  onDismiss: () => void;
  action?: {
    label: string;
    handler: () => void;
  };
  children?: React.ReactNode;
}

export const CustomToast: React.FC<CustomToastProps> = ({
  isOpen,
  message,
  severity,
  onDismiss,
  action,
  children
}) => {
  const buttons = [
    ...(action ? [{
      text: action.label,
      role: 'action',
      handler: action.handler
    }] : []),
    {
      text: 'Dismiss',
      role: 'cancel',
      handler: onDismiss
    }
  ];

  return (
    <IonToast
      isOpen={isOpen}
      message={message}
      color={getToastColor(severity)}
      icon={getToastIcon(severity)}
      onDidDismiss={onDismiss}
      buttons={buttons}
      position="top"
      translucent={true}
    >
      {children}
    </IonToast>
  );
};

export default ToastContainer;