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
    name: p.full_name,
    squadNumber: nullToUndefined(p.squad_number),
    preferredPosition: nullToUndefined(p.preferred_pos),
    dateOfBirth: p.dob ? new Date(p.dob) : undefined,
    notes: nullToUndefined(p.notes),
    currentTeam: nullToUndefined(p.current_team),
    createdAt: toDate(p.created_at) ?? new Date(),
    updatedAt: toDate(p.updated_at),
    created_by_user_id: p.created_by_user_id,
    deleted_at: toDate(p.deleted_at),
    deleted_by_user_id: nullToUndefined(p.deleted_by_user_id),
    is_deleted: toBool(p.is_deleted),
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
    full_name: data.name,
    squad_number: data.squadNumber,
    preferred_pos: data.preferredPosition,
    dob: data.dateOfBirth,
    notes: data.notes,
    current_team: data.teamId,
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
 */
export function dbPlayerToServerPayload(p: EnhancedPlayer): ServerPlayerPayload {
  return {
    name: p.full_name,
    squadNumber: nullToUndefined(p.squad_number),
    preferredPosition: nullToUndefined(p.preferred_pos),
    dateOfBirth: nullToUndefined(p.dob),
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
    full_name: p.name,
    squad_number: p.squadNumber,
    preferred_pos: p.preferredPosition,
    dob: p.dateOfBirth ? new Date(p.dateOfBirth).toISOString() : undefined,
    notes: p.notes,
    current_team: p.currentTeam,
    created_at: p.createdAt ? new Date(p.createdAt).getTime() : now,
    updated_at: p.updatedAt ? new Date(p.updatedAt).getTime() : now,
    created_by_user_id: p.created_by_user_id || 'server',
    is_deleted: p.is_deleted ?? false,
    synced: true,
    synced_at: now,
  } as EnhancedPlayer;
}
