/**
 * Base API client with authentication, error handling, and type safety
 * Uses shared types for complete type safety between frontend and backend
 */

import type { ApiResponse, PaginatedResponse } from '@shared/types';
import { buildApiBaseUrl } from '../../utils/protocol';
import { AuthSessionChangedError, isAuthRejection } from './authFailure';
import { clearConfirmedProfile, readTokenClaims } from './authOfflineIdentity';

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

interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private reqSeq: number = 0;
  private sessionGeneration = 0;
  private refreshInFlight: { generation: number; promise: Promise<ApiResponse<SessionTokens>> } | null = null;

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
  setToken(token: string | null, preserveSession = false): void {
    if (!preserveSession) this.sessionGeneration++;
    if (!token || readTokenClaims(token).subject !== readTokenClaims(this.token).subject) {
      clearConfirmedProfile();
    }
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
      data = await this.withTimeout(isJson ? respForParsing.json() : respForParsing.text());
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new Error('Failed to parse API response.');
    }

    this.debug('Response parsed', { status: response.status, ok: response.ok });

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

  getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  assertSession(generation: number): void {
    if (generation !== this.sessionGeneration) throw new AuthSessionChangedError();
  }

  clearSession(notify = false): void {
    const hadSession = !!this.token || !!this.getRefreshToken();
    this.setToken(null);
    try { localStorage.removeItem('refresh_token'); } catch { /* storage unavailable */ }
    if (notify && hadSession) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  }

  private getRefreshToken(): string | null {
    try { return localStorage.getItem('refresh_token'); } catch { return null; }
  }

  private debug(event: string, details: Record<string, unknown>): void {
    try {
      if (localStorage.getItem('DEBUG_API') === '1' || import.meta.env.DEV) {
        // Only call with request metadata; never log bodies, headers or response payloads.
        console.debug(`[api] ${event}`, details);
      }
    } catch { /* diagnostics must not affect requests */ }
  }

  private async withTimeout<T>(pending: Promise<T>, onTimeout?: () => void): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            onTimeout?.();
            reject(new ApiRequestError('Connection timed out. Please try again when connected.', 0, 'TIMEOUT'));
          }, 10_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchWithTimeout(url: string, config: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const relayAbort = () => controller.abort();
    if (config.signal?.aborted) controller.abort();
    config.signal?.addEventListener('abort', relayAbort, { once: true });
    try {
      return await this.withTimeout(fetch(url, { ...config, signal: controller.signal }), relayAbort);
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ApiRequestError('Network error. Please check your connection.', 0, 'NETWORK_ERROR');
      }
      throw error;
    } finally {
      config.signal?.removeEventListener('abort', relayAbort);
    }
  }

  /** Share refresh work within one session, and never publish a stale result. */
  async refreshSession(): Promise<ApiResponse<SessionTokens>> {
    const generation = this.sessionGeneration;
    if (this.refreshInFlight?.generation === generation) return this.refreshInFlight.promise;
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) throw new Error('No refresh token available');
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new ApiRequestError('Offline. Your session will be checked when connected.', 0, 'OFFLINE');
    }
    const subject = readTokenClaims(this.token).subject;
    const promise = (async () => {
      try {
        const response = await this.fetchWithTimeout(`${this.baseURL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        this.assertSession(generation);
        if (response.status === 401 || response.status === 403) this.clearSession(true);
        const result = await this.handleResponse<SessionTokens>(response);
        this.assertSession(generation);
        const tokens = result.data;
        if (!result.success || !tokens?.access_token || !tokens.refresh_token ||
          (subject && readTokenClaims(tokens.access_token).subject !== subject)) {
          throw new ApiRequestError('Invalid refresh response. Please try again when connected.', 0, 'INVALID_REFRESH_RESPONSE');
        }
        this.setToken(tokens.access_token, true);
        try { localStorage.setItem('refresh_token', tokens.refresh_token); } catch { /* storage unavailable */ }
        window.dispatchEvent(new CustomEvent('auth:refreshed'));
        return result;
      } catch (error) {
        // A rejection already invalidated this generation; retain its error status.
        if (!isAuthRejection(error)) this.assertSession(generation);
        throw error;
      }
    })();
    this.refreshInFlight = { generation, promise };
    try {
      return await promise;
    } finally {
      if (this.refreshInFlight?.promise === promise) this.refreshInFlight = null;
    }
  }

  /** Make a request; a transient refresh failure must not become unauthorized. */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const generation = this.sessionGeneration;
    const path = endpoint.split('?')[0];
    const sessionRequest = !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(path);
    const url = `${this.baseURL}${endpoint}`;
    const buildConfig = (): RequestInit => ({
      ...options,
      headers: sessionRequest ? this.createHeaders(options.headers as Record<string, string>) : {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(path === '/auth/logout' && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    const fetchRequest = async () => {
      this.assertSession(generation);
      // Exclude query strings from diagnostics as they may contain sensitive values.
      this.debug('Request', { id: ++this.reqSeq, method: options.method || 'GET', path });
      const response = await this.fetchWithTimeout(url, buildConfig());
      this.assertSession(generation);
      this.debug('Fetch completed', { path, status: response.status, ok: response.ok });
      return response;
    };

    if (sessionRequest) {
      const expiry = readTokenClaims(this.token).expiryMs;
      if (expiry !== null && expiry - Date.now() <= 60_000 && this.getRefreshToken()) {
        await this.refreshSession();
        this.assertSession(generation);
      }
    }
    let response = await fetchRequest();
    if (sessionRequest && response.status === 401 && this.getRefreshToken()) {
      await this.refreshSession();
      response = await fetchRequest();
    }
    const definitiveRejection = sessionRequest && (response.status === 401 ||
      (response.status === 403 && ['/auth/profile', '/auth/me'].includes(path)));
    if (definitiveRejection) this.clearSession(true);
    const result = await this.handleResponse<T>(response);
    this.assertSession(generation);
    return result;
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
