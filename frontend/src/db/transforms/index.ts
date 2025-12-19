/**
 * Transform Layer - Central re-exports
 *
 * This module provides all transformations between IndexedDB (camelCase)
 * and frontend (camelCase) types in a single source of truth.
 *
 * With shared types now using camelCase and ISO strings everywhere,
 * most transforms are simplified pass-through operations.
 *
 * Transform directions:
 * - dbToXxx: IndexedDB → Frontend (mostly pass-through, strips sync metadata)
 * - xxxWriteToDb: Frontend → IndexedDB (for local writes)
 * - dbXxxToServerPayload: IndexedDB → Server API (for sync uploads)
 * - serverXxxToDb: Server API → IndexedDB (for cache downloads)
 */

// Common utilities
export * from './common';

// Entity transforms
export * from './teams';
export * from './players';
export * from './seasons';
export * from './matches';
export * from './events';
export * from './lineups';
export * from './matchState';

// Cache-only transforms (Server → IndexedDB)
export * from './playerTeams';
export * from './defaultLineups';
