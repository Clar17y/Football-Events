# Design Document: IndexedDB camelCase Migration

## Overview

This migration converts the IndexedDB schema from snake_case to camelCase field naming. The goal is to align the database layer with API responses and frontend TypeScript types, eliminating unnecessary field name transformations. Since there are no active users, we use a clean slate approach where bumping the Dexie database version auto-clears old data.

**Estimated effort:** 25-35 hours  
**Risk level:** Low (0 users, clean DB reset)  
**Prerequisites:** 0 active users (fresh start)

### Migration Strategy

Since there are no users, we use the **clean slate approach**:
1. Bump Dexie database version to 11
2. Old database auto-clears on version mismatch
3. Users get fresh, empty database with new schema
4. Data syncs from server on first authenticated load

## Architecture

The migration follows a layered approach, updating from bottom to top:

```
┌─────────────────────────────────────────┐
│         Components & Hooks              │  ← Phase 5
├─────────────────────────────────────────┤
│         Service Layer                   │  ← Phase 4
│  (cacheService, syncService, APIs)      │
├─────────────────────────────────────────┤
│         Transform Layer                 │  ← Phase 3
│  (transforms/*.ts - simplified)         │
├─────────────────────────────────────────┤
│         Database Layer                  │  ← Phase 2
│  (indexedDB.ts, utils.ts, etc.)         │
├─────────────────────────────────────────┤
│         Schema & Types                  │  ← Phase 1
│  (schema.ts interfaces + indexes)       │
└─────────────────────────────────────────┘
```

## Components and Interfaces

### Phase 1: Schema Changes

**File: `frontend/src/db/schema.ts`**

All interfaces convert from snake_case to camelCase:

```typescript
// SyncableRecord
interface SyncableRecord {
  synced: boolean;
  syncedAt?: Timestamp;  // was: synced_at
}

// EnhancedEvent (example fields)
interface EnhancedEvent extends SyncableRecord {
  id: ID;
  matchId: ID;           // was: match_id
  tsServer: Timestamp;   // was: ts_server
  periodNumber: number;  // was: period_number
  clockMs: number;       // was: clock_ms
  teamId: ID;            // was: team_id
  playerId: ID;          // was: player_id
  createdAt: Timestamp;  // was: created_at
  updatedAt: Timestamp;  // was: updated_at
  createdByUserId: ID;   // was: created_by_user_id
  isDeleted: boolean;    // was: is_deleted
  // ... etc
}
```

**SCHEMA_INDEXES** also converts to camelCase:

```typescript
export const SCHEMA_INDEXES = {
  events: [
    'matchId',
    'playerId', 
    '[matchId+playerId]',
    '[matchId+clockMs]',
    // ...
  ],
  // ...
};
```

### Phase 2: Database Layer

**File: `frontend/src/db/indexedDB.ts`**

- Bump version to 11 to trigger clean slate
- Update all method implementations to use camelCase field access

### Phase 3: Transform Layer

After migration, transforms become simpler:

```typescript
// BEFORE: serverTeamToDb had complex mapping
export function serverTeamToDb(t: ServerTeamResponse): EnhancedTeam {
  return {
    id: t.id,
    team_id: t.id,           // snake_case
    color_primary: t.homeKitPrimary,  // mapping required
    // ...
  };
}

// AFTER: near pass-through
export function serverTeamToDb(t: ServerTeamResponse): EnhancedTeam {
  return {
    id: t.id,
    teamId: t.id,            // camelCase - direct
    colorPrimary: t.homeKitPrimary,  // simpler mapping
    // ...
  };
}
```

## Data Models

### Field Mapping Reference (Complete)

| Entity | Before (snake_case) | After (camelCase) |
|--------|---------------------|-------------------|
| Common | `created_at` | `createdAt` |
| Common | `updated_at` | `updatedAt` |
| Common | `created_by_user_id` | `createdByUserId` |
| Common | `deleted_at` | `deletedAt` |
| Common | `deleted_by_user_id` | `deletedByUserId` |
| Common | `is_deleted` | `isDeleted` |
| Common | `synced_at` | `syncedAt` |
| Event | `match_id` | `matchId` |
| Event | `ts_server` | `tsServer` |
| Event | `period_number` | `periodNumber` |
| Event | `clock_ms` | `clockMs` |
| Event | `team_id` | `teamId` |
| Event | `player_id` | `playerId` |
| Event | `linked_events` | `linkedEvents` |
| Event | `auto_linked_at` | `autoLinkedAt` |
| Match | `match_id` | `matchId` |
| Match | `season_id` | `seasonId` |
| Match | `kickoff_ts` | `kickoffTs` |
| Match | `home_team_id` | `homeTeamId` |
| Match | `away_team_id` | `awayTeamId` |
| Match | `duration_mins` | `durationMins` |
| Match | `period_format` | `periodFormat` |
| Match | `home_score` | `homeScore` |
| Match | `away_score` | `awayScore` |
| Team | `team_id` | `teamId` |
| Team | `color_primary` | `colorPrimary` |
| Team | `color_secondary` | `colorSecondary` |
| Team | `away_color_primary` | `awayColorPrimary` |
| Team | `away_color_secondary` | `awayColorSecondary` |
| Team | `logo_url` | `logoUrl` |
| Team | `is_opponent` | `isOpponent` |
| Player | `full_name` | `fullName` |
| Player | `squad_number` | `squadNumber` |
| Player | `preferred_pos` | `preferredPos` |
| Player | `current_team` | `currentTeam` |
| Season | `season_id` | `seasonId` |
| Season | `start_date` | `startDate` |
| Season | `end_date` | `endDate` |
| Season | `is_current` | `isCurrent` |
| Lineup | `match_id` | `matchId` |
| Lineup | `player_id` | `playerId` |
| Lineup | `start_min` | `startMin` |
| Lineup | `end_min` | `endMin` |
| MatchNote | `match_note_id` | `matchNoteId` |
| MatchNote | `match_id` | `matchId` |
| MatchNote | `period_number` | `periodNumber` |
| MatchPeriod | `match_id` | `matchId` |
| MatchPeriod | `period_number` | `periodNumber` |
| MatchPeriod | `period_type` | `periodType` |
| MatchPeriod | `started_at` | `startedAt` |
| MatchPeriod | `ended_at` | `endedAt` |
| MatchPeriod | `duration_seconds` | `durationSeconds` |
| MatchState | `match_id` | `matchId` |
| MatchState | `current_period_id` | `currentPeriodId` |
| MatchState | `timer_ms` | `timerMs` |
| MatchState | `last_updated_at` | `lastUpdatedAt` |
| DefaultLineup | `team_id` | `teamId` |
| Outbox | `table_name` | `tableName` |
| Outbox | `record_id` | `recordId` |
| Outbox | `retry_count` | `retryCount` |
| Outbox | `last_sync_attempt` | `lastSyncAttempt` |
| Outbox | `sync_error` | `syncError` |
| Outbox | `failed_at` | `failedAt` |
| SyncMetadata | `table_name` | `tableName` |
| SyncMetadata | `record_id` | `recordId` |
| SyncMetadata | `last_synced` | `lastSynced` |
| SyncMetadata | `server_version` | `serverVersion` |
| SyncMetadata | `local_version` | `localVersion` |
| SyncMetadata | `conflict_strategy` | `conflictStrategy` |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Schema Field Names Follow camelCase
*For any* field name in the database schema interfaces (excluding 'id'), the field name should match the camelCase pattern (no underscores except in specific legacy fields).
**Validates: Requirements 1.1, 1.2**

### Property 2: Index Names Follow camelCase
*For any* index specification in SCHEMA_INDEXES, all field names within the index string should use camelCase naming.
**Validates: Requirements 1.2**

### Property 3: Transform Round-Trip Consistency
*For any* valid entity data, transforming from server response to database format and back to frontend type should preserve all semantic data (accounting for known field name mappings like `durationMins` ↔ `durationMinutes`).
**Validates: Requirements 3.1, 3.2, 7.2**

### Property 4: Database CRUD Round-Trip
*For any* valid team, player, season, or match data, creating a record and then reading it back should return equivalent data.
**Validates: Requirements 7.2, 7.3, 7.4**

### Property 5: TypeScript Compilation Success
*For any* code change in the migration, the TypeScript compiler should produce zero errors when run with `tsc --noEmit`.
**Validates: Requirements 6.1, 6.2**

## Error Handling

- **Database Version Mismatch**: Dexie automatically handles version upgrades. Version 11 will clear old data.
- **TypeScript Errors**: The migration relies on TypeScript to catch missed field name updates. All errors must be fixed before completion.
- **Runtime Errors**: If any snake_case field access remains, it will return `undefined` at runtime. Manual testing catches these.

## Testing Strategy

### Unit Tests
- Verify transform functions produce correct output
- Test database methods with mock data

### Property-Based Tests
Using fast-check library:
- Generate random valid entity data
- Verify round-trip consistency through transforms
- Verify CRUD operations preserve data

### Integration Tests
- App starts without errors
- Database initializes correctly
- CRUD operations work for all entities

### Manual Testing Checklist
- [ ] App starts without errors
- [ ] Database initializes (check console for version upgrade)
- [ ] Teams CRUD works
- [ ] Players CRUD works
- [ ] Seasons CRUD works
- [ ] Matches CRUD works
- [ ] Events creation works
- [ ] Lineup management works
- [ ] Offline mode works (disconnect network)
- [ ] Sync works when reconnecting
- [ ] Guest mode works
- [ ] Authentication flow works

## Files to Update

### Schema & DB Layer
- `frontend/src/db/schema.ts`
- `frontend/src/db/indexedDB.ts`
- `frontend/src/db/eventLinking.ts`
- `frontend/src/db/utils.ts`
- `frontend/src/db/migrations.ts`

### Transform Layer
- `frontend/src/db/transforms/common.ts`
- `frontend/src/db/transforms/teams.ts`
- `frontend/src/db/transforms/players.ts`
- `frontend/src/db/transforms/seasons.ts`
- `frontend/src/db/transforms/matches.ts`
- `frontend/src/db/transforms/events.ts`
- `frontend/src/db/transforms/lineups.ts`
- `frontend/src/db/transforms/matchState.ts`
- `frontend/src/db/transforms/playerTeams.ts`
- `frontend/src/db/transforms/defaultLineups.ts`
- `frontend/src/db/transforms/index.ts`

### Services
- `frontend/src/services/cacheService.ts`
- `frontend/src/services/syncService.ts`
- `frontend/src/services/dataLayer.ts`
- `frontend/src/services/importService.ts`
- `frontend/src/services/guestQuickMatch.ts`
- `frontend/src/services/realTimeService.ts`
- `frontend/src/services/api/teamsApi.ts`
- `frontend/src/services/api/playersApi.ts`
- `frontend/src/services/api/seasonsApi.ts`
- `frontend/src/services/api/matchesApi.ts`
- `frontend/src/services/api/eventsApi.ts`
- `frontend/src/services/api/lineupsApi.ts`
- `frontend/src/services/api/defaultLineupsApi.ts`

### Components & Hooks
- `frontend/src/pages/LiveMatchPage.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/contexts/MatchContext.tsx`
- `frontend/src/hooks/useLocalData.ts`

### Utilities
- `frontend/src/utils/guestQuota.ts`
- `frontend/src/utils/calendarUtils.ts`

### Types
- `frontend/src/types/database.ts` (if exists)
- `frontend/src/types/index.ts`

## Implementation Order

Execute in this order to minimize broken states:

```
1. schema.ts (types + SCHEMA_INDEXES)
   ↓
2. indexedDB.ts (bump version, update methods)
   ↓
3. transforms/*.ts (all transform files)
   ↓
4. db/utils.ts, eventLinking.ts, migrations.ts
   ↓
5. services/cacheService.ts
   ↓
6. services/syncService.ts
   ↓
7. services/dataLayer.ts
   ↓
8. services/api/*.ts (all API services)
   ↓
9. Other services (import, guest, realtime)
   ↓
10. Components & hooks
   ↓
11. Run TypeScript, fix remaining errors
   ↓
12. Manual testing
```

## Rollback Plan

Since there are no users:
1. Git revert to pre-migration commit
2. Delete IndexedDB in browser (DevTools → Application → IndexedDB → Delete)
3. Reload app

## Success Criteria

- `npx tsc --noEmit` passes with 0 errors
- App builds successfully (`npm run build`)
- All manual test cases pass
- No console errors on app load
- Data persists correctly in IndexedDB (inspect in DevTools)
- Sync to server works
- Cache from server works

## Post-Migration Cleanup (Optional)

After migration is stable, consider:

1. **Unify semantic field names**: Align `durationMinutes` vs `durationMins`, `kickoffTime` vs `kickoffTs`, etc.
2. **Remove redundant transforms**: Some `serverXxxToDb` functions may become simple enough to inline.
3. **Update documentation**: Update any architecture docs referencing the transform layer.
