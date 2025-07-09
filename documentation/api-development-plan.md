# API Development Plan

**Created:** 2025-07-07  
**Updated:** 2025-07-08  
**Status:** IN PROGRESS  
**Foundation:** Complete backend testing suite (149+ tests, 8 entities)  
**Goal:** Production-ready REST API with full type safety and validation

## 🎯 **Strategic Overview**

### **Foundation Strengths**
- ✅ **Complete Schema Validation** - All 8 entities tested and validated
- ✅ **Type Safety** - Full Prisma ↔ Frontend transformation layer
- ✅ **Database Integrity** - Foreign keys, constraints, cascade deletes tested
- ✅ **Error Handling** - Comprehensive error scenarios validated
- ✅ **Business Logic** - Complex rules (substitutions, awards, events) tested

### **API Development Approach**
- **Type-First Development** - Leverage existing transformation functions
- **Test-Driven API** - Build on validated schema patterns
- **API Versioning** - v1 from start for future-proofing and backward compatibility
- **Incremental Rollout** - Start with core entities, expand to complex workflows
- **Production Standards** - Authentication, validation, error handling, logging

## 📋 **Phase 1: Core API Infrastructure**

### **Priority 1.0: MCP Server Enhancement** 📋 **APPROVED**
**Target:** Integrated development server management and API testing  
**Duration:** 10-15 days  
**Dependencies:** Existing MCP server infrastructure

**Implementation Plan:**
- Process management for backend/frontend dev servers
- File-based logging system with log levels
- HTTP request capabilities for API testing
- Health checking and startup detection
- Proper cleanup and error handling

**Deliverables:**
- `mcp-server/lib/processManager.js` - Core process management
- `mcp-server/lib/apiTester.js` - HTTP request handling
- `mcp-server/lib/logger.js` - File-based logging
- `mcp-server/logs/` - Server log directory
- Enhanced MCP functions for development workflow

**New MCP Functions:**
```javascript
// Server Management
startDevServer(project, options?)
stopDevServer(project)
getServerStatus(project)
stopAllServers()

// API Testing
testApiEndpoint(method, url, body?, headers?)
checkPortStatus(port)
listManagedServers()

// Logging & Debugging
getServerLogs(project, lines?)
listLogFiles(project?)
getLogFile(filename)
```

### **Priority 1.1: API Framework Setup** ✅ **COMPLETE**
**Target:** Express.js + TypeScript foundation with middleware  
**Duration:** 1-2 hours  
**Dependencies:** None

**Achievements:**
- ✅ Express.js server running on port 3001
- ✅ v1 API versioning structure implemented
- ✅ Teams API with full CRUD operations working
- ✅ Database integration using tested transformation functions
- ✅ Request validation with Zod schemas
- ✅ Proper error handling and HTTP status codes
- ✅ Pagination support with metadata

**Working Endpoints:**
```
GET    /api/v1                   - API info
GET    /api/v1/teams             - List teams ✅
POST   /api/v1/teams             - Create team ✅
GET    /api/v1/teams/:id         - Get team ✅
PUT    /api/v1/teams/:id         - Update team ✅
DELETE /api/v1/teams/:id         - Delete team ✅
GET    /api/v1/teams/:id/players - Get team roster ✅
```

## 📋 **Phase 2: Core Entity Endpoints**

### **Priority 2.1: Simple Entity APIs (Seasons, Positions)**
**Target:** Complete foundational entity CRUD operations  
**Duration:** 2-3 hours  
**Dependencies:** Phase 1 complete

**Endpoints to Implement:**
```
# Seasons
GET    /api/v1/seasons            - List seasons
POST   /api/v1/seasons            - Create season
GET    /api/v1/seasons/:id        - Get season
PUT    /api/v1/seasons/:id        - Update season
DELETE /api/v1/seasons/:id        - Delete season

# Positions
GET    /api/v1/positions          - List positions
POST   /api/v1/positions          - Create position
GET    /api/v1/positions/:code    - Get position by code
PUT    /api/v1/positions/:code    - Update position
DELETE /api/v1/positions/:code    - Delete position
```

### **Priority 2.2: Player Management API**
**Target:** Player CRUD with team relationships  
**Duration:** 2 hours  
**Dependencies:** Teams API complete

**Endpoints to Implement:**
```
GET    /api/v1/players            - List players with filters
POST   /api/v1/players            - Create player
GET    /api/v1/players/:id        - Get player details
PUT    /api/v1/players/:id        - Update player
DELETE /api/v1/players/:id        - Delete player
GET    /api/v1/players/:id/stats  - Get player statistics
```

## 📋 **Phase 3: Complex Entity Endpoints**

### **Priority 3.1: Match Management API**
**Target:** Match CRUD with complex relationships  
**Duration:** 3 hours  
**Dependencies:** Teams, Seasons APIs complete

**Endpoints to Implement:**
```
GET    /api/v1/matches                    - List matches with filters
POST   /api/v1/matches                    - Create match
GET    /api/v1/matches/:id                - Get match details
PUT    /api/v1/matches/:id                - Update match
DELETE /api/v1/matches/:id                - Delete match
GET    /api/v1/matches/:id/lineup         - Get match lineup
POST   /api/v1/matches/:id/lineup         - Set lineup
GET    /api/v1/matches/:id/events         - Get match events
POST   /api/v1/matches/:id/events         - Add event
GET    /api/v1/matches/:id/awards         - Get match awards
POST   /api/v1/matches/:id/awards         - Add award
```

### **Priority 3.2: Event System API**
**Target:** Match event tracking  
**Duration:** 2-3 hours  
**Dependencies:** Match API complete

**Endpoints to Implement:**
```
GET    /api/v1/events                     - List events with filters
POST   /api/v1/events                     - Create event
GET    /api/v1/events/:id                 - Get event details
PUT    /api/v1/events/:id                 - Update event
DELETE /api/v1/events/:id                 - Delete event
```

### **Priority 3.3: Lineup Management API**
**Target:** Complex lineup operations with substitutions  
**Duration:** 2-3 hours  
**Dependencies:** Match, Player, Position APIs complete

**Endpoints to Implement:**
```
GET    /api/v1/lineups                    - List lineups with filters
POST   /api/v1/lineups                    - Create lineup entry
PUT    /api/v1/lineups/:matchId/:playerId/:startMin - Update lineup
DELETE /api/v1/lineups/:matchId/:playerId/:startMin - Remove from lineup
POST   /api/v1/matches/:id/substitution   - Make substitution
```

## 📋 **Phase 4: Advanced Features**

### **Priority 4.1: Awards System API**
**Target:** Season and match awards management  
**Duration:** 2 hours  
**Dependencies:** Player, Season, Match APIs complete

**Endpoints to Implement:**
```
GET    /api/v1/awards                     - List awards with filters
POST   /api/v1/awards                     - Create award
PUT    /api/v1/awards/:id                 - Update award
DELETE /api/v1/awards/:id                 - Delete award
GET    /api/v1/seasons/:id/awards         - Get season awards
GET    /api/v1/players/:id/awards         - Get player awards
```

### **Priority 4.2: Statistics and Analytics API**
**Target:** Aggregated data and insights  
**Duration:** 3-4 hours  
**Dependencies:** All entity APIs complete

**Endpoints to Implement:**
```
GET    /api/v1/stats/players/:id          - Player statistics
GET    /api/v1/stats/teams/:id            - Team statistics
GET    /api/v1/stats/seasons/:id          - Season statistics
GET    /api/v1/stats/matches/:id          - Match statistics
```

## 📋 **Phase 5: Production Features**

### **Priority 5.1: Authentication & Authorization**
**Target:** User management and permissions  
**Duration:** 4-5 hours  
**Dependencies:** Core APIs complete

**Endpoints:**
```
POST   /api/v1/auth/login                 - User login
POST   /api/v1/auth/logout                - User logout
POST   /api/v1/auth/refresh               - Token refresh
GET    /api/v1/auth/profile               - User profile
PUT    /api/v1/auth/profile               - Update profile
```

### **Priority 5.2: API Documentation & Testing**
**Target:** Comprehensive documentation and testing  
**Duration:** 2-3 hours  
**Dependencies:** All APIs implemented

### **Priority 5.3: Deployment & Monitoring**
**Target:** Production deployment readiness  
**Duration:** 2-3 hours  
**Dependencies:** All features complete

## 🛠 **Technical Implementation Strategy**

### **Code Organization**
```
backend/src/
├── server.ts                 # Main server entry
├── app.ts                    # Express app configuration
├── routes/                   # API route definitions
│   ├── v1/                   # API version 1
│   │   ├── teams.ts          ✅ COMPLETE
│   │   ├── players.ts
│   │   ├── seasons.ts
│   │   ├── positions.ts
│   │   ├── matches.ts
│   │   ├── events.ts
│   │   ├── lineups.ts
│   │   └── awards.ts
├── services/                 # Business logic layer
│   ├── TeamService.ts        ✅ COMPLETE
│   ├── PlayerService.ts
│   ├── MatchService.ts
│   └── ...
├── middleware/               # Express middleware
│   ├── validation.ts         ✅ COMPLETE
│   ├── errorHandler.ts       ✅ COMPLETE
│   └── auth.ts
├── validation/               # Request validation
│   ├── schemas.ts            ✅ COMPLETE
│   └── validators.ts
├── utils/                    # Utilities
│   └── asyncHandler.ts       ✅ COMPLETE
└── tests/                    # API integration tests
```

### **Development Principles**
- **Type Safety First** - Leverage existing transformation functions
- **Test-Driven Development** - Build on validated schema patterns
- **API Versioning** - v1 from start for future-proofing and backward compatibility
- **Error Handling** - Comprehensive error responses with proper HTTP codes
- **Performance** - Efficient queries with pagination and caching
- **Security** - Authentication, authorization, input validation
- **Documentation** - Self-documenting APIs with OpenAPI

## 🚀 **Timeline Estimate**

### **Sprint 1 (Week 1): Infrastructure & Foundation**
- **Days 1-3:** Phase 1.0 - MCP Server Enhancement (Process Management)
- **Days 4-5:** Phase 1.0 - MCP Server Enhancement (API Testing & Logging)

### **Sprint 2 (Week 2): Core API Development**
- **Days 1-2:** Phase 2.1 - Simple Entity APIs (Seasons, Positions)
- **Days 3-4:** Phase 2.2 - Player Management API
- **Day 5:** Integration testing with enhanced MCP server

### **Sprint 3 (Week 3): Complex Features**
- **Days 1-2:** Phase 3.1 - Match Management API
- **Days 3-4:** Phase 3.2 - Event System API
- **Day 5:** Phase 3.3 - Lineup Management API

### **Sprint 4 (Week 4): Advanced & Production**
- **Days 1-2:** Phase 4 - Advanced Features (Awards, Statistics)
- **Days 3-4:** Phase 5 - Production Features (Auth, Documentation)
- **Day 5:** Final testing, optimization, deployment

**Total Estimated Time:** 20-25 development days (including MCP enhancement)

## 📊 **Success Metrics**

### **Phase 1 Success Criteria**
- ✅ Server running with health checks
- ✅ Middleware stack operational
- ✅ Database service layer functional
- ✅ Error handling working correctly
- ✅ Teams API fully operational

### **Current Status:**
- ✅ **Phase 1.1 Complete** - API Framework with Teams endpoint working
- 📋 **Phase 1.0 Planned** - MCP Server Enhancement approved and documented

## 🎯 **Immediate Next Steps**

1. **Implement MCP Server Enhancement** - Process management and API testing
2. **Complete Simple Entity APIs** - Seasons, Positions endpoints
3. **Add Player Management API** - With team relationships
4. **Move to Complex Entities** - Matches, Events, Lineups

**Ready to continue API development with our solid foundation of 149+ tests and working API framework!**

---

**Status:** Phase 1.1 Complete, Phase 1.0 Planned  
**Foundation:** 149+ tests passing, complete schema validation  
**Next Action:** MCP Server Enhancement or continue with entity APIs