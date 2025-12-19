# IndexedDB snake_case Audit Results

## Summary

This audit identifies all snake_case field usage in the frontend and shared directories that need to be migrated to camelCase.

**Audit Date:** December 17, 2025  
**Status:** Complete

## Findings Overview

| Category | Files Affected | Severity |
|----------|---------------|----------|
| Schema Interfaces | 1 | High |
| Schema Indexes | 1 | High |
| Database Layer | 3 | High |
| Transform Layer | 9 | High |
| Services | TBD | Medium |
| Components | TBD | Medium |

## Detailed Findings

### 1. Schema Interfaces (`frontend/src/db/schema.ts`)

All interface definitions use snake_case fields:

**SyncableRecord:**
- `synced_at`

**EnhancedEvent:**
- `match_id`, `ts_server`, `period_number`, `clock_ms`, `team_id`, `player_id`
- `linked_events`, `auto_linked_at`, `created_at`, `updated_at`
- `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**EnhancedMatch:**
- `match_id`, `season_id`, `kickoff_ts`, `home_team_id`, `away_team_id`
- `duration_mins`, `period_format`, `home_score`, `away_score`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**EnhancedTeam:**
- `team_id`, `color_primary`, `color_secondary`, `away_color_primary`, `away_color_secondary`
- `logo_url`, `is_opponent`, `created_at`, `updated_at`
- `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**EnhancedPlayer:**
- `full_name`, `squad_number`, `preferred_pos`, `current_team`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**EnhancedSeason:**
- `season_id`, `start_date`, `end_date`, `is_current`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**EnhancedLineup:**
- `match_id`, `player_id`, `start_min`, `end_min`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**EnhancedMatchNote:**
- `match_note_id`, `match_id`, `period_number`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**LocalMatchPeriod:**
- `match_id`, `period_number`, `period_type`, `started_at`, `ended_at`, `duration_seconds`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**LocalMatchState:**
- `match_id`, `current_period_id`, `timer_ms`, `last_updated_at`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**LocalDefaultLineup:**
- `team_id`, `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**EnhancedOutboxEvent:**
- `table_name`, `record_id`, `created_at`, `retry_count`, `last_sync_attempt`, `sync_error`, `failed_at`

**EnhancedSyncMetadata:**
- `table_name`, `record_id`, `last_synced`, `server_version`, `local_version`, `conflict_strategy`

### 2. Schema Indexes (`frontend/src/db/schema.ts` - SCHEMA_INDEXES)

All composite indexes use snake_case:

**Events:**
- `match_id`, `player_id`, `team_id`
- `[match_id+player_id]`, `[match_id+team_id]`, `[match_id+clock_ms]`
- `[match_id+kind]`, `[match_id+period_number]`
- `[player_id+kind]`, `[player_id+sentiment]`, `[team_id+period_number]`
- `linked_events`, `ts_server`, `updated_at`, `[synced+created_by_user_id]`

**Matches:**
- `season_id`, `home_team_id`, `away_team_id`, `kickoff_ts`
- `created_by_user_id`, `is_deleted`
- `[season_id+kickoff_ts]`, `[home_team_id+kickoff_ts]`, `[away_team_id+kickoff_ts]`
- `updated_at`, `[synced+created_by_user_id]`

**Players:**
- `current_team`, `full_name`, `squad_number`
- `created_by_user_id`, `is_deleted`
- `[current_team+squad_number]`, `[current_team+full_name]`
- `updated_at`, `[synced+created_by_user_id]`

**Teams:**
- `created_by_user_id`, `is_deleted`, `updated_at`, `[synced+created_by_user_id]`

**Seasons:**
- `created_by_user_id`, `is_deleted`, `updated_at`, `[synced+created_by_user_id]`

**Lineup:**
- `match_id`, `player_id`
- `[match_id+start_min]`, `[match_id+position]`, `[player_id+match_id]`
- `updated_at`, `[synced+created_by_user_id]`

**Match Notes:**
- `match_id`, `[match_id+period_number]`, `updated_at`

**Outbox:**
- `table_name`, `created_by_user_id`
- `[synced+created_at]`, `[table_name+synced]`
- `retry_count`, `last_sync_attempt`

**Sync Metadata:**
- `table_name`, `record_id`
- `[table_name+record_id]`, `[table_name+last_synced]`
- `last_synced`

**Match Periods:**
- `match_id`, `period_number`, `[match_id+period_number]`
- `started_at`, `created_by_user_id`, `is_deleted`
- `[synced+created_by_user_id]`, `[match_id+synced]`

**Match State:**
- `match_id`, `created_by_user_id`, `[synced+created_by_user_id]`

**Default Lineups:**
- `team_id`, `created_by_user_id`, `is_deleted`, `[synced+created_by_user_id]`

### 3. Database Layer

**`frontend/src/db/indexedDB.ts`:**
- Dexie where clauses: `.where('match_id')`, `.where('[match_id+player_id]')`
- Field access: `event.match_id`, `event.clock_ms`, `event.team_id`, `event.player_id`
- Object construction: `match_id: eventData.match_id`, `ts_server: now`, etc.
- OutboxEvent interface: `table_name`, `record_id`, `created_at`, `retry_count`, etc.

**`frontend/src/db/utils.ts`:**
- Dexie where clauses: `.where('[match_id+player_id]')`, `.where('[match_id+team_id]')`
- Field access: `event.player_id`, `event.period_number`, `event.clock_ms`
- Object construction: `updated_at: Date.now()`, `table_name`, `record_id`, etc.

**`frontend/src/db/eventLinking.ts`:**
- Dexie where clause: `.where('[match_id+clock_ms]')`
- Field access: `event.linked_events`, `event.clock_ms`
- Object updates: `linked_events`, `auto_linked_at`, `updated_at`

**`frontend/src/db/performance.ts`:**
- Dexie where clause: `.where('[match_id+clock_ms]')`
- Index references in strings: `'[match_id+clock_ms]'`

### 4. Transform Layer

All transform files convert between snake_case (DB) and camelCase (frontend):

**`frontend/src/db/transforms/teams.ts`:**
- `color_primary` ↔ `homeKitPrimary`
- `color_secondary` ↔ `homeKitSecondary`
- `away_color_primary` ↔ `awayKitPrimary`
- `away_color_secondary` ↔ `awayKitSecondary`
- `logo_url` ↔ `logoUrl`
- `is_opponent` ↔ `isOpponent`
- `team_id`, `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`, `synced_at`

**`frontend/src/db/transforms/players.ts`:**
- `full_name` ↔ `name`
- `squad_number` ↔ `squadNumber`
- `preferred_pos` ↔ `preferredPosition`
- `current_team` ↔ `currentTeam`/`teamId`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**`frontend/src/db/transforms/seasons.ts`:**
- `season_id` ↔ `id`
- `start_date` ↔ `startDate`
- `end_date` ↔ `endDate`
- `is_current` ↔ `isCurrent`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**`frontend/src/db/transforms/matches.ts`:**
- `match_id` ↔ `id`
- `season_id` ↔ `seasonId`
- `kickoff_ts` ↔ `kickoffTime`
- `home_team_id` ↔ `homeTeamId`
- `away_team_id` ↔ `awayTeamId`
- `duration_mins` ↔ `durationMinutes`
- `period_format` ↔ `periodFormat`
- `home_score` ↔ `homeScore`
- `away_score` ↔ `awayScore`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**`frontend/src/db/transforms/events.ts`:**
- `match_id` ↔ `matchId`
- `period_number` ↔ `periodNumber`
- `clock_ms` ↔ `clockMs`
- `team_id` ↔ `teamId`
- `player_id` ↔ `playerId`
- `ts_server`, `linked_events`, `auto_linked_at`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**`frontend/src/db/transforms/lineups.ts`:**
- `match_id` ↔ `matchId`
- `player_id` ↔ `playerId`
- `start_min` ↔ `startMinute`/`startMin`
- `end_min` ↔ `endMinute`/`endMin`
- `created_at`, `updated_at`, `created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`

**`frontend/src/db/transforms/matchState.ts`:**
- `match_id` ↔ `matchId`
- `current_period_id` ↔ `currentPeriodId`
- `timer_ms` ↔ `timerMs`
- `last_updated_at` ↔ `lastUpdatedAt`
- `period_number` ↔ `periodNumber`
- `period_type` ↔ `periodType`
- `started_at` ↔ `startedAt`
- `ended_at` ↔ `endedAt`
- `duration_seconds` ↔ `durationSeconds`

**`frontend/src/db/transforms/playerTeams.ts`:** (to be verified)
**`frontend/src/db/transforms/defaultLineups.ts`:** (to be verified)

## Hotspots Summary

### Critical (Must Update First)
1. `frontend/src/db/schema.ts` - All interface definitions and SCHEMA_INDEXES
2. `frontend/src/db/indexedDB.ts` - Database version, store definitions, all methods

### High Priority (Update After Schema)
3. `frontend/src/db/utils.ts` - Query methods and field access
4. `frontend/src/db/eventLinking.ts` - Event linking queries
5. `frontend/src/db/performance.ts` - Index references
6. All transform files in `frontend/src/db/transforms/`

### Medium Priority (Update After DB Layer)
7. Service layer files (cacheService, syncService, dataLayer, API services)
8. Components and hooks

## No snake_case Found In

The following patterns were searched and returned no results:
- Direct property access like `.match_id`, `.team_id` in non-DB files
- JSON fixture files
- JavaScript files in frontend/shared

## Recommendations

1. **Start with schema.ts** - Update all interfaces and SCHEMA_INDEXES first
2. **Bump DB version to 11** - This triggers clean slate migration
3. **Update indexedDB.ts** - All methods and store definitions
4. **Update transform layer** - Simplify transforms since DB will now use camelCase
5. **Run TypeScript compiler** - Let it catch remaining snake_case references
6. **Manual testing** - Verify all CRUD operations work correctly
