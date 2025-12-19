/**
 * Match transforms: IndexedDB ↔ Frontend
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * DbMatch extends Match, so dbToMatch is essentially pass-through.
 */

import type { DbMatch } from '../schema';
import type { Match } from '@shared/types';
import { nullToUndefined, toBool, nowIso } from './common';

/**
 * Transform IndexedDB match record to frontend Match type
 * Since DbMatch extends Match, this is essentially a pass-through
 * that strips sync metadata.
 */
export function dbToMatch(m: DbMatch): Match {
  return {
    id: m.id,
    seasonId: m.seasonId,
    kickoffTime: m.kickoffTime,
    competition: nullToUndefined(m.competition),
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    venue: nullToUndefined(m.venue),
    durationMinutes: m.durationMinutes,
    periodFormat: m.periodFormat,
    homeScore: m.homeScore ?? 0,
    awayScore: m.awayScore ?? 0,
    notes: nullToUndefined(m.notes),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    createdByUserId: m.createdByUserId,
    deletedAt: m.deletedAt,
    deletedByUserId: nullToUndefined(m.deletedByUserId),
    isDeleted: toBool(m.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB match records
 */
export function dbToMatches(matches: DbMatch[]): Match[] {
  return matches.map(dbToMatch);
}

/**
 * Input shape for creating/updating matches (frontend camelCase)
 */
export interface MatchWriteInput {
  seasonId: string;
  kickoffTime: string;
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
export function matchWriteToDb(data: MatchWriteInput): Partial<DbMatch> {
  return {
    seasonId: data.seasonId,
    kickoffTime: data.kickoffTime,
    homeTeamId: data.homeTeamId,
    awayTeamId: data.awayTeamId,
    competition: data.competition,
    venue: data.venue,
    durationMinutes: data.durationMinutes ?? 60,
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
  kickoffTime: string;
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
export function dbMatchToServerPayload(m: DbMatch): ServerMatchPayload {
  return {
    seasonId: m.seasonId,
    kickoffTime: m.kickoffTime,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    competition: nullToUndefined(m.competition),
    venue: nullToUndefined(m.venue),
    durationMinutes: m.durationMinutes,
    periodFormat: m.periodFormat,
    notes: nullToUndefined(m.notes),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API match response (camelCase - server now returns camelCase)
 */
export interface ServerMatchResponse {
  id: string;
  seasonId: string;
  kickoffTime: string;
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
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API match to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverMatchToDb(m: ServerMatchResponse): DbMatch {
  const now = nowIso();
  return {
    id: m.id,
    matchId: m.id,
    seasonId: m.seasonId,
    kickoffTime: m.kickoffTime,
    competition: m.competition,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    venue: m.venue,
    durationMinutes: m.durationMinutes ?? 60,
    periodFormat: m.periodFormat ?? 'quarter',
    homeScore: m.homeScore ?? 0,
    awayScore: m.awayScore ?? 0,
    notes: m.notes,
    createdAt: m.createdAt ?? now,
    updatedAt: m.updatedAt ?? now,
    createdByUserId: m.createdByUserId ?? 'server',
    deletedAt: m.deletedAt,
    deletedByUserId: m.deletedByUserId,
    isDeleted: m.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}
