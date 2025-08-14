# Implementation Plan

- [ ] 1. Database schema implementation
  - Add match_state and match_periods tables to Prisma schema
  - Create database migration files for new tables
  - Update User model with new relation fields for match state and periods
  - Update Match model with new relation fields for match state and periods
  - _Requirements: 1.1, 2.1, 7.1, 7.2_

- [ ] 2. Create MatchStateService backend service
  - Implement MatchStateService class with state management methods
  - Add startMatch, pauseMatch, resumeMatch, completeMatch, cancelMatch methods
  - Implement state transition validation logic
  - Add getCurrentState and status query methods
  - Write unit tests for state transition logic and validation
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.1, 4.2, 6.1, 6.2_

- [ ] 3. Create MatchPeriodsService backend service
  - Implement MatchPeriodsService class with period management methods
  - Add startPeriod, endPeriod, getMatchPeriods methods
  - Implement timing calculation logic for elapsed time
  - Add support for different period types (regular, extra_time, penalty_shootout)
  - Write unit tests for period management and timing calculations
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.4, 3.5, 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 4. Implement match state management API endpoints
  - Create POST /api/v1/matches/{id}/start endpoint
  - Create POST /api/v1/matches/{id}/pause endpoint  
  - Create POST /api/v1/matches/{id}/resume endpoint
  - Create POST /api/v1/matches/{id}/complete endpoint
  - Create POST /api/v1/matches/{id}/cancel endpoint
  - Create GET /api/v1/matches/{id}/state endpoint
  - Add proper error handling and validation for all endpoints
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 6.1, 6.2, 9.1, 9.4_

- [ ] 5. Implement match periods management API endpoints
  - Create POST /api/v1/matches/{id}/periods/start endpoint
  - Create POST /api/v1/matches/{id}/periods/{periodId}/end endpoint
  - Create GET /api/v1/matches/{id}/periods endpoint
  - Add validation for period transitions and timing
  - Implement error handling for invalid period operations
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.2, 5.3, 5.4, 5.5, 9.2, 9.4_

- [ ] 6. Create match status query API endpoints
  - Create GET /api/v1/matches/live endpoint for live matches
  - Create GET /api/v1/matches/{id}/status endpoint for match status
  - Implement efficient queries with proper indexing
  - Add caching for frequently accessed match states
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.3_

- [ ] 7. Implement soft delete functionality
  - Add soft delete support to MatchStateService methods
  - Add soft delete support to MatchPeriodsService methods
  - Implement proper audit trail with deleted_at and deleted_by_user_id
  - Create methods to query active vs deleted records
  - Write tests for soft delete functionality
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 8. Create frontend match state management hooks
  - Create useMatchState hook for managing match state operations
  - Create useMatchPeriods hook for period management
  - Implement real-time state updates with polling or WebSocket
  - Add error handling and loading states for match operations
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 9. Build LiveMatchControl component
  - Create LiveMatchControl component for match state management
  - Add buttons for start, pause, resume, complete match operations
  - Implement period transition controls
  - Add real-time timer display and elapsed time tracking
  - Style component consistent with grassroots design system
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 4.1, 4.2_

- [ ] 10. Integrate match status display with matches page
  - Update MatchesCalendar to show live match indicators
  - Update match list components to display current match status
  - Add visual indicators for live, paused, completed matches
  - Implement status colors and icons for different match states
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 11. Handle special match scenarios
  - Implement extra time period management
  - Add penalty shootout period support
  - Create UI controls for transitioning to special periods
  - Add validation for special period transitions
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 12. Implement comprehensive error handling
  - Add error boundaries for live match components
  - Implement retry mechanisms for failed state transitions
  - Create user-friendly error messages for invalid operations
  - Add logging for match state operations and errors
  - _Requirements: 6.3, 6.4, 6.5, 9.4_

- [ ] 13. Add real-time updates and notifications
  - Implement WebSocket or polling for live match updates
  - Add real-time status updates to matches page
  - Create notifications for match state changes
  - Optimize update frequency and performance
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 14. Write comprehensive API tests
  - Create integration tests for all match state API endpoints
  - Add tests for match periods API endpoints
  - Implement tests for error scenarios and edge cases
  - Add performance tests for live match queries
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.5_

- [ ] 15. Write frontend component tests
  - Create unit tests for match state management hooks
  - Add component tests for LiveMatchControl component
  - Implement integration tests for match status display
  - Add tests for real-time update functionality
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [ ] 16. Performance optimization and caching
  - Implement database indexing for match state queries
  - Add caching layer for frequently accessed match states
  - Optimize real-time update performance
  - Add monitoring for live match system performance
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 17. Security and authorization implementation
  - Add authorization checks for match state operations
  - Implement user permission validation for match control
  - Add audit logging for all match state changes
  - Secure soft delete operations and data access
  - _Requirements: 7.3, 7.4, 7.5_

- [ ] 18. Documentation and deployment preparation
  - Create API documentation for match state endpoints
  - Write user guide for live match management features
  - Prepare database migration scripts
  - Create deployment checklist and rollback procedures
  - _Requirements: 9.1, 9.2, 9.3, 9.4_