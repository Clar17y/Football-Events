# Soft Delete Restoration Implementation Plan

## Overview
This document outlines the plan to implement soft delete restoration across all backend services. When creating a new record that would trigger a unique constraint violation due to an existing soft-deleted record, the system should restore the soft-deleted record instead of throwing an error.

## Current Status Analysis

### ✅ Services with Soft Delete Restoration (Already Implemented)
1. **PlayerTeamService** - `createPlayerTeam()` method
   - Properly checks for existing soft-deleted relationships
   - Restores soft-deleted records with updated data
   - Located in lines 214-252

### ❌ Services Requiring Soft Delete Restoration Implementation

#### 1. AuthService - `register()` method
- **Current Issue**: Only checks for non-deleted users (`is_deleted: false`)
- **Unique Constraint**: `email` field
- **Implementation**: Check for soft-deleted users with same email and restore them
- **Priority**: High (user registration should handle email reuse)

#### 2. TeamService - `createTeam()` method
- **Current Issue**: No soft delete restoration logic
- **Unique Constraint**: `name` field (if enforced at DB level)
- **Implementation**: Check for soft-deleted teams with same name and restore
- **Priority**: Medium

#### 3. PlayerService - `createPlayer()` method
- **Current Issue**: No soft delete restoration logic
- **Unique Constraints**: Combination of `name` + `squad_number` + `current_team`
- **Implementation**: Check for soft-deleted players with same constraints and restore
- **Priority**: Medium

#### 4. MatchService - `createMatch()` method
- **Current Issue**: No soft delete restoration logic
- **Unique Constraints**: Complex combination of teams, date, competition
- **Implementation**: Check for soft-deleted matches with same constraints and restore
- **Priority**: Medium

#### 5. EventService - `createEvent()` method
- **Current Issue**: No soft delete restoration logic
- **Unique Constraints**: Event ID (UUID, unlikely to conflict)
- **Implementation**: Check for soft-deleted events with same ID and restore
- **Priority**: Low (UUID conflicts are rare)

#### 6. AwardsService - `createAward()` and `createMatchAward()` methods
- **Current Issue**: No soft delete restoration logic
- **Unique Constraints**: Award combinations (player + season + category)
- **Implementation**: Check for soft-deleted awards with same constraints and restore
- **Priority**: Medium

#### 7. SeasonService - `createSeason()` method
- **Current Issue**: No soft delete restoration logic
- **Unique Constraints**: `label` field
- **Implementation**: Check for soft-deleted seasons with same label and restore
- **Priority**: Medium

### ⚠️ Services with Hard Delete (No Soft Delete Support)
1. **PositionService** - Uses hard delete, no `is_deleted` field in positions table
2. **LineupService** - Uses hard delete, no `is_deleted` field in lineup table

## Implementation Strategy

### Phase 1: Create Utility Functions
Create reusable utility functions for common soft delete restoration patterns:
- `findAndRestoreSoftDeleted()` - Generic function to find and restore soft-deleted records
- `checkUniqueConstraints()` - Helper to check for unique constraint violations

### Phase 2: Service-by-Service Implementation
Implement soft delete restoration in order of priority:

1. **AuthService** (High Priority)
2. **TeamService** (Medium Priority)
3. **PlayerService** (Medium Priority)
4. **SeasonService** (Medium Priority)
5. **AwardsService** (Medium Priority)
6. **MatchService** (Medium Priority)
7. **EventService** (Low Priority)

### Phase 3: Testing
Create comprehensive tests for each service to ensure:
- Soft delete restoration works correctly
- Original create functionality is preserved
- Error handling is appropriate
- Data integrity is maintained

## Implementation Details

### Common Pattern for Soft Delete Restoration

```typescript
async createEntity(data: EntityCreateRequest, userId: string): Promise<Entity> {
  return withPrismaErrorHandling(async () => {
    // 1. Check for existing soft-deleted record with same unique constraints
    const existingSoftDeleted = await this.prisma.entity.findFirst({
      where: {
        // Unique constraint fields
        field1: data.field1,
        field2: data.field2,
        is_deleted: true
      }
    });

    // 2. If soft-deleted record exists, restore it
    if (existingSoftDeleted) {
      const restored = await this.prisma.entity.update({
        where: { id: existingSoftDeleted.id },
        data: {
          // Update with new data
          ...transformEntityCreateRequest(data),
          // Reset soft delete fields
          is_deleted: false,
          deleted_at: null,
          deleted_by_user_id: null,
          // Update metadata
          updated_at: new Date(),
          // Preserve or update ownership
          created_by_user_id: userId // or keep original
        }
      });
      return transformEntity(restored);
    }

    // 3. If no soft-deleted record, create new one
    const entityData = {
      ...transformEntityCreateRequest(data),
      created_by_user_id: userId
    };

    const entity = await this.prisma.entity.create({
      data: entityData
    });

    return transformEntity(entity);
  }, 'Entity');
}
```

### Unique Constraint Mappings

| Service | Table | Unique Constraints |
|---------|-------|-------------------|
| AuthService | user | email |
| TeamService | team | name (per user) |
| PlayerService | player | name + squad_number + current_team |
| SeasonService | seasons | label |
| AwardsService | awards | player_id + season_id + category |
| AwardsService | match_awards | player_id + match_id + category |
| MatchService | match | Complex (teams + date + competition) |
| EventService | event | id (UUID) |

## Testing Strategy

### Unit Tests
- Test soft delete restoration for each service
- Test normal creation when no soft-deleted records exist
- Test error handling for invalid data
- Test permission checks during restoration

### Integration Tests
- Test end-to-end workflows with soft delete restoration
- Test API endpoints that trigger soft delete restoration
- Test concurrent operations

### Test Data Scenarios
1. **Happy Path**: Create → Soft Delete → Create Again (should restore)
2. **No Soft Delete**: Create new record when no soft-deleted record exists
3. **Multiple Soft Deleted**: Handle multiple soft-deleted records with same constraints
4. **Permission Checks**: Ensure users can only restore records they have access to
5. **Data Integrity**: Verify restored records maintain referential integrity

## Files to Create/Modify

### New Files
- `backend/scripts/implement-soft-delete-restoration.js` - Implementation script
- `backend/scripts/test-soft-delete-restoration.js` - Testing script
- `backend/src/utils/softDeleteUtils.ts` - Utility functions
- `backend/tests/soft-delete-restoration/` - Test directory with service-specific tests

### Modified Files
- `backend/src/services/AuthService.ts`
- `backend/src/services/TeamService.ts`
- `backend/src/services/PlayerService.ts`
- `backend/src/services/SeasonService.ts`
- `backend/src/services/AwardsService.ts`
- `backend/src/services/MatchService.ts`
- `backend/src/services/EventService.ts`

## Success Criteria
1. All services with soft delete support implement restoration logic
2. All existing tests continue to pass
3. New tests cover soft delete restoration scenarios
4. API endpoints handle soft delete restoration gracefully
5. No breaking changes to existing functionality
6. Documentation is updated with new behavior

## Timeline
- **Phase 1**: Utility functions and AuthService (1-2 days)
- **Phase 2**: Remaining services implementation (3-4 days)
- **Phase 3**: Comprehensive testing (2-3 days)
- **Total**: 6-9 days

## Risk Mitigation
1. **Data Loss**: Implement comprehensive backups before changes
2. **Breaking Changes**: Maintain backward compatibility
3. **Performance**: Monitor query performance with new logic
4. **Concurrency**: Handle race conditions in restoration logic
5. **Testing**: Extensive testing in development environment before production