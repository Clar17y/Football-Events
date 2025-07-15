# Task: User Management & Authentication System

## Overview
Implementation of a comprehensive user management system with authentication, authorization, multi-tenancy, and subscription management. This transforms the application from an open API system to a secure, multi-user platform suitable for commercialization.

## Business Requirements

### Core Problem
Currently, the application has no authentication - all APIs are open and anyone can modify any data. For production use, we need:
- User registration and authentication
- Data ownership and privacy
- Multi-level permissions (Admin, Organization, Team)
- Subscription management for commercialization
- Soft delete strategy for data recovery

### Target User Hierarchy
1. **Administrator** - Platform-wide access (system management)
2. **Organization Admin** - Multi-team management within their organization
3. **Team Owner** - Primary team manager (subscription holder)
4. **Team Coach** - Additional team manager (inherits owner's subscription)
5. **Player** - Read-only access to own data (future enhancement)

## Technical Architecture

### Authentication Method
**JWT (JSON Web Tokens)** with refresh token strategy:
- **Access Token**: 15-30 minute expiry for API calls
- **Refresh Token**: 30 days, stored securely for auto-refresh
- **Password Security**: bcrypt hashing (industry standard)
- **Mobile-First**: Stateless design perfect for PWA offline functionality

### Database Schema Changes

#### New Tables

```sql
-- Core User Management
users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  first_name VARCHAR,
  last_name VARCHAR,
  role ENUM('admin', 'user') DEFAULT 'user',
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP NULL,
  deleted_by_user_id UUID REFERENCES users(id) NULL
);

-- Organizations (optional team grouping)
organizations (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  created_by_user_id UUID REFERENCES users(id) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP NULL,
  deleted_by_user_id UUID REFERENCES users(id) NULL
);

-- Team Coaching Relationships (many-to-many)
team_coaches (
  id UUID PRIMARY KEY,
  team_id UUID REFERENCES teams(id) NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  role ENUM('owner', 'coach') DEFAULT 'coach',
  invited_by_user_id UUID REFERENCES users(id),
  status ENUM('active', 'invited', 'declined') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

-- Subscription Management
subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL, -- The paying user (team owner)
  plan_type ENUM('trial', 'basic', 'premium') DEFAULT 'trial',
  status ENUM('active', 'cancelled', 'expired') DEFAULT 'active',
  trial_ends_at TIMESTAMP,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  max_active_matches INTEGER DEFAULT 1,
  max_events_per_match INTEGER DEFAULT 50,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Modified Existing Tables

All existing tables require these additional columns:
```sql
-- Add to ALL existing tables (teams, players, matches, events, etc.)
created_by_user_id UUID REFERENCES users(id) NOT NULL,
is_deleted BOOLEAN DEFAULT false,
deleted_at TIMESTAMP NULL,
deleted_by_user_id UUID REFERENCES users(id) NULL
```

**Specific table modifications:**
```sql
-- teams table additions
organization_id UUID REFERENCES organizations(id) NULL,
CONSTRAINT teams_name_org_unique UNIQUE (name, organization_id) WHERE is_deleted = false;

-- matches table additions  
is_active BOOLEAN DEFAULT false, -- For subscription active match limits
```

### Data Ownership Model

#### Team-Centric Ownership
- **Teams**: Multiple coaches per team (owner + invited coaches)
- **Players**: Owned by team coaches (can belong to multiple teams)
- **Matches**: Each team creates their own match record (no sharing between teams)
- **Events**: Owned by the team that created the match
- **Organizations**: Optional grouping, teams can request to join/leave

#### Key Design Decisions
1. **No Shared Matches**: Each team records their own version of a match for privacy and independence
2. **Organization at Team Level Only**: Players don't belong to organizations directly
3. **Multiple Team Coaches**: Team owners can invite additional coaches
4. **Subscription Inheritance**: Coaches inherit owner's subscription benefits

### Permission Matrix

| Resource | Admin | Org Admin | Team Owner | Team Coach | Player |
|----------|-------|-----------|------------|------------|---------|
| **Users** | CRUD | Read (org users) | Read own | Read own | Read own |
| **Organizations** | CRUD | CRUD (own org) | Read | Read | Read |
| **Teams** | CRUD | CRUD (org teams) | CRUD (own teams) | RU (assigned teams) | Read (own teams) |
| **Players** | CRUD | CRUD (org players) | CRUD (own teams) | CRUD (assigned teams) | Read (own data) |
| **Matches** | CRUD | CRUD (org matches) | CRUD (own teams) | CRUD (assigned teams) | Read (own matches) |
| **Events** | CRUD | CRUD (org events) | CRUD (own matches) | CRUD (assigned matches) | Read (own events) |

### Soft Delete Strategy

#### High-Frequency Tables (Events)
- **No uniqueness checks** on insert for performance
- Allow duplicates if user deletes/recreates during live matches
- Background cleanup for true duplicates

#### Core Entity Tables (Teams, Players, Matches)
- **Check for soft-deleted records** before creating new ones
- Option to "restore" instead of creating duplicates
- Unique constraints exclude soft-deleted records

#### Implementation Pattern
```sql
-- Unique constraints should exclude soft-deleted records
CREATE UNIQUE INDEX teams_name_org_active 
ON teams (name, organization_id) 
WHERE is_deleted = false;
```

### Subscription Model

#### Plan Structure
```typescript
TRIAL: {
  duration: 30 days,
  maxActiveMatches: 1,
  maxEventsPerMatch: unlimited,
  features: ['all_basic_features']
}

BASIC: {
  price: '$5/month',
  maxActiveMatches: 1, 
  maxEventsPerMatch: unlimited,
  features: ['all_basic_features', 'advanced_stats']
}

PREMIUM: {
  price: '$15/month',
  maxActiveMatches: 3,
  maxEventsPerMatch: unlimited,
  features: ['all_basic_features', 'advanced_stats', 'ai_analysis', 'multi_team']
}
```

#### Subscription Rules
- **Team Owner** must have active subscription
- **Team Coaches** inherit owner's subscription benefits
- **Subscription Lapse**: Access to existing data maintained, new features blocked
- **Billing**: Per-user (team owner), not per-organization
- **Active Match Limit**: Prevents abuse while allowing reasonable usage

## API Changes

### New Authentication Endpoints
```typescript
POST /api/v1/auth/register
POST /api/v1/auth/login  
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
POST /api/v1/auth/verify-email
```

### New User Management Endpoints
```typescript
GET /api/v1/users/profile
PUT /api/v1/users/profile
GET /api/v1/users/teams
POST /api/v1/teams/:id/coaches/invite
PUT /api/v1/teams/:id/coaches/:userId
DELETE /api/v1/teams/:id/coaches/:userId
```

### New Organization Endpoints
```typescript
GET /api/v1/organizations
POST /api/v1/organizations
GET /api/v1/organizations/:id
PUT /api/v1/organizations/:id
DELETE /api/v1/organizations/:id
POST /api/v1/organizations/:id/join-request
PUT /api/v1/organizations/:id/join-requests/:requestId
```

### Modified Existing Endpoints
All existing v1 endpoints will be updated to:
- Require authentication (JWT middleware)
- Filter results by user ownership/permissions
- Include soft delete logic
- Validate subscription limits

### Authorization Middleware Chain
```typescript
1. authenticateJWT() // Verify token, extract user
2. checkSubscription() // Verify active subscription  
3. authorizeResource() // Check ownership/permissions
4. validateSoftDelete() // Exclude deleted records
```

## Frontend Changes

### New Pages Required
- **Authentication**
  - Login page
  - Registration page  
  - Password reset flow
  - Email verification

- **User Management**
  - User profile/settings
  - Team management dashboard
  - Coach invitation system

- **Organization Management**
  - Organization creation
  - Join request management
  - Organization settings

- **Subscription Management**
  - Plan selection
  - Billing information
  - Usage monitoring
  - Payment integration

### State Management Updates
- **User Context**: Current user, permissions, subscription status
- **Team Context**: Current team being managed, coach relationships
- **Organization Context**: Current organization (if applicable)

### Authentication Flow
- JWT tokens stored in secure storage
- Automatic token refresh
- Redirect to login for unauthenticated users
- Permission-based UI rendering

## Implementation Phases

### Phase 1: Core Authentication (Week 1)
**Backend:**
- User table and Prisma model
- JWT authentication middleware
- Register/login/refresh endpoints
- Password hashing with bcrypt

**Frontend:**
- Login/register pages
- JWT token management
- Authentication context
- Protected route wrapper

**Testing:**
- Authentication endpoint tests
- JWT middleware tests
- Frontend auth flow tests

### Phase 2: Authorization & Soft Delete (Week 2)
**Backend:**
- Add user_id columns to all existing tables
- Implement ownership middleware for all APIs
- Add soft delete logic to all CRUD operations
- Update all existing endpoints

**Frontend:**
- Update API calls to handle authentication
- Add error handling for authorization failures
- Update UI to show only user's data

**Testing:**
- Authorization middleware tests
- Soft delete functionality tests
- API integration tests with auth

### Phase 3: Team Management & Multi-Coach (Week 3)
**Backend:**
- Team coaches table and relationships
- Coach invitation system
- Team ownership transfer logic
- Organization creation and joining

**Frontend:**
- Team management dashboard
- Coach invitation UI
- Organization creation/management
- Team settings page

**Testing:**
- Multi-coach functionality tests
- Organization management tests
- Team ownership tests

### Phase 4: Subscription System (Week 4)
**Backend:**
- Subscription table and logic
- Usage limit enforcement middleware
- Subscription status checking
- Payment webhook handling

**Frontend:**
- Subscription management UI
- Plan selection and upgrade flow
- Usage monitoring dashboard
- Payment integration (Stripe)

**Testing:**
- Subscription limit enforcement tests
- Payment flow tests
- Usage tracking tests

## Migration Strategy

### Data Migration
- **Current Data**: All existing data is mock/test data created by seed scripts
- **Migration Approach**: Fresh start - wipe existing data and reseed with user associations
- **No Backward Compatibility**: Current APIs are not production-ready, full replacement acceptable

### API Versioning
- **Approach**: Update existing v1 endpoints rather than creating v2
- **Justification**: Current APIs are incomplete without authentication, not production-ready
- **Breaking Changes**: Acceptable since no production users exist

## Security Considerations

### Authentication Security
- Password hashing with bcrypt (minimum 12 rounds)
- JWT secret rotation capability
- Refresh token revocation on logout
- Email verification for new accounts

### Authorization Security  
- Principle of least privilege
- Resource-level permission checking
- Subscription status validation on every request
- Soft delete prevents accidental data loss

### API Security
- Rate limiting on authentication endpoints
- Input validation and sanitization
- SQL injection prevention via Prisma ORM
- CORS configuration for frontend domain

## Testing Strategy

### Backend Testing
- **Unit Tests**: Authentication middleware, authorization logic, soft delete functions
- **Integration Tests**: Full API workflows with authentication
- **Security Tests**: Permission boundary testing, subscription limit enforcement

### Frontend Testing
- **Component Tests**: Authentication forms, protected routes
- **Integration Tests**: Full user registration and login flows
- **E2E Tests**: Complete user journey from registration to team management

### Performance Testing
- **Load Testing**: Authentication endpoints under load
- **Database Performance**: Soft delete query performance with large datasets
- **Mobile Performance**: JWT token management on mobile devices

## Success Criteria

### Functional Requirements
- ✅ Users can register and authenticate securely
- ✅ Data is properly isolated by ownership
- ✅ Multi-coach teams work correctly
- ✅ Organizations can be created and managed
- ✅ Subscription limits are enforced
- ✅ Soft delete allows data recovery

### Non-Functional Requirements
- ✅ Authentication response time < 200ms
- ✅ API authorization overhead < 50ms
- ✅ Mobile app works offline with cached tokens
- ✅ Database queries exclude soft-deleted records efficiently
- ✅ Subscription checks don't impact match recording performance

### Security Requirements
- ✅ No unauthorized access to other users' data
- ✅ Passwords are securely hashed and stored
- ✅ JWT tokens expire appropriately
- ✅ Subscription limits cannot be bypassed
- ✅ Soft-deleted data is properly excluded from all operations

## Future Enhancements

### Phase 5: Advanced Features
- **Player Role**: Read-only access for players to view their own stats
- **Advanced Analytics**: AI-powered insights for premium subscribers
- **Real-time Collaboration**: Multiple coaches editing simultaneously
- **Mobile App**: Native iOS/Android apps with push notifications

### Phase 6: Enterprise Features
- **SSO Integration**: SAML/OAuth for organizations
- **Advanced Reporting**: Custom reports and data export
- **API Access**: Third-party integrations for organizations
- **White-label Solutions**: Custom branding for large organizations

## Risk Mitigation

### Technical Risks
- **Database Migration**: Comprehensive testing in staging environment
- **Performance Impact**: Benchmark authorization middleware overhead
- **Token Management**: Implement robust refresh token rotation

### Business Risks
- **User Adoption**: Generous trial period and gradual feature rollout
- **Data Loss**: Soft delete strategy with recovery options
- **Subscription Complexity**: Clear pricing and feature communication

### Security Risks
- **Authentication Bypass**: Comprehensive security testing
- **Data Leakage**: Strict permission boundary testing
- **Payment Security**: PCI-compliant payment processing (Stripe)

---

## Next Steps

1. **Review and Approve**: Stakeholder review of this comprehensive plan
2. **Environment Setup**: Prepare development environment for user management
3. **Phase 1 Implementation**: Begin with core authentication system
4. **Iterative Development**: Build and test each phase incrementally
5. **Security Review**: Conduct security audit before production deployment

This document serves as the complete specification for transforming the Grassroots PWA into a secure, multi-user, commercially-viable platform.