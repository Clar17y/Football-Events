import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRetry } from '../../../src/hooks/useRetry';
import { ToastProvider } from '../../../src/contexts/ToastContext';

// Mock the toast context
const mockShowInfo = vi.fn();
const mockShowError = vi.fn();

vi.mock('../../../src/contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    showInfo: mockShowInfo,
    showError: mockShowError
  })
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

// Helper to create a promise that can be resolved/rejected manually
const createControllablePromise = () => {
  let resolve: (value: any) => void;
  let reject: (error: any) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
};

describe('useRetry Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic Functionality', () => {
    it('should execute operation successfully on first attempt', async () => {
      const { result } = renderHook(() => useRetry(), { wrapper });
      const mockOperation = vi.fn().mockResolvedValue('success');

      let operationResult: any;
      await act(async () => {
        operationResult = await result.current.executeWithRetry(mockOperation);
      });

      expect(mockOperation).toHaveBeenCalledOnce();
      expect(operationResult).toBe('success');
      expect(result.current.attemptCount).toBe(1);
      expect(result.current.isRetrying).toBe(false);
    });

    it('should retry on retryable errors', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 3 }), { wrapper });
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      let operationResult: any;
      const executePromise = act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        
        // Fast-forward timers for retries
        await vi.runAllTimersAsync();
        
        return promise;
      });

      operationResult = await executePromise;

      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(operationResult).toBe('success');
    });

    it('should not retry non-retryable errors', async () => {
      const { result } = renderHook(() => useRetry(), { wrapper });
      const mockOperation = vi.fn().mockRejectedValue(new Error('Validation error'));

      await act(async () => {
        try {
          await result.current.executeWithRetry(mockOperation);
        } catch (error) {
          expect(error.message).toBe('Validation error');
        }
      });

      expect(mockOperation).toHaveBeenCalledOnce();
    });

    it('should throw error after max attempts reached', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 2 }), { wrapper });
      const mockOperation = vi.fn().mockRejectedValue(new Error('Network error'));

      await act(async () => {
        try {
          const promise = result.current.executeWithRetry(mockOperation);
          await vi.runAllTimersAsync();
          await promise;
        } catch (error) {
          expect(error.message).toBe('Network error');
        }
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration Options', () => {
    it('should respect maxAttempts configuration', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 5 }), { wrapper });
      const mockOperation = vi.fn().mockRejectedValue(new Error('Network error'));

      await act(async () => {
        try {
          const promise = result.current.executeWithRetry(mockOperation);
          await vi.runAllTimersAsync();
          await promise;
        } catch (error) {
          // Expected to fail
        }
      });

      expect(mockOperation).toHaveBeenCalledTimes(5);
    });

    it('should use custom isRetryable function', async () => {
      const customIsRetryable = vi.fn().mockReturnValue(false);
      const { result } = renderHook(() => 
        useRetry({ isRetryable: customIsRetryable }), 
        { wrapper }
      );
      const mockOperation = vi.fn().mockRejectedValue(new Error('Custom error'));

      await act(async () => {
        try {
          await result.current.executeWithRetry(mockOperation);
        } catch (error) {
          expect(error.message).toBe('Custom error');
        }
      });

      expect(customIsRetryable).toHaveBeenCalledWith(expect.any(Error));
      expect(mockOperation).toHaveBeenCalledOnce();
    });

    it('should call onRetryAttempt callback', async () => {
      const onRetryAttempt = vi.fn();
      const { result } = renderHook(() => 
        useRetry({ maxAttempts: 3, onRetryAttempt }), 
        { wrapper }
      );
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        await vi.runAllTimersAsync();
        await promise;
      });

      expect(onRetryAttempt).toHaveBeenCalledWith(2, expect.any(Error));
    });

    it('should call onMaxAttemptsReached callback', async () => {
      const onMaxAttemptsReached = vi.fn();
      const { result } = renderHook(() => 
        useRetry({ maxAttempts: 2, onMaxAttemptsReached }), 
        { wrapper }
      );
      const mockOperation = vi.fn().mockRejectedValue(new Error('Network error'));

      await act(async () => {
        try {
          const promise = result.current.executeWithRetry(mockOperation);
          await vi.runAllTimersAsync();
          await promise;
        } catch (error) {
          // Expected to fail
        }
      });

      expect(onMaxAttemptsReached).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('Exponential Backoff', () => {
    it('should use exponential backoff by default', async () => {
      const { result } = renderHook(() => 
        useRetry({ maxAttempts: 3, initialDelayMs: 100 }), 
        { wrapper }
      );
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      
      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        
        // Advance timers step by step to verify delays
        await vi.advanceTimersByTimeAsync(100); // First retry delay
        await vi.advanceTimersByTimeAsync(200); // Second retry delay (exponential)
        
        await promise;
      });

      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should use fixed delay when exponential backoff disabled', async () => {
      const { result } = renderHook(() => 
        useRetry({ 
          maxAttempts: 3, 
          initialDelayMs: 100, 
          exponentialBackoff: false 
        }), 
        { wrapper }
      );
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        
        // Advance timers with fixed delays
        await vi.advanceTimersByTimeAsync(100); // First retry delay
        await vi.advanceTimersByTimeAsync(100); // Second retry delay (same as first)
        
        await promise;
      });

      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should respect maxDelayMs limit', async () => {
      const { result } = renderHook(() => 
        useRetry({ 
          maxAttempts: 5, 
          initialDelayMs: 1000, 
          maxDelayMs: 2000 
        }), 
        { wrapper }
      );
      const mockOperation = vi.fn().mockRejectedValue(new Error('Network error'));

      await act(async () => {
        try {
          const promise = result.current.executeWithRetry(mockOperation);
          
          // The exponential backoff should be capped at maxDelayMs
          await vi.advanceTimersByTimeAsync(1000); // First retry: 1000ms
          await vi.advanceTimersByTimeAsync(2000); // Second retry: 2000ms (capped)
          await vi.advanceTimersByTimeAsync(2000); // Third retry: 2000ms (capped)
          await vi.advanceTimersByTimeAsync(2000); // Fourth retry: 2000ms (capped)
          
          await promise;
        } catch (error) {
          // Expected to fail
        }
      });

      expect(mockOperation).toHaveBeenCalledTimes(5);
    });
  });

  describe('State Management', () => {
    it('should update state during retry process', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 3 }), { wrapper });
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      // Initial state
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.attemptCount).toBe(0);

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        await vi.runAllTimersAsync();
        await promise;
      });

      // Final state after retry succeeds
      expect(result.current.isRetrying).toBe(false);
      expect(result.current.attemptCount).toBe(2);
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should reset state between different operations', async () => {
      const { result } = renderHook(() => useRetry(), { wrapper });
      
      // First operation
      await act(async () => {
        await result.current.executeWithRetry(() => Promise.resolve('success1'));
      });

      expect(result.current.attemptCount).toBe(1);

      // Second operation should reset state
      await act(async () => {
        await result.current.executeWithRetry(() => Promise.resolve('success2'));
      });

      expect(result.current.attemptCount).toBe(1);
    });
  });

  describe('Manual Retry', () => {
    it('should allow manual retry', async () => {
      const { result } = renderHook(() => useRetry(), { wrapper });
      const mockOperation = vi.fn().mockResolvedValue('success');

      await act(async () => {
        await result.current.retry(mockOperation);
      });

      expect(mockOperation).toHaveBeenCalledOnce();
      expect(result.current.attemptCount).toBe(1);
    });

    it('should update canRetry state correctly', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 2 }), { wrapper });
      const mockOperation = vi.fn().mockRejectedValue(new Error('Network error'));

      expect(result.current.canRetry).toBe(false);

      await act(async () => {
        try {
          const promise = result.current.executeWithRetry(mockOperation);
          
          // After first failure, should be able to retry
          await vi.advanceTimersByTimeAsync(1000);
          expect(result.current.canRetry).toBe(true);
          
          await promise;
        } catch (error) {
          // After max attempts, should not be able to retry
          expect(result.current.canRetry).toBe(false);
        }
      });
    });
  });

  describe('Cleanup', () => {
    it('should cleanup timeouts on unmount', () => {
      const { result, unmount } = renderHook(() => useRetry(), { wrapper });
      
      act(() => {
        // Start an operation that will need retry
        result.current.executeWithRetry(() => Promise.reject(new Error('Network error')));
      });

      // Unmount before retry completes
      unmount();

      // Should not throw or cause memory leaks
      expect(() => vi.runAllTimers()).not.toThrow();
    });
  });

  describe('Default Retry Logic', () => {
    it('should retry network errors by default', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 2 }), { wrapper });
      const mockOperation = vi.fn().mockRejectedValue(new Error('fetch failed'));

      await act(async () => {
        try {
          const promise = result.current.executeWithRetry(mockOperation);
          await vi.runAllTimersAsync();
          await promise;
        } catch (error) {
          // Expected to fail after retries
        }
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should retry database errors by default', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 2 }), { wrapper });
      const mockOperation = vi.fn().mockRejectedValue(new Error('database connection failed'));

      await act(async () => {
        try {
          const promise = result.current.executeWithRetry(mockOperation);
          await vi.runAllTimersAsync();
          await promise;
        } catch (error) {
          // Expected to fail after retries
        }
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should not retry validation errors by default', async () => {
      const { result } = renderHook(() => useRetry(), { wrapper });
      const mockOperation = vi.fn().mockRejectedValue(new Error('Invalid input'));

      await act(async () => {
        try {
          await result.current.executeWithRetry(mockOperation);
        } catch (error) {
          expect(error.message).toBe('Invalid input');
        }
      });

      expect(mockOperation).toHaveBeenCalledOnce();
    });
  });
});