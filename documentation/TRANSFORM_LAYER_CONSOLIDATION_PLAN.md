# Transform Layer Consolidation Plan

## Executive Summary

The codebase has migrated to an offline-first Dexie DB architecture, but the transform layer is now fragmented. The original `shared/types/transformers.ts` file (700+ lines) is **completely unused** in the frontend, while inline transformations are **duplicated across 8+ API service files**. This plan consolidates all transformations into a single, well-tested module.

---

## Current State Analysis

### 1. Unused Transform Layer

**File:** `shared/types/transformers.ts`
- 700+ lines of transform functions
- Zero imports in frontend code
- Transforms between Prisma types and frontend types
- Still used by backend for API responses

**Functions available but unused in frontend:**
- `transformPlayer`, `transformTeam`, `transformMatch`, `transformEvent`, `transformSeason`, `transformLineup`
- `transformPlayerCreateRequest`, `transformTeamCreateRequest`, etc.
- Array variants: `transformPlayers`, `transformTeams`, etc.

### 2. Current Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WRITE PATH                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Component (camelCase)                                                      │
│       │                                                                     │
│       ▼                                                                     │
│  API Service (teamsApi.createTeam)                                          │
│       │                                                                     │
│       ▼                                                                     │
│  dataLayer (teamsDataLayer.create)                                          │
│       │  ┌──────────────────────────────────────┐                          │
│       │  │ INLINE TRANSFORM: camelCase → snake  │                          │
│       │  │ homeKitPrimary → color_primary       │                          │
│       │  └──────────────────────────────────────┘                          │
│       ▼                                                                     │
│  IndexedDB (EnhancedTeam with synced: false)                               │
│       │                                                                     │
│       ▼ (background)                                                        │
│  syncService → Server API                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              READ PATH                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Component                                                                  │
│       │                                                                     │
│       ▼                                                                     │
│  API Service (teamsApi.getTeams)                                            │
│       │                                                                     │
│       ▼                                                                     │
│  IndexedDB Query (db.teams.toArray())                                       │
│       │  ┌──────────────────────────────────────┐                          │
│       │  │ INLINE TRANSFORM: snake → camelCase  │                          │
│       │  │ color_primary → homeKitPrimary       │                          │
│       │  └──────────────────────────────────────┘                          │
│       ▼                                                                     │
│  Component receives Team[] (camelCase)                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Inline Transform Locations (Duplication)

| File | Read Transforms | Write Transforms |
|------|-----------------|------------------|
| `teamsApi.ts` | Lines 93-106, 129-142 | Lines 164-172, 204-212 |
| `playersApi.ts` | Lines 102-116, 138-152 | Lines 166-173, 201-207 |
| `matchesApi.ts` | Lines 117-137, 252-270, 282-300, 344-368 | Lines 455-469 |
| `seasonsApi.ts` | Lines 52-66, 88-102 | Lines 113-119, 146-152 |
| `eventsApi.ts` | Lines 23-41 (function) | Lines 55-64 |
| `lineupsApi.ts` | Lines 71-86 (function) | Lines 157-163, 254-266 |
| `dataLayer.ts` | N/A | Lines 94-105, 171-179, 243-252, 317-332, 414-426, 488-496, etc. |

### 4. Specific Field Mapping Inconsistencies

**Teams:**
```typescript
// teamsApi.ts line 96-99
homeKitPrimary: t.color_primary || t.homeKitPrimary,  // Fallback for both formats
homeKitSecondary: t.color_secondary || t.homeKitSecondary,
awayKitPrimary: t.away_color_primary || t.awayKitPrimary,
awayKitSecondary: t.away_color_secondary || t.awayKitSecondary,

// dataLayer.ts line 98-101
color_primary: data.homeKitPrimary,
color_secondary: data.homeKitSecondary,
away_color_primary: data.awayKitPrimary,
away_color_secondary: data.awayKitSecondary,
```

**Players:**
```typescript
// playersApi.ts line 104
name: p.full_name,  // Read: full_name → name

// dataLayer.ts line 173
full_name: data.name,  // Write: name → full_name
```

**Seasons:**
```typescript
// seasonsApi.ts lines 53-54
id: s.season_id || s.id,
seasonId: s.season_id || s.id,  // Dual ID fields for compatibility
```

**Matches:**
```typescript
// matchesApi.ts lines 117-137 (23 field mappings!)
id: m.id,
matchId: m.match_id || m.id,
seasonId: m.season_id,
kickoffTime: new Date(m.kickoff_ts),
// ... 19 more fields
```

---

## Proposed Architecture

### New File Structure

```
frontend/src/db/
├── schema.ts              # IndexedDB schema types (unchanged)
├── indexedDB.ts           # Dexie database instance (unchanged)
├── transforms/
│   ├── index.ts           # Re-exports all transforms
│   ├── teams.ts           # Team transforms
│   ├── players.ts         # Player transforms
│   ├── matches.ts         # Match transforms
│   ├── seasons.ts         # Season transforms
│   ├── events.ts          # Event transforms
│   ├── lineups.ts         # Lineup transforms
│   ├── matchState.ts      # Match state/period transforms
│   └── common.ts          # Shared utilities
```

### Transform Module Interface

Each entity module exports:

```typescript
// frontend/src/db/transforms/teams.ts

import type { EnhancedTeam } from '../schema';
import type { Team, TeamCreateRequest, TeamUpdateRequest } from '@shared/types';

/**
 * Transform IndexedDB team record to frontend Team type
 */
export function dbToTeam(dbTeam: EnhancedTeam): Team;

/**
 * Transform multiple IndexedDB team records to frontend Team[]
 */
export function dbToTeams(dbTeams: EnhancedTeam[]): Team[];

/**
 * Transform frontend create request to dataLayer input format
 */
export function createRequestToDb(req: TeamCreateRequest): Partial<EnhancedTeam>;

/**
 * Transform frontend update request to dataLayer input format
 */
export function updateRequestToDb(req: TeamUpdateRequest): Partial<EnhancedTeam>;
```

### Common Utilities

```typescript
// frontend/src/db/transforms/common.ts

/**
 * Convert timestamp to Date object safely
 */
export function toDate(ts: number | string | Date | undefined): Date | undefined;

/**
 * Convert Date to timestamp for storage
 */
export function toTimestamp(date: Date | string | number | undefined): number | undefined;

/**
 * Null-safe string conversion
 */
export function nullToUndefined<T>(value: T | null): T | undefined;
```

---

## Implementation Plan

### Phase 1: Create Transform Module (No Breaking Changes)

**Goal:** Create the new transform module without changing existing code.

#### Step 1.1: Create common utilities

**File:** `frontend/src/db/transforms/common.ts`

```typescript
export function toDate(ts: number | string | Date | undefined): Date | undefined {
  if (ts === undefined || ts === null) return undefined;
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export function toTimestamp(date: Date | string | number | undefined): number | undefined {
  if (date === undefined || date === null) return undefined;
  if (typeof date === 'number') return date;
  return new Date(date).getTime();
}

export function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}
```

#### Step 1.2: Create entity transform modules

**File:** `frontend/src/db/transforms/teams.ts`

```typescript
import type { EnhancedTeam } from '../schema';
import type { Team } from '@shared/types';
import { toDate, nullToUndefined } from './common';

export function dbToTeam(t: EnhancedTeam): Team {
  return {
    id: t.id,
    name: t.name,
    homeKitPrimary: nullToUndefined(t.color_primary),
    homeKitSecondary: nullToUndefined(t.color_secondary),
    awayKitPrimary: nullToUndefined(t.away_color_primary),
    awayKitSecondary: nullToUndefined(t.away_color_secondary),
    logoUrl: nullToUndefined(t.logo_url),
    is_opponent: !!t.is_opponent,
    createdAt: toDate(t.created_at),
    updatedAt: toDate(t.updated_at),
    created_by_user_id: t.created_by_user_id,
    deleted_at: toDate(t.deleted_at),
    deleted_by_user_id: nullToUndefined(t.deleted_by_user_id),
    is_deleted: !!t.is_deleted,
  };
}

export function dbToTeams(teams: EnhancedTeam[]): Team[] {
  return teams.map(dbToTeam);
}

export interface TeamWriteInput {
  name: string;
  homeKitPrimary?: string;
  homeKitSecondary?: string;
  awayKitPrimary?: string;
  awayKitSecondary?: string;
  logoUrl?: string;
  isOpponent?: boolean;
}

export function writeInputToDb(data: TeamWriteInput): Partial<EnhancedTeam> {
  return {
    name: data.name,
    color_primary: data.homeKitPrimary,
    color_secondary: data.homeKitSecondary,
    away_color_primary: data.awayKitPrimary,
    away_color_secondary: data.awayKitSecondary,
    logo_url: data.logoUrl,
    is_opponent: data.isOpponent ?? false,
  };
}
```

Similar modules for: `players.ts`, `matches.ts`, `seasons.ts`, `events.ts`, `lineups.ts`, `matchState.ts`

#### Step 1.3: Create index file

**File:** `frontend/src/db/transforms/index.ts`

```typescript
// Re-export all transforms
export * from './common';
export * from './teams';
export * from './players';
export * from './matches';
export * from './seasons';
export * from './events';
export * from './lineups';
export * from './matchState';
```

### Phase 2: Add Tests

**Goal:** Ensure transforms are correct before migrating.

#### Step 2.1: Create test file structure

```
frontend/src/db/transforms/__tests__/
├── teams.test.ts
├── players.test.ts
├── matches.test.ts
├── seasons.test.ts
├── events.test.ts
├── lineups.test.ts
├── matchState.test.ts
└── common.test.ts
```

#### Step 2.2: Test patterns

```typescript
// frontend/src/db/transforms/__tests__/teams.test.ts

import { describe, it, expect } from 'vitest';
import { dbToTeam, writeInputToDb } from '../teams';
import type { EnhancedTeam } from '../../schema';

describe('teams transforms', () => {
  describe('dbToTeam', () => {
    it('transforms all fields correctly', () => {
      const dbTeam: EnhancedTeam = {
        id: 'team-1',
        team_id: 'team-1',
        name: 'Test FC',
        color_primary: '#ff0000',
        color_secondary: '#ffffff',
        away_color_primary: '#0000ff',
        away_color_secondary: '#ffff00',
        logo_url: 'https://example.com/logo.png',
        is_opponent: false,
        created_at: 1700000000000,
        updated_at: 1700000001000,
        created_by_user_id: 'user-1',
        is_deleted: false,
        synced: true,
      };

      const result = dbToTeam(dbTeam);

      expect(result).toEqual({
        id: 'team-1',
        name: 'Test FC',
        homeKitPrimary: '#ff0000',
        homeKitSecondary: '#ffffff',
        awayKitPrimary: '#0000ff',
        awayKitSecondary: '#ffff00',
        logoUrl: 'https://example.com/logo.png',
        is_opponent: false,
        createdAt: new Date(1700000000000),
        updatedAt: new Date(1700000001000),
        created_by_user_id: 'user-1',
        deleted_at: undefined,
        deleted_by_user_id: undefined,
        is_deleted: false,
      });
    });

    it('handles null/undefined fields', () => {
      const dbTeam: EnhancedTeam = {
        id: 'team-2',
        team_id: 'team-2',
        name: 'Minimal FC',
        created_at: 1700000000000,
        updated_at: 1700000000000,
        created_by_user_id: 'user-1',
        is_deleted: false,
        synced: false,
      } as EnhancedTeam;

      const result = dbToTeam(dbTeam);

      expect(result.homeKitPrimary).toBeUndefined();
      expect(result.is_opponent).toBe(false);
    });
  });

  describe('writeInputToDb', () => {
    it('transforms write input to db format', () => {
      const input = {
        name: 'New Team',
        homeKitPrimary: '#ff0000',
        isOpponent: true,
      };

      const result = writeInputToDb(input);

      expect(result).toEqual({
        name: 'New Team',
        color_primary: '#ff0000',
        color_secondary: undefined,
        away_color_primary: undefined,
        away_color_secondary: undefined,
        logo_url: undefined,
        is_opponent: true,
      });
    });
  });

  describe('roundtrip', () => {
    it('write then read preserves data', () => {
      const original = {
        name: 'Roundtrip FC',
        homeKitPrimary: '#ff0000',
        homeKitSecondary: '#ffffff',
        isOpponent: false,
      };

      // Simulate write
      const dbFormat = writeInputToDb(original);

      // Simulate what gets stored (add required fields)
      const stored: EnhancedTeam = {
        id: 'team-3',
        team_id: 'team-3',
        ...dbFormat,
        created_at: Date.now(),
        updated_at: Date.now(),
        created_by_user_id: 'user-1',
        is_deleted: false,
        synced: false,
      } as EnhancedTeam;

      // Simulate read
      const readBack = dbToTeam(stored);

      expect(readBack.name).toBe(original.name);
      expect(readBack.homeKitPrimary).toBe(original.homeKitPrimary);
      expect(readBack.homeKitSecondary).toBe(original.homeKitSecondary);
      expect(readBack.is_opponent).toBe(original.isOpponent);
    });
  });
});
```

### Phase 3: Migrate API Services

**Goal:** Replace inline transforms with centralized module.

#### Step 3.1: Migrate teamsApi.ts

**Before:**
```typescript
// teamsApi.ts lines 93-106
const data = paged.map((t: any) => ({
  id: t.id,
  name: t.name,
  homeKitPrimary: t.color_primary || t.homeKitPrimary,
  homeKitSecondary: t.color_secondary || t.homeKitSecondary,
  // ... 8 more lines
})) as any;
```

**After:**
```typescript
import { dbToTeams } from '../../db/transforms';

// teamsApi.ts
const data = dbToTeams(paged);
```

#### Step 3.2: Migrate dataLayer.ts

**Before:**
```typescript
// dataLayer.ts lines 94-105
const team: EnhancedTeam = {
  id,
  team_id: id,
  name: data.name,
  color_primary: data.homeKitPrimary,
  color_secondary: data.homeKitSecondary,
  away_color_primary: data.awayKitPrimary,
  away_color_secondary: data.awayKitSecondary,
  logo_url: data.logoUrl,
  is_opponent: data.isOpponent ?? false,
  ...createCommonFields(),
} as EnhancedTeam;
```

**After:**
```typescript
import { writeInputToDb } from '../../db/transforms';

// dataLayer.ts
const team: EnhancedTeam = {
  id,
  team_id: id,
  ...writeInputToDb(data),
  ...createCommonFields(),
} as EnhancedTeam;
```

#### Step 3.3: Migration order (by dependency)

1. `common.ts` - No dependencies
2. `teams.ts` - Used by matches
3. `players.ts` - Used by lineups, events
4. `seasons.ts` - Used by matches
5. `events.ts` - Depends on players
6. `lineups.ts` - Depends on players
7. `matches.ts` - Depends on teams, seasons
8. `matchState.ts` - Depends on matches

### Phase 4: Migrate matchesApi.ts Transform Functions

The `matchesApi.ts` file contains two local transform functions that should be moved:

```typescript
// Current: matchesApi.ts lines 32-70
function transformToApiMatchState(localState: LocalMatchState): MatchState { ... }
function transformToApiMatchPeriod(localPeriod: LocalMatchPeriod): MatchPeriod { ... }
```

**Move to:** `frontend/src/db/transforms/matchState.ts`

### Phase 5: Update syncService and cacheService

These services transform data when syncing with the server. They should use the centralized transforms.

**cacheService.ts changes:**
```typescript
// When storing server data to IndexedDB
import { serverToDb } from '../db/transforms';
```

**syncService.ts changes:**
```typescript
// When sending local data to server
import { dbToServer } from '../db/transforms';
```

### Phase 6: Clean Up Unused Code

1. **Evaluate `shared/types/transformers.ts`:**
   - Check if backend still uses it
   - If backend uses it: Keep for backend, document it's backend-only
   - If unused everywhere: Delete it

2. **Remove fallback field mappings:**
   ```typescript
   // Remove these fallbacks after migration is complete
   homeKitPrimary: t.color_primary || t.homeKitPrimary,  // Remove fallback
   ```

---

## Field Mapping Reference

### Teams

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `id` | Same |
| `name` | `name` | Same |
| `homeKitPrimary` | `color_primary` | Primary home color |
| `homeKitSecondary` | `color_secondary` | Secondary home color |
| `awayKitPrimary` | `away_color_primary` | Primary away color |
| `awayKitSecondary` | `away_color_secondary` | Secondary away color |
| `logoUrl` | `logo_url` | Team logo |
| `is_opponent` | `is_opponent` | Same (kept snake_case) |
| `createdAt` | `created_at` | Date object ↔ timestamp |
| `updatedAt` | `updated_at` | Date object ↔ timestamp |

### Players

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `id` | Same |
| `name` | `full_name` | **Different name** |
| `squadNumber` | `squad_number` | Jersey number |
| `preferredPosition` | `preferred_pos` | Position code |
| `dateOfBirth` | `dob` | ISO date string |
| `notes` | `notes` | Same |
| `currentTeam` | `current_team` | Team FK |
| `createdAt` | `created_at` | Date object ↔ timestamp |
| `updatedAt` | `updated_at` | Date object ↔ timestamp |

### Matches

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `id` | Same |
| `matchId` | `match_id` | Duplicate ID field |
| `seasonId` | `season_id` | Season FK |
| `kickoffTime` | `kickoff_ts` | Date object ↔ timestamp |
| `competition` | `competition` | Same |
| `homeTeamId` | `home_team_id` | Team FK |
| `awayTeamId` | `away_team_id` | Team FK |
| `venue` | `venue` | Same |
| `durationMinutes` | `duration_mins` | Match length |
| `periodFormat` | `period_format` | 'half' \| 'quarter' |
| `homeScore` | `home_score` | Score |
| `awayScore` | `away_score` | Score |
| `notes` | `notes` | Same |
| `createdAt` | `created_at` | Date object ↔ timestamp |
| `updatedAt` | `updated_at` | Date object ↔ timestamp |

### Seasons

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `id` \| `season_id` | Both used for compat |
| `seasonId` | `season_id` | Primary ID |
| `label` | `label` | Same |
| `startDate` | `start_date` | ISO date string |
| `endDate` | `end_date` | ISO date string |
| `isCurrent` | `is_current` | Boolean |
| `description` | `description` | Same |
| `createdAt` | `created_at` | Date object ↔ timestamp |
| `updatedAt` | `updated_at` | Date object ↔ timestamp |

### Events

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `id` | Same |
| `matchId` | `match_id` | Match FK |
| `periodNumber` | `period_number` | 1-4 for quarters |
| `clockMs` | `clock_ms` | Game clock |
| `kind` | `kind` | Event type |
| `teamId` | `team_id` | Team FK |
| `playerId` | `player_id` | Player FK |
| `notes` | `notes` | Same |
| `sentiment` | `sentiment` | -4 to +4 |
| `createdAt` | `created_at` | Date object ↔ timestamp |
| `updatedAt` | `updated_at` | Date object ↔ timestamp |

### Lineups

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `id` | Composite key |
| `matchId` | `match_id` | Match FK |
| `playerId` | `player_id` | Player FK |
| `startMinute` | `start_min` | Entry time |
| `endMinute` | `end_min` | Exit time |
| `position` | `position` | Same |
| `createdAt` | `created_at` | Date object ↔ timestamp |
| `updatedAt` | `updated_at` | Date object ↔ timestamp |

### Match State

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `match_id` | Match ID as PK |
| `matchId` | `match_id` | Same |
| `status` | `status` | NOT_STARTED/LIVE/etc |
| `currentPeriod` | `current_period_id` | Period FK |
| `timerMs` | `timer_ms` | Elapsed time |
| `lastUpdatedAt` | `last_updated_at` | Timestamp |

### Match Periods

| Frontend (camelCase) | IndexedDB (snake_case) | Notes |
|---------------------|------------------------|-------|
| `id` | `id` | UUID |
| `matchId` | `match_id` | Match FK |
| `periodNumber` | `period_number` | 1, 2, 3, 4 |
| `periodType` | `period_type` | REGULAR/EXTRA_TIME/etc |
| `startedAt` | `started_at` | Timestamp |
| `endedAt` | `ended_at` | Timestamp |
| `durationSeconds` | `duration_seconds` | Calculated |

---

## Verification Checklist

### Before Starting
- [ ] All tests pass (`npm run test`)
- [ ] Application runs without errors
- [ ] TypeScript compiles (`npx tsc --noEmit`)

### After Each Phase
- [ ] TypeScript compiles without errors
- [ ] All transform tests pass
- [ ] Application runs correctly
- [ ] Manual testing of affected features

### After Phase 3 (API Migration)
- [ ] Teams CRUD works (create, read, update, delete)
- [ ] Players CRUD works
- [ ] Matches CRUD works
- [ ] Seasons CRUD works
- [ ] Events work during live match
- [ ] Lineups work during live match
- [ ] Match state transitions work (start, pause, resume, complete)

### After Phase 5 (Sync Services)
- [ ] Offline data syncs correctly when online
- [ ] Cache refresh populates IndexedDB correctly
- [ ] No data loss during sync

### Final Verification
- [ ] No inline transforms remain in API services
- [ ] No inline transforms remain in dataLayer
- [ ] All transform functions are tested
- [ ] Documentation updated

---

## Risk Assessment

### Low Risk
- Creating new transform module (additive, no breaking changes)
- Adding tests (no production code changes)

### Medium Risk
- Migrating API services (requires careful testing)
- Migrating dataLayer (central to all writes)

### High Risk
- Modifying syncService/cacheService (affects data integrity)
- Removing fallback field mappings (may break legacy data)

### Mitigation Strategies
1. **Feature flag:** Can be enabled per-entity during migration
2. **Gradual rollout:** Migrate one entity at a time
3. **Fallback support:** Keep fallback mappings until fully verified
4. **Comprehensive tests:** Test all transforms before migration

---

## Estimated Effort

| Phase | Description | Estimated Hours |
|-------|-------------|-----------------|
| 1 | Create transform module | 2-3 |
| 2 | Add tests | 2-3 |
| 3 | Migrate API services | 3-4 |
| 4 | Migrate matchesApi transforms | 1 |
| 5 | Update sync services | 2-3 |
| 6 | Clean up unused code | 1 |
| - | Testing & verification | 2-3 |
| **Total** | | **13-18 hours** |

---

## Success Criteria

1. **Single source of truth:** All field mappings defined in one place
2. **Full test coverage:** Every transform function has tests
3. **No duplication:** No inline transforms in API services
4. **Type safety:** Full TypeScript types for all transforms
5. **Documentation:** Field mapping reference is accurate and complete
6. **No regressions:** All existing functionality works correctly

---

## Progress Log

### Phase 1: Create Transform Module ✅ COMPLETED

**Date:** 2025-12-16

**Files Created:**
```
frontend/src/db/transforms/
├── index.ts           # Re-exports all transforms
├── common.ts          # toDate, toTimestamp, nullToUndefined, toBool
├── teams.ts           # dbToTeam, dbToTeams, teamWriteToDb
├── players.ts         # dbToPlayer, dbToPlayers, playerWriteToDb
├── seasons.ts         # dbToSeason, dbToSeasons, seasonWriteToDb
├── matches.ts         # dbToMatch, dbToMatches, matchWriteToDb
├── events.ts          # dbToEvent, dbToEvents, eventWriteToDb
├── lineups.ts         # dbToLineup, dbToLineups, lineupWriteToDb, generateLineupId
└── matchState.ts      # dbToMatchState, dbToMatchPeriod, dbToMatchPeriods, write helpers
```

**Verification:**
- [x] All transform files compile without TypeScript errors
- [x] No breaking changes to existing code (additive only)
- [x] Type-safe interfaces for write inputs defined

**Notes:**
- `createdAt` fields use `?? new Date()` fallback since shared types require non-optional Date
- `Match` type doesn't include `matchId` (only `id`), so transform excludes legacy alias
- Write input interfaces use camelCase to match frontend conventions

### Phase 2: Add Tests ✅ COMPLETED

**Date:** 2025-12-16

**Files Created:**
```
frontend/tests/unit/transforms/
├── common.test.ts     # 16 tests - toDate, toTimestamp, nullToUndefined, toBool
├── teams.test.ts      # 10 tests - dbToTeam, dbToTeams, teamWriteToDb, roundtrip
├── players.test.ts    # 8 tests - dbToPlayer, dbToPlayers, playerWriteToDb, roundtrip
├── seasons.test.ts    # 11 tests - dbToSeason, dbToSeasons, seasonWriteToDb, roundtrip
├── matches.test.ts    # 10 tests - dbToMatch, dbToMatches, matchWriteToDb, roundtrip
├── events.test.ts     # 9 tests - dbToEvent, dbToEvents, eventWriteToDb, roundtrip
├── lineups.test.ts    # 12 tests - dbToLineup, dbToLineups, lineupWriteToDb, generateLineupId, roundtrip
└── matchState.test.ts # 17 tests - dbToMatchState, dbToMatchPeriod, dbToMatchPeriods, write helpers
```

**Test Results:** 93 tests passing

**Verification:**
- [x] All 93 transform tests pass
- [x] Tests cover read transforms (db → frontend)
- [x] Tests cover write transforms (frontend → db)
- [x] Roundtrip tests verify data integrity
- [x] Edge cases tested (null, undefined, soft deletes)

### Phase 3: Migrate API Services ✅ COMPLETED

**Date:** 2025-12-16

**Files Modified:**

| File | Changes |
|------|---------|
| `teamsApi.ts` | Added `dbToTeam`, `dbToTeams` imports; replaced inline transforms in `getTeams`, `getTeamById`, `createTeam`, `updateTeam`, `getOpponentTeams` |
| `playersApi.ts` | Added `dbToPlayer`, `dbToPlayers` imports; replaced inline transforms in `getPlayers`, `getPlayerById`, `getPlayersByTeam` |
| `seasonsApi.ts` | Added `dbToSeason`, `dbToSeasons` imports; replaced inline transforms in `getSeasons`, `getSeasonById` |
| `matchesApi.ts` | Added `dbToMatch`, `dbToMatches`, `dbToMatchState`, `dbToMatchPeriod` imports; removed local `transformToApiMatchState` and `transformToApiMatchPeriod` functions; replaced inline transforms in `getMatch`, `getMatchesBySeason`, `getMatchesByTeam`, `getMatches`, `getUpcoming`, `getRecent`, and all match state/period methods |
| `eventsApi.ts` | Added `dbToEvent` import; removed local `transformToApiEvent` function; replaced usages with centralized transform |
| `lineupsApi.ts` | Added `dbToLineup`, `generateLineupId` imports; removed local `transformToApiLineup` and `generateLineupId` functions; replaced usages with centralized transforms |

**Verification:**
- [x] All 93 transform tests still pass
- [x] No new TypeScript errors introduced (pre-existing errors unrelated to transforms)
- [x] teamsApi uses centralized transforms
- [x] playersApi uses centralized transforms
- [x] seasonsApi uses centralized transforms
- [x] matchesApi uses centralized transforms
- [x] eventsApi uses centralized transforms
- [x] lineupsApi uses centralized transforms

**Notes:**
- Methods with team joins (getMatch, getMatches, getUpcoming, getRecent) use `dbToMatch` for base transform, then extend with team data
- Local transform functions removed: `transformToApiMatchState`, `transformToApiMatchPeriod`, `transformToApiEvent`, `transformToApiLineup`, `generateLineupId`
- All API services now import from `../../db/transforms`

### Phase 4: Migrate matchesApi.ts Transform Functions ✅ COMPLETED

**Date:** 2025-12-16

**Note:** This phase was completed as part of Phase 3. The local transform functions `transformToApiMatchState` and `transformToApiMatchPeriod` were already moved to `frontend/src/db/transforms/matchState.ts` and removed from `matchesApi.ts` during Phase 3.

### Phase 5: Update syncService and cacheService ✅ COMPLETED

**Date:** 2025-12-16

**New Transform Files Created:**
```
frontend/src/db/transforms/
├── playerTeams.ts     # serverPlayerTeamToDb (Server → IndexedDB for cache)
└── defaultLineups.ts  # serverDefaultLineupToDb (Server → IndexedDB for cache)
```

**New Transforms Added to Existing Files:**

| File | New Functions | Direction |
|------|---------------|-----------|
| `teams.ts` | `dbTeamToServerPayload`, `serverTeamToDb` | Sync ↔ Cache |
| `players.ts` | `dbPlayerToServerPayload`, `serverPlayerToDb` | Sync ↔ Cache |
| `seasons.ts` | `dbSeasonToServerPayload`, `serverSeasonToDb` | Sync ↔ Cache |
| `matches.ts` | `dbMatchToServerPayload`, `serverMatchToDb` | Sync ↔ Cache |
| `events.ts` | `dbEventToServerPayload` | Sync only |

**Files Modified:**

| File | Changes |
|------|---------|
| `syncService.ts` | Replaced inline transforms with `dbTeamToServerPayload`, `dbPlayerToServerPayload`, `dbSeasonToServerPayload`, `dbMatchToServerPayload`, `dbEventToServerPayload` |
| `cacheService.ts` | Replaced inline transforms with `serverTeamToDb`, `serverPlayerToDb`, `serverSeasonToDb`, `serverMatchToDb`, `serverPlayerTeamToDb`, `serverDefaultLineupToDb` |
| `transforms/index.ts` | Added re-exports for `playerTeams.ts` and `defaultLineups.ts` |

**Verification:**
- [x] All 93 transform tests pass
- [x] syncService uses centralized transforms for: seasons, teams, players, matches, events
- [x] cacheService uses centralized transforms for: teams, players, seasons, matches, player-teams, default-lineups
- [x] New transforms follow established patterns (interfaces + transform functions)
- [x] Index file updated to re-export all transforms

### Phase 6: Clean Up Unused Code ✅ COMPLETED

**Date:** 2025-12-17

**Analysis of shared/types/transformers.ts:**
- Backend services (`backend/src/services/*.ts`) actively use shared transformers
- Backend tests use shared transformers for validation
- Frontend no longer uses shared transformers (has own `frontend/src/db/transforms/`)
- Decision: Keep file, add documentation clarifying it's for backend use

**Files Modified:**

| File | Changes |
|------|---------|
| `shared/types/transformers.ts` | Added documentation comment clarifying backend-only usage |
| `frontend/src/services/api/teamsApi.ts` | Replaced inline fallback transforms with centralized `dbToPlayers` |

**Fallback Mappings Removed:**
- `teamsApi.ts` line 235: `p.full_name || p.name || ''` → `p.name` (via dbToPlayers)
- `teamsApi.ts` line 272: `p.full_name || p.name || ''` → `p.name` (via dbToPlayers)

**Verification:**
- [x] All 93 transform tests still pass
- [x] shared/types/transformers.ts documented as backend-only
- [x] Legacy fallback patterns removed from teamsApi.ts
- [x] No dual-format fallbacks remain in frontend API services
