import React, { useState, useCallback, useRef } from 'react';
import { useToast } from '../contexts/ToastContext';

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay between retries in milliseconds */
  initialDelayMs: number;
  /** Whether to use exponential backoff */
  exponentialBackoff: boolean;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Function to determine if an error is retryable */
  isRetryable?: (error: Error) => boolean;
  /** Called when all retries are exhausted */
  onMaxAttemptsReached?: (error: Error) => void;
  /** Called on each retry attempt */
  onRetryAttempt?: (attempt: number, error: Error) => void;
}

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  exponentialBackoff: true,
  maxDelayMs: 10000,
  isRetryable: (error: Error) => {
    // Default: retry network and database errors
    const message = error.message.toLowerCase();
    return message.includes('network') || 
           message.includes('fetch') || 
           message.includes('database') ||
           message.includes('timeout') ||
           message.includes('connection');
  }
};

/**
 * Retry state
 */
interface RetryState {
  isRetrying: boolean;
  attemptCount: number;
  lastError: Error | null;
  canRetry: boolean;
}

/**
 * Hook for handling retryable operations with exponential backoff
 */
export const useRetry = (config: Partial<RetryConfig> = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const { showInfo, showError } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    attemptCount: 0,
    lastError: null,
    canRetry: false
  });

  /**
   * Calculate delay for next retry attempt
   */
  const calculateDelay = useCallback((attempt: number): number => {
    if (!finalConfig.exponentialBackoff) {
      return finalConfig.initialDelayMs;
    }
    
    // Exponential backoff: delay = initialDelay * (2 ^ attempt)
    const delay = finalConfig.initialDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, finalConfig.maxDelayMs);
  }, [finalConfig]);

  /**
   * Execute operation with retry logic
   */
  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<T>,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> => {
    const config = { ...finalConfig, ...customConfig };
    let lastError: Error;
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setState({
      isRetrying: false,
      attemptCount: 0,
      lastError: null,
      canRetry: false
    });

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        setState(prev => ({
          ...prev,
          isRetrying: attempt > 1,
          attemptCount: attempt
        }));

        const result = await operation();
        
        // Success - keep attempt count, reset other state
        setState(prev => ({
          isRetrying: false,
          attemptCount: prev.attemptCount,
          lastError: null,
          canRetry: false
        }));
        
        if (attempt > 1) {
          showInfo(`Operation succeeded after ${attempt} attempts`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        const isRetryable = config.isRetryable?.(lastError) ?? true;
        const hasAttemptsLeft = attempt < config.maxAttempts;
        
        setState(prev => ({
          ...prev,
          lastError,
          canRetry: isRetryable && hasAttemptsLeft,
          isRetrying: false
        }));

        if (!isRetryable) {
          throw lastError;
        }

        if (hasAttemptsLeft) {
          // Call retry attempt callback with retry attempt number (attempt + 1)
          config.onRetryAttempt?.(attempt + 1, lastError);
          
          // Calculate delay and wait
          const delay = calculateDelay(attempt);
          showInfo(`Retrying in ${Math.round(delay / 1000)} seconds... (Attempt ${attempt}/${config.maxAttempts})`);
          
          await new Promise(resolve => {
            timeoutRef.current = setTimeout(resolve, delay);
          });
        }
      }
    }

    // All retries exhausted
    setState(prev => ({
      ...prev,
      isRetrying: false,
      canRetry: false
    }));

    config.onMaxAttemptsReached?.(lastError!);
    throw lastError!;
  }, [finalConfig, calculateDelay, showInfo]);

  /**
   * Manual retry function for user-triggered retries
   */
  const retry = useCallback(async <T>(
    operation: () => Promise<T>
  ): Promise<T> => {
    setState(prev => ({
      ...prev,
      attemptCount: prev.attemptCount + 1,
      isRetrying: true
    }));

    try {
      const result = await operation();
      setState(prev => ({
        isRetrying: false,
        attemptCount: prev.attemptCount,
        lastError: null,
        canRetry: false
      }));
      return result;
    } catch (error) {
      const err = error as Error;
      const isRetryable = finalConfig.isRetryable?.(err) ?? true;
      
      setState(prev => ({
        ...prev,
        isRetrying: false,
        lastError: err,
        canRetry: isRetryable
      }));
      
      throw error;
    }
  }, [finalConfig]);

  /**
   * Reset retry state
   */
  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setState({
      isRetrying: false,
      attemptCount: 0,
      lastError: null,
      canRetry: false
    });
  }, []);

  /**
   * Create a retryable version of an async function
   */
  const createRetryable = useCallback(<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    customConfig?: Partial<RetryConfig>
  ): T => {
    return ((...args: Parameters<T>) => 
      executeWithRetry(() => fn(...args), customConfig)
    ) as T;
  }, [executeWithRetry]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    ...state,
    executeWithRetry,
    retry,
    reset,
    createRetryable
  };
};

export default useRetry;