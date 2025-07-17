# Schema Alignment Tests Continuation Prompt

## Context
You are continuing work on fixing schema alignment tests for a grassroots football PWA. The shared types and transformers have been updated to include authorization fields, and a proven pattern has been established for fixing these tests.

## Current Status
✅ **COMPLETED** (All tests passing):
- `backend/tests/schema-alignment/team.test.ts` - 12 tests
- `backend/tests/schema-alignment/player.test.ts` - 15 tests  
- `backend/tests/schema-alignment/season.test.ts` - 12 tests
- `backend/tests/schema-alignment/awards.test.ts` - 27 tests

🔄 **REMAINING** (Need to be fixed):
- `backend/tests/schema-alignment/match.test.ts`
- `backend/tests/schema-alignment/event.test.ts`
- `backend/tests/schema-alignment/lineup.test.ts`

## Key Infrastructure Already in Place

### 1. SchemaTestUserHelper
Location: `backend/tests/schema-alignment/test-user-helper.ts`
```typescript
import { SchemaTestUserHelper } from './test-user-helper';

// In test setup:
let userHelper: SchemaTestUserHelper;
let testUserId: string;

beforeAll(async () => {
  userHelper = new SchemaTestUserHelper(prisma);
  testUserId = await userHelper.createTestUser('USER');
});

afterAll(async () => {
  await userHelper.cleanup();
  await prisma.$disconnect();
});
```

### 2. Updated Transformers
All create transformers now require `created_by_user_id` parameter:
```typescript
// Example usage:
const prismaInput = transformTeamCreateRequest(frontendData, testUserId);
const prismaInput = transformPlayerCreateRequest(frontendData, testUserId);
// etc.
```

### 3. Authorization Fields Required
All database entities now require `created_by_user_id` in create operations:
```typescript
await prisma.team.create({
  data: {
    name: 'Test Team',
    created_by_user_id: testUserId  // REQUIRED
  }
});
```

## Command Execution Requirements

**IMPORTANT**: All commands must be executed via the MCP server as specified:

```powershell
# Run tests
Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command": "cd backend && npx vitest tests/schema-alignment/match.test.ts --run"}'

# Check MCP server status
Invoke-RestMethod -Uri "http://localhost:9123/status" -Method GET

# Get available endpoints
Invoke-RestMethod -Uri "http://localhost:9123/" -Method GET
```

## Proven Systematic Pattern

For each failing test file, apply this pattern:

### Step 1: Add SchemaTestUserHelper
```typescript
// Add import
import { SchemaTestUserHelper } from './test-user-helper';

// Add variables
let testUserId: string;
let userHelper: SchemaTestUserHelper;

// Update beforeAll
beforeAll(async () => {
  // ... existing setup
  userHelper = new SchemaTestUserHelper(prisma);
  testUserId = await userHelper.createTestUser('USER');
});

// Update afterAll
afterAll(async () => {
  await userHelper.cleanup();
  await prisma.$disconnect();
});
```

### Step 2: Fix Transformer Calls
Find and replace all transformer calls to include `testUserId`:
```typescript
// BEFORE:
const prismaInput = transformMatchCreateRequest(frontendData);

// AFTER:
const prismaInput = transformMatchCreateRequest(frontendData, testUserId);
```

### Step 3: Fix Direct Prisma Calls
Add `created_by_user_id` to all direct database create operations:
```typescript
// BEFORE:
await prisma.match.create({
  data: {
    season_id: testSeasonId,
    kickoff_ts: new Date(),
    home_team_id: testHomeTeamId,
    away_team_id: testAwayTeamId
  }
});

// AFTER:
await prisma.match.create({
  data: {
    season_id: testSeasonId,
    kickoff_ts: new Date(),
    home_team_id: testHomeTeamId,
    away_team_id: testAwayTeamId,
    created_by_user_id: testUserId  // ADD THIS
  }
});
```

### Step 4: Update Test Expectations
Add authorization fields to transformation expectations:
```typescript
// BEFORE:
expect(transformedEntity).toEqual({
  id: entity.id,
  name: 'Test Name',
  createdAt: entity.created_at,
  updatedAt: undefined
});

// AFTER:
expect(transformedEntity).toEqual({
  id: entity.id,
  name: 'Test Name',
  createdAt: entity.created_at,
  updatedAt: undefined,
  // Authorization and soft delete fields
  created_by_user_id: testUserId,
  deleted_at: undefined,
  deleted_by_user_id: undefined,
  is_deleted: false
});
```

### Step 5: Fix Prisma Input Expectations
```typescript
// BEFORE:
expect(prismaInput).toEqual({
  name: 'Test Name',
  other_field: 'value'
});

// AFTER:
expect(prismaInput).toEqual({
  name: 'Test Name',
  other_field: 'value',
  created_by_user_id: testUserId  // ADD THIS
});
```

## Common Issues and Solutions

### 1. Missing Required Fields
If tests fail with "NOT NULL constraint", ensure all required fields are provided:
```typescript
// Seasons need start_date, end_date
await prisma.seasons.create({
  data: {
    label: 'Test Season',
    start_date: new Date('2024-01-01'),
    end_date: new Date('2024-12-31'),
    is_current: false,
    created_by_user_id: testUserId
  }
});
```

### 2. Updated_at Field Issues
Replace expectations about automatic `updated_at` updates:
```typescript
// REPLACE:
expect(entity.updatedAt).toBeInstanceOf(Date);

// WITH:
// Note: updated_at is not automatically set in current schema
```

### 3. Removed Fields
Some fields may have been removed from the schema (e.g., `current_team` in players):
```typescript
// REMOVE or comment out:
// expect(player.currentTeam).toBeNull();
// Note: currentTeam field removed from schema
```

## Testing Strategy

1. **Run the test file** to see current failures
2. **Apply fixes systematically** following the pattern above
3. **Re-run tests** after each major fix to track progress
4. **Focus on one issue type at a time** (transformer calls, then Prisma calls, then expectations)

## File Locations

- Test files: `backend/tests/schema-alignment/`
- Helper: `backend/tests/schema-alignment/test-user-helper.ts`
- Shared types: `shared/types/`
- Transformers: `shared/types/transformers.ts`

## Success Criteria

Each test file should have **ALL tests passing** when complete. The pattern has been proven to work across 4 different entity types (teams, players, seasons, awards) with 66 total tests now passing.

## Next Steps

1. Start with `match.test.ts` as it's likely to have similar patterns to the completed files
2. Apply the systematic pattern above
3. Move to `event.test.ts` and `lineup.test.ts` using the same approach
4. Consider creating player-teams transformers if needed

The infrastructure is solid and the pattern is proven - just need to systematically apply it to the remaining test files.