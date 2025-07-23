import React from 'react';
import { useDatabase } from '../contexts/DatabaseContext';

interface DatabaseStatusProps {
  showWhenReady?: boolean;
  className?: string;
}

export const DatabaseStatus: React.FC<DatabaseStatusProps> = ({ 
  showWhenReady = false, 
  className = '' 
}) => {
  const { status, error, retryInitialization, forceReset } = useDatabase();

  // Don't show anything when ready unless explicitly requested
  if (status === 'ready' && !showWhenReady) {
    return null;
  }

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'degraded': return 'text-yellow-600';
      case 'initializing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'ready': return 'Database ready';
      case 'failed': return 'Database unavailable - running in API-only mode';
      case 'degraded': return 'Database partially available';
      case 'initializing': return 'Initializing database...';
      default: return 'Database status unknown';
    }
  };

  return (
    <div className={`database-status ${className}`}>
      <div className={`text-sm ${getStatusColor()}`}>
        {getStatusMessage()}
      </div>
      
      {error && (
        <div className="text-xs text-gray-500 mt-1">
          {error}
        </div>
      )}
      
      {status === 'failed' && (
        <div className="mt-2 space-x-2">
          <button
            onClick={retryInitialization}
            className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600"
          >
            Retry
          </button>
          <button
            onClick={forceReset}
            className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
          >
            Reset Database
          </button>
        </div>
      )}
    </div>
  );
};

export default DatabaseStatus;