/**
 * Player transforms: IndexedDB ↔ Frontend
 * 
 * With shared types using camelCase and ISO strings, transforms are simplified.
 * DbPlayer extends Player, so dbToPlayer is essentially pass-through.
 */

import type { DbPlayer } from '../schema';
import type { Player } from '@shared/types';
import { nullToUndefined, toBool, nowIso } from './common';

/**
 * Transform IndexedDB player record to frontend Player type
 * Since DbPlayer extends Player, this is essentially a pass-through
 * that strips sync metadata and handles legacy field aliases.
 */
export function dbToPlayer(p: DbPlayer): Player {
  return {
    id: p.id,
    name: p.name || '',
    squadNumber: nullToUndefined(p.squadNumber),
    preferredPosition: nullToUndefined(p.preferredPosition),
    dateOfBirth: nullToUndefined(p.dateOfBirth),
    notes: nullToUndefined(p.notes),
    currentTeam: nullToUndefined(p.currentTeam),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdByUserId: p.createdByUserId,
    deletedAt: p.deletedAt,
    deletedByUserId: nullToUndefined(p.deletedByUserId),
    isDeleted: toBool(p.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB player records
 */
export function dbToPlayers(players: DbPlayer[]): Player[] {
  return players.map(dbToPlayer);
}

/**
 * Input shape for creating/updating players (frontend camelCase)
 */
export interface PlayerWriteInput {
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: string;
  notes?: string;
  teamId?: string;
}

/**
 * Transform frontend write input to IndexedDB format
 */
export function playerWriteToDb(data: PlayerWriteInput): Partial<DbPlayer> {
  return {
    name: data.name,
    squadNumber: data.squadNumber,
    preferredPosition: data.preferredPosition,
    dateOfBirth: data.dateOfBirth,
    notes: data.notes,
    currentTeam: data.teamId,
  };
}

// ============================================================================
// SYNC SERVICE TRANSFORMS (IndexedDB → Server API)
// ============================================================================

/**
 * Server API player payload (camelCase)
 */
export interface ServerPlayerPayload {
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: string;
  notes?: string;
}

/**
 * Transform IndexedDB player to Server API payload for sync
 * Note: dateOfBirth must be YYYY-MM-DD format for the server
 */
export function dbPlayerToServerPayload(p: DbPlayer): ServerPlayerPayload {
  // Convert ISO timestamp to YYYY-MM-DD format for server
  let dateOfBirth: string | undefined;
  const dob = p.dateOfBirth;
  if (dob) {
    // Handle both ISO format (2005-12-16T00:00:00.000Z) and date-only (2005-12-16)
    dateOfBirth = dob.split('T')[0];
  }

  return {
    name: p.name || '',
    squadNumber: nullToUndefined(p.squadNumber),
    preferredPosition: nullToUndefined(p.preferredPosition),
    dateOfBirth,
    notes: nullToUndefined(p.notes),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API player response (camelCase - server now returns camelCase)
 */
export interface ServerPlayerResponse {
  id: string;
  name: string;
  squadNumber?: number;
  preferredPosition?: string;
  dateOfBirth?: string;
  notes?: string;
  currentTeam?: string;
  createdAt?: string;
  updatedAt?: string;
  createdByUserId?: string;
  deletedAt?: string;
  deletedByUserId?: string;
  isDeleted?: boolean;
}

/**
 * Transform Server API player to IndexedDB format for caching
 * Server now returns camelCase, so this is mostly pass-through
 */
export function serverPlayerToDb(p: ServerPlayerResponse): DbPlayer {
  const now = nowIso();
  return {
    id: p.id,
    name: p.name,
    squadNumber: p.squadNumber,
    preferredPosition: p.preferredPosition,
    dateOfBirth: p.dateOfBirth,
    notes: p.notes,
    currentTeam: p.currentTeam,
    createdAt: p.createdAt ?? now,
    updatedAt: p.updatedAt ?? now,
    createdByUserId: p.createdByUserId ?? 'server',
    deletedAt: p.deletedAt,
    deletedByUserId: p.deletedByUserId,
    isDeleted: p.isDeleted ?? false,
    synced: true,
    syncedAt: now,
  };
}
