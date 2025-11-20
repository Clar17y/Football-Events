// Guest mode utilities
// Provides a stable guest_id and helpers for checking guest state

import { authApi } from '../services/api/authApi';

const GUEST_ID_KEY = 'guest_id';

export function getGuestId(): string {
  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;
    const id = `guest-${crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    // Fallback if localStorage not available
    return `guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function isGuest(): boolean {
  try {
    return !authApi.isAuthenticated();
  } catch {
    return true;
  }
}

export function getCurrentUserOrGuestId(): string {
  // In guest mode, return guest_id; when authenticated, return a placeholder
  // Note: Most server writes ignore client-provided created_by_user_id and use token claims.
  if (isGuest()) return getGuestId();
  // We don't have direct access to user ID here; callers should avoid relying on it.
  return 'authenticated-user';
}

