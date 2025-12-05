/**
 * Network detection utilities for offline-first functionality
 * 
 * Requirements: 6.1 - Network detection mechanism using navigator.onLine and network events
 */

/**
 * Check if the device is currently online
 * Uses navigator.onLine as the primary indicator
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Check if a request should use offline fallback
 * Returns true if offline OR if the error is a network error
 * 
 * Requirements: 6.1 - Detect network errors and fall back to local storage
 */
export function shouldUseOfflineFallback(error?: Error | unknown): boolean {
  // If explicitly offline, always use fallback
  if (!isOnline()) return true;
  
  // If no error provided, check online status only
  if (!error) return false;
  
  // Check for network-related errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const name = error.name;
    
    // TypeError is thrown by fetch when network is unavailable
    if (name === 'TypeError') return true;
    
    // Check for common network error messages
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('offline') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return true;
    }
  }
  
  // Check for API error objects with status codes
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    // 5xx errors might be temporary server issues - could use offline fallback
    // But 4xx errors are validation/auth errors - should NOT use fallback
    if (status >= 500 && status < 600) return true;
    if (status === 0) return true; // Status 0 often indicates network failure
  }
  
  return false;
}

/**
 * Get the authenticated user's ID from the JWT token
 * Returns null if not authenticated or token is invalid
 * 
 * Requirements: 5.1 - Use authenticated user ID for offline-created records
 */
export function getAuthUserId(): string | null {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    
    // Decode JWT payload (second part)
    const parts = token.split('.');
    if (parts.length < 2) return null;
    
    // Base64 decode with URL-safe character replacement
    const payloadJson = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    
    // JWT typically stores user ID in 'sub' (subject) or 'userId' claim
    return payload.sub || payload.userId || payload.user_id || payload.id || null;
  } catch {
    return null;
  }
}

/**
 * Get the current user ID - either authenticated user or guest
 * This is the primary function to use when creating records
 * 
 * Requirements: 5.1 - Properly attribute offline-created data to authenticated user
 */
export function getCurrentUserId(): string {
  // Try to get authenticated user ID first
  const authUserId = getAuthUserId();
  if (authUserId) return authUserId;
  
  // Fall back to guest ID
  // Import dynamically to avoid circular dependencies
  const GUEST_ID_KEY = 'guest_id';
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const id = `guest-${crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Subscribe to online/offline events
 * Returns an unsubscribe function
 */
export function subscribeToNetworkChanges(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
