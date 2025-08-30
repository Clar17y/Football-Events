# Lineup API Enhancements

## Overview

This document describes the enhancements made to the lineup API endpoints to support positioning data and substitution functionality for live match integration.

## Enhanced Validation Schemas

### Updated `lineupCreateSchema`
- Added `pitchX` (optional): Number between 0-100 representing X coordinate on pitch
- Added `pitchY` (optional): Number between 0-100 representing Y coordinate on pitch  
- Added `substitutionReason` (optional): String up to 100 characters describing substitution reason

### Updated `lineupUpdateSchema`
- Added same optional fields as create schema for updates
- All fields remain optional for partial updates

## New API Endpoints

### GET `/api/v1/lineups/match/:matchId/current`
Returns current lineup for a match at a specific time.

**Query Parameters:**
- `currentTime` (optional): Time in minutes, defaults to 0

**Response:** Array of `LineupWithDetails` objects including positioning data

**Example:**
```bash
GET /api/v1/lineups/match/123e4567-e89b-12d3-a456-426614174000/current?currentTime=30
```

### GET `/api/v1/lineups/match/:matchId/active-at/:timeMinutes`
Returns active players at a specific time in the match.

**Parameters:**
- `matchId`: UUID of the match
- `timeMinutes`: Time in minutes (number)

**Response:** Array of `PlayerWithPosition` objects

**Example:**
```bash
GET /api/v1/lineups/match/123e4567-e89b-12d3-a456-426614174000/active-at/45
```

### POST `/api/v1/lineups/match/:matchId/substitute`
Makes a substitution during a live match.

**Request Body:**
```json
{
  "playerOffId": "uuid",
  "playerOnId": "uuid", 
  "position": "string",
  "currentTime": number,
  "substitutionReason": "string (optional)"
}
```

**Response:** `SubstitutionResult` object containing:
- `playerOffLineup`: Updated lineup record for player going off
- `playerOnLineup`: New lineup record for player coming on
- `timelineEvents`: Array of timeline events created

**Example:**
```bash
POST /api/v1/lineups/match/123e4567-e89b-12d3-a456-426614174000/substitute
{
  "playerOffId": "player-1-uuid",
  "playerOnId": "player-2-uuid",
  "position": "ST",
  "currentTime": 60,
  "substitutionReason": "Tactical change"
}
```

## Enhanced Existing Endpoints

All existing lineup endpoints now support the new positioning and substitution reason fields:

- `POST /api/v1/lineups` - Create with positioning data
- `PUT /api/v1/lineups/:id` - Update with positioning data
- `POST /api/v1/lineups/batch` - Batch operations with positioning data
- `POST /api/v1/lineups/batch-by-match` - Match-scoped batch operations

## Authorization

All new endpoints follow the same authorization patterns as existing lineup endpoints:
- Require authentication via JWT token
- Users can only access lineups from matches they created
- Admins have access to all lineups
- UUID validation on all match and lineup ID parameters

## Error Handling

### Validation Errors (400)
- Invalid pitch coordinates (outside 0-100 range)
- Substitution reason too long (over 100 characters)
- Missing required fields for substitution
- Invalid time parameters

### Authorization Errors (401/404)
- Missing or invalid authentication token
- Access denied to match (returns 404 for security)

### Service Errors (400/500)
- Player not currently on pitch for substitution
- Match not found or access denied
- Database constraint violations

## Testing

### Validation Tests
- `tests/validation/lineup.enhanced.validation.test.ts`
- Comprehensive schema validation testing
- Edge cases and boundary value testing

### Service Tests  
- `tests/services/LineupService.enhanced.test.ts`
- Enhanced service method testing
- Authorization and error handling

### API Integration Tests
- `tests/api/lineups.enhanced.api.test.ts`
- End-to-end API testing (requires database setup)
- Authentication and authorization testing

## Requirements Coverage

This implementation addresses the following requirements from the specification:

### Requirement 3.4
- ✅ Substitution timing with precise start_min/end_min recording
- ✅ Lineup table updates with current match time

### Requirement 3.5  
- ✅ Timeline event creation for substitutions
- ✅ Separate "Player X off" and "Player Y on" events

### Requirement 4.1
- ✅ Precise timing data for statistical accuracy
- ✅ Match period integration for time calculations

### Requirement 4.2
- ✅ Data integrity with unique constraints
- ✅ Proper handling of multiple lineup changes

## Usage Examples

### Creating Lineup with Positioning
```javascript
const lineup = await fetch('/api/v1/lineups', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    matchId: 'match-uuid',
    playerId: 'player-uuid',
    startMinute: 0,
    position: 'GK',
    pitchX: 50.0,
    pitchY: 5.0
  })
});
```

### Making a Substitution
```javascript
const substitution = await fetch('/api/v1/lineups/match/match-uuid/substitute', {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    playerOffId: 'player-off-uuid',
    playerOnId: 'player-on-uuid', 
    position: 'ST',
    currentTime: 60,
    substitutionReason: 'Tactical change'
  })
});
```

### Getting Current Lineup
```javascript
const currentLineup = await fetch('/api/v1/lineups/match/match-uuid/current?currentTime=45', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

## Database Schema Impact

The enhancements work with the existing database schema and the planned additions:
- Uses existing `lineup` table structure
- Compatible with planned `pitch_x`, `pitch_y`, and `substitution_reason` columns
- Maintains referential integrity with matches, players, and timeline events

## Backward Compatibility

All enhancements are backward compatible:
- New fields are optional in validation schemas
- Existing API endpoints continue to work unchanged
- New endpoints are additive and don't affect existing functionality
- Service methods maintain existing signatures while adding new functionality