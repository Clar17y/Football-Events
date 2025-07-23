import { useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { ValidationError } from '../schemas/validation';
import { errorService } from '../services/errorService';

/**
 * Error categories for different handling strategies
 */
export type ErrorCategory = 
  | 'validation'    // User input errors
  | 'network'       // API/sync errors  
  | 'database'      // IndexedDB errors
  | 'permission'    // Access denied errors
  | 'system'        // Unexpected errors
  | 'user'          // User-caused errors (like cancellation);

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Enhanced error information
 */
export interface ErrorInfo {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  userMessage: string;
  technicalMessage: string;
  context?: string;
  timestamp: number;
}

/**
 * Error handling configuration
 */
interface ErrorHandlerConfig {
  /** Whether to show toast notifications */
  showToast?: boolean;
  /** Whether to log errors to console */
  logToConsole?: boolean;
  /** Whether to log errors to service */
  logToService?: boolean;
  /** Context for error (component name, operation, etc.) */
  context?: string;
}

/**
 * Hook for centralized error handling
 */
export const useErrorHandler = (config: ErrorHandlerConfig = {}) => {
  const { showError, showWarning, showInfo } = useToast();
  
  const {
    showToast = true,
    logToConsole = true,
    logToService = true,
    context
  } = config;

  /**
   * Categorize an error based on its type and message
   */
  const categorizeError = useCallback((error: Error | string | null | undefined): ErrorInfo => {
    // Handle null or undefined errors
    if (error === null || error === undefined) {
      return {
        category: 'system',
        severity: 'critical',
        retryable: false,
        userMessage: 'Unknown error occurred. Please try again.',
        technicalMessage: 'Received null or undefined error',
        context,
        timestamp: Date.now()
      };
    }
    
    const errorMessage = typeof error === 'string' ? error : error.message || 'Unknown error';
    const timestamp = Date.now();

    // Validation errors
    if (error instanceof ValidationError) {
      return {
        category: 'validation',
        severity: 'low',
        retryable: false,
        userMessage: `Please check your input: ${error.message}`,
        technicalMessage: error.message,
        context,
        timestamp
      };
    }

    // Network errors
    if (errorMessage.includes('fetch') || 
        errorMessage.includes('network') || 
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Failed to sync')) {
      return {
        category: 'network',
        severity: 'medium',
        retryable: true,
        userMessage: 'Connection problem. Please check your internet and try again.',
        technicalMessage: errorMessage,
        context,
        timestamp
      };
    }

    // Database errors
    if (errorMessage.includes('IndexedDB') || 
        errorMessage.includes('database') ||
        errorMessage.includes('Failed to save') ||
        errorMessage.includes('Failed to load')) {
      return {
        category: 'database',
        severity: 'high',
        retryable: true,
        userMessage: 'Problem saving data. Your changes may not be saved.',
        technicalMessage: errorMessage,
        context,
        timestamp
      };
    }

    // Permission errors
    if (errorMessage.toLowerCase().includes('permission') || 
        errorMessage.toLowerCase().includes('unauthorized') ||
        errorMessage.toLowerCase().includes('forbidden') ||
        errorMessage.toLowerCase().includes('access denied')) {
      return {
        category: 'permission',
        severity: 'medium',
        retryable: false,
        userMessage: 'You don\'t have permission to perform this action.',
        technicalMessage: errorMessage,
        context,
        timestamp
      };
    }

    // User errors (cancellation, etc.)
    if (errorMessage.includes('cancelled') || 
        errorMessage.includes('aborted') ||
        errorMessage.includes('user cancelled')) {
      return {
        category: 'user',
        severity: 'low',
        retryable: false,
        userMessage: 'Operation cancelled.',
        technicalMessage: errorMessage,
        context,
        timestamp
      };
    }

    // Default to system error
    return {
      category: 'system',
      severity: 'critical',
      retryable: true,
      userMessage: 'An unexpected error occurred. Please try again.',
      technicalMessage: errorMessage,
      context,
      timestamp
    };
  }, [context]);

  /**
   * Log error to console with structured format
   */
  const logError = useCallback((errorInfo: ErrorInfo, originalError?: Error) => {
    if (!logToConsole) return;

    const logData = {
      ...errorInfo,
      originalError: originalError?.stack || originalError?.message,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    switch (errorInfo.severity) {
      case 'critical':
        console.error(`Error in ${context || 'application'}:`, logData);
        break;
      case 'high':
        console.error(`Error in ${context || 'application'}:`, logData);
        break;
      case 'medium':
        console.warn(`Warning in ${context || 'application'}:`, logData);
        break;
      case 'low':
        console.info(`Info in ${context || 'application'}:`, logData);
        break;
    }
  }, [logToConsole]);

  /**
   * Show appropriate toast notification
   */
  const showToastNotification = useCallback((errorInfo: ErrorInfo, retryHandler?: () => void) => {
    if (!showToast) return;

    // Provide retry action only when retryHandler is provided
    const action = errorInfo.retryable && retryHandler ? {
      label: 'Retry',
      handler: retryHandler
    } : undefined;

    // Always show errors as error toasts for consistent UX
    // Severity is used for logging and reporting, not toast type
    return showError(errorInfo.userMessage, action, undefined);
  }, [showToast, showError]);

  /**
   * Main error handling function
   */
  const handleError = useCallback((
    error: Error | string | null | undefined,
    retryHandler?: () => void
  ): ErrorInfo => {
    const errorInfo = categorizeError(error);
    
    // Log the error
    logError(errorInfo, typeof error === 'object' && error !== null ? error : undefined);
    
    // Show toast notification
    showToastNotification(errorInfo, retryHandler);
    
    // Log to error service
    if (logToService) {
      errorService.logError(
        errorInfo,
        typeof error === 'object' && error !== null ? error.stack : undefined,
        { context }
      );
      
      // Report critical errors
      if (errorInfo.severity === 'critical') {
        errorService.reportError(errorInfo);
      }
    }
    
    return errorInfo;
  }, [categorizeError, logError, showToastNotification, logToService, context]);

  /**
   * Handle async operation errors with automatic retry
   */
  const handleAsyncError = useCallback(async <T>(
    operation: () => Promise<T>,
    retryHandler?: () => Promise<T>
  ): Promise<T | null> => {
    try {
      return await operation();
    } catch (error) {
      const errorInfo = handleError(error as Error, retryHandler ? () => {
        retryHandler().catch(retryError => {
          handleError(retryError as Error);
        });
      } : undefined);
      
      return null;
    }
  }, [handleError]);

  /**
   * Wrap a function with error handling
   */
  const withErrorHandling = useCallback(<T extends (...args: any[]) => any>(
    fn: T,
    retryHandler?: T
  ): T => {
    return ((...args: Parameters<T>) => {
      try {
        const result = fn(...args);
        
        // Handle async functions
        if (result instanceof Promise) {
          return result.catch((error: Error) => {
            handleError(error, retryHandler ? () => retryHandler(...args) : undefined);
            throw error; // Re-throw to maintain Promise behavior
          });
        }
        
        return result;
      } catch (error) {
        handleError(error as Error, retryHandler ? () => retryHandler(...args) : undefined);
        throw error; // Re-throw to maintain function behavior
      }
    }) as T;
  }, [handleError]);

  return {
    handleError,
    handleAsyncError,
    withErrorHandling,
    categorizeError
  };
};

export default useErrorHandler;