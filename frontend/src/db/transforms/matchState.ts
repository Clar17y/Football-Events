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
    id: s.match_id,
    matchId: s.match_id,
    status: s.status === 'NOT_STARTED' ? 'SCHEDULED' : s.status,
    currentPeriod: undefined, // Set from period data if available
    currentPeriodType: undefined,
    matchStartedAt: s.status !== 'NOT_STARTED' ? toDate(s.created_at) : undefined,
    matchEndedAt: s.status === 'COMPLETED' ? toDate(s.updated_at) : undefined,
    totalElapsedSeconds: Math.floor(s.timer_ms / 1000),
    createdAt: toDate(s.created_at) ?? new Date(),
    updatedAt: toDate(s.updated_at),
    created_by_user_id: s.created_by_user_id,
    deleted_at: toDate(s.deleted_at),
    deleted_by_user_id: nullToUndefined(s.deleted_by_user_id),
    is_deleted: toBool(s.is_deleted),
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
    match_id: matchId,
    status: data.status,
    current_period_id: data.currentPeriodId,
    timer_ms: data.timerMs ?? 0,
    last_updated_at: Date.now(),
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
    matchId: p.match_id,
    periodNumber: p.period_number,
    periodType: p.period_type,
    startedAt: toDate(p.started_at),
    endedAt: toDate(p.ended_at),
    durationSeconds: nullToUndefined(p.duration_seconds),
    createdAt: toDate(p.created_at) ?? new Date(),
    updatedAt: toDate(p.updated_at),
    created_by_user_id: p.created_by_user_id,
    deleted_at: toDate(p.deleted_at),
    deleted_by_user_id: nullToUndefined(p.deleted_by_user_id),
    is_deleted: toBool(p.is_deleted),
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
    match_id: data.matchId,
    period_number: data.periodNumber,
    period_type: data.periodType ?? 'REGULAR',
    started_at: data.startedAt ?? Date.now(),
  };
}
