/**
 * Match transforms: IndexedDB ↔ Frontend
 */

import type { EnhancedMatch } from '../schema';
import type { Match } from '@shared/types';
import { toDate, nullToUndefined, toBool } from './common';

/**
 * Transform IndexedDB match record to frontend Match type (without team data)
 */
export function dbToMatch(m: EnhancedMatch): Match {
  return {
    id: m.id,
    seasonId: m.seasonId,
    kickoffTime: toDate(m.kickoffTs) ?? new Date(),
    competition: nullToUndefined(m.competition),
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    venue: nullToUndefined(m.venue),
    durationMinutes: m.durationMins,
    periodFormat: m.periodFormat,
    homeScore: m.homeScore ?? 0,
    awayScore: m.awayScore ?? 0,
    notes: nullToUndefined(m.notes),
    createdAt: toDate(m.createdAt) ?? new Date(),
    updatedAt: toDate(m.updatedAt),
    created_by_user_id: m.createdByUserId,
    deleted_at: toDate(m.deletedAt),
    deleted_by_user_id: nullToUndefined(m.deletedByUserId),
    is_deleted: toBool(m.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB match records
 */
export function dbToMatches(matches: EnhancedMatch[]): Match[] {
  return matches.map(dbToMatch);
}

/**
 * Input shape for creating/updating matches (frontend camelCase)
 */
export interface MatchWriteInput {
  seasonId: string;
  kickoffTime: number | string;
  homeTeamId: string;
  awayTeamId: string;
  competition?: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: 'half' | 'quarter';
  homeScore?: number;
  awayScore?: number;
  notes?: string;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function matchWriteToDb(data: MatchWriteInput): Partial<EnhancedMatch> {
  const kickoffTs = typeof data.kickoffTime === 'string'
    ? new Date(data.kickoffTime).getTime()
    : data.kickoffTime;

  return {
    seasonId: data.seasonId,
    kickoffTs: kickoffTs,
    homeTeamId: data.homeTeamId,
    awayTeamId: data.awayTeamId,
    competition: data.competition,
    venue: data.venue,
    durationMins: data.durationMinutes ?? 60,
    periodFormat: data.periodFormat ?? 'quarter',
    homeScore: data.homeScore ?? 0,
    awayScore: data.awayScore ?? 0,
    notes: data.notes,
  };
}

// ============================================================================
// SYNC SERVICE TRANSFORMS (IndexedDB → Server API)
// ============================================================================

/**
 * Server API match payload (camelCase)
 */
export interface ServerMatchPayload {
  seasonId: string;
  kickoffTime: number;
  homeTeamId: string;
  awayTeamId: string;
  competition?: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: string;
  notes?: string;
}

/**
 * Transform IndexedDB match to Server API payload for sync
 */
export function dbMatchToServerPayload(m: EnhancedMatch): ServerMatchPayload {
  return {
    seasonId: m.seasonId,
    kickoffTime: m.kickoffTs,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    competition: nullToUndefined(m.competition),
    venue: nullToUndefined(m.venue),
    durationMinutes: m.durationMins,
    periodFormat: m.periodFormat,
    notes: nullToUndefined(m.notes),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API match response (camelCase)
 */
export interface ServerMatchResponse {
  id: string;
  seasonId: string;
  kickoffTime: string | number;
  homeTeamId: string;
  awayTeamId: string;
  competition?: string;
  venue?: string;
  durationMinutes?: number;
  periodFormat?: 'half' | 'quarter';
  homeScore?: number;
  awayScore?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  created_by_user_id?: string;
  is_deleted?: boolean;
}

/**
 * Transform Server API match to IndexedDB format for caching
 */
export function serverMatchToDb(m: ServerMatchResponse): EnhancedMatch {
  const now = Date.now();
  return {
    id: m.id,
    matchId: m.id,
    seasonId: m.seasonId,
    kickoffTs: typeof m.kickoffTime === 'string' ? new Date(m.kickoffTime).getTime() : m.kickoffTime ?? now,
    competition: m.competition,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    venue: m.venue,
    durationMins: m.durationMinutes || 60,
    periodFormat: m.periodFormat || 'quarter',
    homeScore: m.homeScore || 0,
    awayScore: m.awayScore || 0,
    notes: m.notes,
    createdAt: m.createdAt ? new Date(m.createdAt).getTime() : now,
    updatedAt: m.updatedAt ? new Date(m.updatedAt).getTime() : now,
    createdByUserId: m.created_by_user_id || 'server',
    isDeleted: m.is_deleted ?? false,
    synced: true,
    syncedAt: now,
  } as EnhancedMatch;
}
