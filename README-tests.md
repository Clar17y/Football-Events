# Testing Guide

## Overview
This project uses **Vitest** for unit and integration testing, following the **KISS principle** for a solo developer workflow.

## Directory Structure
```
tests/
├── unit/                    # Unit tests
│   ├── components/         # Component tests
│   └── database/          # Database operation tests
├── integration/           # Integration tests
└── setup/                # Test utilities and helpers
```

## Running Tests

### Basic Commands
```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Run with coverage
npm run test:coverage

# Interactive UI (helpful for debugging)
npm run test:ui
```

### Specific Test Files
```bash
# Run specific test file
npx vitest run tests/unit/database/indexedDB.test.ts

# Run tests matching pattern
npx vitest run --grep "database"
```

## Test Categories

### 1. Database Operations (Priority 1)
- **Location**: `tests/unit/database/`
- **Focus**: IndexedDB operations, migrations, sync
- **Key Tests**:
  - Event CRUD operations
  - Data ordering and retrieval
  - Error handling and recovery
  - Database reset functionality

### 2. Component Testing (Priority 2)
- **Location**: `tests/unit/components/`
- **Focus**: UI components and user interactions
- **Key Tests**:
  - Error message display
  - Form validation
  - Button interactions
  - Accessibility compliance

### 3. Integration Testing (Priority 3)
- **Location**: `tests/integration/`
- **Focus**: End-to-end workflows
- **Key Tests**:
  - Match logging workflow
  - Context provider integration
  - Real-time updates

## Writing Tests

### Database Tests
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GrassrootsDB } from '../../../src/db/indexedDB';

describe('Database Feature', () => {
  let db: GrassrootsDB;

  beforeEach(async () => {
    db = new GrassrootsDB();
    await db.initialize();
  });

  afterEach(async () => {
    if (db.isOpen()) {
      await db.clearAllData();
      db.close();
    }
  });

  it('should perform operation', async () => {
    // Test implementation
  });
});
```

### Component Tests
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../../../src/components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

## Coverage Targets
- **Overall**: 60% (realistic for solo dev)
- **Database modules**: Higher priority for critical operations
- **Focus**: Quality over quantity - test critical paths thoroughly

## Debugging Tests
1. Use `npm run test:ui` for interactive debugging
2. Add `console.log` statements in tests
3. Use `--grep` to run specific tests
4. Check browser dev tools when using jsdom

## Mobile Testing Notes
- Primary target: **iPhone Safari**
- Use responsive design tests
- Test touch interactions
- Verify offline functionality

## Best Practices
1. **KISS**: Keep tests simple and focused
2. **DRY**: Use test utilities for common setup
3. **Single Responsibility**: One concept per test
4. **Clear Names**: Describe what the test validates
5. **Fast Feedback**: Prefer unit tests over integration tests

## Troubleshooting
- If tests don't run: Check vitest.config.ts
- If database tests fail: Verify fake-indexeddb setup
- If components don't render: Check Ionic mocks in test-setup.ts