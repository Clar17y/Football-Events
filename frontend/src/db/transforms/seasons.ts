/**
 * Season transforms: IndexedDB ↔ Frontend
 */

import type { EnhancedSeason } from '../schema';
import type { Season } from '@shared/types';
import { toDate, nullToUndefined, toBool } from './common';

/**
 * Transform IndexedDB season record to frontend Season type
 */
export function dbToSeason(s: EnhancedSeason): Season {
  const id = s.seasonId || s.id;
  return {
    id: id!,
    seasonId: id!,
    label: s.label,
    startDate: nullToUndefined(s.startDate),
    endDate: nullToUndefined(s.endDate),
    isCurrent: toBool(s.isCurrent),
    description: nullToUndefined(s.description),
    createdAt: toDate(s.createdAt) ?? new Date(),
    updatedAt: toDate(s.updatedAt),
    created_by_user_id: s.createdByUserId,
    deleted_at: toDate(s.deletedAt),
    deleted_by_user_id: nullToUndefined(s.deletedByUserId),
    is_deleted: toBool(s.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB season records
 */
export function dbToSeasons(seasons: EnhancedSeason[]): Season[] {
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
export function seasonWriteToDb(data: SeasonWriteInput): Partial<EnhancedSeason> {
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
export function dbSeasonToServerPayload(s: EnhancedSeason): ServerSeasonPayload {
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
 * Server API season response (camelCase)
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
  created_by_user_id?: string;
  is_deleted?: boolean;
}

/**
 * Transform Server API season to IndexedDB format for caching
 */
export function serverSeasonToDb(s: ServerSeasonResponse): EnhancedSeason {
  const now = Date.now();
  const seasonId = s.id || s.seasonId!;
  return {
    id: seasonId,
    seasonId: seasonId,
    label: s.label,
    startDate: s.startDate,
    endDate: s.endDate,
    isCurrent: s.isCurrent ?? false,
    description: s.description,
    createdAt: s.createdAt ? new Date(s.createdAt).getTime() : now,
    updatedAt: s.updatedAt ? new Date(s.updatedAt).getTime() : now,
    createdByUserId: s.created_by_user_id || 'server',
    isDeleted: s.is_deleted ?? false,
    synced: true,
    syncedAt: now,
  } as EnhancedSeason;
}
