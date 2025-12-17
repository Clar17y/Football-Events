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
    homeKitPrimary: nullToUndefined(t.color_primary),
    homeKitSecondary: nullToUndefined(t.color_secondary),
    awayKitPrimary: nullToUndefined(t.away_color_primary),
    awayKitSecondary: nullToUndefined(t.away_color_secondary),
    logoUrl: nullToUndefined(t.logo_url),
    is_opponent: toBool(t.is_opponent),
    createdAt: toDate(t.created_at) ?? new Date(),
    updatedAt: toDate(t.updated_at),
    created_by_user_id: t.created_by_user_id,
    deleted_at: toDate(t.deleted_at),
    deleted_by_user_id: nullToUndefined(t.deleted_by_user_id),
    is_deleted: toBool(t.is_deleted),
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
    color_primary: data.homeKitPrimary,
    color_secondary: data.homeKitSecondary,
    away_color_primary: data.awayKitPrimary,
    away_color_secondary: data.awayKitSecondary,
    logo_url: data.logoUrl,
    is_opponent: data.isOpponent ?? false,
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
    homeKitPrimary: nullToUndefined(t.color_primary),
    homeKitSecondary: nullToUndefined(t.color_secondary),
    awayKitPrimary: nullToUndefined(t.away_color_primary),
    awayKitSecondary: nullToUndefined(t.away_color_secondary),
    logoUrl: nullToUndefined(t.logo_url),
    isOpponent: toBool(t.is_opponent),
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
    team_id: t.id,
    name: t.name,
    color_primary: t.homeKitPrimary,
    color_secondary: t.homeKitSecondary,
    away_color_primary: t.awayKitPrimary,
    away_color_secondary: t.awayKitSecondary,
    logo_url: t.logoUrl,
    is_opponent: t.is_opponent ?? false,
    created_at: t.createdAt ? new Date(t.createdAt).getTime() : now,
    updated_at: t.updatedAt ? new Date(t.updatedAt).getTime() : now,
    created_by_user_id: t.created_by_user_id || 'server',
    is_deleted: t.is_deleted ?? false,
    synced: true,
    synced_at: now,
  } as EnhancedTeam;
}
