# IndexedDB camelCase Migration Plan

## Overview

Migrate IndexedDB schema from snake_case to camelCase to align with API responses and frontend types, simplifying the transform layer.

**Estimated effort:** 25-35 hours
**Risk level:** Low (0 users, clean DB reset)
**Prerequisites:** 0 active users (fresh start)

---

## Migration Strategy

Since there are no users, we use the **clean slate approach**:
1. Bump Dexie database version
2. Old database auto-clears on version mismatch
3. Users get fresh, empty database with new schema
4. Data syncs from server on first authenticated load

---

## Phase 1: Schema & Type Definitions (3-4 hours)

### 1.1 Update `frontend/src/db/schema.ts`

Convert all interface fields from snake_case to camelCase:

```typescript
// BEFORE
export interface EnhancedEvent extends SyncableRecord {
  id: ID;
  match_id: ID;
  ts_server: Timestamp;
  period_number: number;
  clock_ms: number;
  team_id: ID;
  player_id: ID;
  created_at: Timestamp;
  updated_at: Timestamp;
  created_by_user_id: ID;
  is_deleted: boolean;
  // ...
}

// AFTER
export interface EnhancedEvent extends SyncableRecord {
  id: ID;
  matchId: ID;
  tsServer: Timestamp;
  periodNumber: number;
  clockMs: number;
  teamId: ID;
  playerId: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUserId: ID;
  isDeleted: boolean;
  // ...
}
```

**Files to update:**
- `frontend/src/db/schema.ts`

**Field mapping reference:**

| Entity | snake_case | camelCase |
|--------|------------|-----------|
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

### 1.2 Update `SCHEMA_INDEXES` in `schema.ts`

Convert all index field names:

```typescript
// BEFORE
export const SCHEMA_INDEXES = {
  events: [
    'match_id',
    'player_id',
    '[match_id+player_id]',
    '[match_id+clock_ms]',
    '[synced+created_by_user_id]',
    // ...
  ],
  // ...
};

// AFTER
export const SCHEMA_INDEXES = {
  events: [
    'matchId',
    'playerId',
    '[matchId+playerId]',
    '[matchId+clockMs]',
    '[synced+createdByUserId]',
    // ...
  ],
  // ...
};
```

---

## Phase 2: Database Layer (4-5 hours)

### 2.1 Update `frontend/src/db/indexedDB.ts`

**Step 1:** Bump the database version to force reset

```typescript
// Add new version that clears old data
this.version(11).stores({
  events: `id, ${SCHEMA_INDEXES.events.join(', ')}`,
  matches: `id, ${SCHEMA_INDEXES.matches.join(', ')}`,
  // ... all tables with new camelCase indexes
});
```

**Step 2:** Update all method implementations

Find and replace all snake_case field access:
- `.match_id` → `.matchId`
- `.team_id` → `.teamId`
- `.player_id` → `.playerId`
- etc.

**Key methods to update:**
- `addEnhancedEvent()`
- `getEnhancedMatchEvents()`
- `addEventToTable()`
- `getPlayersByTeam()`
- `getAllTeams()`
- `createMatchPeriod()`
- `endMatchPeriod()`
- `getMatchPeriods()`
- `updateMatchState()`
- `getMatchState()`

### 2.2 Update `frontend/src/db/eventLinking.ts`

Update field references in auto-linking logic.

### 2.3 Update `frontend/src/db/utils.ts`

Update any direct field access.

### 2.4 Update `frontend/src/db/migrations.ts`

Update any field references in migration logic.

---

## Phase 3: Transform Layer Simplification (6-8 hours)

The transform layer becomes significantly simpler. Many transforms become near pass-through.

### 3.1 Update `frontend/src/db/transforms/common.ts`

No changes needed - utility functions are field-agnostic.

### 3.2 Update each entity transform file

For each file in `frontend/src/db/transforms/`:

#### `teams.ts`

```typescript
// BEFORE: dbToTeam
export function dbToTeam(t: EnhancedTeam): Team {
  return {
    id: t.id,
    name: t.name,
    homeKitPrimary: nullToUndefined(t.color_primary),
    homeKitSecondary: nullToUndefined(t.color_secondary),
    // ...
  };
}

// AFTER: dbToTeam (simpler - fields mostly align)
export function dbToTeam(t: EnhancedTeam): Team {
  return {
    id: t.id,
    name: t.name,
    homeKitPrimary: nullToUndefined(t.colorPrimary),
    homeKitSecondary: nullToUndefined(t.colorSecondary),
    // ...
  };
}

// BEFORE: serverTeamToDb (complex transformation)
export function serverTeamToDb(t: ServerTeamResponse): EnhancedTeam {
  return {
    id: t.id,
    team_id: t.id,
    name: t.name,
    color_primary: t.homeKitPrimary,
    // ... lots of snake_case mapping
  };
}

// AFTER: serverTeamToDb (near pass-through!)
export function serverTeamToDb(t: ServerTeamResponse): EnhancedTeam {
  return {
    id: t.id,
    teamId: t.id,
    name: t.name,
    colorPrimary: t.homeKitPrimary,
    // ... direct mapping, much simpler
    synced: true,
    syncedAt: Date.now(),
  };
}
```

**Files to update:**
1. `transforms/teams.ts`
2. `transforms/players.ts`
3. `transforms/seasons.ts`
4. `transforms/matches.ts`
5. `transforms/events.ts`
6. `transforms/lineups.ts`
7. `transforms/matchState.ts`
8. `transforms/playerTeams.ts`
9. `transforms/defaultLineups.ts`

### 3.3 Transform simplification summary

| Transform | Before | After |
|-----------|--------|-------|
| `serverXxxToDb` | Full field mapping | Near pass-through |
| `dbToXxx` | Full field mapping | Simpler (some semantic diffs remain) |
| `xxxWriteToDb` | Full field mapping | Simpler |
| `dbXxxToServerPayload` | Full field mapping | Near pass-through |

**Note:** Some semantic differences remain (e.g., `durationMinutes` in frontend vs `durationMins` in DB). These can be unified in a follow-up if desired.

---

## Phase 4: Service Layer Updates (6-8 hours)

### 4.1 Update `frontend/src/services/cacheService.ts`

Update all field access patterns. Most changes are in the transform calls which are already updated.

Key areas:
- `cleanupOldTemporalData()` - update `synced_at` → `syncedAt`, `created_at` → `createdAt`
- Any direct field access on DB records

### 4.2 Update `frontend/src/services/syncService.ts`

Update field access in:
- `processSoftDeletes()` - `is_deleted` → `isDeleted`, `synced_at` → `syncedAt`
- Sync progress tracking

### 4.3 Update `frontend/src/services/dataLayer.ts`

Update all field references when constructing DB records.

### 4.4 Update API Services

Files in `frontend/src/services/api/`:
1. `teamsApi.ts`
2. `playersApi.ts`
3. `seasonsApi.ts`
4. `matchesApi.ts`
5. `eventsApi.ts`
6. `lineupsApi.ts`
7. `defaultLineupsApi.ts`

Most changes will be in query construction and filter conditions.

### 4.5 Update Other Services

- `frontend/src/services/importService.ts`
- `frontend/src/services/guestQuickMatch.ts`
- `frontend/src/services/realTimeService.ts`

---

## Phase 5: Component & Hook Updates (2-3 hours)

### 5.1 Update React Components

Files with direct snake_case access:
1. `frontend/src/pages/LiveMatchPage.tsx`
2. `frontend/src/pages/HomePage.tsx`
3. `frontend/src/contexts/MatchContext.tsx`

### 5.2 Update Hooks

- `frontend/src/hooks/useLocalData.ts`

### 5.3 Update Utilities

- `frontend/src/utils/guestQuota.ts`
- `frontend/src/utils/calendarUtils.ts`

---

## Phase 6: Testing & Verification (4-6 hours)

### 6.1 TypeScript Compilation

```bash
cd frontend && npx tsc --noEmit
```

Fix all type errors. TypeScript will catch most issues.

### 6.2 Update Existing Tests

- `shared/tests/transformers.test.ts` - Update if it references frontend transforms
- `frontend/tests/unit/services/errorService.test.ts` - Verify no breaking changes

### 6.3 Manual Testing Checklist

Run through the app and verify:

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

### 6.4 Add New Transform Tests (Optional but Recommended)

Create `frontend/tests/unit/db/transforms.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { dbToTeam, serverTeamToDb, teamWriteToDb } from '../../../src/db/transforms';

describe('Team Transforms', () => {
  it('dbToTeam converts IndexedDB to frontend type', () => {
    const dbTeam = {
      id: '123',
      teamId: '123',
      name: 'Test FC',
      colorPrimary: '#FF0000',
      createdAt: 1234567890,
      createdByUserId: 'user-1',
      isDeleted: false,
      synced: true,
    };

    const result = dbToTeam(dbTeam);

    expect(result.id).toBe('123');
    expect(result.homeKitPrimary).toBe('#FF0000');
  });

  // ... more tests
});
```

---

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

---

## Rollback Plan

Since there are no users:
1. Git revert to pre-migration commit
2. Delete IndexedDB in browser (DevTools → Application → IndexedDB → Delete)
3. Reload app

---

## Post-Migration Cleanup (Optional)

After migration is stable, consider:

1. **Unify semantic field names**: Align `durationMinutes` vs `durationMins`, `kickoffTime` vs `kickoffTs`, etc.

2. **Remove redundant transforms**: Some `serverXxxToDb` functions may become simple enough to inline.

3. **Update documentation**: Update any architecture docs referencing the transform layer.

---

## File Checklist

### Schema & DB Layer
- [ ] `frontend/src/db/schema.ts`
- [ ] `frontend/src/db/indexedDB.ts`
- [ ] `frontend/src/db/eventLinking.ts`
- [ ] `frontend/src/db/utils.ts`
- [ ] `frontend/src/db/migrations.ts`

### Transform Layer
- [ ] `frontend/src/db/transforms/common.ts`
- [ ] `frontend/src/db/transforms/teams.ts`
- [ ] `frontend/src/db/transforms/players.ts`
- [ ] `frontend/src/db/transforms/seasons.ts`
- [ ] `frontend/src/db/transforms/matches.ts`
- [ ] `frontend/src/db/transforms/events.ts`
- [ ] `frontend/src/db/transforms/lineups.ts`
- [ ] `frontend/src/db/transforms/matchState.ts`
- [ ] `frontend/src/db/transforms/playerTeams.ts`
- [ ] `frontend/src/db/transforms/defaultLineups.ts`
- [ ] `frontend/src/db/transforms/index.ts`

### Services
- [ ] `frontend/src/services/cacheService.ts`
- [ ] `frontend/src/services/syncService.ts`
- [ ] `frontend/src/services/dataLayer.ts`
- [ ] `frontend/src/services/importService.ts`
- [ ] `frontend/src/services/guestQuickMatch.ts`
- [ ] `frontend/src/services/realTimeService.ts`
- [ ] `frontend/src/services/api/teamsApi.ts`
- [ ] `frontend/src/services/api/playersApi.ts`
- [ ] `frontend/src/services/api/seasonsApi.ts`
- [ ] `frontend/src/services/api/matchesApi.ts`
- [ ] `frontend/src/services/api/eventsApi.ts`
- [ ] `frontend/src/services/api/lineupsApi.ts`
- [ ] `frontend/src/services/api/defaultLineupsApi.ts`

### Components & Hooks
- [ ] `frontend/src/pages/LiveMatchPage.tsx`
- [ ] `frontend/src/pages/HomePage.tsx`
- [ ] `frontend/src/contexts/MatchContext.tsx`
- [ ] `frontend/src/hooks/useLocalData.ts`

### Utilities
- [ ] `frontend/src/utils/guestQuota.ts`
- [ ] `frontend/src/utils/calendarUtils.ts`

### Types (if separate from schema)
- [ ] `frontend/src/types/database.ts` (if exists)
- [ ] `frontend/src/types/index.ts`

---

## Success Criteria

- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] App builds successfully (`npm run build`)
- [ ] All manual test cases pass
- [ ] No console errors on app load
- [ ] Data persists correctly in IndexedDB (inspect in DevTools)
- [ ] Sync to server works
- [ ] Cache from server works
