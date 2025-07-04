import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { errorService, ErrorService } from '../../../src/services/errorService';
import type { ErrorInfo } from '../../../src/hooks/useErrorHandler';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock fetch for error reporting
global.fetch = vi.fn();

// Mock console methods
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('ErrorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('Error Logging', () => {
    it('should log error with all required fields', async () => {
      const errorInfo: ErrorInfo = {
        category: 'network',
        severity: 'medium',
        retryable: true,
        userMessage: 'Connection problem',
        technicalMessage: 'Failed to fetch',
        context: 'TestComponent',
        timestamp: Date.now()
      };

      await errorService.logError(errorInfo);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({
          category: 'network',
          severity: 'medium',
          context: 'TestComponent'
        })
      );
    });

    it('should log error without optional fields', async () => {
      const errorInfo: ErrorInfo = {
        category: 'system',
        severity: 'high',
        retryable: false,
        userMessage: 'System error',
        technicalMessage: 'Unexpected error',
        timestamp: Date.now()
      };

      await errorService.logError(errorInfo);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]'),
        expect.objectContaining({
          category: 'system',
          severity: 'high'
        })
      );
    });

    it('should store error in localStorage', async () => {
      const errorInfo: ErrorInfo = {
        category: 'database',
        severity: 'high',
        retryable: true,
        userMessage: 'Database error',
        technicalMessage: 'IndexedDB failed',
        timestamp: Date.now()
      };

      await errorService.logError(errorInfo);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'grassroots_error_logs',
        expect.stringContaining('"category":"database"')
      );
    });

    it('should handle localStorage errors gracefully', async () => {
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const errorInfo: ErrorInfo = {
        category: 'system',
        severity: 'low',
        retryable: false,
        userMessage: 'Test error',
        technicalMessage: 'Test error',
        timestamp: Date.now()
      };

      await expect(errorService.logError(errorInfo)).resolves.not.toThrow();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save error logs'),
        expect.any(Error)
      );
    });
  });

  describe('Error Reporting', () => {
    it('should report critical errors immediately', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true })
      });

      const errorInfo: ErrorInfo = {
        category: 'system',
        severity: 'critical',
        retryable: false,
        userMessage: 'Critical system failure',
        technicalMessage: 'System crashed',
        timestamp: Date.now()
      };

      await errorService.reportError(errorInfo);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/errors'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('"severity":"critical"')
        })
      );
    });

    it('should not report low severity errors immediately', async () => {
      const errorInfo: ErrorInfo = {
        category: 'validation',
        severity: 'low',
        retryable: false,
        userMessage: 'Validation error',
        technicalMessage: 'Invalid input',
        timestamp: Date.now()
      };

      await errorService.reportError(errorInfo);

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle network errors during reporting', async () => {
      (global.fetch as Mock).mockRejectedValue(new Error('Network error'));

      const errorInfo: ErrorInfo = {
        category: 'system',
        severity: 'critical',
        retryable: false,
        userMessage: 'Critical error',
        technicalMessage: 'System failure',
        timestamp: Date.now()
      };

      await errorService.reportError(errorInfo);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to report error'),
        expect.any(Error)
      );
    });

    it('should handle server errors during reporting', async () => {
      (global.fetch as Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const errorInfo: ErrorInfo = {
        category: 'system',
        severity: 'critical',
        retryable: false,
        userMessage: 'Critical error',
        technicalMessage: 'System failure',
        timestamp: Date.now()
      };

      await errorService.reportError(errorInfo);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to report error'),
        expect.stringContaining('500')
      );
    });
  });

  describe('Error Retrieval', () => {
    it('should retrieve stored errors', () => {
      const storedErrors = [
        {
          id: 'error-1',
          timestamp: Date.now() - 1000,
          errorInfo: {
            category: 'network',
            severity: 'medium',
            retryable: true,
            userMessage: 'Network error',
            technicalMessage: 'Fetch failed',
            timestamp: Date.now() - 1000
          },
          userAgent: 'test-agent',
          url: 'http://test.com',
          sessionId: 'session-1'
        },
        {
          id: 'error-2',
          timestamp: Date.now(),
          errorInfo: {
            category: 'database',
            severity: 'high',
            retryable: false,
            userMessage: 'Database error',
            technicalMessage: 'DB failed',
            timestamp: Date.now()
          },
          userAgent: 'test-agent',
          url: 'http://test.com',
          sessionId: 'session-1'
        }
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedErrors));

      const errors = errorService.getErrorLogs();

      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatchObject({
        id: 'error-1',
        errorInfo: {
          category: 'network',
          severity: 'medium'
        }
      });
    });

    it('should return empty array when no errors stored', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const errors = errorService.getErrorLogs();

      expect(errors).toEqual([]);
    });

    it('should handle corrupted localStorage data', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');

      const errors = errorService.getErrorLogs();

      expect(errors).toEqual([]);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse stored error logs'),
        expect.any(Error)
      );
    });

    it('should filter errors by category', () => {
      const storedErrors = [
        { 
          id: 'error-1', 
          timestamp: Date.now(),
          errorInfo: { category: 'network', severity: 'medium', retryable: true, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-2', 
          timestamp: Date.now(),
          errorInfo: { category: 'database', severity: 'high', retryable: false, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-3', 
          timestamp: Date.now(),
          errorInfo: { category: 'network', severity: 'low', retryable: true, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        }
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedErrors));

      const networkErrors = errorService.getErrorLogsByCategory('network');

      expect(networkErrors).toHaveLength(2);
      expect(networkErrors.every(error => error.errorInfo.category === 'network')).toBe(true);
    });

    it('should filter errors by severity', () => {
      const storedErrors = [
        { 
          id: 'error-1', 
          timestamp: Date.now(),
          errorInfo: { category: 'network', severity: 'medium', retryable: true, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-2', 
          timestamp: Date.now(),
          errorInfo: { category: 'database', severity: 'high', retryable: false, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-3', 
          timestamp: Date.now(),
          errorInfo: { category: 'system', severity: 'high', retryable: false, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        }
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedErrors));

      const highSeverityErrors = errorService.getErrorLogsBySeverity('high');

      expect(highSeverityErrors).toHaveLength(2);
      expect(highSeverityErrors.every(error => error.errorInfo.severity === 'high')).toBe(true);
    });

    it('should filter errors by time range', () => {
      const now = Date.now();
      const storedErrors = [
        { 
          id: 'error-1', 
          timestamp: now - 2000,
          errorInfo: { category: 'network', severity: 'medium', retryable: true, userMessage: 'msg', technicalMessage: 'tech', timestamp: now - 2000 },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-2', 
          timestamp: now - 500,
          errorInfo: { category: 'database', severity: 'high', retryable: false, userMessage: 'msg', technicalMessage: 'tech', timestamp: now - 500 },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-3', 
          timestamp: now,
          errorInfo: { category: 'system', severity: 'low', retryable: false, userMessage: 'msg', technicalMessage: 'tech', timestamp: now },
          userAgent: 'test', url: 'test', sessionId: 'test'
        }
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedErrors));

      const recentErrors = errorService.getRecentErrorLogs(1); // Last 1 hour

      expect(recentErrors).toHaveLength(3); // All errors are within 1 hour
      expect(recentErrors.every(error => error.timestamp >= now - 60 * 60 * 1000)).toBe(true);
    });
  });

  describe('Error Cleanup', () => {
    it('should clear all stored errors', () => {
      errorService.clearErrorLogs();

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('grassroots_error_logs');
    });

    it('should limit stored errors to maxStoredErrors', async () => {
      // Set up a service with a low limit
      const limitedService = new ErrorService({ maxStoredErrors: 2 });
      
      const existingErrors = [
        { 
          id: 'error-1', 
          timestamp: Date.now() - 1000,
          errorInfo: { category: 'network', severity: 'medium', retryable: true, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() - 1000 },
          userAgent: 'test', url: 'test', sessionId: 'test'
        }
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(existingErrors));

      const newError: ErrorInfo = {
        category: 'system',
        severity: 'low',
        retryable: false,
        userMessage: 'New error',
        technicalMessage: 'New error',
        timestamp: Date.now()
      };

      await limitedService.logError(newError);

      // Should store only up to maxStoredErrors
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
      const storedData = mockLocalStorage.setItem.mock.calls[0][1];
      const parsedData = JSON.parse(storedData);
      
      expect(parsedData.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Error Statistics', () => {
    it('should provide error statistics', () => {
      const storedErrors = [
        { 
          id: 'error-1', 
          timestamp: Date.now(),
          errorInfo: { category: 'network', severity: 'medium', retryable: true, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-2', 
          timestamp: Date.now(),
          errorInfo: { category: 'network', severity: 'high', retryable: false, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-3', 
          timestamp: Date.now(),
          errorInfo: { category: 'database', severity: 'low', retryable: true, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        },
        { 
          id: 'error-4', 
          timestamp: Date.now(),
          errorInfo: { category: 'system', severity: 'critical', retryable: false, userMessage: 'msg', technicalMessage: 'tech', timestamp: Date.now() },
          userAgent: 'test', url: 'test', sessionId: 'test'
        }
      ];

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(storedErrors));

      const stats = errorService.getErrorStats();

      expect(stats).toMatchObject({
        total: 4,
        byCategory: {
          network: 2,
          database: 1,
          system: 1
        },
        bySeverity: {
          low: 1,
          medium: 1,
          high: 1,
          critical: 1
        }
      });
    });

    it('should handle empty error log for statistics', () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const stats = errorService.getErrorStats();

      expect(stats).toMatchObject({
        total: 0,
        byCategory: {},
        bySeverity: {}
      });
    });
  });
});