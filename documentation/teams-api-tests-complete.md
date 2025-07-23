# Teams API Tests Documentation

## Overview
Comprehensive test suite for the Teams API service and useTeams hook to ensure reliability and correctness.

## Test Files

### 1. `tests/unit/services/teamsApi.test.ts`
**Unit tests for the Teams API service**
- ✅ **15 tests passing**
- Tests all CRUD operations with mocked HTTP calls
- Validates data transformation (camelCase ↔ snake_case)
- Tests error handling and edge cases
- Verifies pagination and search functionality

**Test Coverage:**
- `getTeams()` - List teams with pagination/search
- `getTeamById()` - Fetch specific team
- `createTeam()` - Create new team with validation
- `updateTeam()` - Update team with partial data
- `deleteTeam()` - Soft delete team
- `getTeamPlayers()` - Fetch team roster
- `getActiveTeamPlayers()` - Fetch active players
- `getTeamSquad()` - Fetch team squad with season context
- Error handling for network and HTTP errors

### 2. `tests/unit/hooks/useTeams.test.tsx`
**Unit tests for the useTeams React hook**
- ✅ **15 tests passing**
- Tests state management and React integration
- Validates toast notifications and error handling
- Tests optimistic updates for CRUD operations
- Verifies loading states and pagination

**Test Coverage:**
- Initial state validation
- `loadTeams()` - Load teams with loading states
- `createTeam()` - Create team with optimistic updates
- `updateTeam()` - Update team in state
- `deleteTeam()` - Remove team from state
- `refreshTeams()` - Refresh functionality
- `clearError()` - Error state management
- Toast integration and error handling

### 3. `tests/integration/teams-api-integration.test.ts`
**Integration tests against actual backend**
- Tests real API endpoints with authentication
- Validates complete CRUD workflow
- Tests error scenarios with real backend responses
- Requires backend running on localhost:3001

**Test Coverage:**
- Backend connectivity verification
- Authentication flow
- Complete CRUD operations
- Error handling (404, 400, duplicate names)
- Pagination and search functionality
- Data persistence validation

## Running Tests

### Unit Tests Only
```bash
# Teams API service tests
npm test -- tests/unit/services/teamsApi.test.ts

# useTeams hook tests  
npm test -- tests/unit/hooks/useTeams.test.tsx

# All unit tests
npm test -- tests/unit/
```

### Integration Tests
```bash
# Requires backend running on localhost:3001
npm test -- tests/integration/teams-api-integration.test.ts
```

### All Tests
```bash
npm test
```

## Test Results Summary

### ✅ Unit Tests: 30/30 Passing
- **Teams API Service**: 15/15 tests passing
- **useTeams Hook**: 15/15 tests passing
- **TypeScript**: No compilation errors
- **Coverage**: All major code paths tested

### 🔧 Integration Tests
- Requires manual backend setup
- Tests real API endpoints
- Validates end-to-end functionality
- Includes authentication and error scenarios

## Key Features Tested

### Data Validation
- ✅ Team creation with all fields (name, colors, logo)
- ✅ Team updates with partial data
- ✅ Color format validation (hex colors)
- ✅ URL validation for logos
- ✅ Required field validation

### API Integration
- ✅ HTTP method mapping (GET, POST, PUT, DELETE)
- ✅ Query parameter handling (pagination, search)
- ✅ Request/response data transformation
- ✅ Authentication token handling
- ✅ Error response parsing

### State Management
- ✅ Loading states during API calls
- ✅ Optimistic updates for better UX
- ✅ Error state management
- ✅ Toast notification integration
- ✅ Pagination state tracking

### Error Handling
- ✅ Network errors
- ✅ HTTP error responses (400, 404, 500)
- ✅ Malformed API responses
- ✅ Authentication failures
- ✅ Validation errors

## Next Steps

1. **Run Integration Tests**: Start backend and run integration tests
2. **Add E2E Tests**: Create Cypress tests for full user workflows
3. **Performance Tests**: Add tests for large datasets
4. **Accessibility Tests**: Ensure UI components are accessible

## Dependencies

- **Vitest**: Test runner and assertion library
- **@testing-library/react**: React component testing utilities
- **@testing-library/react-hooks**: Hook testing utilities
- **jsdom**: DOM environment for testing

## Notes

- All tests use proper mocking to avoid external dependencies
- Integration tests require backend authentication
- Tests follow AAA pattern (Arrange, Act, Assert)
- Error scenarios are thoroughly tested
- TypeScript ensures type safety throughout