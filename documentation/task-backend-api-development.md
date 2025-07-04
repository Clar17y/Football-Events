# Task: Backend API Development ❌

**Status:** Not Started  
**Priority:** Critical  
**Estimated Time:** 8-10 hours  
**Actual Time:** -  
**Completion Date:** -

## Description
Develop a FastAPI backend to replace the current IndexedDB-only storage, enabling real-time sharing, cloud persistence, and mobile-optimized data access for the grassroots football PWA.

## Current Issues
- **No Backend Integration**: All data stored locally in IndexedDB only
- **No Real-time Sharing**: Cannot share live match updates with family
- **No Cloud Persistence**: Data lost if device is damaged/lost
- **No Multi-device Access**: Cannot access data from different devices
- **Limited Analytics**: Cannot perform server-side data analysis
- **No Offline Sync**: No mechanism to sync data when back online

## Implementation Steps

### 1. FastAPI Project Setup
- **File:** `backend/main.py`
- **Purpose:** Core FastAPI application setup
- **Features:**
  - FastAPI application initialization
  - CORS configuration for PWA access
  - Environment configuration management
  - Health check endpoints

### 2. Database Integration
- **File:** `backend/database.py`
- **Purpose:** PostgreSQL connection and ORM setup
- **Features:**
  - SQLAlchemy integration with existing schema
  - Connection pooling configuration
  - Database session management
  - Migration support for schema updates

### 3. Data Models & Validation
- **File:** `backend/models/`
- **Purpose:** Pydantic models for API validation
- **Features:**
  - Match, Team, Player, Event models
  - Request/response validation schemas
  - Data serialization for mobile optimization
  - Type safety and validation rules

### 4. Core API Endpoints
- **File:** `backend/routers/`
- **Purpose:** RESTful API endpoints
- **Features:**
  - Match CRUD operations
  - Event logging endpoints
  - Team and player management
  - Mobile-optimized response formats

### 5. Real-time WebSocket Support
- **File:** `backend/websockets.py`
- **Purpose:** Live match updates and sharing
- **Features:**
  - WebSocket connection management
  - Event broadcasting to connected clients
  - Match-specific channels
  - Read-only sharing for family members

### 6. Authentication & Security
- **File:** `backend/auth.py`
- **Purpose:** Simple authentication system
- **Features:**
  - Token-based authentication
  - Match sharing token generation
  - Rate limiting and security headers
  - CORS configuration

## Technical Specifications

### API Endpoints
```python
# Match Management
GET    /api/matches                    # List user's matches
POST   /api/matches                    # Create new match
GET    /api/matches/{match_id}         # Get match details
PUT    /api/matches/{match_id}         # Update match
DELETE /api/matches/{match_id}         # Delete match

# Event Logging (Mobile-Optimized)
POST   /api/matches/{match_id}/events  # Log new event
GET    /api/matches/{match_id}/events  # Get match events
PUT    /api/events/{event_id}          # Update event
DELETE /api/events/{event_id}          # Delete event

# Real-time Sharing
GET    /api/matches/{match_id}/share   # Get sharing link
WebSocket /ws/match/{match_id}         # Live updates
```

### Database Schema Integration
```sql
-- Utilize existing PostgreSQL schema
grassroots.teams
grassroots.players
grassroots.matches
grassroots.events
grassroots.lineup

-- Event types from existing enum
event_kind: goal, assist, key_pass, save, interception, 
           tackle, foul, penalty, free_kick, ball_out, own_goal
```

### Mobile-First Response Format
```json
{
  "match": {
    "id": "uuid",
    "home_team": "Team Name",
    "away_team": "Opposition",
    "score": {"home": 2, "away": 1},
    "status": "live",
    "current_period": 2,
    "clock_time": "25:30"
  },
  "recent_events": [
    {
      "id": "uuid",
      "kind": "goal",
      "player": "Player Name",
      "team": "home",
      "timestamp": "23:45",
      "period": 2
    }
  ]
}
```

## Cloud Deployment

### Hosting Options
1. **Railway** (Recommended)
   - Simple FastAPI deployment
   - Built-in PostgreSQL
   - Environment management
   - WebSocket support

2. **Heroku**
   - Easy deployment pipeline
   - PostgreSQL add-on
   - Automatic scaling

### Environment Configuration
```bash
DATABASE_URL=postgresql://user:pass@host:port/grassroots
SECRET_KEY=your-secret-key-here
CORS_ORIGINS=https://your-pwa-domain.com
ENVIRONMENT=production
```

## Integration with Frontend

### PWA Configuration Updates
```typescript
// Update API base URL in frontend
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? 'https://your-api-domain.com'
  : 'http://localhost:8000';

// WebSocket connection
const wsUrl = API_BASE_URL.replace('http', 'ws') + '/ws/match/{matchId}';
```

### Offline Sync Strategy
```typescript
// Queue events when offline
interface QueuedEvent {
  id: string;
  matchId: string;
  eventData: EventData;
  timestamp: number;
}

// Sync when back online
const syncQueuedEvents = async () => {
  const queuedEvents = await getQueuedEvents();
  for (const event of queuedEvents) {
    await api.post('/api/sync/events', event);
  }
};
```

## Testing Strategy

### Unit Tests
- API endpoint testing
- Database operation testing
- WebSocket connection testing
- Authentication flow testing

### Integration Tests
- End-to-end match creation flow
- Real-time event broadcasting
- Mobile API response validation
- Offline sync functionality

### Performance Tests
- API response time benchmarks
- WebSocket connection limits
- Database query optimization
- Mobile data usage optimization

## Success Criteria

### Functional Requirements
- ✅ All match data persisted to PostgreSQL
- ✅ Real-time event sharing via WebSockets
- ✅ Mobile-optimized API responses < 200ms
- ✅ Offline event queueing and sync
- ✅ Secure sharing links for family access

### Performance Requirements
- ✅ API response times < 500ms
- ✅ WebSocket latency < 100ms
- ✅ Support 10+ concurrent live matches
- ✅ Mobile data usage < 1MB per match

### Security Requirements
- ✅ Secure authentication system
- ✅ Rate limiting on all endpoints
- ✅ CORS properly configured
- ✅ No sensitive data in sharing links

## Dependencies

### Technical Dependencies
- FastAPI framework
- PostgreSQL database access
- Cloud hosting platform account
- Domain name for production deployment

### Project Dependencies
- Existing PostgreSQL schema (schema.sql)
- Frontend PWA for integration testing
- Mobile device for testing

## Risks & Mitigation

### Technical Risks
- **WebSocket scaling**: Use Redis for multi-instance support
- **Database performance**: Implement connection pooling and indexing
- **Mobile connectivity**: Robust offline sync mechanism
- **Security vulnerabilities**: Regular dependency updates and security audits

### Project Risks
- **Cloud hosting costs**: Start with free tiers, monitor usage
- **Deployment complexity**: Use simple platforms like Railway initially
- **Data migration**: Careful planning for existing IndexedDB data

## Post-Implementation

### Monitoring Setup
- API performance monitoring
- Error tracking and alerting
- WebSocket connection monitoring
- Database performance metrics

### Documentation
- API documentation (auto-generated by FastAPI)
- Deployment guide
- Environment setup instructions
- Troubleshooting guide

**Status:** ❌ **NOT STARTED**