import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { db } from '../db/indexedDB';

export type DatabaseStatus = 'initializing' | 'ready' | 'failed' | 'degraded';

interface DatabaseContextType {
  status: DatabaseStatus;
  error: string | null;
  isReady: boolean;
  retryInitialization: () => Promise<void>;
  forceReset: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export const useDatabase = () => {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
};

interface DatabaseProviderProps {
  children: ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  const [status, setStatus] = useState<DatabaseStatus>('initializing');
  const [error, setError] = useState<string | null>(null);

  const initializeDatabase = async () => {
    try {
      setStatus('initializing');
      setError(null);
      
      await db.initialize();
      
      setStatus('ready');
      console.log('Database initialized successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown database error';
      console.warn('Database initialization failed:', errorMessage);
      
      setError(errorMessage);
      setStatus('failed');
      
      // Don't throw - let the app continue without database
    }
  };

  const retryInitialization = async () => {
    await initializeDatabase();
  };

  const forceReset = async () => {
    try {
      setStatus('initializing');
      setError(null);
      
      await db.forceReset();
      await db.initialize();
      
      setStatus('ready');
      console.log('Database reset and reinitialized successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset database';
      console.error('Database reset failed:', errorMessage);
      
      setError(errorMessage);
      setStatus('failed');
    }
  };

  // Initialize database on mount, but don't block the component
  useEffect(() => {
    initializeDatabase();
  }, []);

  const value: DatabaseContextType = {
    status,
    error,
    isReady: status === 'ready',
    retryInitialization,
    forceReset,
  };

  return (
    <DatabaseContext.Provider value={value}>
      {children}
    </DatabaseContext.Provider>
  );
};

export default DatabaseProvider;