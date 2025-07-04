# API Design Specification

**Date:** 2025-07-04  
**Purpose:** Complete API endpoint specification for Node.js backend supporting mobile match console and real-time family sharing

## Overview

This document defines the RESTful API endpoints and real-time communication patterns for the grassroots football PWA backend. The API supports offline-first mobile usage with intelligent synchronization, match history management, and real-time family sharing capabilities.

## Architecture Principles

### Data Flow Strategy
- **Primary Storage**: IndexedDB for offline reliability and pitch-side performance
- **Sync Strategy**: Intelligent batching with immediate sync for critical events
- **Real-time Updates**: Server-Sent Events (SSE) for live family sharing
- **Offline Support**: Queue-based synchronization when connectivity returns

### Sync Timing Strategy
- **Active Play**: Batch sync every 5 seconds
- **Critical Events**: Immediate sync for goals, assists, cards
- **Idle State**: Background sync with push notifications for important events
- **Offline Recovery**: Full sync when connectivity restored

## Core Data Models

### Match Model
```typescript
interface Match {
  id: string
  homeTeam: Team
  awayTeam: Team
  venue?: string
  kickoffTime: Date
  status: 'scheduled' | 'live' | 'completed'
  currentPeriod: number
  totalPeriods: number
  periodLengthMinutes: number
  createdAt: Date
  updatedAt: Date
}
```

### Team Model
```typescript
interface Team {
  id: string
  name: string
  isOwned: boolean  // true for user's team, false for opposition
  players: Player[]
  colors?: {
    primary: string
    secondary: string
  }
}
```

### Player Model
```typescript
interface Player {
  id: string
  name: string
  shirtNumber?: number
  position?: string
  isActive: boolean
  teamId: string
}
```

### Event Model
```typescript
interface MatchEvent {
  id: string
  matchId: string
  kind: EventKind
  playerId: string
  teamId: string
  clockMs: number
  period: number
  position?: { x: number, y: number }
  notes?: string
  timestamp: Date
}
```

### Lineup Model
```typescript
interface MatchLineup {
  matchId: string
  teamId: string
  period: number
  players: LineupPlayer[]
  formation?: string
  updatedAt: Date
}

interface LineupPlayer {
  playerId: string
  position: string
  coordinates?: { x: number, y: number }
  onPitch: boolean
  startTime?: number  // clock time when player entered
  endTime?: number    // clock time when player left
}
```

## API Endpoints

### Match Management

#### Create New Match
```
POST /api/matches
Content-Type: application/json

Request Body:
{
  "homeTeamName": "Old Wilsonians U10",
  "awayTeamName": "Unity FC",
  "venue": "Rectory Field",
  "kickoffTime": "2025-07-05T10:00:00Z",
  "periodLengthMinutes": 12.5,
  "totalPeriods": 4
}

Response: 201 Created
{
  "match": Match,
  "shareUrl": "https://app.grassroots.com/matches/abc123/live"
}
```

#### Get Match History
```
GET /api/matches?limit=20&offset=0&status=completed

Response: 200 OK
{
  "matches": Match[],
  "total": number,
  "hasMore": boolean
}
```

#### Get Match Details
```
GET /api/matches/:matchId

Response: 200 OK
{
  "match": Match,
  "events": MatchEvent[],
  "lineups": MatchLineup[],
  "statistics": MatchStatistics
}
```

#### Get Match for Live Viewing
```
GET /api/matches/:matchId/live

Response: 200 OK (HTML page for family sharing)
- Real-time score display
- Current lineup visualization
- Recent events timeline
- Auto-refreshing via SSE
```

### Event Synchronization

#### Batch Sync Events
```
POST /api/matches/:matchId/sync
Content-Type: application/json

Request Body:
{
  "events": MatchEvent[],
  "lineupChanges": MatchLineup[],
  "lastSyncTimestamp": "2025-07-05T10:15:30Z"
}

Response: 200 OK
{
  "synced": number,
  "conflicts": ConflictResolution[],
  "serverEvents": MatchEvent[]  // events from other sources
}
```

#### Immediate Event Sync
```
POST /api/matches/:matchId/events
Content-Type: application/json

Request Body: MatchEvent

Response: 201 Created
{
  "event": MatchEvent,
  "broadcastSent": boolean
}
```

### Team and Player Management

#### Get Available Teams
```
GET /api/teams?search=unity

Response: 200 OK
{
  "teams": Team[],
  "suggestions": string[]  // previously played team names
}
```

#### Get Team Roster
```
GET /api/teams/:teamId/players

Response: 200 OK
{
  "players": Player[],
  "defaultFormation": string
}
```

#### Create/Update Opposition Team
```
POST /api/teams
Content-Type: application/json

Request Body:
{
  "name": "Unity FC",
  "isOwned": false,
  "players": [
    { "name": "Player 1", "shirtNumber": 1 },
    { "name": "Player 2", "shirtNumber": 2 }
  ]
}

Response: 201 Created
{
  "team": Team
}
```

### Lineup Management

#### Get Current Lineup
```
GET /api/matches/:matchId/lineup?period=1

Response: 200 OK
{
  "homeLineup": MatchLineup,
  "awayLineup": MatchLineup,
  "substitutionsRemaining": number
}
```

#### Update Player Positions
```
PUT /api/matches/:matchId/lineup
Content-Type: application/json

Request Body:
{
  "teamId": "team123",
  "period": 1,
  "players": [
    {
      "playerId": "player1",
      "position": "GK",
      "coordinates": { "x": 0.1, "y": 0.5 },
      "onPitch": true
    }
  ]
}

Response: 200 OK
{
  "lineup": MatchLineup,
  "broadcastSent": boolean
}
```

### Real-time Communication

#### Server-Sent Events Stream
```
GET /api/matches/:matchId/events/stream
Accept: text/event-stream

Response: 200 OK
Content-Type: text/event-stream

Event Types:
- match:event (new match event)
- match:lineup (lineup change)
- match:score (score update)
- match:period (period change)
- match:status (match status change)

Example Event:
data: {
  "type": "match:event",
  "event": {
    "kind": "goal",
    "player": "John Smith",
    "team": "Old Wilsonians U10",
    "time": "15:23",
    "score": { "home": 2, "away": 1 }
  }
}
```

#### Push Notification Subscription
```
POST /api/matches/:matchId/notifications/subscribe
Content-Type: application/json

Request Body:
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { ... },
  "eventTypes": ["goal", "card", "period_end"]
}

Response: 201 Created
{
  "subscriptionId": "sub123",
  "expiresAt": "2025-07-05T18:00:00Z"
}
```

### Statistics and Analytics

#### Match Statistics
```
GET /api/matches/:matchId/statistics

Response: 200 OK
{
  "score": { "home": 2, "away": 1 },
  "events": {
    "goals": 3,
    "cards": 1,
    "substitutions": 4
  },
  "playerStats": [
    {
      "playerId": "player1",
      "name": "John Smith",
      "goals": 2,
      "assists": 1,
      "timeOnPitch": 2700000,  // milliseconds
      "positions": ["ST", "RW"]
    }
  ],
  "teamStats": {
    "possession": 65,
    "ballOutEvents": 23
  }
}
```

#### Player Performance History
```
GET /api/players/:playerId/statistics?matches=10

Response: 200 OK
{
  "player": Player,
  "recentMatches": [
    {
      "matchId": "match1",
      "opponent": "Unity FC",
      "date": "2025-07-05",
      "goals": 2,
      "assists": 1,
      "timeOnPitch": 2700000
    }
  ],
  "totals": {
    "matches": 10,
    "goals": 15,
    "assists": 8,
    "averageTimeOnPitch": 2400000
  }
}
```

## Error Handling

### Standard Error Response
```typescript
interface ErrorResponse {
  error: {
    code: string
    message: string
    details?: any
  }
  timestamp: string
  path: string
}
```

### Common Error Codes
- `MATCH_NOT_FOUND` (404)
- `INVALID_EVENT_DATA` (400)
- `SYNC_CONFLICT` (409)
- `RATE_LIMIT_EXCEEDED` (429)
- `UNAUTHORIZED_ACCESS` (401)

## Real-time Event Broadcasting

### SSE Event Format
```typescript
interface SSEEvent {
  type: 'match:event' | 'match:lineup' | 'match:score' | 'match:period' | 'match:status'
  data: {
    matchId: string
    timestamp: string
    payload: any
  }
}
```

### Event Broadcasting Rules
- **Goals/Assists**: Immediate broadcast to all connected clients
- **Cards**: Immediate broadcast with player details
- **Substitutions**: Broadcast with updated lineup
- **Period Changes**: Broadcast with time remaining
- **Score Updates**: Broadcast calculated score after each goal

## Offline Synchronization

### Conflict Resolution Strategy
```typescript
interface ConflictResolution {
  eventId: string
  conflictType: 'timestamp' | 'duplicate' | 'invalid'
  resolution: 'server_wins' | 'client_wins' | 'merge' | 'manual'
  serverVersion: MatchEvent
  clientVersion: MatchEvent
}
```

### Sync Recovery Process
1. **Connection Restored**: Client sends last known sync timestamp
2. **Server Response**: Returns all events since timestamp
3. **Conflict Detection**: Compare overlapping events
4. **Resolution**: Apply conflict resolution rules
5. **Confirmation**: Client confirms successful sync

## Performance Considerations

### Caching Strategy
- **Match Data**: Cache for 5 minutes
- **Team Rosters**: Cache for 1 hour
- **Player Statistics**: Cache for 15 minutes
- **Live Events**: No caching (real-time)

### Rate Limiting
- **Event Sync**: 60 requests per minute
- **Live Page Access**: 1000 requests per hour
- **Statistics API**: 100 requests per hour
- **Team Management**: 30 requests per minute

### Database Optimization
- **Indexes**: Match date, team names, player names
- **Partitioning**: Events by match date
- **Archiving**: Matches older than 2 years
- **Connection Pooling**: Maximum 20 concurrent connections

## Security Considerations

### Authentication
- **Match Access**: Token-based for live sharing
- **Team Management**: User authentication required
- **Public Live Pages**: No authentication needed
- **API Access**: Rate limiting and CORS protection

### Data Validation
- **Input Sanitization**: All user inputs validated
- **Event Validation**: Timestamps and data consistency
- **Team Names**: Prevent injection attacks
- **File Uploads**: Size and type restrictions

## Deployment and Monitoring

### Health Checks
```
GET /api/health

Response: 200 OK
{
  "status": "healthy",
  "database": "connected",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Monitoring Endpoints
- **Metrics**: `/api/metrics` (Prometheus format)
- **Database Status**: `/api/health/database`
- **Real-time Connections**: `/api/health/websockets`

## Future Enhancements

### Planned Features
- **Video Integration**: Link events to video timestamps
- **Advanced Analytics**: AI-powered match insights
- **Multi-team Support**: Manage multiple teams per user
- **Tournament Management**: Bracket and league support
- **Mobile App**: Native iOS/Android applications

### API Versioning
- **Current Version**: v1
- **Versioning Strategy**: URL path versioning (/api/v1/, /api/v2/)
- **Backward Compatibility**: Maintain previous version for 6 months
- **Migration Guides**: Detailed upgrade documentation

## Success Criteria

### Performance Targets
- [ ] API response times under 200ms for local operations
- [ ] SSE events delivered within 100ms
- [ ] Offline sync completes within 5 seconds
- [ ] Support 50+ concurrent live viewers per match
- [ ] 99.9% uptime during match hours

### Functional Requirements
- [ ] All IndexedDB operations replicated via API
- [ ] Real-time family sharing works reliably
- [ ] Match history accessible across all devices
- [ ] Offline events sync without data loss
- [ ] Push notifications delivered promptly

### User Experience Goals
- [ ] Seamless offline/online transitions
- [ ] Family members can follow matches easily
- [ ] Match history browsing is intuitive
- [ ] Player statistics are comprehensive
- [ ] Live sharing links work on all devices