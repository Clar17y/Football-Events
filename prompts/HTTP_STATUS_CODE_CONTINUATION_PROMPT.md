# HTTP Status Code Improvements Continuation Prompt

## Context
You are continuing work on implementing proper HTTP status codes across all backend services in a grassroots football PWA. The error handling infrastructure has been established and some services have been updated, but others still need to be converted from generic 500 errors to proper REST status codes.

## Current Status
✅ **COMPLETED**:
- Error handling middleware properly imported in `backend/src/app.ts`
- `express-async-errors` catches async errors and passes to middleware
- Error handler in `backend/src/middleware/errorHandler.ts` handles `statusCode` properties
- **PlayerTeamService**: All errors updated with proper status codes (403, 404, 409) - ALL TESTS PASSING
- **MatchService**: Access denied errors updated to 403 - ALL TESTS PASSING
- **EventService**: Access denied errors updated to 403
- **TeamService**: Not found errors updated to 404
- **AuthService**: All error types updated (401, 404, 409)

## Pattern Established
The pattern for updating services is:

**OLD (Wrong):**
```typescript
throw new Error('Access denied: message here');
// Results in 500 Internal Server Error
```

**NEW (Correct):**
```typescript
const error = new Error('Access denied: message here') as any;
error.statusCode = 403;
throw error;
// Results in 403 Forbidden
```

## HTTP Status Code Standards
- **403 Forbidden**: Access denied, user lacks permission
- **404 Not Found**: Resource not found or user lacks access to see it exists
- **409 Conflict**: Resource already exists, duplicate data
- **401 Unauthorized**: Authentication failed, invalid credentials/tokens

## Remaining Work
🔄 **NEEDS TESTING & POTENTIAL FIXES**:

1. **Test Other Services**: Run API tests for services we updated to find tests expecting wrong status codes:
   ```bash
   cd backend && npx vitest tests/api/events.api.test.ts --run
   cd backend && npx vitest tests/api/teams.api.test.ts --run
   cd backend && npx vitest tests/api/auth.api.test.ts --run  # if exists
   ```

2. **Fix Test Expectations**: Update any tests that expect `500` but should expect proper codes:
   - Access denied tests should expect `403`
   - Not found tests should expect `404`
   - Conflict tests should expect `409`
   - Auth failure tests should expect `401`

3. **Check Other Services**: Search for any remaining services with plain `throw new Error()`:
   ```bash
   grep -r "throw new Error" backend/src/services/ --include="*.ts"
   ```

4. **Update Any Missing Services**: Apply the established pattern to any services not yet updated.

## Example Test Fix
**Before:**
```typescript
await apiRequest
  .post('/api/v1/events')
  .set(authHelper.getAuthHeader(testUser))
  .send(eventData)
  .expect(500); // Wrong - was expecting generic error
```

**After:**
```typescript
await apiRequest
  .post('/api/v1/events')
  .set(authHelper.getAuthHeader(testUser))
  .send(eventData)
  .expect(403); // Correct - access denied should be 403
```

## Verification Steps
1. Run all API tests to identify failures due to status code mismatches
2. Update test expectations to match proper HTTP standards
3. Verify all services return appropriate status codes
4. Confirm error middleware is working correctly across all endpoints

## Success Criteria
- All API tests passing with proper HTTP status codes
- No business logic errors returning 500 (except for actual server errors)
- Consistent error handling across all services
- RESTful API compliance

## Files to Focus On
- `backend/tests/api/*.api.test.ts` - Update test expectations
- `backend/src/services/*.ts` - Ensure all use proper status codes
- Look for patterns like `.expect(500)` in tests that should be `.expect(403/404/409/401)`

The infrastructure is complete - just need to systematically test and fix any remaining inconsistencies!