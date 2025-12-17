/**
 * Match State & Period transforms: IndexedDB ↔ Frontend
 */

import type { LocalMatchState, LocalMatchPeriod } from '../schema';
import type { MatchState, MatchPeriod } from '@shared/types';
import { toDate, nullToUndefined, toBool } from './common';

// ============================================================================
// MATCH STATE
// ============================================================================

/**
 * Transform IndexedDB match state to frontend MatchState type
 */
export function dbToMatchState(s: LocalMatchState): MatchState {
  return {
    id: s.matchId,
    matchId: s.matchId,
    status: s.status === 'NOT_STARTED' ? 'SCHEDULED' : s.status,
    currentPeriod: undefined, // Set from period data if available
    currentPeriodType: undefined,
    matchStartedAt: s.status !== 'NOT_STARTED' ? toDate(s.createdAt) : undefined,
    matchEndedAt: s.status === 'COMPLETED' ? toDate(s.updatedAt) : undefined,
    totalElapsedSeconds: Math.floor(s.timerMs / 1000),
    createdAt: toDate(s.createdAt) ?? new Date(),
    updatedAt: toDate(s.updatedAt),
    created_by_user_id: s.createdByUserId,
    deleted_at: toDate(s.deletedAt),
    deleted_by_user_id: nullToUndefined(s.deletedByUserId),
    is_deleted: toBool(s.isDeleted),
  };
}

/**
 * Input shape for creating/updating match state (frontend camelCase)
 */
export interface MatchStateWriteInput {
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  currentPeriodId?: string;
  timerMs?: number;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function matchStateWriteToDb(matchId: string, data: MatchStateWriteInput): Partial<LocalMatchState> {
  return {
    matchId: matchId,
    status: data.status,
    currentPeriodId: data.currentPeriodId,
    timerMs: data.timerMs ?? 0,
    lastUpdatedAt: Date.now(),
  };
}

// ============================================================================
// MATCH PERIODS
// ============================================================================

/**
 * Transform IndexedDB match period to frontend MatchPeriod type
 */
export function dbToMatchPeriod(p: LocalMatchPeriod): MatchPeriod {
  return {
    id: p.id,
    matchId: p.matchId,
    periodNumber: p.periodNumber,
    periodType: p.periodType,
    startedAt: toDate(p.startedAt),
    endedAt: toDate(p.endedAt),
    durationSeconds: nullToUndefined(p.durationSeconds),
    createdAt: toDate(p.createdAt) ?? new Date(),
    updatedAt: toDate(p.updatedAt),
    created_by_user_id: p.createdByUserId,
    deleted_at: toDate(p.deletedAt),
    deleted_by_user_id: nullToUndefined(p.deletedByUserId),
    is_deleted: toBool(p.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB match periods
 */
export function dbToMatchPeriods(periods: LocalMatchPeriod[]): MatchPeriod[] {
  return periods.map(dbToMatchPeriod);
}

/**
 * Input shape for creating match periods (frontend camelCase)
 */
export interface MatchPeriodWriteInput {
  matchId: string;
  periodNumber: number;
  periodType?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  startedAt?: number;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function matchPeriodWriteToDb(data: MatchPeriodWriteInput): Partial<LocalMatchPeriod> {
  return {
    matchId: data.matchId,
    periodNumber: data.periodNumber,
    periodType: data.periodType ?? 'REGULAR',
    startedAt: data.startedAt ?? Date.now(),
  };
}
