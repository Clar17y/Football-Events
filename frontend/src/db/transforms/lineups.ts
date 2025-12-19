/**
 * Lineup transforms: IndexedDB ↔ Frontend
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * DbLineup extends Lineup, so dbToLineup is essentially pass-through.
 */

import type { DbLineup } from '../schema';
import type { Lineup } from '@shared/types';
import { nullToUndefined, toBool, nowIso } from './common';

/**
 * Transform IndexedDB lineup record to frontend Lineup type
 * Since DbLineup extends Lineup, this is essentially a pass-through
 * that strips sync metadata.
 */
export function dbToLineup(l: DbLineup): Lineup {
  return {
    id: l.id,
    matchId: l.matchId,
    playerId: l.playerId,
    startMinute: l.startMinute,
    endMinute: nullToUndefined(l.endMinute),
    position: l.position,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    createdByUserId: l.createdByUserId,
    deletedAt: l.deletedAt,
    deletedByUserId: nullToUndefined(l.deletedByUserId),
    isDeleted: toBool(l.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB lineup records
 */
export function dbToLineups(lineups: DbLineup[]): Lineup[] {
  return lineups.map(dbToLineup);
}

/**
 * Input shape for creating/updating lineups (frontend camelCase)
 */
export interface LineupWriteInput {
  matchId: string;
  playerId: string;
  startMinute: number;
  endMinute?: number;
  position: string;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function lineupWriteToDb(data: LineupWriteInput): Partial<DbLineup> {
  return {
    matchId: data.matchId,
    playerId: data.playerId,
    startMinute: data.startMinute,
    endMinute: data.endMinute,
    position: data.position,
  };
}

/**
 * Generate composite ID for lineup records
 * Format: matchId-playerId-startMinute
 */
export function generateLineupId(matchId: string, playerId: string, startMinute: number): string {
  return `${matchId}-${playerId}-${startMinute}`;
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API lineup response (camelCase - server now returns camelCase)
 */
export interface ServerLineupResponse {
  id: string;
  matchId: string;
  playerId: string;
  startMinute: number;
  endMinute?: number;
  position: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API lineup to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverLineupToDb(l: ServerLineupResponse): DbLineup {
  const now = nowIso();
  return {
    id: l.id,
    matchId: l.matchId,
    playerId: l.playerId,
    startMinute: l.startMinute,
    endMinute: l.endMinute,
    position: l.position,
    createdAt: l.createdAt ?? now,
    updatedAt: l.updatedAt ?? now,
    createdByUserId: l.createdByUserId ?? 'server',
    deletedAt: l.deletedAt,
    deletedByUserId: l.deletedByUserId,
    isDeleted: l.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}
