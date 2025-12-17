/**
 * Team transforms: IndexedDB ↔ Frontend
 */

import type { EnhancedTeam } from '../schema';
import type { Team } from '@shared/types';
import { toDate, nullToUndefined, toBool } from './common';

/**
 * Transform IndexedDB team record to frontend Team type
 */
export function dbToTeam(t: EnhancedTeam): Team {
  return {
    id: t.id,
    name: t.name,
    homeKitPrimary: nullToUndefined(t.colorPrimary),
    homeKitSecondary: nullToUndefined(t.colorSecondary),
    awayKitPrimary: nullToUndefined(t.awayColorPrimary),
    awayKitSecondary: nullToUndefined(t.awayColorSecondary),
    logoUrl: nullToUndefined(t.logoUrl),
    is_opponent: toBool(t.isOpponent),
    createdAt: toDate(t.createdAt) ?? new Date(),
    updatedAt: toDate(t.updatedAt),
    created_by_user_id: t.createdByUserId,
    deleted_at: toDate(t.deletedAt),
    deleted_by_user_id: nullToUndefined(t.deletedByUserId),
    is_deleted: toBool(t.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB team records
 */
export function dbToTeams(teams: EnhancedTeam[]): Team[] {
  return teams.map(dbToTeam);
}

/**
 * Input shape for creating/updating teams (frontend camelCase)
 */
export interface TeamWriteInput {
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
  isOpponent?: boolean;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function teamWriteToDb(data: TeamWriteInput): Partial<EnhancedTeam> {
  return {
    name: data.name,
    colorPrimary: data.homeKitPrimary,
    colorSecondary: data.homeKitSecondary,
    awayColorPrimary: data.awayKitPrimary,
    awayColorSecondary: data.awayKitSecondary,
    logoUrl: data.logoUrl,
    isOpponent: data.isOpponent ?? false,
  };
}

// ============================================================================
// SYNC SERVICE TRANSFORMS (IndexedDB → Server API)
// ============================================================================

/**
 * Server API team payload (camelCase)
 */
export interface ServerTeamPayload {
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
  isOpponent?: boolean;
}

/**
 * Transform IndexedDB team to Server API payload for sync
 */
export function dbTeamToServerPayload(t: EnhancedTeam): ServerTeamPayload {
  return {
    name: t.name,
    homeKitPrimary: nullToUndefined(t.colorPrimary),
    homeKitSecondary: nullToUndefined(t.colorSecondary),
    awayKitPrimary: nullToUndefined(t.awayColorPrimary),
    awayKitSecondary: nullToUndefined(t.awayColorSecondary),
    logoUrl: nullToUndefined(t.logoUrl),
    isOpponent: toBool(t.isOpponent),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API team response (camelCase)
 */
export interface ServerTeamResponse {
  id: string;
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
  is_opponent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  created_by_user_id?: string;
  is_deleted?: boolean;
}

/**
 * Transform Server API team to IndexedDB format for caching
 */
export function serverTeamToDb(t: ServerTeamResponse): EnhancedTeam {
  const now = Date.now();
  return {
    id: t.id,
    teamId: t.id,
    name: t.name,
    colorPrimary: t.homeKitPrimary,
    colorSecondary: t.homeKitSecondary,
    awayColorPrimary: t.awayKitPrimary,
    awayColorSecondary: t.awayKitSecondary,
    logoUrl: t.logoUrl,
    isOpponent: t.is_opponent ?? false,
    createdAt: t.createdAt ? new Date(t.createdAt).getTime() : now,
    updatedAt: t.updatedAt ? new Date(t.updatedAt).getTime() : now,
    createdByUserId: t.created_by_user_id || 'server',
    isDeleted: t.is_deleted ?? false,
    synced: true,
    syncedAt: now,
  } as EnhancedTeam;
}
