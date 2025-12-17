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
  const id = s.season_id || s.id;
  return {
    id: id!,
    seasonId: id!,
    label: s.label,
    startDate: nullToUndefined(s.start_date),
    endDate: nullToUndefined(s.end_date),
    isCurrent: toBool(s.is_current),
    description: nullToUndefined(s.description),
    createdAt: toDate(s.created_at) ?? new Date(),
    updatedAt: toDate(s.updated_at),
    created_by_user_id: s.created_by_user_id,
    deleted_at: toDate(s.deleted_at),
    deleted_by_user_id: nullToUndefined(s.deleted_by_user_id),
    is_deleted: toBool(s.is_deleted),
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
    start_date: data.startDate,
    end_date: data.endDate,
    is_current: data.isCurrent ?? false,
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
 */
export function dbSeasonToServerPayload(s: EnhancedSeason): ServerSeasonPayload {
  return {
    label: s.label,
    startDate: s.start_date || new Date().toISOString().slice(0, 10),
    endDate: s.end_date || new Date().toISOString().slice(0, 10),
    isCurrent: toBool(s.is_current),
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
    season_id: seasonId,
    label: s.label,
    start_date: s.startDate,
    end_date: s.endDate,
    is_current: s.isCurrent ?? false,
    description: s.description,
    created_at: s.createdAt ? new Date(s.createdAt).getTime() : now,
    updated_at: s.updatedAt ? new Date(s.updatedAt).getTime() : now,
    created_by_user_id: s.created_by_user_id || 'server',
    is_deleted: s.is_deleted ?? false,
    synced: true,
    synced_at: now,
  } as EnhancedSeason;
}
