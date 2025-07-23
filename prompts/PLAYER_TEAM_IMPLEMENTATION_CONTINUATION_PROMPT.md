# PlayerTeam Implementation Continuation Prompt

## Context
You are continuing work on implementing PlayerTeam transformers and frontend layers for a grassroots football PWA. The PlayerTeam entity represents the new way of denoting which players belong to which teams, replacing the old `current_team` field on players with a proper many-to-many relationship with date ranges.

## Current Status
✅ **COMPLETED**:
- `PrismaPlayerTeam` type added to `shared/types/prisma.ts`
- `PrismaPlayerTeamCreateInput` and `PrismaPlayerTeamUpdateInput` types added to `shared/types/prisma.ts`
- `PlayerTeam`, `PlayerTeamCreateRequest`, and `PlayerTeamUpdateRequest` interfaces added to `shared/types/frontend.ts`

🔄 **REMAINING WORK**:
1. Create transformer functions in `shared/types/transformers.ts`
2. Add PlayerTeam to the main exports in `shared/types/index.ts`
3. Create schema alignment tests following the established pattern

## Database Schema Reference
From `backend/prisma/schema.prisma`, the `player_teams` model:
```prisma
model player_teams {
  id                String   @id @default(uuid())
  player_id         String
  team_id           String
  start_date        DateTime @db.Date
  end_date          DateTime? @db.Date
  created_at        DateTime @default(now())
  updated_at        DateTime?
  created_by_user_id String
  deleted_at        DateTime?
  deleted_by_user_id String?
  is_deleted        Boolean  @default(false)

  // Relations
  player Player @relation(fields: [player_id], references: [id], onDelete: Cascade)
  team   Team   @relation(fields: [team_id], references: [id], onDelete: Cascade)

  @@unique([player_id, team_id, start_date])
  @@map("player_teams")
}
```

## Existing Service Implementation
The `PlayerTeamService` already exists in `backend/src/services/PlayerTeamService.ts` with methods:
- `createPlayerTeam(data, userId)`
- `getPlayerTeamById(id)`
- `updatePlayerTeam(id, data)`
- `deletePlayerTeam(id, userId)`
- `getPlayerTeamsByPlayerId(playerId)`
- `getPlayerTeamsByTeamId(teamId)`
- `getCurrentPlayerTeams()`
- `getPlayerTeamsInDateRange(startDate, endDate)`

## API Routes
The routes exist in `backend/src/routes/v1/player-teams.ts` with endpoints:
- `POST /` - Create player team
- `GET /:id` - Get by ID
- `PUT /:id` - Update player team
- `DELETE /:id` - Delete player team
- `GET /player/:playerId` - Get by player ID
- `GET /team/:teamId` - Get by team ID
- `GET /current` - Get current player teams
- `GET /date-range` - Get by date range

## Validation Schemas
Validation schemas exist in `backend/src/validation/schemas.ts`:
- `playerTeamCreateSchema`
- `playerTeamUpdateSchema`

## Tasks to Complete

### 1. Create Transformer Functions in `shared/types/transformers.ts`

Add these transformer functions following the established pattern:

```typescript
// PlayerTeam transformers
export const transformPlayerTeam = (prismaPlayerTeam: PrismaPlayerTeam): PlayerTeam => ({
  id: prismaPlayerTeam.id,
  playerId: prismaPlayerTeam.player_id,
  teamId: prismaPlayerTeam.team_id,
  startDate: prismaPlayerTeam.start_date,
  endDate: prismaPlayerTeam.end_date ?? undefined,
  createdAt: prismaPlayerTeam.created_at,
  updatedAt: prismaPlayerTeam.updated_at ?? undefined,
  // Authentication and soft delete fields
  created_by_user_id: prismaPlayerTeam.created_by_user_id,
  deleted_at: prismaPlayerTeam.deleted_at ?? undefined,
  deleted_by_user_id: prismaPlayerTeam.deleted_by_user_id ?? undefined,
  is_deleted: prismaPlayerTeam.is_deleted,
});

export const transformPlayerTeamCreateRequest = (
  data: PlayerTeamCreateRequest,
  userId: string
): PrismaPlayerTeamCreateInput => ({
  player_id: data.playerId,
  team_id: data.teamId,
  start_date: data.startDate,
  end_date: data.endDate ?? null,
  created_by_user_id: userId,
});

export const transformPlayerTeamUpdateRequest = (
  data: PlayerTeamUpdateRequest
): PrismaPlayerTeamUpdateInput => ({
  player_id: data.playerId,
  team_id: data.teamId,
  start_date: data.startDate,
  end_date: data.endDate ?? null,
});

export const transformPlayerTeams = (prismaPlayerTeams: PrismaPlayerTeam[]): PlayerTeam[] =>
  prismaPlayerTeams.map(transformPlayerTeam);

export const safeTransformPlayerTeam = (prismaPlayerTeam: PrismaPlayerTeam | null): PlayerTeam | null =>
  prismaPlayerTeam ? transformPlayerTeam(prismaPlayerTeam) : null;
```

### 2. Update Main Exports in `shared/types/index.ts`

Add PlayerTeam exports to the main index file:

```typescript
// Add to existing exports
export type {
  // ... existing exports ...
  PlayerTeam,
  PlayerTeamCreateRequest,
  PlayerTeamUpdateRequest,
} from './frontend';

export type {
  // ... existing exports ...
  PrismaPlayerTeam,
  PrismaPlayerTeamCreateInput,
  PrismaPlayerTeamUpdateInput,
} from './prisma';

export {
  // ... existing exports ...
  transformPlayerTeam,
  transformPlayerTeamCreateRequest,
  transformPlayerTeamUpdateRequest,
  transformPlayerTeams,
  safeTransformPlayerTeam,
} from './transformers';
```

### 3. Create Schema Alignment Tests

Create `backend/tests/schema-alignment/player-team.test.ts` following the established pattern from other test files. The test should include:

**Test Structure Pattern** (based on existing tests):
- Import SchemaTestUserHelper
- Set up test infrastructure with user helper
- Create test dependencies (teams, players)
- Test transformer functions
- Test CRUD operations
- Test field mappings
- Test authorization fields
- Test soft delete functionality
- Test edge cases and validation

**Key Test Categories**:
1. **Transformer Tests**:
   - `transformPlayerTeamCreateRequest` with userId
   - `transformPlayerTeam` round-trip
   - Field mapping (camelCase ↔ snake_case)
   - Authorization fields inclusion

2. **Database Operations**:
   - Create with required fields
   - Read operations
   - Update operations
   - Soft delete operations

3. **Validation Tests**:
   - Required fields validation
   - Foreign key constraints
   - Unique constraint (player_id, team_id, start_date)
   - Date validation

4. **Edge Cases**:
   - Null/undefined handling
   - Date range overlaps
   - Current team assignments

**Test File Template Structure**:
```typescript
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  PlayerTeam,
  PlayerTeamCreateRequest,
  PlayerTeamUpdateRequest,
  transformPlayerTeam,
  transformPlayerTeamCreateRequest,
  transformPlayerTeamUpdateRequest,
  PrismaPlayerTeam
} from '@shared/types';
import { SchemaTestUserHelper } from './test-user-helper';

describe('PlayerTeam Schema Alignment Tests', () => {
  let prisma: PrismaClient;
  let testUserId: string;
  let userHelper: SchemaTestUserHelper;
  let testPlayerId: string;
  let testTeamId: string;
  let createdPlayerTeamIds: string[] = [];

  beforeAll(async () => {
    // Initialize Prisma and user helper
    // Create test dependencies (team, player)
  });

  afterEach(async () => {
    // Clean up created player teams
  });

  afterAll(async () => {
    // Clean up all test data
    // Cleanup user helper
  });

  // Add comprehensive tests following the pattern
});
```

## Key Implementation Notes

1. **Authorization Fields**: All transformers must include the authorization and soft delete fields (`created_by_user_id`, `deleted_at`, `deleted_by_user_id`, `is_deleted`)

2. **Field Mapping**: Follow the established pattern:
   - Frontend: camelCase (`playerId`, `teamId`, `startDate`, `endDate`)
   - Database: snake_case (`player_id`, `team_id`, `start_date`, `end_date`)

3. **Date Handling**: 
   - `start_date` is required
   - `end_date` is optional (null for current assignments)
   - Use proper Date objects in transformers

4. **Unique Constraint**: The combination of `player_id`, `team_id`, and `start_date` must be unique

5. **Test Pattern**: Follow the exact same pattern as the recently completed schema alignment tests (match.test.ts, event.test.ts, lineup.test.ts)

## Commands to Run Tests
All commands should be executed via MCP server:
```bash
# Test the new player-team schema alignment
Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command": "cd backend && npx vitest tests/schema-alignment/player-team.test.ts --run"}'

# Test all schema alignment tests
Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command": "cd backend && npx vitest tests/schema-alignment/ --run"}'
```

## Success Criteria
- All transformer functions work correctly with proper field mapping
- PlayerTeam types are properly exported from shared/types
- Schema alignment tests pass with comprehensive coverage
- Authorization fields are properly handled
- Date handling works correctly
- Unique constraints are respected
- Soft delete functionality works

The infrastructure is solid and the pattern is proven - just need to systematically implement the transformers and tests following the established patterns.