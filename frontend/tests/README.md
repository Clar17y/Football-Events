# Frontend Test Organization

This document explains how the frontend tests are organized and when to use each type.

## Test Structure

```
frontend/tests/
├── unit/                           # Unit tests (isolated, mocked)
│   ├── components/                 # Component unit tests
│   ├── hooks/                      # Hook unit tests
│   ├── services/                   # Service unit tests (mocked APIs)
│   └── database/                   # Database unit tests
├── integration/                    # Integration tests (real APIs)
│   ├── api-services.test.ts        # Auth API integration
│   ├── teams-api-integration.test.ts
│   ├── seasons-api-integration.test.ts
│   ├── players-api-integration.test.ts
│   ├── matches-api-integration.test.ts
│   ├── all-apis-integration.test.ts # Cross-API workflows
│   ├── match-workflow.test.tsx     # UI workflow tests
│   └── realTimeSync.test.tsx       # Real-time features
├── manual/                         # Manual testing guides
└── setup/                          # Test utilities and setup
```

## Test Types

### 1. Unit Tests (`/unit/`)
**Purpose**: Test individual functions/components in isolation
**Characteristics**:
- ✅ Fast execution (< 100ms per test)
- ✅ No external dependencies
- ✅ Mocked API calls
- ✅ Focused on single responsibility

**Example**: `teamsApi.test.ts`
```typescript
// Tests the teamsApi service with mocked HTTP calls
it('should format team data correctly', () => {
  mockApiClient.get.mockResolvedValue(mockTeamData);
  // Test data transformation logic
});
```

**When to use**:
- Testing data transformation logic
- Testing component rendering with props
- Testing utility functions
- Testing error handling logic

### 2. Integration Tests (`/integration/`)
**Purpose**: Test complete workflows with real backend APIs
**Characteristics**:
- ⚡ Slower execution (1-5s per test)
- 🌐 Real HTTP calls to backend
- 🔄 Tests complete user workflows
- 📊 Tests cross-service interactions

**Example**: `teams-api-integration.test.ts`
```typescript
// Tests actual API calls to backend
it('should create and retrieve a team', async () => {
  const team = await teamsApi.createTeam(teamData);
  const retrieved = await teamsApi.getTeamById(team.id);
  expect(retrieved.name).toBe(teamData.name);
});
```

**When to use**:
- Testing complete CRUD workflows
- Testing API error handling
- Testing data persistence
- Testing cross-API relationships

## Running Tests

### Unit Tests (Fast)
```bash
# Run all unit tests
npm run test:unit

# Run specific unit test
npm run test:unit -- teams

# Watch mode for development
npm run test:unit:watch
```

### Integration Tests (Requires Backend)
```bash
# Run all integration tests
npm run test:api

# Run specific integration test
npm run test:api:individual:teams

# Watch mode
npm run test:api:watch
```

### All Tests
```bash
# Run everything
npm test

# With coverage
npm run test:coverage
```

## Test Guidelines

### Unit Tests Should:
- ✅ Run in < 100ms
- ✅ Not require backend server
- ✅ Mock all external dependencies
- ✅ Test edge cases and error conditions
- ✅ Have descriptive test names

### Integration Tests Should:
- ✅ Test real API interactions
- ✅ Clean up test data after each test
- ✅ Handle authentication properly
- ✅ Test complete user workflows
- ✅ Verify data persistence

### Both Should:
- ✅ Be deterministic (no flaky tests)
- ✅ Be independent (no test dependencies)
- ✅ Have clear assertions
- ✅ Follow AAA pattern (Arrange, Act, Assert)

## Migration Guide

### Existing Tests
- **`teamsApi.test.ts`** (unit) - Keep for fast data transformation testing
- **`teams-api-integration.test.ts`** (integration) - Use for real API testing

### When to Choose Which:

**Use Unit Tests When**:
- Testing data transformation logic
- Testing component props/state
- Testing utility functions
- Need fast feedback during development

**Use Integration Tests When**:
- Testing complete user workflows
- Testing API error responses
- Testing data persistence
- Testing cross-service interactions
- Validating backend integration

## Best Practices

### Test Data Management
```typescript
// Integration tests - clean up after each test
afterEach(async () => {
  for (const id of createdIds) {
    await api.delete(id);
  }
  createdIds.length = 0;
});

// Unit tests - use mock data
const mockTeam = {
  id: 'test-id',
  name: 'Test Team',
  // ... other properties
};
```

### Error Testing
```typescript
// Unit test - mock the error
mockApiClient.get.mockRejectedValue(new Error('Network error'));

// Integration test - test real error conditions
await expect(teamsApi.getTeamById('invalid-uuid'))
  .rejects.toMatchObject({ status: 400 });
```

### Async Testing
```typescript
// Always use async/await for consistency
it('should handle async operations', async () => {
  const result = await someAsyncFunction();
  expect(result).toBeDefined();
});
```

This organization ensures we have both fast unit tests for development and comprehensive integration tests for confidence in our API layer.