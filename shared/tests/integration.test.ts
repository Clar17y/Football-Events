import { describe, it, expect } from 'vitest';
import {
  transformMatchState,
  transformMatchPeriod,
  transformStartMatchRequest,
  transformStartPeriodRequest,
  transformMatchStateToResponse,
  transformMatchStateToStatusResponse,
  transformToLiveMatchesResponse,
} from '../types/index';

describe('Integration Tests - Type Exports', () => {
  it('should export all match state transformer functions', () => {
    expect(typeof transformMatchState).toBe('function');
    expect(typeof transformMatchPeriod).toBe('function');
    expect(typeof transformStartMatchRequest).toBe('function');
    expect(typeof transformStartPeriodRequest).toBe('function');
    expect(typeof transformMatchStateToResponse).toBe('function');
    expect(typeof transformMatchStateToStatusResponse).toBe('function');
    expect(typeof transformToLiveMatchesResponse).toBe('function');
  });

  it('should be able to create a complete match state workflow', () => {
    // Create a start match request
    const startRequest = transformStartMatchRequest(
      { matchId: 'match-123' },
      'user-456'
    );
    
    expect(startRequest.match_id).toBe('match-123');
    expect(startRequest.status).toBe('live');
    expect(startRequest.created_by_user_id).toBe('user-456');

    // Create a start period request
    const periodRequest = transformStartPeriodRequest(
      { matchId: 'match-123', periodNumber: 1, periodType: 'REGULAR' },
      'user-456'
    );
    
    expect(periodRequest.match_id).toBe('match-123');
    expect(periodRequest.period_number).toBe(1);
    expect(periodRequest.period_type).toBe('regular');
  });
});