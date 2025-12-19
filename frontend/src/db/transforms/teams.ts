/**
 * Team transforms: IndexedDB ↔ Frontend
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * DbTeam extends Team, so dbToTeam is essentially pass-through.
 */

import type { DbTeam } from '../schema';
import type { Team } from '@shared/types';
import { nullToUndefined, toBool, nowIso } from './common';

/**
 * Transform IndexedDB team record to frontend Team type
 * Since DbTeam extends Team, this is essentially a pass-through
 * that strips sync metadata and handles legacy field aliases.
 */
export function dbToTeam(t: DbTeam): Team {
  return {
    id: t.id,
    name: t.name,
    homeKitPrimary: nullToUndefined(t.homeKitPrimary),
    homeKitSecondary: nullToUndefined(t.homeKitSecondary),
    awayKitPrimary: nullToUndefined(t.awayKitPrimary),
    awayKitSecondary: nullToUndefined(t.awayKitSecondary),
    logoUrl: nullToUndefined(t.logoUrl),
    isOpponent: toBool(t.isOpponent),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdByUserId: t.createdByUserId,
    deletedAt: t.deletedAt,
    deletedByUserId: nullToUndefined(t.deletedByUserId),
    isDeleted: toBool(t.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB team records
 */
export function dbToTeams(teams: DbTeam[]): Team[] {
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
export function teamWriteToDb(data: TeamWriteInput): Partial<DbTeam> {
  return {
    name: data.name,
    homeKitPrimary: data.homeKitPrimary,
    homeKitSecondary: data.homeKitSecondary,
    awayKitPrimary: data.awayKitPrimary,
    awayKitSecondary: data.awayKitSecondary,
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
export function dbTeamToServerPayload(t: DbTeam): ServerTeamPayload {
  return {
    name: t.name,
    homeKitPrimary: nullToUndefined(t.homeKitPrimary),
    homeKitSecondary: nullToUndefined(t.homeKitSecondary),
    awayKitPrimary: nullToUndefined(t.awayKitPrimary),
    awayKitSecondary: nullToUndefined(t.awayKitSecondary),
    logoUrl: nullToUndefined(t.logoUrl),
    isOpponent: toBool(t.isOpponent),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API team response (camelCase - server now returns camelCase)
 */
export interface ServerTeamResponse {
  id: string;
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
  isOpponent?: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API team to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverTeamToDb(t: ServerTeamResponse): DbTeam {
  const now = nowIso();
  return {
    id: t.id,
    name: t.name,
    homeKitPrimary: t.homeKitPrimary,
    homeKitSecondary: t.homeKitSecondary,
    awayKitPrimary: t.awayKitPrimary,
    awayKitSecondary: t.awayKitSecondary,
    logoUrl: t.logoUrl,
    isOpponent: t.isOpponent ?? false,
    createdAt: t.createdAt ?? now,
    updatedAt: t.updatedAt ?? now,
    createdByUserId: t.createdByUserId ?? 'server',
    deletedAt: t.deletedAt,
    deletedByUserId: t.deletedByUserId,
    isDeleted: t.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}
