import React, { createContext, useCallback, useContext, useEffect, useState, ReactNode, useRef } from 'react';
import { authApi } from '../services/api/authApi';
import { AuthSessionChangedError, CONNECTED_RECOVERY_MESSAGE, isAuthRejection } from '../services/api/authFailure';
import { db } from '../db/indexedDB';
import type { UserProfile } from '../services/api/authApi';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  recoveryMessage: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

interface AuthProviderProps { children: ReactNode; }

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [initialProfile] = useState(() => authApi.getCachedProfile());
  const [user, setUser] = useState<UserProfile | null>(initialProfile);
  const [isLoading, setIsLoading] = useState(() => !initialProfile && authApi.isAuthenticated() && navigator.onLine);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [tokenExpiryMs, setTokenExpiryMs] = useState(() => authApi.getAccessTokenExpiryMs());
  const mounted = useRef(false);
  const operation = useRef(0);
  const localReset = useRef<Promise<unknown> | null>(null);
  const sessionGeneration = authApi.getSessionGeneration();
  const isAuthenticated = authApi.isAuthenticated() && user !== null;

  const isCurrent = useCallback((pendingOperation: number, session: number) =>
    mounted.current && operation.current === pendingOperation && authApi.getSessionGeneration() === session, []);

  const explainRecovery = useCallback(() => {
    if (authApi.getCachedProfile()) return;
    setRecoveryMessage(CONNECTED_RECOVERY_MESSAGE);
    try { (window as any).__toastApi?.current?.showError?.(CONNECTED_RECOVERY_MESSAGE); } catch { /* optional toast */ }
  }, []);

  const publishProfile = useCallback((profile: UserProfile) => {
    setUser(profile);
    setRecoveryMessage(null);
    setTokenExpiryMs(authApi.getAccessTokenExpiryMs());
    window.dispatchEvent(new CustomEvent('auth:loggedin'));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!authApi.isAuthenticated()) return;
    const pendingOperation = operation.current;
    const session = authApi.getSessionGeneration();
    if (!navigator.onLine) {
      explainRecovery();
      setIsLoading(false);
      return;
    }
    try {
      const response = await authApi.getProfile();
      if (!isCurrent(pendingOperation, session)) return;
      if (response.success && response.data) publishProfile(response.data);
      else explainRecovery();
    } catch (error) {
      if (!isCurrent(pendingOperation, session) || error instanceof AuthSessionChangedError) return;
      if (isAuthRejection(error)) {
        authApi.clearToken();
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      } else {
        explainRecovery();
      }
    } finally {
      if (isCurrent(pendingOperation, session)) setIsLoading(false);
    }
  }, [explainRecovery, isCurrent, publishProfile]);

  useEffect(() => {
    mounted.current = true;
    const onUnauthorized = () => {
      operation.current++;
      authApi.clearToken();
      setUser(null);
      setTokenExpiryMs(null);
      setRecoveryMessage(null);
      setIsLoading(false);
      localReset.current = db.clearAllData().catch(() => console.warn('Failed to clear local data on auth reset.'));
    };
    const onRefreshed = () => setTokenExpiryMs(authApi.getAccessTokenExpiryMs());
    const onOnline = () => { void refreshUser(); };
    window.addEventListener('auth:unauthorized', onUnauthorized);
    window.addEventListener('auth:refreshed', onRefreshed);
    window.addEventListener('online', onOnline);
    void refreshUser();
    return () => {
      mounted.current = false;
      operation.current++;
      window.removeEventListener('auth:unauthorized', onUnauthorized);
      window.removeEventListener('auth:refreshed', onRefreshed);
      window.removeEventListener('online', onOnline);
    };
  }, [refreshUser]);

  const authenticate = async (request: () => ReturnType<typeof authApi.login>) => {
    const pendingOperation = ++operation.current;
    setIsLoading(true);
    setUser(null);
    setTokenExpiryMs(null);
    setRecoveryMessage(null);
    let session: number;
    try {
      const pending = request();
      session = authApi.getSessionGeneration();
      const response = await pending;
      if (!isCurrent(pendingOperation, session)) return { success: false, error: 'Authentication session changed.' };
      if (!response.success || !response.data) return { success: false, error: response.message || 'Sign in failed' };
      const profile = await authApi.getProfile();
      if (!isCurrent(pendingOperation, session)) return { success: false, error: 'Authentication session changed.' };
      if (profile.success && profile.data) {
        publishProfile(profile.data);
        return { success: true };
      }
      explainRecovery();
      return { success: false, error: CONNECTED_RECOVERY_MESSAGE };
    } catch (error) {
      if (mounted.current && operation.current === pendingOperation && !(error instanceof AuthSessionChangedError)) {
        if (authApi.isAuthenticated()) explainRecovery();
        return { success: false, error: error instanceof Error ? error.message : 'Sign in failed' };
      }
      return { success: false, error: 'Authentication session changed.' };
    } finally {
      if (mounted.current && operation.current === pendingOperation) {
        setIsLoading(false);
        // Even without a cached profile, retry the retained session on expiry/online recovery.
        setTokenExpiryMs(authApi.getAccessTokenExpiryMs());
      }
    }
  };

  const login = (email: string, password: string) => authenticate(() => authApi.login({ email, password }));
  const register = (data: RegisterData) => authenticate(() => authApi.register(data));

  const logout = async () => {
    operation.current++;
    setUser(null);
    setTokenExpiryMs(null);
    setRecoveryMessage(null);
    setIsLoading(false);
    const pending = authApi.logout();
    await Promise.all([pending, localReset.current]);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const refreshLimits = async () => {
      if (!navigator.onLine) return;
      const session = authApi.getSessionGeneration();
      try {
        const { fetchAndCacheMeLimits } = await import('../services/limitsService');
        if (mounted.current && authApi.getSessionGeneration() === session) await fetchAndCacheMeLimits();
      } catch { /* limits recovery is independent of local identity */ }
    };
    void refreshLimits();
    const timer = window.setInterval(() => { void refreshLimits(); }, 10 * 60 * 1000);
    window.addEventListener('online', refreshLimits);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', refreshLimits);
    };
  }, [isAuthenticated, sessionGeneration]);

  useEffect(() => {
    if (tokenExpiryMs === null) return;
    let stopped = false;
    let pending = false;
    let timer: number | undefined;
    const pendingOperation = operation.current;
    const session = authApi.getSessionGeneration();
    const current = () => !stopped && isCurrent(pendingOperation, session);
    const schedule = () => {
      window.clearTimeout(timer);
      if (!current()) return;
      const expiry = authApi.getAccessTokenExpiryMs();
      // Expired/offline/short-lived credentials get a bounded retry, never a zero-delay loop.
      const delay = Math.max((expiry ?? Date.now()) - Date.now() - 60_000, 30_000);
      timer = window.setTimeout(() => { void refresh(); }, Math.min(delay, 2_147_483_647));
    };
    const refresh = async () => {
      if (!current() || pending) return;
      window.clearTimeout(timer);
      if (!navigator.onLine) { schedule(); return; }
      pending = true;
      try {
        const ok = await authApi.attemptTokenRefresh();
        if (current() && ok) {
          setTokenExpiryMs(authApi.getAccessTokenExpiryMs());
          await refreshUser();
        }
      } finally {
        pending = false;
        schedule();
      }
    };
    const onOnline = () => { void refresh(); };
    schedule();
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [tokenExpiryMs, sessionGeneration, isCurrent, refreshUser]);

  return <AuthContext.Provider value={{ user, isAuthenticated, isLoading, recoveryMessage, login, register, logout, refreshUser }}>
    {children}
  </AuthContext.Provider>;
};

export default AuthProvider;
