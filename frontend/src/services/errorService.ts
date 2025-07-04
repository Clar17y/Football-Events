/**
 * Error Logging Service
 * 
 * Handles error logging, storage, and optional remote reporting
 */

import type { ErrorInfo } from '../hooks/useErrorHandler';

/**
 * Stored error log entry
 */
interface ErrorLogEntry {
  id: string;
  timestamp: number;
  errorInfo: ErrorInfo;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId: string;
  stackTrace?: string;
  additionalData?: Record<string, any>;
}

/**
 * Error service configuration
 */
interface ErrorServiceConfig {
  /** Maximum number of errors to store locally */
  maxStoredErrors: number;
  /** Whether to enable remote reporting */
  enableRemoteReporting: boolean;
  /** Remote endpoint for error reporting */
  remoteEndpoint?: string;
  /** API key for remote service */
  apiKey?: string;
  /** Whether to log to console */
  logToConsole: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ErrorServiceConfig = {
  maxStoredErrors: 100,
  enableRemoteReporting: false,
  logToConsole: true
};

/**
 * Error Service Class
 */
class ErrorService {
  private config: ErrorServiceConfig;
  private sessionId: string;
  private storageKey = 'grassroots_error_logs';

  constructor(config: Partial<ErrorServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get stored error logs from localStorage
   */
  private getStoredErrors(): ErrorLogEntry[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to parse stored error logs:', error);
      return [];
    }
  }

  /**
   * Save error logs to localStorage
   */
  private saveErrorLogs(errors: ErrorLogEntry[]): void {
    try {
      // Limit the number of stored errors
      const limitedErrors = errors.slice(0, this.config.maxStoredErrors);
      localStorage.setItem(this.storageKey, JSON.stringify(limitedErrors));
    } catch (error) {
      console.warn('Failed to save error logs:', error);
    }
  }

  /**
   * Log an error
   */
  async logError(
    errorInfo: ErrorInfo,
    stackTrace?: string,
    additionalData?: Record<string, any>
  ): Promise<void> {
    const errorEntry: ErrorLogEntry = {
      id: this.generateErrorId(),
      timestamp: Date.now(),
      errorInfo,
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.sessionId,
      stackTrace,
      additionalData
    };

    // Log to console if enabled
    if (this.config.logToConsole) {
      this.logToConsole(errorEntry);
    }

    // Store locally
    this.storeErrorLocally(errorEntry);

    // Send to remote service if enabled
    if (this.config.enableRemoteReporting) {
      await this.sendToRemoteService(errorEntry);
    }
  }

  /**
   * Log to console with formatting
   */
  private logToConsole(errorEntry: ErrorLogEntry): void {
    const { errorInfo } = errorEntry;
    
    const logData = {
      category: errorInfo.category,
      severity: errorInfo.severity,
      context: errorInfo.context
    };

    console.error('[ERROR]', logData);
  }

  /**
   * Store error locally
   */
  private storeErrorLocally(errorEntry: ErrorLogEntry): void {
    const existingErrors = this.getStoredErrors();
    const updatedErrors = [errorEntry, ...existingErrors];
    this.saveErrorLogs(updatedErrors);
  }

  /**
   * Send error to remote service
   */
  private async sendToRemoteService(errorEntry: ErrorLogEntry): Promise<void> {
    if (!this.config.remoteEndpoint) {
      return;
    }

    try {
      const response = await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify(errorEntry)
      });

      if (!response.ok) {
        throw new Error(`Remote logging failed: ${response.status}`);
      }
    } catch (error) {
      console.warn('Failed to send error to remote service:', error);
      // Don't throw here to avoid recursive error logging
    }
  }

  /**
   * Report error to remote service (public method for testing)
   */
  async reportError(errorInfo: ErrorInfo): Promise<void> {
    // Only report critical and high severity errors immediately
    if (errorInfo.severity === 'critical' || errorInfo.severity === 'high') {
      const errorEntry: ErrorLogEntry = {
        id: this.generateErrorId(),
        timestamp: Date.now(),
        errorInfo,
        userAgent: navigator.userAgent,
        url: window.location.href,
        sessionId: this.sessionId
      };

      try {
        const endpoint = this.config.remoteEndpoint || '/api/errors';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
          },
          body: JSON.stringify(errorEntry)
        });

        if (!response.ok) {
          console.warn('Failed to report error', `${response.status}`);
          return;
        }
      } catch (error) {
        console.warn('Failed to report error', error);
      }
    }
  }

  /**
   * Get all stored error logs
   */
  getErrorLogs(): ErrorLogEntry[] {
    return this.getStoredErrors();
  }

  /**
   * Get error logs by category
   */
  getErrorLogsByCategory(category: string): ErrorLogEntry[] {
    return this.getStoredErrors().filter(
      error => error.errorInfo.category === category
    );
  }

  /**
   * Get error logs by severity
   */
  getErrorLogsBySeverity(severity: string): ErrorLogEntry[] {
    return this.getStoredErrors().filter(
      error => error.errorInfo.severity === severity
    );
  }

  /**
   * Get recent error logs (last N hours)
   */
  getRecentErrorLogs(hours: number = 24): ErrorLogEntry[] {
    const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
    return this.getStoredErrors().filter(
      error => error.timestamp > cutoffTime
    );
  }

  /**
   * Clear all stored error logs
   */
  clearErrorLogs(): void {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Export error logs as JSON
   */
  exportErrorLogs(): string {
    const errors = this.getStoredErrors();
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      sessionId: this.sessionId,
      totalErrors: errors.length,
      errors
    }, null, 2);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
    recent24h: number;
  } {
    const errors = this.getStoredErrors();
    const recent24h = this.getRecentErrorLogs(24);

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};

    errors.forEach(error => {
      const category = error.errorInfo.category;
      const severity = error.errorInfo.severity;

      byCategory[category] = (byCategory[category] || 0) + 1;
      bySeverity[severity] = (bySeverity[severity] || 0) + 1;
    });

    return {
      total: errors.length,
      byCategory,
      bySeverity,
      recent24h: recent24h.length
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ErrorServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export singleton instance
export const errorService = new ErrorService();

// Export class for testing
export { ErrorService };

// Export types
export type { ErrorLogEntry, ErrorServiceConfig };

export default errorService;