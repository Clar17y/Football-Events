// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

// Helper to mark a promise as handled for Vitest to avoid unhandled rejection warnings
function markHandled<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => { });
  return promise;
}

async function captureRejection<T>(promise: Promise<T>): Promise<Error | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    return error as Error;
  }
}

describe('useRetry Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Suppress unhandled rejection warnings that occur during fake timer ticks
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (e) => {
        e.preventDefault();
      });
    }
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
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
        .mockResolvedValue('success');

      let operationResult: any;
      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        await vi.runAllTimersAsync();
        operationResult = await promise;
      });

      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(operationResult).toBe('success');
    });

    it('should not retry non-retryable errors', async () => {
      const { result } = renderHook(() => useRetry(), { wrapper });
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Validation error'))));

      await act(async () => {
        try {
          await result.current.executeWithRetry(mockOperation);
          expect(true).toBe(false);
        } catch (error: any) {
          expect(error.message).toBe('Validation error');
        }
      });

      expect(mockOperation).toHaveBeenCalledOnce();
    });

    it('should throw error after max attempts reached', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 2 }), { wrapper });
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Network error'))));

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        const errorPromise = captureRejection(promise);
        await vi.runAllTimersAsync();
        const error = await errorPromise;
        expect(error?.message).toBe('Network error');
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Configuration Options', () => {
    it('should respect maxAttempts configuration', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 5 }), { wrapper });
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Network error'))));

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        const errorPromise = captureRejection(promise);
        await vi.runAllTimersAsync();
        await errorPromise;
      });

      expect(mockOperation).toHaveBeenCalledTimes(5);
    });

    it('should use custom isRetryable function', async () => {
      const customIsRetryable = vi.fn().mockReturnValue(false);
      const { result } = renderHook(() =>
        useRetry({ isRetryable: customIsRetryable }),
        { wrapper }
      );
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Custom error'))));

      await act(async () => {
        try {
          await result.current.executeWithRetry(mockOperation);
        } catch (error: any) {
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
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
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
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Network error'))));

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        const errorPromise = captureRejection(promise);
        await vi.runAllTimersAsync();
        await errorPromise;
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
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
        .mockResolvedValue('success');

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
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
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
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Network error'))));

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        const errorPromise = captureRejection(promise);

        // The exponential backoff should be capped at maxDelayMs
        await vi.advanceTimersByTimeAsync(1000); // First retry: 1000ms
        await vi.advanceTimersByTimeAsync(2000); // Second retry: 2000ms (capped)
        await vi.advanceTimersByTimeAsync(2000); // Third retry: 2000ms (capped)
        await vi.advanceTimersByTimeAsync(2000); // Fourth retry: 2000ms (capped)

        await errorPromise;
      });

      expect(mockOperation).toHaveBeenCalledTimes(5);
    });
  });

  describe('State Management', () => {
    it('should update state during retry process', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 3 }), { wrapper });
      const mockOperation = vi.fn()
        .mockImplementationOnce(() => markHandled(Promise.reject(new Error('Network error'))))
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
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Network error'))));

      expect(result.current.canRetry).toBe(false);

      let errorPromise: Promise<Error | undefined>;
      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        errorPromise = captureRejection(promise);
        await Promise.resolve();
      });

      // After first failure, should be able to retry
      expect(result.current.canRetry).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        await errorPromise;
      });

      // After max attempts, should not be able to retry
      expect(result.current.canRetry).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup timeouts on unmount', async () => {
      const { result, unmount } = renderHook(() => useRetry(), { wrapper });

      act(() => {
        // Start an operation that will need retry
        result.current.executeWithRetry(() => markHandled(Promise.reject(new Error('Network error')))).catch(() => { });
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
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('fetch failed'))));

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        const errorPromise = captureRejection(promise);
        await vi.runAllTimersAsync();
        await errorPromise;
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should retry database errors by default', async () => {
      const { result } = renderHook(() => useRetry({ maxAttempts: 2 }), { wrapper });
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('database connection failed'))));

      await act(async () => {
        const promise = result.current.executeWithRetry(mockOperation);
        const errorPromise = captureRejection(promise);
        await vi.runAllTimersAsync();
        await errorPromise;
      });

      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should not retry validation errors by default', async () => {
      const { result } = renderHook(() => useRetry(), { wrapper });
      const mockOperation = vi.fn().mockImplementation(() => markHandled(Promise.reject(new Error('Invalid input'))));

      await act(async () => {
        try {
          await result.current.executeWithRetry(mockOperation);
        } catch (error: any) {
          expect(error.message).toBe('Invalid input');
        }
      });

      expect(mockOperation).toHaveBeenCalledOnce();
    });
  });
});
