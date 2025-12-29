/**
 * Base API client with authentication, error handling, and type safety
 * Uses shared types for complete type safety between frontend and backend
 */

import type { ApiResponse, PaginatedResponse } from '@shared/types';
import { buildApiBaseUrl } from '../../utils/protocol';

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  response?: any;
  retryAfterMs?: number;

  constructor(message: string, status: number, code?: string, response?: any, retryAfterMs?: number) {
    super(message);
    // Ensure enumerable properties for JSON.stringify and spreading
    this.status = status;
    this.code = code;
    this.message = message;
    this.retryAfterMs = retryAfterMs;

    Object.defineProperty(this, 'message', { enumerable: true, writable: true });
    Object.defineProperty(this, 'status', { enumerable: true, writable: true });
    Object.defineProperty(this, 'code', { enumerable: true, writable: true });
    Object.defineProperty(this, 'response', { enumerable: true, writable: true });
    Object.defineProperty(this, 'retryAfterMs', { enumerable: true, writable: true });
  }
}

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private reqSeq: number = 0;

  constructor(baseURL: string = buildApiBaseUrl()) {
    this.baseURL = baseURL;
    this.loadToken();
  }

  /**
   * Load token from localStorage
   */
  private loadToken(): void {
    try {
      this.token = localStorage.getItem('access_token');
    } catch (error) {
      console.warn('Failed to load token from localStorage:', error);
      this.token = null;
    }
  }

  /**
   * Set authentication token
   */
  setToken(token: string | null): void {
    this.token = token;
    if (token) {
      try {
        localStorage.setItem('access_token', token);
      } catch (error) {
        console.warn('Failed to save token to localStorage:', error);
      }
    } else {
      try {
        localStorage.removeItem('access_token');
      } catch (error) {
        console.warn('Failed to remove token from localStorage:', error);
      }
    }
  }

  /**
   * Get current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token;
  }

  /**
   * Create request headers with authentication
   */
  private createHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...additionalHeaders,
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Handle API response and errors
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');

    let data: any;
    try {
      if (response.bodyUsed) {
        // Body already read, return a generic error or handle accordingly
        throw new Error('Response body already consumed');
      }
      const respForParsing = response.clone();
      data = isJson ? await respForParsing.json() : await respForParsing.text();
    } catch (error) {
      throw new Error(`Failed to parse response: ${error}`);
    }

    // Debug parsed response
    try {
      const debug = (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_API') === '1') || (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV);
      if (debug) {
        const preview = typeof data === 'string' ? data.slice(0, 512) : data;
        // eslint-disable-next-line no-console
        console.debug('[api] Response parsed', { status: response.status, ok: response.ok, url: response.url, data: preview });
      }
    } catch { }

    if (!response.ok) {
      const retryAfterHeader = response.headers.get('Retry-After');
      let retryAfterMs: number | undefined = undefined;
      if (retryAfterHeader) {
        const seconds = Number(retryAfterHeader);
        if (Number.isFinite(seconds)) {
          retryAfterMs = Math.max(0, seconds * 1000);
        } else {
          const until = Date.parse(retryAfterHeader);
          if (!Number.isNaN(until)) retryAfterMs = Math.max(0, until - Date.now());
        }
      }

      const apiError: ApiError = {
        message: data?.error || data?.message || `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
        code: data?.code,
      };

      // Handle specific error cases
      if (response.status === 401) {
        // Token expired or invalid - clear it
        this.setToken(null);
        apiError.message = 'Authentication required. Please log in again.';
        // Only show session-expired toast if user has a refresh token (i.e., was actually logged in)
        try {
          const hasRefresh = (() => { try { return !!localStorage.getItem('refresh_token'); } catch { return false; } })();
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          if (hasRefresh) {
            const toast = (window as any).__toastApi?.current;
            toast?.showError?.('Your session expired. Please sign in again.');
          }
        } catch { }
      }

      throw new ApiRequestError(apiError.message, apiError.status, apiError.code, data, retryAfterMs);
    }

    // Backend APIs return { success: true, data: T } format
    if (data && typeof data === 'object' && 'success' in data) {
      return data as ApiResponse<T>;
    }

    // Fallback for non-standard responses
    return {
      success: true,
      data: data as T,
    };
  }

  /**
   * Make a generic HTTP request
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    const buildConfig = (opts: RequestInit = {}): RequestInit => ({
      ...opts,
      headers: this.createHeaders(opts.headers as Record<string, string>),
    });

    const decodeExpMs = (): number | null => {
      try {
        const t = this.getToken();
        if (!t) return null;
        const parts = t.split('.');
        if (parts.length < 2) return null;
        const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        const payload = JSON.parse(payloadJson);
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
      } catch { return null; }
    };

    const proactiveRefreshIfNeeded = async (): Promise<void> => {
      const expMs = decodeExpMs();
      if (!expMs) return;
      const now = Date.now();
      const timeLeft = expMs - now;
      const hasRefresh = (() => { try { return !!localStorage.getItem('refresh_token'); } catch { return false; } })();
      if (hasRefresh && timeLeft <= 60_000) {
        try {
          const refreshToken = localStorage.getItem('refresh_token') as string;
          const refreshResp = await fetch(`${this.baseURL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
          });
          if (refreshResp.ok) {
            const data = await refreshResp.json();
            if (data?.access_token) {
              this.setToken(data.access_token);
              try { if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token); } catch { }
              try { window.dispatchEvent(new CustomEvent('auth:refreshed')); } catch { }
            }
          }
        } catch {
          // ignore preflight refresh errors; the request may still succeed
        }
      }
    };

    const attemptRefreshAndRetry = async (originalResponse: Response): Promise<ApiResponse<T>> => {
      try {
        // Try to parse error to check if token expired
        const hasRefresh = (() => {
          try {
            return !!localStorage.getItem('refresh_token');
          } catch {
            return false;
          }
        })();

        if (!hasRefresh) {
          // No refresh token available, clear and return original error silently for guests
          this.setToken(null);
          try { window.dispatchEvent(new CustomEvent('auth:unauthorized')); } catch { }
          return await this.handleResponse<T>(originalResponse);
        }

        // Attempt to refresh token
        const refreshToken = localStorage.getItem('refresh_token') as string;
        const refreshResp = await fetch(`${this.baseURL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!refreshResp.ok) {
          // Refresh failed
          this.setToken(null);
          try { localStorage.removeItem('refresh_token'); } catch { }
          try { window.dispatchEvent(new CustomEvent('auth:unauthorized')); } catch { }
          // Return original error
          return await this.handleResponse<T>(originalResponse);
        }

        const refreshData = await refreshResp.json();
        if (refreshData?.access_token) {
          this.setToken(refreshData.access_token);
          try { if (refreshData.refresh_token) localStorage.setItem('refresh_token', refreshData.refresh_token); } catch { }
          try { window.dispatchEvent(new CustomEvent('auth:refreshed')); } catch { }

          // Retry original request with new token
          const retryResp = await fetch(url, buildConfig(options));
          return await this.handleResponse<T>(retryResp);
        }

        // If no access token in response, treat as failure
        this.setToken(null);
        try { localStorage.removeItem('refresh_token'); } catch { }
        try {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          const toast = (window as any).__toastApi?.current;
          toast?.showError?.('Your session expired. Please sign in again.');
        } catch { }
        return await this.handleResponse<T>(originalResponse);
      } catch (err) {
        // Any error during refresh -> clear and propagate
        this.setToken(null);
        try { localStorage.removeItem('refresh_token'); } catch { }
        try { window.dispatchEvent(new CustomEvent('auth:unauthorized')); } catch { }
        // Fallback to original error handling
        return await this.handleResponse<T>(originalResponse);
      }
    };

    try {
      // Proactive refresh to implement sliding session
      await proactiveRefreshIfNeeded();

      // Debug outbound request
      try {
        const debug = (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_API') === '1') || (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV);
        if (debug) {
          const id = ++this.reqSeq;
          const bodyPreview = typeof (options.body as any) === 'string' ? (options.body as string).slice(0, 512) : options.body;
          // eslint-disable-next-line no-console
          console.debug('[api] Request', { id, method: options.method || 'GET', url, body: bodyPreview });
        }
      } catch { }

      const response = await fetch(url, buildConfig(options));
      try {
        const debug = (typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_API') === '1') || (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV);
        if (debug) {
          // eslint-disable-next-line no-console
          console.debug('[api] Fetch completed', { url, status: response.status, ok: response.ok });
        }
      } catch { }
      if (response.status === 401) {
        // Try refresh logic and retry once
        const result = await attemptRefreshAndRetry(response);
        return result;
      }
      return await this.handleResponse<T>(response);
    } catch (error) {
      // Network or other errors
      if (error instanceof Error && error.name === 'TypeError') {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: URLSearchParams): Promise<ApiResponse<T>> {
    const url = params ? `${endpoint}?${params.toString()}` : endpoint;
    return this.request<T>(url, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * Paginated GET request
   */
  async paginated<T>(
    endpoint: string,
    params: {
      page?: number;
      limit?: number;
      search?: string;
      [key: string]: any;
    } = {}
  ): Promise<PaginatedResponse<T>> {
    const searchParams = new URLSearchParams();

    // Add pagination params
    if (params.page !== undefined) {
      searchParams.append('page', params.page.toString());
    }
    if (params.limit !== undefined) {
      searchParams.append('limit', params.limit.toString());
    }
    if (params.search) {
      searchParams.append('search', params.search);
    }

    // Add other params
    Object.entries(params).forEach(([key, value]) => {
      if (key !== 'page' && key !== 'limit' && key !== 'search' && value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await this.get<PaginatedResponse<T>>(endpoint, searchParams);

    // Backend returns paginated data directly in the data field
    return response.data as PaginatedResponse<T>;
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export for testing
export default apiClient;
