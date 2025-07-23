# Frontend API Optimization Plan
**Phase 2: Enhanced Usability & Batch Operations**

## 📋 Status Overview

| Category | Status | Progress | Notes |
|----------|--------|----------|-------|
| **Lineup UUID Migration** | ✅ Complete | 100% | All 24 tests passing, UUID primary key implemented |
| **High Priority Batch Ops** | ✅ Complete | 100% | Awards & Match Awards batch operations implemented |
| **Player-Teams Natural Keys** | ✅ Complete | 100% | Natural key support implemented in batch operations |
| **Medium Priority Batch Ops** | ✅ Complete | 100% | Players batch complete, match-scoped batch operations implemented |
| **Frontend Convenience APIs** | ✅ Complete | 90% | Match aggregations, team squad, player stats implemented |
| **Documentation Updates** | 🔄 In Progress | 50% | API tests implemented, docs pending |

## 🎯 Work Items

### **Phase 2A: Critical Batch Operations** 
*Estimated: 8-12 iterations*

#### 1. Awards Batch Operations
- [x] Add `POST /api/v1/awards/batch` endpoint
- [x] Add `POST /api/v1/awards/match-awards/batch` endpoint  
- [x] Update validation schemas for batch operations
- [x] Add comprehensive API tests
- [x] Update shared types for batch responses

#### 2. Player-Teams Natural Key Improvements
- [x] ~~Add `POST /api/v1/player-teams/batch-by-keys` endpoint~~ (Enhanced existing `/batch` endpoint instead)
- [x] Add `GET /api/v1/teams/:id/active-players` convenience endpoint
- [x] Update existing batch operations to support natural keys
- [x] Update API tests for new endpoints

### **Phase 2B: Enhanced Batch Operations**
*Estimated: 6-10 iterations*

#### 3. Players Batch Operations
- [x] Add `POST /api/v1/players/batch` endpoint
- [x] Add validation for bulk player creation
- [x] Add comprehensive API tests

#### 4. Context-Aware Batch Operations
- [x] Add `POST /api/v1/events/batch-by-match` endpoint
- [x] Add `POST /api/v1/lineups/batch-by-match` endpoint
- [x] Simplify match-scoped bulk operations

### **Phase 2C: Frontend Convenience APIs**
*Estimated: 10-15 iterations*

#### 5. Match-Centric Aggregations
- [x] Add `GET /api/v1/matches/:id/full-details` endpoint
- [x] Add `GET /api/v1/matches/:id/timeline` endpoint
- [x] Add `GET /api/v1/matches/upcoming` and `/recent` endpoints

#### 6. Team & Player Aggregations  
- [x] Add `GET /api/v1/teams/:id/squad` endpoint
- [x] Add `GET /api/v1/players/:id/season-stats` endpoint
- [ ] Add dashboard summary endpoints

#### 7. Real-Time Match Console APIs
- [x] Add `GET /api/v1/matches/:id/live-state` endpoint
- [x] Add `POST /api/v1/matches/:id/quick-event` endpoint
- [ ] Add substitution helper endpoints

### **Phase 2D: Documentation & Testing**
*Estimated: 4-6 iterations*

#### 8. API Documentation Updates
- [ ] Update API specification with new endpoints
- [ ] Add usage examples for batch operations
- [ ] Document natural key patterns
- [ ] Update frontend integration guides

## 🛠 MCP Server Usage Guide

### **Running Tests**
```bash
# Run specific test file
POST http://localhost:9123/exec
{"command": "cd backend && npx vitest run tests/api/awards.api.test.ts"}

# Run all API tests
{"command": "cd backend && npx vitest run tests/api/"}

# Run with verbose output
{"command": "cd backend && npx vitest run tests/api/awards.api.test.ts --reporter=verbose"}
```

### **Database Operations**
```bash
# Run migration scripts
{"command": "cd backend && node scripts/migrate-awards-batch.js"}

# Check schema alignment
{"command": "cd backend && node scripts/check-schema-alignment.js"}

# Generate Prisma client after schema changes
{"command": "cd backend && npx prisma generate"}
```

### **Development Workflow**
```bash
# Type checking
{"command": "cd backend && npx tsc --noEmit"}

# Run specific service tests
{"command": "cd backend && npx vitest run tests/api/awards.api.test.ts"}

# Check test output files
# Results available in: .ai-outputs/{operation-id}.out
```

### **Allowed Commands**
- `node scripts/*.js` - Run custom scripts
- `npx vitest run` - Run tests  
- `npx tsc --noEmit` - Type checking
- `npx prisma generate` - Update Prisma client
- Standard shell commands: `ls`, `cat`, `grep`, `pwd`

## 🎯 Success Criteria

### **Phase 2A Complete When:**
- [ ] Awards batch operations implemented and tested
- [ ] Player-teams natural key operations working
- [ ] All existing tests still passing
- [ ] New endpoints have 100% test coverage

### **Phase 2B Complete When:**
- [ ] Players batch operations implemented
- [ ] Enhanced context-aware batch operations working
- [ ] Performance improvements measurable

### **Phase 2C Complete When:**
- [ ] Key frontend convenience APIs implemented
- [ ] Match console real-time APIs working
- [ ] Frontend can eliminate multi-call patterns

### **Phase 2D Complete When:**
- [ ] All new APIs documented
- [ ] Integration examples provided
- [ ] Frontend team can begin implementation

## 📈 Expected Outcomes

**Developer Experience:**
- 50% reduction in frontend API calls for common operations
- Simplified bulk operations (no internal ID management)
- Real-time match console ready for implementation

**Performance:**
- Faster page loads through aggregated endpoints
- Reduced network overhead from batch operations
- Better mobile experience with fewer round trips

**Maintainability:**
- Consistent patterns across all batch operations
- Natural key support reduces frontend complexity
- Comprehensive test coverage for all new endpoints

