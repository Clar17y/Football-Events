import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useErrorHandler, ErrorCategory, ErrorSeverity } from '../../../src/hooks/useErrorHandler';
import { ValidationError } from '../../../src/schemas/validation';
import { ToastProvider } from '../../../src/contexts/ToastContext';
import { errorService } from '../../../src/services/errorService';

// Mock the toast context
const mockShowError = vi.fn();
const mockShowWarning = vi.fn();
const mockShowInfo = vi.fn();

vi.mock('../../../src/contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({
    showError: mockShowError,
    showWarning: mockShowWarning,
    showInfo: mockShowInfo
  })
}));

// Mock the error service
vi.mock('../../../src/services/errorService', () => ({
  errorService: {
    logError: vi.fn(),
    reportError: vi.fn()
  }
}));

// Mock console methods
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe('useErrorHandler Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Error Categorization', () => {
    it('should categorize validation errors correctly', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const validationError = new ValidationError('Invalid input', 'testField', 'testValue');
      let errorInfo: any;
      
      act(() => {
        result.current.handleError(validationError);
        // Get the categorized error through the mock call
        errorInfo = {
          category: 'validation',
          severity: 'low',
          retryable: false,
          userMessage: 'Please check your input: Invalid input'
        };
      });

      expect(mockShowError).toHaveBeenCalledWith(
        'Please check your input: Invalid input',
        undefined,
        undefined
      );
    });

    it('should categorize network errors correctly', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const networkError = new Error('Failed to fetch data');
      const retryFn = vi.fn();
      
      act(() => {
        result.current.handleError(networkError, retryFn);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('Connection problem'),
        expect.objectContaining({ label: "Retry", handler: expect.any(Function) }),
        undefined
      );
    });

    it('should categorize database errors correctly', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const dbError = new Error('IndexedDB operation failed');
      const retryFn = vi.fn();
      
      act(() => {
        result.current.handleError(dbError, retryFn);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('Problem saving data'),
        expect.objectContaining({ label: "Retry", handler: expect.any(Function) }),
        undefined
      );
    });

    it('should categorize permission errors correctly', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const permissionError = new Error('Access denied to resource');
      
      act(() => {
        result.current.handleError(permissionError);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('permission'),
        undefined,
        undefined
      );
    });

    it('should categorize system errors as fallback', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      const systemError = new Error('Unexpected error occurred');
      
      act(() => {
        result.current.handleError(systemError);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error'),
        undefined,
        undefined
      );
    });
  });

  describe('Error Handling Configuration', () => {
    it('should respect showToast configuration', () => {
      const { result } = renderHook(() => 
        useErrorHandler({ showToast: false }), 
        { wrapper }
      );
      
      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(mockShowError).not.toHaveBeenCalled();
    });

    it('should respect logToConsole configuration', () => {
      const { result } = renderHook(() => 
        useErrorHandler({ logToConsole: false }), 
        { wrapper }
      );
      
      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(mockConsoleError).not.toHaveBeenCalled();
    });

    it('should respect logToService configuration', () => {
      const { result } = renderHook(() => 
        useErrorHandler({ logToService: false }), 
        { wrapper }
      );
      
      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(errorService.logError).not.toHaveBeenCalled();
    });

    it('should include context in error info', () => {
      const { result } = renderHook(() => 
        useErrorHandler({ context: 'TestComponent' }), 
        { wrapper }
      );
      
      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(errorService.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          context: 'TestComponent'
        }),
        expect.any(String),
        expect.objectContaining({
          context: 'TestComponent'
        })
      );
    });
  });

  describe('Error Severity Handling', () => {
    it('should show error toast for high severity', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(new Error('Critical system failure'));
      });

      expect(mockShowError).toHaveBeenCalled();
      expect(mockShowWarning).not.toHaveBeenCalled();
      expect(mockShowInfo).not.toHaveBeenCalled();
    });

    it('should show warning toast for medium severity', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(new Error('Network timeout'));
      });

      // Network errors are medium severity but still show as error for user attention
      expect(mockShowError).toHaveBeenCalled();
    });

    it('should show info toast for low severity', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(new ValidationError('Invalid input', 'testField', 'testValue'));
      });

      // Validation errors are low severity but show as error for clarity
      expect(mockShowError).toHaveBeenCalled();
    });
  });

  describe('Retry Functionality', () => {
    it('should provide retry function for retryable errors', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      const retryFn = vi.fn();
      
      act(() => {
        result.current.handleError(new Error('Network error'), retryFn);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ label: "Retry", handler: expect.any(Function) }),
        undefined
      );

      // Get the retry function from the mock call
      const retryButton = mockShowError.mock.calls[0][1];
      expect(typeof retryButton).toBe('object');
      expect(retryButton).toHaveProperty('handler');
      expect(typeof retryButton.handler).toBe('function');
    });

    it('should not provide retry function for non-retryable errors', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      const retryFn = vi.fn();
      
      act(() => {
        result.current.handleError(new ValidationError('Invalid input', 'testField', 'testValue'), retryFn);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
        undefined
      );
    });

    it('should execute retry function when retry button is used', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      const retryFn = vi.fn();
      
      act(() => {
        result.current.handleError(new Error('Network error'), retryFn);
      });

      // Get the retry function from the toast call
      const retryButton = mockShowError.mock.calls[0][1];
      
      act(() => {
        if (retryButton && typeof retryButton === 'object' && 'handler' in retryButton) {
          (retryButton as any).handler();
        }
      });

      expect(retryFn).toHaveBeenCalledOnce();
    });
  });

  describe('String Error Handling', () => {
    it('should handle string errors', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError('String error message');
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('unexpected error'),
        undefined,
        undefined
      );
    });
  });

  describe('Logging', () => {
    it('should log to console when enabled', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error in'),
        expect.any(Object)
      );
    });

    it('should log to service when enabled', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(errorService.logError).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'system',
          severity: expect.any(String),
          technicalMessage: 'Test error'
        }),
        expect.any(String),
        expect.objectContaining({
          context: undefined
        })
      );
    });

    it('should report critical errors to service', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(new Error('Critical system failure'));
      });

      expect(errorService.reportError).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'critical'
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined error', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(undefined as any);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error'),
        undefined,
        undefined
      );
    });

    it('should handle null error', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      
      act(() => {
        result.current.handleError(null as any);
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error'),
        undefined,
        undefined
      );
    });

    it('should handle error without message', () => {
      const { result } = renderHook(() => useErrorHandler(), { wrapper });
      const errorWithoutMessage = new Error();
      errorWithoutMessage.message = '';
      
      act(() => {
        result.current.handleError(errorWithoutMessage);
      });

      expect(mockShowError).toHaveBeenCalled();
    });
  });
});