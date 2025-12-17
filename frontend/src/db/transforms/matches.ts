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
    seasonId: m.season_id,
    kickoffTime: toDate(m.kickoff_ts) ?? new Date(),
    competition: nullToUndefined(m.competition),
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    venue: nullToUndefined(m.venue),
    durationMinutes: m.duration_mins,
    periodFormat: m.period_format,
    homeScore: m.home_score ?? 0,
    awayScore: m.away_score ?? 0,
    notes: nullToUndefined(m.notes),
    createdAt: toDate(m.created_at) ?? new Date(),
    updatedAt: toDate(m.updated_at),
    created_by_user_id: m.created_by_user_id,
    deleted_at: toDate(m.deleted_at),
    deleted_by_user_id: nullToUndefined(m.deleted_by_user_id),
    is_deleted: toBool(m.is_deleted),
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
    season_id: data.seasonId,
    kickoff_ts: kickoffTs,
    home_team_id: data.homeTeamId,
    away_team_id: data.awayTeamId,
    competition: data.competition,
    venue: data.venue,
    duration_mins: data.durationMinutes ?? 60,
    period_format: data.periodFormat ?? 'quarter',
    home_score: data.homeScore ?? 0,
    away_score: data.awayScore ?? 0,
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
    seasonId: m.season_id,
    kickoffTime: m.kickoff_ts,
    homeTeamId: m.home_team_id,
    awayTeamId: m.away_team_id,
    competition: nullToUndefined(m.competition),
    venue: nullToUndefined(m.venue),
    durationMinutes: m.duration_mins,
    periodFormat: m.period_format,
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
    match_id: m.id,
    season_id: m.seasonId,
    kickoff_ts: typeof m.kickoffTime === 'string' ? new Date(m.kickoffTime).getTime() : m.kickoffTime ?? now,
    competition: m.competition,
    home_team_id: m.homeTeamId,
    away_team_id: m.awayTeamId,
    venue: m.venue,
    duration_mins: m.durationMinutes || 60,
    period_format: m.periodFormat || 'quarter',
    home_score: m.homeScore || 0,
    away_score: m.awayScore || 0,
    notes: m.notes,
    created_at: m.createdAt ? new Date(m.createdAt).getTime() : now,
    updated_at: m.updatedAt ? new Date(m.updatedAt).getTime() : now,
    created_by_user_id: m.created_by_user_id || 'server',
    is_deleted: m.is_deleted ?? false,
    synced: true,
    synced_at: now,
  } as EnhancedMatch;
}
