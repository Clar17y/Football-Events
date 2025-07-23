import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi } from '../services/api/authApi';
import type { UserProfile } from '../services/api/authApi';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
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
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = authApi.isAuthenticated() && user !== null;

  // Initialize auth state on app load
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('AuthContext: Starting initialization...');
      try {
        if (authApi.isAuthenticated()) {
          console.log('AuthContext: User appears authenticated, getting profile...');
          // Try to get user profile
          const response = await authApi.getProfile();
          if (response.success && response.data) {
            console.log('AuthContext: Profile loaded successfully');
            setUser(response.data);
          } else {
            console.log('AuthContext: Profile failed, trying refresh...');
            // Token might be expired, try to refresh
            const refreshSuccess = await authApi.attemptTokenRefresh();
            if (refreshSuccess) {
              console.log('AuthContext: Refresh successful, retrying profile...');
              const retryResponse = await authApi.getProfile();
              if (retryResponse.success && retryResponse.data) {
                console.log('AuthContext: Profile loaded after refresh');
                setUser(retryResponse.data);
              }
            } else {
              console.log('AuthContext: Refresh failed, clearing tokens...');
              // Clear invalid tokens
              await authApi.logout();
            }
          }
        } else {
          console.log('AuthContext: User not authenticated');
        }
      } catch (error) {
        console.warn('AuthContext: Failed to initialize auth:', error);
        // Clear potentially invalid tokens
        await authApi.logout();
      } finally {
        console.log('AuthContext: Setting isLoading = false');
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setIsLoading(true);
      const response = await authApi.login({ email, password });
      
      if (response.success && response.data) {
        // Get user profile after successful login
        const profileResponse = await authApi.getProfile();
        if (profileResponse.success && profileResponse.data) {
          setUser(profileResponse.data);
          return { success: true };
        } else {
          return { success: false, error: 'Failed to get user profile' };
        }
      } else {
        return { 
          success: false, 
          error: response.message || 'Login failed' 
        };
      }
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: RegisterData) => {
    try {
      setIsLoading(true);
      const response = await authApi.register(data);
      
      if (response.success) {
        // Auto-login after successful registration
        const loginResult = await login(data.email, data.password);
        return loginResult;
      } else {
        return { 
          success: false, 
          error: response.message || 'Registration failed' 
        };
      }
    } catch (error) {
      console.error('Registration error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Registration failed' 
      };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await authApi.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      // Clear user state even if logout request fails
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    try {
      if (authApi.isAuthenticated()) {
        const response = await authApi.getProfile();
        if (response.success && response.data) {
          setUser(response.data);
        }
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
  };

  console.log('AuthContext: Rendering with isLoading =', isLoading, 'isAuthenticated =', isAuthenticated);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;