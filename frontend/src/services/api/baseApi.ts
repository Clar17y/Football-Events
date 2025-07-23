/**
 * Base API client with authentication, error handling, and type safety
 * Uses shared types for complete type safety between frontend and backend
 */

import type { ApiResponse, PaginatedResponse } from '@shared/types';

export interface ApiError {
  message: string;
  status: number;
  code?: string;
}

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string = (() => {
    // Smart API URL detection - works for both PC and mobile automatically
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
    
    // Auto-detect based on current hostname
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // PC development
      return 'http://localhost:3001/api/v1';
    } else {
      // Mobile or network access - use the same IP as frontend
      return `http://${hostname}:3001/api/v1`;
    }
  })()) {
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
      data = isJson ? await response.json() : await response.text();
    } catch (error) {
      throw new Error(`Failed to parse response: ${error}`);
    }

    if (!response.ok) {
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
      }

      throw apiError;
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
    
    const config: RequestInit = {
      ...options,
      headers: this.createHeaders(options.headers as Record<string, string>),
    };

    try {
      const response = await fetch(url, config);
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