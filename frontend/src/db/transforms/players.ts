/**
 * Player transforms: IndexedDB ↔ Frontend
 */

import type { EnhancedPlayer } from '../schema';
import type { Player } from '@shared/types';
import { toDate, nullToUndefined, toBool } from './common';

/**
 * Transform IndexedDB player record to frontend Player type
 */
export function dbToPlayer(p: EnhancedPlayer): Player {
  return {
    id: p.id,
    name: p.fullName,
    squadNumber: nullToUndefined(p.squadNumber),
    preferredPosition: nullToUndefined(p.preferredPos),
    dateOfBirth: p.dob ? new Date(p.dob) : undefined,
    notes: nullToUndefined(p.notes),
    currentTeam: nullToUndefined(p.currentTeam),
    createdAt: toDate(p.createdAt) ?? new Date(),
    updatedAt: toDate(p.updatedAt),
    created_by_user_id: p.createdByUserId,
    deleted_at: toDate(p.deletedAt),
    deleted_by_user_id: nullToUndefined(p.deletedByUserId),
    is_deleted: toBool(p.isDeleted),
  };
}

/**
 * Transform multiple IndexedDB player records
 */
export function dbToPlayers(players: EnhancedPlayer[]): Player[] {
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
export function playerWriteToDb(data: PlayerWriteInput): Partial<EnhancedPlayer> {
  return {
    fullName: data.name,
    squadNumber: data.squadNumber,
    preferredPos: data.preferredPosition,
    dob: data.dateOfBirth,
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
export function dbPlayerToServerPayload(p: EnhancedPlayer): ServerPlayerPayload {
  // Convert ISO timestamp to YYYY-MM-DD format for server
  let dateOfBirth: string | undefined;
  if (p.dob) {
    // Handle both ISO format (2005-12-16T00:00:00.000Z) and date-only (2005-12-16)
    dateOfBirth = p.dob.split('T')[0];
  }
  
  return {
    name: p.fullName,
    squadNumber: nullToUndefined(p.squadNumber),
    preferredPosition: nullToUndefined(p.preferredPos),
    dateOfBirth,
    notes: nullToUndefined(p.notes),
  };
}

// ============================================================================
// CACHE SERVICE TRANSFORMS (Server API → IndexedDB)
// ============================================================================

/**
 * Server API player response (camelCase)
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
  created_by_user_id?: string;
  is_deleted?: boolean;
}

/**
 * Transform Server API player to IndexedDB format for caching
 */
export function serverPlayerToDb(p: ServerPlayerResponse): EnhancedPlayer {
  const now = Date.now();
  return {
    id: p.id,
    fullName: p.name,
    squadNumber: p.squadNumber,
    preferredPos: p.preferredPosition,
    dob: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString() : undefined,
    notes: p.notes,
    currentTeam: p.currentTeam,
    createdAt: p.createdAt ? new Date(p.createdAt).getTime() : now,
    updatedAt: p.updatedAt ? new Date(p.updatedAt).getTime() : now,
    createdByUserId: p.created_by_user_id || 'server',
    isDeleted: p.is_deleted ?? false,
    synced: true,
    syncedAt: now,
  } as EnhancedPlayer;
}
