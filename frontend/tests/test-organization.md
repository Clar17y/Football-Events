# Frontend Test Organization

## Current Test Structure

```
frontend/tests/
├── unit/                           # Unit tests (mocked, fast)
│   ├── services/
│   │   └── teamsApi.test.ts       # Mocked API tests
│   ├── components/
│   ├── hooks/
│   └── database/
├── integration/                    # Integration tests (real APIs)
│   ├── api-services.test.ts        # Auth API
│   ├── teams-api-integration.test.ts
│   ├── seasons-api-integration.test.ts
│   ├── players-api-integration.test.ts
│   ├── matches-api-integration.test.ts
│   └── all-apis-integration.test.ts
└── setup/
```

## Test Types

### Unit Tests (/unit/)
- **Purpose**: Test logic in isolation
- **Speed**: Fast (< 100ms)
- **Dependencies**: Mocked
- **Example**: Data transformation, component rendering

### Integration Tests (/integration/)
- **Purpose**: Test complete workflows
- **Speed**: Slower (1-5s)
- **Dependencies**: Real backend APIs
- **Example**: CRUD operations, error handling

## Running Tests

```bash
# Unit tests (fast, no backend needed)
npm run test:unit

# Integration tests (requires backend)
npm run test:api

# Specific integration test
npm run test:api:individual:teams
```

## Best Practice

**Keep both test types**:
- Unit tests for fast development feedback
- Integration tests for confidence in real workflows

**teamsApi example**:
- `/unit/services/teamsApi.test.ts` - Tests data transformation with mocks
- `/integration/teams-api-integration.test.ts` - Tests real API calls

This gives you both speed and confidence!