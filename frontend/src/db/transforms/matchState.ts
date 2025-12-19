/**
 * Match State & Period transforms: IndexedDB ↔ Frontend
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * Note: DbMatchState and DbMatchPeriod use timestamps (numbers) for timer precision
 * but ISO strings for createdAt/updatedAt consistency.
 */

import type { DbMatchState, DbMatchPeriod } from '../schema';
import type { MatchState, MatchPeriod } from '@shared/types';
import { nullToUndefined, toBool, toIsoString, nowIso } from './common';

// ============================================================================
// MATCH STATE
// ============================================================================

/**
 * Transform IndexedDB match state to frontend MatchState type
 */
export function dbToMatchState(s: DbMatchState): MatchState {
  return {
    id: s.matchId,
    matchId: s.matchId,
    status: s.status === 'NOT_STARTED' ? 'SCHEDULED' : s.status,
    currentPeriod: undefined, // Set from period data if available
    currentPeriodType: undefined,
    matchStartedAt: s.status !== 'NOT_STARTED' ? s.createdAt : undefined,
    matchEndedAt: s.status === 'COMPLETED' ? s.updatedAt : undefined,
    totalElapsedSeconds: Math.floor(s.timerMs / 1000),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    createdByUserId: s.createdByUserId,
    deletedAt: s.deletedAt,
    deletedByUserId: nullToUndefined(s.deletedByUserId),
    isDeleted: toBool(s.isDeleted),
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
export function matchStateWriteToDb(matchId: string, data: MatchStateWriteInput): Partial<DbMatchState> {
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
export function dbToMatchPeriod(p: DbMatchPeriod): MatchPeriod {
  return {
    id: p.id,
    matchId: p.matchId,
    periodNumber: p.periodNumber,
    periodType: p.periodType,
    startedAt: toIsoString(p.startedAt),
    endedAt: toIsoString(p.endedAt),
    durationSeconds: nullToUndefined(p.durationSeconds),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdByUserId: p.createdByUserId,
    deletedAt: p.deletedAt,
    deletedByUserId: nullToUndefined(p.deletedByUserId),
    isDeleted: toBool(p.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB match periods
 */
export function dbToMatchPeriods(periods: DbMatchPeriod[]): MatchPeriod[] {
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
export function matchPeriodWriteToDb(data: MatchPeriodWriteInput): Partial<DbMatchPeriod> {
  return {
    matchId: data.matchId,
    periodNumber: data.periodNumber,
    periodType: data.periodType ?? 'REGULAR',
    startedAt: data.startedAt ?? Date.now(),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API match state response (camelCase - server now returns camelCase)
 */
export interface ServerMatchStateResponse {
  id: string;
  matchId: string;
  status: 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'POSTPONED';
  currentPeriod?: number;
  currentPeriodType?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  matchStartedAt?: string;
  matchEndedAt?: string;
  totalElapsedSeconds?: number;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API match state to IndexedDB format for caching
 */
export function serverMatchStateToDb(s: ServerMatchStateResponse): DbMatchState {
  const now = nowIso();
  // Map server status to local status
  const localStatus = s.status === 'SCHEDULED' ? 'NOT_STARTED' : 
    (s.status === 'CANCELLED' || s.status === 'POSTPONED') ? 'COMPLETED' : s.status;
  
  return {
    matchId: s.matchId,
    status: localStatus as DbMatchState['status'],
    timerMs: (s.totalElapsedSeconds ?? 0) * 1000,
    lastUpdatedAt: Date.now(),
    createdAt: s.createdAt ?? now,
    updatedAt: s.updatedAt ?? now,
    createdByUserId: s.createdByUserId ?? 'server',
    deletedAt: s.deletedAt,
    deletedByUserId: s.deletedByUserId,
    isDeleted: s.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}

/**
 * Server API match period response (camelCase - server now returns camelCase)
 */
export interface ServerMatchPeriodResponse {
  id: string;
  matchId: string;
  periodNumber: number;
  periodType: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API match period to IndexedDB format for caching
 */
export function serverMatchPeriodToDb(p: ServerMatchPeriodResponse): DbMatchPeriod {
  const now = nowIso();
  return {
    id: p.id,
    matchId: p.matchId,
    periodNumber: p.periodNumber,
    periodType: p.periodType,
    startedAt: p.startedAt ? new Date(p.startedAt).getTime() : Date.now(),
    endedAt: p.endedAt ? new Date(p.endedAt).getTime() : undefined,
    durationSeconds: p.durationSeconds,
    createdAt: p.createdAt ?? now,
    updatedAt: p.updatedAt ?? now,
    createdByUserId: p.createdByUserId ?? 'server',
    deletedAt: p.deletedAt,
    deletedByUserId: p.deletedByUserId,
    isDeleted: p.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}
