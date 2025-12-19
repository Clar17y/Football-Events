# Design Document: Shared Types Unification

## Overview

This design establishes `shared/types/frontend.ts` as the single source of truth for the app's data contract across backend, frontend, and IndexedDB. The current architecture has duplicate type definitions, inconsistent naming, and mismatched timestamp representations that create drift and unnecessary transform complexity.

### Key Decisions

1. **camelCase everywhere in TypeScript** (no underscores).
2. **ISO strings for date/time fields everywhere** (shared types, API payloads, and IndexedDB storage).
   - The UI formats ISO strings for display; we do not carry `Date` objects through the app layers.
3. **snake_case only at the Prisma/PostgreSQL boundary** (Prisma models/queries and DB columns).
4. **No migration complexity required**: there are no users. For testing, delete IndexedDB in Chrome DevTools and reload.

### Scope (Nothing Left Behind)

This work is only complete when every persistent model/store is covered and no mixed casing remains outside the Prisma boundary.

- **Backend Prisma models** (source: `backend/prisma/schema.prisma`): `User`, `Team`, `Player`, `Match`, `Event`, `awards`, `match_awards`, `seasons`, `lineup`, `player_teams`, `match_state`, `match_periods`, `viewer_links`, `default_lineups`, `position_zones`, `live_formations`, `user_role`
- **Frontend IndexedDB/Dexie stores** (source: `frontend/src/db/indexedDB.ts`): `players`, `teams`, `seasons`, `matches`, `events`, `lineup`, `playerTeams`, `matchNotes`, `matchPeriods`, `matchState`, `defaultLineups`, `outbox`, `syncMetadata`, `settings`

### Current State (Problem)

```
┌─────────────────────────────────────────────────────────────────────┐
│ shared/types/frontend.ts                                            │
│ - Player, Team, Match, etc.                                         │
│ - MIXED CASING: createdAt (camelCase) + created_by_user_id (snake)  │
│ - Uses Date types for timestamps (not JSON-native)                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ imported by backend
┌─────────────────────────────────────────────────────────────────────┐
│ shared/types/transformers.ts                                        │
│ - Prisma (snake_case) → Frontend (mixed case)                       │
│ - Outputs mixed case fields                                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ frontend/src/db/schema.ts                                           │
│ - EnhancedPlayer, EnhancedTeam, EnhancedMatch, etc.                 │
│ - DUPLICATE definitions with different field names                  │
│ - Uses number (timestamp) for dates                                 │
│ - Full camelCase (createdByUserId)                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ used by
┌─────────────────────────────────────────────────────────────────────┐
│ frontend/src/db/transforms/*.ts                                     │
│ - Converts between schema types and shared types                    │
│ - Has to rename fields (createdByUserId → created_by_user_id)       │
│ - Complex and error-prone                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Target State (Solution)

```
┌─────────────────────────────────────────────────────────────────────┐
│ shared/types/frontend.ts (SOURCE OF TRUTH)                          │
│ - Player, Team, Match, etc.                                         │
│ - ALL camelCase: createdAt, createdByUserId, isDeleted              │
│ - Uses ISO strings for timestamps                                   │
└─────────────────────────────────────────────────────────────────────┘
           ↓ imported by backend              ↓ imported by frontend
┌──────────────────────────────┐    ┌─────────────────────────────────┐
│ shared/types/transformers.ts │    │ frontend/src/db/schema.ts       │
│ - Prisma → Frontend          │    │ - Extends shared types          │
│ - snake_case → camelCase     │    │ - Adds: synced, syncedAt        │
│ - Only place with snake_case │    │ - No duplicate definitions      │
└──────────────────────────────┘    └─────────────────────────────────┘
                                                    ↓
                                    ┌─────────────────────────────────┐
                                    │ frontend/src/db/transforms/*.ts │
                                    │ - Minimal transforms            │
                                    │ - Date ↔ timestamp conversion   │
                                    │ - No field renaming needed      │
                                    └─────────────────────────────────┘
```

## Architecture

### Type Hierarchy

```
shared/types/frontend.ts
├── Base Entity Types (camelCase, ISO strings)
│   ├── Player { id, name, createdAt: string, createdByUserId, isDeleted, ... }
│   ├── Team { id, name, createdAt: string, createdByUserId, isDeleted, ... }
│   ├── Match { id, seasonId, kickoffTime: string, createdByUserId, ... }
│   ├── Event { id, matchId, createdAt: string, createdByUserId, ... }
│   ├── Season { id, label, createdAt: string, createdByUserId, ... }
│   ├── Lineup { id, matchId, playerId, createdAt: string, ... }
│   └── ... other entities
│
frontend/src/db/schema.ts
├── IndexedDB Extensions (adds sync fields, uses timestamps)
│   ├── SyncableRecord { synced: boolean, syncedAt?: string }
│   ├── DbPlayer extends Player & SyncableRecord (no timestamp overrides)
│   ├── DbTeam extends Team & SyncableRecord
│   └── ... other DB types
```

### Data Flow

```
PostgreSQL (snake_case)
    ↓ Prisma query
PrismaPlayer { full_name, created_by_user_id, is_deleted, created_at: Date }
    ↓ transformers.ts (ONLY snake_case → camelCase + Date → ISO conversion)
Player { name, createdAt: string, createdByUserId, isDeleted } (shared type)
    ↓ API response (JSON)
Frontend receives Player (camelCase + ISO strings)
    ↓ cacheService stores to IndexedDB
DbPlayer { name, createdAt: string, createdByUserId, isDeleted, synced, syncedAt }
    ↓ UI formats ISO strings (no transforms)
Player { name, createdAt: string, createdByUserId, isDeleted } (for React components)
```

## Components and Interfaces

### 1. Shared Types (`shared/types/frontend.ts`)

Update all entity interfaces to use consistent camelCase and ISO string timestamps (JSON-native):

```typescript
// BEFORE (mixed case)
export interface Player {
  id: string;
  name: string;
  createdAt: Date;
  // Mixed case - BAD
  created_by_user_id: string;
  deleted_at?: Date;
  is_deleted: boolean;
}

// AFTER (all camelCase + ISO timestamps)
export type IsoDateTimeString = string; // e.g. "2025-12-17T12:34:56.789Z"

export interface Player {
  id: string;
  name: string;
  createdAt: IsoDateTimeString;
  createdByUserId: string;
  deletedAt?: IsoDateTimeString;
  isDeleted: boolean;
}
```

### 2. Frontend Schema (`frontend/src/db/schema.ts`)

Replace duplicate definitions with extensions of shared types:

```typescript
import type { Player, Team, Match, ... } from '@shared/types';

// Base interface for syncable records
export interface SyncableRecord {
  synced: boolean;
  syncedAt?: string; // ISO date-time string
}

// IndexedDB-specific types extend shared types directly (no field renaming, no timestamp conversion)
export type DbPlayer = Player & SyncableRecord;
export type DbTeam = Team & SyncableRecord;

// ... similar for other entities
```

### 3. Backend Transformers (`shared/types/transformers.ts`)

Update to output fully camelCase types with ISO string timestamps:

```typescript
// BEFORE
export const transformPlayer = (prismaPlayer: PrismaPlayer): Player => ({
  id: prismaPlayer.id,
  name: prismaPlayer.name,
  createdAt: prismaPlayer.created_at,
  // Mixed case output - BAD
  created_by_user_id: prismaPlayer.created_by_user_id,
  is_deleted: prismaPlayer.is_deleted,
});

// AFTER
export const transformPlayer = (prismaPlayer: PrismaPlayer): Player => ({
  id: prismaPlayer.id,
  name: prismaPlayer.name,
  createdAt: prismaPlayer.created_at.toISOString(),
  // All camelCase output - GOOD
  createdByUserId: prismaPlayer.created_by_user_id,
  isDeleted: prismaPlayer.is_deleted,
});
```

### 4. Frontend Transforms (`frontend/src/db/transforms/*.ts`)

Simplify to near pass-through (no field renaming, no timestamp conversion; UI formats ISO strings):

```typescript
// BEFORE (field renaming + type conversion)
export function dbToPlayer(p: EnhancedPlayer): Player {
  return {
    id: p.id,
    name: p.fullName,  // field rename
    createdAt: toDate(p.createdAt),
    created_by_user_id: p.createdByUserId,  // field rename back!
    is_deleted: p.isDeleted,  // field rename back!
  };
}

// AFTER (pass-through)
export function dbToPlayer(p: DbPlayer): Player {
  return p;
}
```

## Data Models

### Shared Type Fields (All camelCase)

| Entity | Auth/Soft Delete Fields |
|--------|------------------------|
| Player | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| Team | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| Match | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| Event | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| Season | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| Lineup | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| Award | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| MatchAward | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| PlayerTeam | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| MatchState | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |
| MatchPeriod | `createdByUserId`, `deletedAt`, `deletedByUserId`, `isDeleted` |

### IndexedDB Extensions

| Field | Type | Purpose |
|-------|------|---------|
| `synced` | `boolean` | Whether record has been synced to server |
| `syncedAt` | ISO date-time string | Timestamp of last successful sync |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Shared Types Follow camelCase and Are JSON-Native

*For any* exported shared interface intended for API/domain use:

1. All field names match the pattern `/^[a-z][a-zA-Z0-9]*$/` (camelCase with no underscores).
2. Date/time fields are ISO strings (no `Date` fields in shared types).

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Backend Transform Output Matches Shared Types

*For any* Prisma record transformed by `shared/types/transformers.ts`, the output should have field names that exactly match the corresponding shared type interface (all camelCase) and serialize dates to ISO strings.

**Validates: Requirements 4.1, 4.3, 4.4**

### Property 3: Frontend Cache is Shape-Preserving

*For any* entity, caching from API → IndexedDB → UI should preserve all entity fields exactly (excluding sync metadata like `synced`/`syncedAt`).

**Validates: Requirements 3.1, 5.1, 7.2**

### Property 4: IndexedDB CRUD Round-Trip

*For any* entity stored in IndexedDB, writing then reading should return equivalent data (ISO strings remain ISO strings).

**Validates: Requirements 7.2, 7.4**

## Error Handling

- **Type Mismatch Errors**: TypeScript compilation will catch any code using old snake_case field names after the migration
- **Runtime Errors**: Transform functions should handle undefined/null values gracefully
- **Reset Strategy (no users)**: If the local DB schema changes, delete IndexedDB in Chrome DevTools (Application → IndexedDB → Delete) and reload

## Testing Strategy

### Property-Based Testing

Use `fast-check` for property-based tests:

1. **Schema Field Naming Test**: Generate/inspect interface field names and verify camelCase pattern
2. **Transform Round-Trip Test**: Generate random entities, transform through the Prisma boundary, verify field naming + ISO string invariants
3. **IndexedDB CRUD Test**: Generate random entities, write to IndexedDB, read back, verify equality

### Unit Tests

1. **Shared Types**: Verify all interfaces export correctly
2. **Backend Transforms**: Test each transform function with sample data
3. **Frontend Cache**: Test “server response → IndexedDB → UI read” is pass-through (no renaming)
4. **Integration**: Test full data flow from API response to UI display

### Compilation Verification

1. Run `tsc --noEmit` in both frontend and backend
2. Run `npm run build` to verify production build succeeds


