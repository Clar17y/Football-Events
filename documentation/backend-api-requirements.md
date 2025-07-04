# Backend API Requirements - FastAPI Implementation

**Created:** 2025-07-04  
**Technology Stack:** FastAPI (Python) + PostgreSQL + WebSockets  
**Purpose:** Real-time grassroots football match tracking with mobile-first design

## Architecture Overview

```
[iPhone PWA] ←→ [FastAPI Backend] ←→ [PostgreSQL Database]
     ↓              ↓
[Family/Friends]  [WebSockets]
[Shared View]     [Real-time Updates]
```

## Technology Stack

### Core Framework
- **FastAPI**: Modern, fast Python web framework
- **PostgreSQL**: Existing database with established schema
- **WebSockets**: Real-time communication for live sharing
- **Pydantic**: Data validation and serialization
- **SQLAlchemy**: Database ORM for PostgreSQL integration

### Cloud Hosting Options
1. **Railway** (Recommended for simplicity)
   - Easy PostgreSQL + FastAPI deployment
   - Built-in WebSocket support
   - Simple environment management

2. **AWS (Advanced)**
   - EC2/ECS for API hosting
   - RDS for PostgreSQL
   - CloudFront for global distribution

3. **Heroku (Simple)**
   - Easy deployment pipeline
   - PostgreSQL add-on available
   - WebSocket support

## API Endpoints Specification

### Authentication & Sessions
```python
POST /api/auth/login          # Simple authentication
POST /api/auth/logout         # Session cleanup
GET  /api/auth/me            # Current user info
```

### Match Management
```python
GET    /api/matches                    # List matches
POST   /api/matches                    # Create new match
GET    /api/matches/{match_id}         # Get match details
PUT    /api/matches/{match_id}         # Update match
DELETE /api/matches/{match_id}         # Delete match
GET    /api/matches/{match_id}/live    # Live match data for sharing
```

### Event Logging (Mobile-Optimized)
```python
POST   /api/matches/{match_id}/events     # Log new event
GET    /api/matches/{match_id}/events     # Get match events
PUT    /api/events/{event_id}             # Update event
DELETE /api/events/{event_id}             # Delete event
GET    /api/matches/{match_id}/score      # Current score summary
```

### Player & Team Management
```python
GET    /api/teams                     # List teams
POST   /api/teams                     # Create team
GET    /api/teams/{team_id}/players   # Team roster
POST   /api/teams/{team_id}/players   # Add player
PUT    /api/players/{player_id}       # Update player
```

### Real-time Features
```python
WebSocket /ws/match/{match_id}        # Live match updates
WebSocket /ws/match/{match_id}/share  # Read-only sharing connection
```

## Database Integration

### Existing Schema Utilization
- Leverage existing PostgreSQL schema from `schema.sql`
- Map existing tables to Pydantic models
- Maintain data integrity with existing structure

### Key Tables Integration
```sql
-- Primary tables from existing schema
grassroots.teams
grassroots.players  
grassroots.matches
grassroots.events
grassroots.lineup
```

### Event Types Support
```python
# From existing schema enum
event_kind = [
    'goal', 'assist', 'key_pass', 'save', 
    'interception', 'tackle', 'foul', 'penalty', 
    'free_kick', 'ball_out', 'own_goal'
]
```

## Mobile-First API Design

### Response Optimization
- Minimal payload sizes for mobile data usage
- Compressed JSON responses
- Efficient pagination for event lists
- Cached responses where appropriate

### Offline Support Strategy
```python
# API design for offline sync
POST /api/sync/events         # Bulk event upload when back online
GET  /api/sync/timestamp      # Last sync timestamp
POST /api/sync/conflicts      # Resolve sync conflicts
```

### Real-time Updates
```python
# WebSocket message types
{
    "type": "event_logged",
    "data": {
        "event_id": "uuid",
        "kind": "goal",
        "player": "Player Name",
        "team": "Team Name",
        "timestamp": "12:34",
        "score": {"home": 2, "away": 1}
    }
}

{
    "type": "substitution",
    "data": {
        "player_on": "Player A",
        "player_off": "Player B", 
        "team": "Team Name",
        "timestamp": "25:15"
    }
}
```

## Security Considerations

### Authentication Strategy
- Simple token-based authentication for initial version
- Match-specific sharing tokens for family access
- Rate limiting for API endpoints
- CORS configuration for PWA access

### Data Privacy
- Match data only accessible to authorized users
- Sharing links with expiration times
- No personal data in shared views
- GDPR compliance for player data

## Performance Requirements

### Response Times
- Event logging: < 200ms
- Match data retrieval: < 500ms
- Real-time updates: < 100ms latency
- Mobile-optimized payloads: < 50KB per request

### Scalability
- Support for concurrent live matches
- WebSocket connection management
- Database connection pooling
- Caching strategy for frequently accessed data

## Development Phases

### Phase 1: Core API
- Basic CRUD operations for matches/events
- PostgreSQL integration
- Simple authentication
- Mobile-optimized responses

### Phase 2: Real-time Features
- WebSocket implementation
- Live sharing functionality
- Event broadcasting
- Offline sync support

### Phase 3: Advanced Features
- Analytics endpoints
- Bulk data operations
- Advanced caching
- Performance optimization

## Deployment Strategy

### Environment Configuration
```python
# Environment variables
DATABASE_URL=postgresql://user:pass@host:port/db
SECRET_KEY=your-secret-key
CORS_ORIGINS=https://your-pwa-domain.com
WEBSOCKET_ORIGINS=https://your-pwa-domain.com
```

### CI/CD Pipeline
1. Code push to repository
2. Automated testing
3. Docker container build
4. Cloud deployment
5. Database migration (if needed)

## Monitoring & Logging

### Key Metrics
- API response times
- WebSocket connection counts
- Event logging frequency
- Error rates and types
- Mobile vs desktop usage

### Logging Strategy
- Structured JSON logging
- Error tracking and alerting
- Performance monitoring
- User activity analytics