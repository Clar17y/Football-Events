# Shared Types Unification - Inventory

## Overview

This document provides a complete inventory of all persistent models/stores across the codebase, documenting the current state and the target state for the type unification effort.

## Backend Prisma Models

| Prisma Model | Shared Type Name | ISO Timestamp Fields | Boundary Conversion Strategy |
|--------------|------------------|---------------------|------------------------------|
| `User` | N/A (backend-only) | `created_at`, `updated_at`, `deleted_at` | Not exposed to frontend |
| `Team` | `Team` | `created_at`, `updated_at`, `deleted_at` | `transformTeam` in `shared/types/transformers.ts` |
| `Player` | `Player` | `created_at`, `updated_at`, `deleted_at`, `dob` | `transformPlayer` in `shared/types/transformers.ts` |
| `Match` | `Match` | `created_at`, `updated_at`, `deleted_at`, `kickoff_ts` | `transformMatch` in `shared/types/transformers.ts` |
| `Event` | `Event` | `created_at`, `updated_at`, `deleted_at` | `transformEvent` in `shared/types/transformers.ts` |
| `awards` | `Award` | `created_at`, `updated_at`, `deleted_at` | `transformAward` in `shared/types/transformers.ts` |
| `match_awards` | `MatchAward` | `created_at`, `updated_at`, `deleted_at` | `transformMatchAward` in `shared/types/transformers.ts` |
| `seasons` | `Season` | `created_at`, `updated_at`, `deleted_at`, `start_date`, `end_date` | `transformSeason` in `shared/types/transformers.ts` |
| `lineup` | `Lineup` | `created_at`, `updated_at`, `deleted_at` | `transformLineup` in `shared/types/transformers.ts` |
| `player_teams` | `PlayerTeam` | `created_at`, `updated_at`, `deleted_at`, `start_date`, `end_date` | `transformPlayerTeam` in `shared/types/transformers.ts` |
| `match_state` | `MatchState` | `created_at`, `updated_at`, `deleted_at`, `match_started_at`, `match_ended_at`, `active_since` | `transformMatchState` in `shared/types/transformers.ts` |
| `match_periods` | `MatchPeriod` | `created_at`, `updated_at`, `deleted_at`, `started_at`, `ended_at` | `transformMatchPeriod` in `shared/types/transformers.ts` |
| `viewer_links` | `ViewerLink` (new) | `created_at`, `updated_at`, `deleted_at`, `expires_at` | `transformViewerLink` (to be added) |
| `default_lineups` | `DefaultLineup` (new) | `created_at`, `updated_at`, `deleted_at` | `transformDefaultLineup` (to be added) |
| `position_zones` | N/A (reference data) | `created_at` | Static reference data, no transform needed |
| `live_formations` | `LiveFormation` (new) | `created_at` | `transformLiveFormation` (to be added) |
| `user_role` (enum) | N/A | N/A | Enum, no transform needed |

## Frontend IndexedDB/Dexie Stores

| Dexie Store | Current Type | Target Db* Type | Shared Type Base | Notes |
|-------------|--------------|-----------------|------------------|-------|
| `players` | `EnhancedPlayer` | `DbPlayer` | `Player` | Extends with `synced`, `syncedAt` |
| `teams` | `EnhancedTeam` | `DbTeam` | `Team` | Extends with `synced`, `syncedAt` |
| `seasons` | `EnhancedSeason` | `DbSeason` | `Season` | Extends with `synced`, `syncedAt` |
| `matches` | `EnhancedMatch` | `DbMatch` | `Match` | Extends with `synced`, `syncedAt` |
| `events` | `EnhancedEvent` | `DbEvent` | `Event` | Extends with `synced`, `syncedAt`, `linkedEvents`, `autoLinkedAt` |
| `lineup` | `EnhancedLineup` | `DbLineup` | `Lineup` | Extends with `synced`, `syncedAt` |
| `player_teams` | `PlayerTeam` | `DbPlayerTeam` | `PlayerTeam` | Extends with `synced`, `syncedAt` |
| `match_notes` | `EnhancedMatchNote` | `DbMatchNote` | N/A (local-only) | Local-only, no shared type |
| `match_periods` | `LocalMatchPeriod` | `DbMatchPeriod` | `MatchPeriod` | Extends with `synced`, `syncedAt` |
| `match_state` | `LocalMatchState` | `DbMatchState` | `MatchState` | Extends with `synced`, `syncedAt` |
| `default_lineups` | `LocalDefaultLineup` | `DbDefaultLineup` | `DefaultLineup` | Extends with `synced`, `syncedAt` |
| `outbox` | `OutboxEvent` | `DbOutboxEvent` | N/A (local-only) | Local sync infrastructure |
| `sync_metadata` | `SyncMetadata` | `DbSyncMetadata` | N/A (local-only) | Local sync infrastructure |
| `settings` | `StoredSetting` | `DbSetting` | N/A (local-only) | Local settings storage |

## Current Issues Identified

### 1. Mixed Casing in Shared Types (`shared/types/frontend.ts`)

The following fields use snake_case instead of camelCase:

| Interface | Snake_case Fields |
|-----------|-------------------|
| `Player` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `Team` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`, `is_opponent` |
| `Match` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `Event` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `Season` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `Lineup` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `Award` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `MatchAward` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `PlayerTeam` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `MatchState` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `MatchPeriod` | `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted` |
| `TeamCreateRequest` | `is_opponent` |

### 2. Date Type Usage in Shared Types

The following fields use `Date` instead of ISO strings:

| Interface | Date Fields |
|-----------|-------------|
| `Player` | `dateOfBirth`, `createdAt`, `updatedAt`, `deleted_at` |
| `Team` | `createdAt`, `updatedAt`, `deleted_at` |
| `Match` | `kickoffTime`, `createdAt`, `updatedAt`, `deleted_at` |
| `Event` | `createdAt`, `updatedAt`, `deleted_at` |
| `Season` | `createdAt`, `updatedAt`, `deleted_at` |
| `Lineup` | `createdAt`, `updatedAt`, `deleted_at` |
| `Award` | `createdAt`, `updatedAt`, `deleted_at` |
| `MatchAward` | `createdAt`, `updatedAt`, `deleted_at` |
| `PlayerTeam` | `startDate`, `endDate`, `createdAt`, `updatedAt`, `deleted_at` |
| `MatchState` | `matchStartedAt`, `matchEndedAt`, `createdAt`, `updatedAt`, `deleted_at` |
| `MatchPeriod` | `startedAt`, `endedAt`, `createdAt`, `updatedAt`, `deleted_at` |

### 3. Duplicate Type Definitions

Frontend `schema.ts` defines these types that duplicate shared types:
- `EnhancedPlayer` (duplicates `Player`)
- `EnhancedTeam` (duplicates `Team`)
- `EnhancedMatch` (duplicates `Match`)
- `EnhancedEvent` (duplicates `Event`)
- `EnhancedSeason` (duplicates `Season`)
- `EnhancedLineup` (duplicates `Lineup`)

### 4. Missing Shared Types

The following Prisma models don't have corresponding shared types:
- `viewer_links` → needs `ViewerLink`
- `default_lineups` → needs `DefaultLineup`
- `live_formations` → needs `LiveFormation`

## Target State Summary

### Shared Types (`shared/types/frontend.ts`)

All entity interfaces will:
1. Use camelCase for ALL fields (no snake_case)
2. Use ISO strings for ALL date/time fields (no `Date` type)
3. Include standard auth/soft-delete fields: `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted`

### Frontend Schema (`frontend/src/db/schema.ts`)

Will define:
1. `SyncableRecord` interface with `synced: boolean` and `syncedAt?: string`
2. `Db*` types that extend shared types: `DbPlayer = Player & SyncableRecord`
3. Local-only types for `DbMatchNote`, `DbOutboxEvent`, `DbSyncMetadata`, `DbSetting`

### Backend Transformers (`shared/types/transformers.ts`)

Will:
1. Convert Prisma snake_case to camelCase
2. Serialize `Date` to ISO strings
3. Be the ONLY place where snake_case exists in TypeScript code

## Audit Results (Task 0.2)

### Snake_case Field Usage Outside Prisma Boundary

The following files contain snake_case field usage that needs to be updated:

#### `shared/types/frontend.ts` (Source of Truth - MUST FIX)
- `created_by_user_id` - 11 occurrences across all entity interfaces
- `deleted_at` - 11 occurrences across all entity interfaces
- `deleted_by_user_id` - 11 occurrences across all entity interfaces
- `is_deleted` - 11 occurrences across all entity interfaces
- `is_opponent` - 2 occurrences (Team interface and TeamCreateRequest)

#### `shared/types/transformers.ts` (Boundary Code - Expected)
- Contains snake_case on the RIGHT side of assignments (reading from Prisma)
- Contains snake_case on the LEFT side of assignments (writing to shared types) - **MUST FIX**
- This is the boundary layer, so reading snake_case from Prisma is expected
- But output should be camelCase

#### `frontend/src/db/indexedDB.ts` (Transform Code - MUST FIX)
- Lines 823-928: Converting between snake_case and camelCase in `upsertPlayer`, `getAllTeams`, `getAllPlayers`
- These transforms exist because shared types use snake_case

#### `frontend/src/db/transforms/teams.ts` (Transform Code - MUST FIX)
- Line 21: `is_opponent: toBool(t.isOpponent)`
- Line 134: `isOpponent: t.is_opponent ?? false`

#### `frontend/src/utils/calendarUtils.ts` (UI Code - MUST FIX)
- Lines 283-311: Multiple `is_opponent` references

#### `frontend/src/components/matchUtils.ts` (UI Code - MUST FIX)
- Lines 4-26: Multiple `is_opponent` references

#### `frontend/src/hooks/useLocalData.ts` (Hook Code - MUST FIX)
- Lines 63, 95: `is_opponent: !!t.isOpponent`

#### Test Files (MUST FIX)
- `frontend/tests/utils/calendarUtils.test.ts`
- `frontend/tests/unit/transforms/teams.test.ts`
- `frontend/tests/unit/database/transforms.property.test.ts`
- `shared/tests/transformers.test.ts`

### Date Type Usage in Shared Types

The following fields in `shared/types/frontend.ts` use `Date` instead of ISO strings:

| Interface | Date Fields |
|-----------|-------------|
| `Player` | `dateOfBirth`, `createdAt`, `updatedAt`, `deleted_at` |
| `Team` | `createdAt`, `updatedAt`, `deleted_at` |
| `Match` | `kickoffTime`, `createdAt`, `updatedAt`, `deleted_at` |
| `Event` | `createdAt`, `updatedAt`, `deleted_at` |
| `Season` | `createdAt`, `updatedAt`, `deleted_at` |
| `Position` | `createdAt`, `updatedAt` |
| `Lineup` | `createdAt`, `updatedAt`, `deleted_at` |
| `Award` | `createdAt`, `updatedAt`, `deleted_at` |
| `MatchAward` | `createdAt`, `updatedAt`, `deleted_at` |
| `PlayerTeam` | `startDate`, `endDate`, `createdAt`, `updatedAt`, `deleted_at` |
| `MatchState` | `matchStartedAt`, `matchEndedAt`, `createdAt`, `updatedAt`, `deleted_at` |
| `MatchPeriod` | `startedAt`, `endedAt`, `createdAt`, `updatedAt`, `deleted_at` |
| `PlayerCreateRequest` | `dateOfBirth` |
| `PlayerUpdateRequest` | `dateOfBirth` |
| `MatchCreateRequest` | `kickoffTime` |
| `MatchUpdateRequest` | `kickoffTime` |
| `PlayerTeamCreateRequest` | `startDate`, `endDate` |
| `PlayerTeamUpdateRequest` | `startDate`, `endDate` |

**Total: 50+ Date field usages that need to be converted to ISO strings**

### Summary of Required Changes

1. **`shared/types/frontend.ts`**: 
   - Change all snake_case fields to camelCase
   - Change all `Date` types to `string` (ISO format)

2. **`shared/types/transformers.ts`**:
   - Update output field names to camelCase
   - Add `.toISOString()` calls for Date serialization

3. **Frontend transforms/services/components**:
   - Will automatically work once shared types are updated
   - Remove field renaming logic
   - Update Date handling to use ISO strings

## Validation Checklist

- [ ] All Prisma models have corresponding shared types (except backend-only models)
- [ ] All IndexedDB stores have corresponding Db* types
- [ ] All shared types use camelCase exclusively
- [ ] All shared types use ISO strings for dates
- [ ] All transformers convert snake_case → camelCase
- [ ] All transformers serialize Date → ISO string
- [ ] No duplicate type definitions in frontend schema
