/**
 * Season transforms: IndexedDB ↔ Frontend
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * DbSeason extends Season, so dbToSeason is essentially pass-through.
 */

import type { DbSeason } from '../schema';
import type { Season } from '@shared/types';
import { nullToUndefined, toBool, nowIso } from './common';

/**
 * Transform IndexedDB season record to frontend Season type
 * Since DbSeason extends Season, this is essentially a pass-through
 * that strips sync metadata.
 */
export function dbToSeason(s: DbSeason): Season {
  return {
    id: s.id,
    seasonId: s.seasonId ?? s.id,
    label: s.label,
    startDate: nullToUndefined(s.startDate),
    endDate: nullToUndefined(s.endDate),
    isCurrent: toBool(s.isCurrent),
    description: nullToUndefined(s.description),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    createdByUserId: s.createdByUserId,
    deletedAt: s.deletedAt,
    deletedByUserId: nullToUndefined(s.deletedByUserId),
    isDeleted: toBool(s.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB season records
 */
export function dbToSeasons(seasons: DbSeason[]): Season[] {
  return seasons.map(dbToSeason);
}

/**
 * Input shape for creating/updating seasons (frontend camelCase)
 */
export interface SeasonWriteInput {
  label: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function seasonWriteToDb(data: SeasonWriteInput): Partial<DbSeason> {
  return {
    label: data.label,
    startDate: data.startDate,
    endDate: data.endDate,
    isCurrent: data.isCurrent ?? false,
    description: data.description,
  };
}

// ============================================================================
// SYNC SERVICE TRANSFORMS (IndexedDB → Server API)
// ============================================================================

/**
 * Server API season payload (camelCase)
 */
export interface ServerSeasonPayload {
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  description?: string;
}

/**
 * Transform IndexedDB season to Server API payload for sync
 * Note: dates must be YYYY-MM-DD format for the server
 */
export function dbSeasonToServerPayload(s: DbSeason): ServerSeasonPayload {
  // Ensure dates are YYYY-MM-DD format (handle both ISO timestamps and date-only strings)
  const formatDate = (date: string | undefined, fallback: string): string => {
    if (!date) return fallback;
    return date.split('T')[0];
  };

  const today = new Date().toISOString().slice(0, 10);

  return {
    label: s.label,
    startDate: formatDate(s.startDate, today),
    endDate: formatDate(s.endDate, today),
    isCurrent: toBool(s.isCurrent),
    description: nullToUndefined(s.description),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API season response (camelCase - server now returns camelCase)
 */
export interface ServerSeasonResponse {
  id?: string;
  seasonId?: string;
  label: string;
  startDate?: string;
  endDate?: string;
  isCurrent?: boolean;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API season to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverSeasonToDb(s: ServerSeasonResponse): DbSeason {
  const now = nowIso();
  const seasonId = s.id ?? s.seasonId!;
  return {
    id: seasonId,
    seasonId: seasonId,
    label: s.label,
    startDate: s.startDate,
    endDate: s.endDate,
    isCurrent: s.isCurrent ?? false,
    description: s.description,
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
