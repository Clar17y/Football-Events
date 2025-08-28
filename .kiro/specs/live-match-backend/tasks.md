# Implementation Plan

- [x] 1. Database schema implementation
  - Add match_state and match_periods tables to Prisma schema
  - Create database migration files for new tables
  - Update User model with new relation fields for match state and periods
  - Update Match model with new relation fields for match state and periods
  - _Requirements: 1.1, 2.1, 7.1, 7.2_

- [x] 2. Create MatchStateService backend service with built-in soft delete
  - Implement MatchStateService class following existing service patterns
  - Add startMatch, pauseMatch, resumeMatch, completeMatch, cancelMatch methods
  - Implement state transition validation logic
  - Add getCurrentState and status query methods with soft delete filtering
  - Integrate user authorization validation following existing MatchService patterns
  - Use existing softDeleteUtils patterns for all database operations
  - Write unit tests for state transition logic, validation, and soft delete functionality
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.1, 4.2, 6.1, 6.2, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3. Create MatchPeriodsService backend service with built-in soft delete
  - Implement MatchPeriodsService class following existing service patterns
  - Add startPeriod, endPeriod, getMatchPeriods methods with soft delete support
  - Implement timing calculation logic for elapsed time
  - Add support for different period types (regular, extra_time, penalty_shootout)
  - Integrate user authorization validation following existing service patterns
  - Use existing softDeleteUtils patterns for all database operations
  - Write unit tests for period management, timing calculations, and soft delete functionality
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 4. Implement match state management API endpoints with built-in authorization
  - Create POST /api/v1/matches/{id}/start endpoint with user validation
  - Create POST /api/v1/matches/{id}/pause endpoint with user validation
  - Create POST /api/v1/matches/{id}/resume endpoint with user validation
  - Create POST /api/v1/matches/{id}/complete endpoint with user validation
  - Create POST /api/v1/matches/{id}/cancel endpoint with user validation
  - Create GET /api/v1/matches/{id}/state endpoint with user validation
  - Use existing authenticateToken middleware and error handling patterns
  - Add proper error handling and validation following existing API patterns
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 6.1, 6.2, 9.1, 9.4_

- [x] 5. Implement match periods management API endpoints with built-in authorization
  - Create POST /api/v1/matches/{id}/periods/start endpoint with user validation
  - Create POST /api/v1/matches/{id}/periods/{periodId}/end endpoint with user validation
  - Create GET /api/v1/matches/{id}/periods endpoint with user validation
  - Use existing authenticateToken middleware and error handling patterns
  - Add validation for period transitions and timing
  - Implement error handling for invalid period operations following existing patterns
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5, 9.2, 9.4_

- [x] 6. Create match status query API endpoints with built-in authorization
  - Create GET /api/v1/matches/live endpoint with user validation
  - Create GET /api/v1/matches/{id}/status endpoint with user validation
  - Use existing authenticateToken middleware and error handling patterns
  - Implement efficient queries with proper indexing and soft delete filtering
  - Add caching for frequently accessed match states
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.3_

- [x] 7. Add validation schemas for API requests
  - Create Zod validation schemas for match state operations following existing patterns
  - Add validation schemas for period management requests
  - Implement request validation middleware for new endpoints using existing validateRequest
  - Write tests for validation schema edge cases
  - _Requirements: 9.4_

- [ ] 8. Write comprehensive API integration tests
  - Create integration tests for all match state API endpoints with authorization testing
  - Add tests for match periods API endpoints with user permission validation
  - Implement tests for error scenarios, edge cases, and soft delete functionality
  - Add performance tests for live match queries
  - Test authorization scenarios (admin vs user, team ownership, etc.)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.5_

- [ ] 9. Implement database performance optimizations
  - Add database indexes for match state queries with soft delete filtering
  - Optimize queries for live match status retrieval
  - Add database constraints for data integrity
  - Test query performance under load with soft delete considerations
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 10. Create shared types and transformers
  - Add TypeScript types for match state and periods to shared package
  - Implement data transformers for API responses following existing patterns
  - Create type definitions for API request/response payloads
  - Write unit tests for transformer functions
  - _Requirements: 9.1, 9.2, 9.3_

- [ ] 11. Add comprehensive error handling and logging
  - Implement error handling for all service methods using existing patterns
  - Add structured logging for match state operations and authorization failures
  - Create error recovery mechanisms for failed operations
  - Add monitoring and alerting for critical failures
  - _Requirements: 6.3, 6.4, 6.5, 9.4_

- [ ] 12. Create database migration and deployment scripts
  - Write Prisma migration files for new tables
  - Create rollback scripts for database changes
  - Add data seeding scripts for testing
  - Prepare deployment documentation and procedures
  - _Requirements: 1.1, 2.1, 7.1, 7.2_