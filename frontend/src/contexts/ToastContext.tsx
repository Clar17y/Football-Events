import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ToastSeverity = 'success' | 'info' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  message: string;
  severity: ToastSeverity;
  duration?: number;
  action?: {
    label: string;
    handler: () => void;
  };
  dismissible?: boolean;
}

interface ToastContextType {
  // Expose a ref getter so non-React code can show toasts
  getApi?: () => ToastContextType | undefined;
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, 'id'>) => string;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
  // Convenience methods
  showSuccess: (message: string, duration?: number) => string;
  showInfo: (message: string, duration?: number) => string;
  showWarning: (message: string, duration?: number) => string;
  showError: (message: string, action?: ToastMessage['action'], duration?: number) => string;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ 
  children, 
  maxToasts = 5 
}) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Keep a global reference so non-React code (e.g. apiClient) can trigger toasts
  ;(window as any).__toastApi = (window as any).__toastApi || { current: undefined };

  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastMessage = {
      id,
      dismissible: true,
      duration: 5000, // Default 5 seconds
      ...toast
    };

    setToasts(prev => {
      // Add new toast and limit total number
      const updated = [newToast, ...prev];
      return updated.slice(0, maxToasts);
    });

    // Auto-dismiss if duration is set
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, newToast.duration);
    }

    return id;
  }, [maxToasts]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const showSuccess = useCallback((message: string, duration?: number): string => {
    return showToast({ message, severity: 'success', duration });
  }, [showToast]);

  const showInfo = useCallback((message: string, duration?: number): string => {
    return showToast({ message, severity: 'info', duration });
  }, [showToast]);

  const showWarning = useCallback((message: string, duration?: number): string => {
    return showToast({ message, severity: 'warning', duration });
  }, [showToast]);

  const showError = useCallback((
    message: string, 
    action?: ToastMessage['action'], 
    duration?: number
  ): string => {
    return showToast({ 
      message, 
      severity: 'error', 
      action,
      duration: duration ?? 0 // Errors don't auto-dismiss by default
    });
  }, [showToast]);

  const value: ToastContextType = {
    // Allow non-React code to obtain the API on demand
    getApi: () => (window as any).__toastApi?.current,
    toasts,
    showToast,
    dismissToast,
    clearAllToasts,
    showSuccess,
    showInfo,
    showWarning,
    showError
  };

  // Update the global reference on each render
  ;(window as any).__toastApi.current = value;

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default ToastContext;