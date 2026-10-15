import type { UserProfile } from './authApi';

export const OFFLINE_IDENTITY_KEY = 'auth_confirmed_profile';

export function readTokenClaims(token: string | null): { subject: string | null; expiryMs: number | null } {
  try {
    const parts = token?.split('.');
    if (!parts || parts.length !== 3 || !parts[2]) throw new Error('Invalid token');
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    // The current server uses userId; also accept the standard JWT subject.
    const subject = payload.sub ?? payload.userId;
    if (payload.sub && payload.userId && payload.sub !== payload.userId) throw new Error('Conflicting subject');
    return {
      subject: typeof subject === 'string' && subject.length > 0 ? subject : null,
      expiryMs: typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : null,
    };
  } catch {
    return { subject: null, expiryMs: null };
  }
}

function isProfile(profile: unknown): profile is UserProfile {
  if (!profile || typeof profile !== 'object') return false;
  const value = profile as Record<string, unknown>;
  return ['id', 'email', 'role', 'created_at', 'updated_at'].every(key => typeof value[key] === 'string') &&
    ['first_name', 'last_name'].every(key => value[key] === null || typeof value[key] === 'string') &&
    typeof value.email_verified === 'boolean';
}

/** This is local continuity evidence, never authorization for a server request. */
export function readConfirmedProfile(token: string | null): UserProfile | null {
  try {
    const subject = readTokenClaims(token).subject;
    if (!subject) return null;
    const cached = JSON.parse(localStorage.getItem(OFFLINE_IDENTITY_KEY) || 'null');
    return cached?.version === 1 && cached.subject === subject &&
      isProfile(cached.profile) && cached.profile.id === subject ? cached.profile : null;
  } catch {
    return null;
  }
}

export function cacheConfirmedProfile(token: string | null, profile: UserProfile): boolean {
  const subject = readTokenClaims(token).subject;
  if (!subject || !isProfile(profile) || profile.id !== subject) return false;
  try {
    localStorage.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ version: 1, subject, profile }));
  } catch {
    // Storage may be unavailable; a verified profile can still be used in memory.
  }
  return true;
}

export function clearConfirmedProfile(): void {
  try { localStorage.removeItem(OFFLINE_IDENTITY_KEY); } catch { /* storage unavailable */ }
}
