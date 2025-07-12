# Task 1.7: API Integration Testing Suite

## Overview
Implement comprehensive API integration tests for all 8 backend APIs before adding real-time WebSocket functionality. This ensures our REST API foundation is solid and reliable.

## Current Testing Gap Analysis

### ✅ **Existing Tests (Strong Foundation)**
- **Schema Alignment Tests**: 8 comprehensive test files (149+ tests)
- **Database Integration**: Proper Prisma test setup with cleanup
- **Type Transformations**: Complete testing of frontend ↔ database mapping
- **Shared Test Patterns**: Reusable utilities for consistent testing

### ❌ **Missing API Tests (Critical Gap)**
- **HTTP Endpoint Testing**: No actual API route testing
- **Request/Response Validation**: No testing of Express middleware
- **Error Handling**: No testing of API error responses
- **Batch Operations**: No testing of batch sync endpoints
- **Authentication/Authorization**: No security testing
- **Performance Testing**: No load/stress testing

## Implementation Strategy

### 1. API Test Infrastructure

#### Test Server Setup
```typescript
// backend/tests/api/setup.ts
import { Express } from 'express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../../src/app';

export class ApiTestSetup {
  public app: Express;
  public prisma: PrismaClient;
  public request: request.SuperTest<request.Test>;
  
  async initialize() {
    // Create test app instance
    this.app = createApp();
    this.request = request(this.app);
    
    // Initialize test database
    this.prisma = new PrismaClient({
      datasources: {
        db: { url: process.env.TEST_DATABASE_URL }
      }
    });
    
    await this.prisma.$connect();
  }
  
  async cleanup() {
    await this.prisma.$disconnect();
  }
}
```

#### Test Data Factory
```typescript
// backend/tests/api/factories.ts
export class TestDataFactory {
  static createTeam(overrides = {}) {
    return {
      name: `Test Team ${Date.now()}`,
      homeKitPrimary: '#FF0000',
      homeKitSecondary: '#FFFFFF',
      ...overrides
    };
  }
  
  static createPlayer(teamId: string, overrides = {}) {
    return {
      name: `Test Player ${Date.now()}`,
      currentTeam: teamId,
      squadNumber: Math.floor(Math.random() * 99) + 1,
      ...overrides
    };
  }
  
  static createEvent(matchId: string, overrides = {}) {
    return {
      matchId,
      seasonId: 'test-season-id',
      kind: 'goal',
      periodNumber: 1,
      clockMs: 30000,
      ...overrides
    };
  }
}
```

### 2. Core API Tests

#### Teams API Tests
```typescript
// backend/tests/api/teams.api.test.ts
describe('Teams API Integration', () => {
  let apiTest: ApiTestSetup;
  
  beforeAll(async () => {
    apiTest = new ApiTestSetup();
    await apiTest.initialize();
  });
  
  describe('POST /api/v1/teams', () => {
    it('should create a team successfully', async () => {
      const teamData = TestDataFactory.createTeam();
      
      const response = await apiTest.request
        .post('/api/v1/teams')
        .send(teamData)
        .expect(201);
      
      expect(response.body).toMatchObject({
        id: expect.any(String),
        name: teamData.name,
        homeKitPrimary: teamData.homeKitPrimary
      });
    });
    
    it('should validate required fields', async () => {
      const response = await apiTest.request
        .post('/api/v1/teams')
        .send({}) // Missing required name
        .expect(400);
      
      expect(response.body.error).toContain('validation');
    });
    
    it('should handle duplicate team names', async () => {
      const teamData = TestDataFactory.createTeam();
      
      // Create first team
      await apiTest.request
        .post('/api/v1/teams')
        .send(teamData)
        .expect(201);
      
      // Try to create duplicate
      await apiTest.request
        .post('/api/v1/teams')
        .send(teamData)
        .expect(409); // Conflict
    });
  });
  
  describe('GET /api/v1/teams', () => {
    it('should return paginated teams', async () => {
      // Create test teams
      const teams = await Promise.all([
        TestDataFactory.createTeam({ name: 'Team A' }),
        TestDataFactory.createTeam({ name: 'Team B' })
      ].map(data => 
        apiTest.request.post('/api/v1/teams').send(data)
      ));
      
      const response = await apiTest.request
        .get('/api/v1/teams')
        .expect(200);
      
      expect(response.body).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'Team A' }),
          expect.objectContaining({ name: 'Team B' })
        ]),
        pagination: {
          page: 1,
          limit: 25,
          total: expect.any(Number)
        }
      });
    });
  });
});
```

#### Events API Tests (Critical for Real-Time)
```typescript
// backend/tests/api/events.api.test.ts
describe('Events API Integration', () => {
  describe('POST /api/v1/events/batch', () => {
    it('should handle batch create operations', async () => {
      const batchData = {
        create: [
          TestDataFactory.createEvent('match-1', { kind: 'goal' }),
          TestDataFactory.createEvent('match-1', { kind: 'assist' })
        ]
      };
      
      const response = await apiTest.request
        .post('/api/v1/events/batch')
        .send(batchData)
        .expect(200);
      
      expect(response.body.results.created.success).toBe(2);
      expect(response.body.results.created.failed).toBe(0);
    });
    
    it('should handle partial batch failures', async () => {
      const batchData = {
        create: [
          TestDataFactory.createEvent('match-1', { kind: 'goal' }), // Valid
          { kind: 'invalid' } // Invalid - missing required fields
        ]
      };
      
      const response = await apiTest.request
        .post('/api/v1/events/batch')
        .send(batchData)
        .expect(207); // Partial success
      
      expect(response.body.results.created.success).toBe(1);
      expect(response.body.results.created.failed).toBe(1);
      expect(response.body.results.created.errors).toHaveLength(1);
    });
  });
  
  describe('Real-time preparation tests', () => {
    it('should handle rapid event creation', async () => {
      const events = Array.from({ length: 10 }, (_, i) => 
        TestDataFactory.createEvent('match-1', { 
          kind: 'ball_out',
          clockMs: i * 1000 
        })
      );
      
      // Simulate rapid event creation
      const promises = events.map(event =>
        apiTest.request.post('/api/v1/events').send(event)
      );
      
      const responses = await Promise.all(promises);
      
      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });
    });
  });
});
```

### 3. Error Handling Tests

```typescript
// backend/tests/api/error-handling.api.test.ts
describe('API Error Handling', () => {
  it('should handle 404 for non-existent resources', async () => {
    const response = await apiTest.request
      .get('/api/v1/teams/non-existent-id')
      .expect(404);
    
    expect(response.body).toMatchObject({
      error: 'Team not found',
      message: expect.stringContaining('non-existent-id')
    });
  });
  
  it('should handle malformed JSON', async () => {
    const response = await apiTest.request
      .post('/api/v1/teams')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }')
      .expect(400);
    
    expect(response.body.error).toContain('Invalid JSON');
  });
  
  it('should handle database connection errors gracefully', async () => {
    // This would require mocking Prisma to simulate connection failure
    // Implementation depends on specific error scenarios we want to test
  });
});
```

### 4. Performance Tests

```typescript
// backend/tests/api/performance.api.test.ts
describe('API Performance Tests', () => {
  it('should handle batch operations efficiently', async () => {
    const startTime = Date.now();
    
    const batchData = {
      create: Array.from({ length: 100 }, () => 
        TestDataFactory.createEvent('match-1')
      )
    };
    
    await apiTest.request
      .post('/api/v1/events/batch')
      .send(batchData)
      .expect(200);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
  });
  
  it('should handle concurrent requests', async () => {
    const concurrentRequests = Array.from({ length: 20 }, () =>
      apiTest.request
        .post('/api/v1/events')
        .send(TestDataFactory.createEvent('match-1'))
    );
    
    const responses = await Promise.all(concurrentRequests);
    
    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBe(201);
    });
  });
});
```

## Implementation Plan

### Phase 1: Infrastructure Setup (Week 1)
- [ ] Add Supertest dependency for HTTP testing
- [ ] Create API test setup utilities
- [ ] Create test data factories
- [ ] Set up test database configuration

### Phase 2: Core API Tests (Week 1)
- [ ] Teams API integration tests
- [ ] Players API integration tests  
- [ ] Events API integration tests (priority for real-time)
- [ ] Matches API integration tests

### Phase 3: Advanced API Tests (Week 2)
- [ ] Batch operations testing
- [ ] Error handling scenarios
- [ ] Validation edge cases
- [ ] Performance benchmarks

### Phase 4: Real-Time Preparation (Week 2)
- [ ] Rapid event creation tests
- [ ] Concurrent request handling
- [ ] Database transaction testing
- [ ] WebSocket readiness validation

## Dependencies Required

```json
{
  "devDependencies": {
    "supertest": "^6.3.3",
    "@types/supertest": "^2.0.12"
  }
}
```

## Test Configuration Updates

```typescript
// vitest.config.ts - Add API test patterns
export default defineConfig({
  test: {
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}',
      'tests/api/**/*.api.test.ts' // New API test pattern
    ],
    testTimeout: 10000, // Longer timeout for API tests
  }
});
```

## Success Metrics

### Coverage Targets
- **API Endpoints**: 100% of routes tested
- **Error Scenarios**: All major error paths covered
- **Batch Operations**: All batch endpoints tested
- **Performance**: Baseline benchmarks established

### Quality Gates
- **Response Time**: < 100ms for simple operations
- **Batch Performance**: < 5s for 100-item batches
- **Error Handling**: Proper HTTP status codes and messages
- **Data Integrity**: No data corruption under load

## Benefits for Real-Time Implementation

### 1. Solid Foundation
- **Proven API Reliability**: All endpoints tested and working
- **Performance Baselines**: Known performance characteristics
- **Error Handling**: Robust error scenarios covered

### 2. WebSocket Readiness
- **Rapid Event Testing**: APIs can handle quick successive events
- **Concurrent Load**: Multiple clients can create events simultaneously
- **Data Consistency**: Events maintain proper ordering and integrity

### 3. Debugging Support
- **Test Coverage**: Easy to isolate API vs WebSocket issues
- **Performance Monitoring**: Clear baseline for real-time performance
- **Regression Prevention**: Catch API breaks before real-time layer

## Risk Mitigation

### Technical Risks
- **Test Database**: Isolated test environment prevents data corruption
- **Performance Impact**: Tests run against separate database
- **Flaky Tests**: Proper cleanup and isolation prevents test interference

### Implementation Risks
- **Time Investment**: 1-2 weeks upfront saves weeks of debugging later
- **Complexity**: Start simple, add advanced scenarios incrementally
- **Maintenance**: Shared test patterns reduce maintenance overhead

---

## Conclusion

Implementing comprehensive API integration tests before adding real-time WebSocket functionality is crucial for:

1. **Reliability**: Ensuring our REST API foundation is rock-solid
2. **Performance**: Understanding baseline performance characteristics  
3. **Debugging**: Isolating issues between API and real-time layers
4. **Confidence**: Knowing our APIs can handle the real-time load

This testing suite will give us the confidence to implement real-time features knowing our backend APIs are thoroughly tested and reliable.