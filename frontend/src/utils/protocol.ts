/**
 * Protocol Detection Utility
 * Provides secure protocol detection for API and WebSocket connections
 */

/**
 * Get the appropriate HTTP protocol (http or https)
 * - In production, always use HTTPS
 * - In development, match the page protocol
 */
export function getApiProtocol(): 'https' | 'http' {
  // Check environment variable override
  if (import.meta.env.VITE_API_URL) {
    const url = import.meta.env.VITE_API_URL as string;
    return url.startsWith('https') ? 'https' : 'http';
  }

  // In production builds, prefer HTTPS
  if (import.meta.env.PROD) {
    return 'https';
  }

  // In development, match the current page protocol
  if (typeof window !== 'undefined') {
    return window.location.protocol === 'https:' ? 'https' : 'http';
  }

  // Default fallback for SSR or non-browser environments
  return 'http';
}

/**
 * Get the appropriate WebSocket protocol (ws or wss)
 * Matches the HTTP protocol for consistency
 */
export function getWsProtocol(): 'wss' | 'ws' {
  return getApiProtocol() === 'https' ? 'wss' : 'ws';
}

/**
 * Build the API base URL with protocol detection
 * @param port - Server port (default: 3001)
 * @param path - API path (default: /api/v1)
 */
export function buildApiBaseUrl(port: number = 3001, path: string = '/api/v1'): string {
  // Use environment variable if set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL as string;
  }

  const protocol = getApiProtocol();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  return `${protocol}://${hostname}:${port}${path}`;
}

/**
 * Build the WebSocket server URL with protocol detection
 * @param port - Server port (default: 3001)
 */
export function buildWsUrl(port: number = 3001): string {
  // Use environment variable if set, converting http(s) to ws(s)
  if (import.meta.env.VITE_API_URL) {
    const apiUrl = import.meta.env.VITE_API_URL as string;
    return apiUrl
      .replace(/^https:/, 'wss:')
      .replace(/^http:/, 'ws:')
      .replace(/\/api\/v1$/, '');
  }

  const protocol = getWsProtocol();
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

  return `${protocol}://${hostname}:${port}`;
}
