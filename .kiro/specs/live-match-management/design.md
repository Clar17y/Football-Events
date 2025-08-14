# Design Document

## Overview

The Live Match Management system extends the existing grassroots football platform with real-time match state tracking capabilities. The system introduces two new database tables (`match_state` and `match_periods`) to manage dynamic match information while preserving the existing `matches` table for static match details. This design enables live match tracking, period management, and comprehensive timing functionality for grassroots football matches.

## Architecture

### Database Design

The system introduces two new tables that work together to provide comprehensive match state management:

#### match_state Table
- **Purpose**: Tracks the current state of each match
- **Cardinality**: One record per match (1:1 relationship with matches)
- **Responsibility**: Current status, timing, and active period tracking

#### match_periods Table  
- **Purpose**: Historical record of all match periods and their timing
- **Cardinality**: Multiple records per match (1:N relationship with matches)
- **Responsibility**: Period-by-period timing history and transitions

### State Management Flow

```
scheduled → live → paused → live → completed
     ↓         ↓              ↓         ↓
   (none)  period_1    period_1   period_2
            starts      paused     starts
```

## Components and Interfaces

### Database Schema

```sql
-- Current match state (one per match)
model match_state {
  id                    String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  match_id              String    @unique @db.Uuid
  status                String    @default("scheduled") -- "scheduled", "live", "paused", "completed", "cancelled", "postponed"
  current_period        Int?      -- Current period number (1, 2, 3, 4)
  current_period_type   String?   -- "regular", "extra_time", "penalty_shootout"
  match_started_at      DateTime? @db.Timestamptz(6)
  match_ended_at        DateTime? @db.Timestamptz(6)
  total_elapsed_seconds Int       @default(0)
  created_at            DateTime  @default(now()) @db.Timestamptz(6)
  updated_at            DateTime? @db.Timestamptz(6)
  created_by_user_id    String    @db.Uuid
  deleted_at            DateTime?
  deleted_by_user_id    String?   @db.Uuid
  is_deleted            Boolean   @default(false)
  
  match                 Match     @relation(fields: [match_id], references: [match_id], onDelete: Cascade)
  created_by            User      @relation("MatchStateCreatedBy", fields: [created_by_user_id], references: [id])
  deleted_by            User?     @relation("MatchStateDeletedBy", fields: [deleted_by_user_id], references: [id])

  @@map("match_state")
  @@schema("grassroots")
}

-- Period history (multiple per match)
model match_periods {
  id                 String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  match_id           String    @db.Uuid
  period_number      Int       -- 1, 2, 3, 4 for quarters; 1, 2 for halves; 1 for whole
  period_type        String    @default("regular") -- "regular", "extra_time", "penalty_shootout"
  started_at         DateTime? @db.Timestamptz(6)
  ended_at           DateTime? @db.Timestamptz(6)
  duration_seconds   Int?      -- Actual duration (may differ from planned)
  created_at         DateTime  @default(now()) @db.Timestamptz(6)
  updated_at         DateTime? @db.Timestamptz(6)
  created_by_user_id String    @db.Uuid
  deleted_at         DateTime?
  deleted_by_user_id String?   @db.Uuid
  is_deleted         Boolean   @default(false)
  
  match              Match     @relation(fields: [match_id], references: [match_id], onDelete: Cascade)
  created_by         User      @relation("MatchPeriodCreatedBy", fields: [created_by_user_id], references: [id])
  deleted_by         User?     @relation("MatchPeriodDeletedBy", fields: [deleted_by_user_id], references: [id])

  @@unique([match_id, period_number, period_type])
  @@map("match_periods")
  @@schema("grassroots")
}
```

### API Endpoints

#### Match State Management
- `POST /api/v1/matches/{id}/start` - Start a match
- `POST /api/v1/matches/{id}/pause` - Pause a live match  
- `POST /api/v1/matches/{id}/resume` - Resume a paused match
- `POST /api/v1/matches/{id}/complete` - Complete a match
- `POST /api/v1/matches/{id}/cancel` - Cancel a match
- `GET /api/v1/matches/{id}/state` - Get current match state

#### Period Management  
- `POST /api/v1/matches/{id}/periods/start` - Start a new period
- `POST /api/v1/matches/{id}/periods/{periodId}/end` - End current period
- `GET /api/v1/matches/{id}/periods` - Get match period history

#### Status Queries
- `GET /api/v1/matches/live` - Get all live matches
- `GET /api/v1/matches/{id}/status` - Get match status for display

### Service Layer

#### MatchStateService
```typescript
class MatchStateService {
  async startMatch(matchId: string, userId: string): Promise<MatchState>
  async pauseMatch(matchId: string, userId: string): Promise<MatchState>  
  async resumeMatch(matchId: string, userId: string): Promise<MatchState>
  async completeMatch(matchId: string, userId: string): Promise<MatchState>
  async cancelMatch(matchId: string, reason: string, userId: string): Promise<MatchState>
  async getCurrentState(matchId: string): Promise<MatchState | null>
}
```

#### MatchPeriodsService  
```typescript
class MatchPeriodsService {
  async startPeriod(matchId: string, periodNumber: number, periodType: string, userId: string): Promise<MatchPeriod>
  async endPeriod(matchId: string, periodId: string, userId: string): Promise<MatchPeriod>
  async getMatchPeriods(matchId: string): Promise<MatchPeriod[]>
  async calculateElapsedTime(matchId: string): Promise<number>
}
```

## Data Models

### Match Status States

| Status | Description | Valid Transitions |
|--------|-------------|-------------------|
| `scheduled` | Match is planned but not started | → `live`, `cancelled`, `postponed` |
| `live` | Match is currently in progress | → `paused`, `completed` |
| `paused` | Match is temporarily stopped | → `live`, `completed`, `cancelled` |
| `completed` | Match has finished normally | (final state) |
| `cancelled` | Match was cancelled before/during play | (final state) |
| `postponed` | Match was postponed to another time | → `scheduled` |

### Period Types

| Type | Description | Usage |
|------|-------------|-------|
| `regular` | Normal match periods | Standard quarters, halves, or full match |
| `extra_time` | Additional time periods | Extra time in knockout matches |
| `penalty_shootout` | Penalty kicks | Penalty shootout to decide winner |

### Timing Calculations

```typescript
// Total elapsed time calculation
function calculateElapsedTime(periods: MatchPeriod[]): number {
  return periods
    .filter(p => p.started_at && p.ended_at)
    .reduce((total, period) => {
      const duration = period.ended_at.getTime() - period.started_at.getTime();
      return total + Math.floor(duration / 1000);
    }, 0);
}
```

## Error Handling

### State Transition Validation
- Prevent invalid state transitions (e.g., `completed` → `live`)
- Validate period transitions based on match format
- Ensure only one period can be active at a time

### Data Consistency
- Atomic operations for state changes
- Transaction rollback on validation failures  
- Soft delete preservation of timing data

### API Error Responses
```typescript
// Standard error response format
{
  success: false,
  error: {
    code: "INVALID_STATE_TRANSITION",
    message: "Cannot start a completed match",
    details: {
      currentStatus: "completed",
      requestedTransition: "live"
    }
  }
}
```

## Testing Strategy

### Unit Tests
- State transition logic validation
- Timing calculation accuracy
- Period management edge cases
- Soft delete functionality

### Integration Tests  
- API endpoint functionality
- Database transaction integrity
- Service layer interactions
- Error handling scenarios

### End-to-End Tests
- Complete match lifecycle flows
- Multi-period match scenarios
- Pause/resume functionality
- Integration with matches page display

## Performance Considerations

### Database Indexing
```sql
-- Optimize common queries
CREATE INDEX idx_match_state_status ON match_state(status) WHERE is_deleted = false;
CREATE INDEX idx_match_state_match_id ON match_state(match_id) WHERE is_deleted = false;
CREATE INDEX idx_match_periods_match_id ON match_periods(match_id) WHERE is_deleted = false;
```

### Caching Strategy
- Cache active match states for live match queries
- Cache period calculations for completed matches
- Invalidate cache on state changes

### Real-time Updates
- Consider WebSocket connections for live match updates
- Implement polling fallback for real-time status
- Optimize query performance for live match lists

## Security Considerations

### Authorization
- Verify user permissions for match state changes
- Restrict match control to authorized coaches/officials
- Audit trail for all state modifications

### Data Validation
- Validate state transition requests
- Sanitize timing data inputs
- Prevent manipulation of historical timing data

### Soft Delete Security
- Restrict access to soft deleted records
- Audit soft delete operations
- Prevent unauthorized data recovery