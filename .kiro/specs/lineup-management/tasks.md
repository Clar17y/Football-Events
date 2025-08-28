# Implementation Plan

- [ ] 1. Database Schema Setup and Core Infrastructure
  - Create database migration for new tables (default_lineups, position_zones)
  - Add new columns to existing lineup table (pitch_x, pitch_y, substitution_reason)
  - Populate position_zones table with initial football pitch zone definitions
  - Update Prisma schema to include new models and relationships
  - _Requirements: 1.1, 1.4, 4.1, 4.3, 6.3_

- [ ] 2. Backend Service Foundation
- [ ] 2.1 Create DefaultLineupService with core CRUD operations
  - Implement DefaultLineupService class with save, get, and delete methods
  - Add formation data validation and JSON schema handling
  - Create unit tests for default lineup operations
  - _Requirements: 1.2, 1.4, 6.3_

- [ ] 2.2 Create PositionCalculatorService for pitch zone calculations
  - Implement position zone calculation logic based on pitch coordinates
  - Create methods for validating player positions and formations
  - Write unit tests for position calculation algorithms
  - _Requirements: 2.3, 2.4, 2.5_

- [ ] 2.3 Enhance existing LineupService with new functionality
  - Add methods for current lineup calculation and substitution handling
  - Implement time-based player queries for match state integration
  - Create unit tests for enhanced lineup operations
  - _Requirements: 3.1, 3.4, 3.5, 4.2_

- [ ] 3. API Endpoints for Lineup Management
- [ ] 3.1 Create default lineup API endpoints
  - Implement POST /api/v1/default-lineups for saving formations
  - Implement GET /api/v1/default-lineups/:teamId for retrieving formations
  - Add validation schemas and error handling for default lineup operations
  - _Requirements: 1.2, 1.4, 5.2_

- [ ] 3.2 Enhance lineup API endpoints with positioning data
  - Update existing lineup endpoints to handle pitch_x and pitch_y coordinates
  - Add substitution-specific endpoints for live match integration
  - Create API tests for enhanced lineup functionality
  - _Requirements: 3.4, 3.5, 4.1, 4.2_

- [ ] 3.3 Create position calculation API endpoints
  - Implement GET /api/v1/positions/zones for retrieving pitch zones
  - Implement POST /api/v1/positions/calculate for position determination
  - Add validation and error handling for position calculations
  - _Requirements: 2.3, 2.4_

- [ ] 4. Core Frontend Components
- [ ] 4.1 Create VisualPitchInterface component
  - Implement SVG-based football pitch rendering with proper proportions
  - Create drag and drop functionality for player positioning
  - Add real-time position feedback and zone highlighting
  - Implement touch and mouse event handling for cross-platform support
  - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8_

- [ ] 4.2 Create PlayerSelectionPanel component
  - Implement player list grouped by preferred positions
  - Add drag initiation functionality for player positioning
  - Create player selection state management and visual indicators
  - _Requirements: 1.2, 2.1_

- [ ] 4.3 Create PositionSelectorModal component
  - Implement modal interface for position selection during substitutions
  - Add position filtering based on pitch areas and available positions
  - Create quick selection interface with position previews
  - _Requirements: 3.3, 3.4_

- [ ] 5. Lineup Management Page Implementation
- [ ] 5.1 Create LineupManagementPage main component
  - Implement team selection dropdown with oldest team as default
  - Create mode switching between default and match-specific lineups
  - Add save/load functionality for formation data
  - Integrate with existing navigation and authentication patterns
  - _Requirements: 1.1, 1.2, 5.1, 5.2_

- [ ] 5.2 Implement formation state management
  - Create Redux/context state for current formation data
  - Add dirty state tracking and unsaved changes warnings
  - Implement auto-save functionality for formation drafts
  - _Requirements: 1.4, 5.2, 5.3_

- [ ] 5.3 Add formation validation and error handling
  - Implement client-side validation for formation completeness
  - Add error handling for network failures and conflicts
  - Create user feedback for validation errors and save status
  - _Requirements: 1.4, 5.4_

- [ ] 6. Live Match Integration
- [ ] 6.1 Enhance live match player list with substitution functionality
  - Update existing live match player components to show on-pitch status
  - Replace "Pin" button with "Substitute" functionality
  - Integrate position selector modal into substitution workflow
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 6.2 Implement substitution workflow and timeline integration
  - Create substitution logic that updates lineup table with precise timing
  - Add timeline event creation for "Player X off" and "Player Y on" events
  - Implement match state synchronization for accurate on-pitch tracking
  - _Requirements: 3.4, 3.5, 3.6_

- [ ] 6.3 Add match preparation lineup loading
  - Implement default lineup loading when preparing for matches
  - Add match-specific lineup modification capabilities
  - Create clear indication of changes from default formation
  - _Requirements: 5.1, 5.3, 5.4_

- [ ] 7. Data Integration and API Services
- [ ] 7.1 Create frontend API services for lineup management
  - Implement defaultLineupsApi service with CRUD operations
  - Create positionCalculatorApi service for zone calculations
  - Add error handling and loading states for API operations
  - _Requirements: 1.2, 1.4, 2.3_

- [ ] 7.2 Enhance existing API services with lineup functionality
  - Update lineupsApi service to handle positioning data
  - Add substitution-specific API methods
  - Integrate with existing match and player API services
  - _Requirements: 3.4, 3.5, 4.1_

- [ ] 8. Testing Implementation
- [ ] 8.1 Create unit tests for frontend components
  - Write tests for VisualPitchInterface drag and drop behavior
  - Create tests for PlayerSelectionPanel state management
  - Add tests for PositionSelectorModal functionality
  - _Requirements: 2.1, 2.2, 2.3, 3.3_

- [ ] 8.2 Create integration tests for API endpoints
  - Write tests for default lineup CRUD operations
  - Create tests for enhanced lineup endpoints with positioning
  - Add tests for position calculation API functionality
  - _Requirements: 1.2, 1.4, 2.3, 3.4_

- [ ] 8.3 Create end-to-end tests for user workflows
  - Write tests for complete default lineup creation workflow
  - Create tests for match preparation and lineup modification
  - Add tests for live match substitution workflow
  - _Requirements: 1.1, 1.2, 3.1, 3.4, 5.1_

- [ ] 9. Performance Optimization and Polish
- [ ] 9.1 Optimize drag and drop performance
  - Implement efficient rendering for multiple player movements
  - Add debouncing for position calculations during drag operations
  - Optimize touch event handling for mobile devices
  - _Requirements: 2.2, 2.7, 2.8_

- [ ] 9.2 Add accessibility features
  - Implement keyboard navigation alternatives for drag and drop
  - Add screen reader support for pitch interface
  - Create high contrast mode support for visual elements
  - _Requirements: 2.7, 2.8_

- [ ] 9.3 Implement error recovery and offline support
  - Add browser storage backup for formation drafts
  - Create conflict resolution UI for concurrent modifications
  - Implement graceful degradation for network failures
  - _Requirements: 1.4, 5.2_

- [ ] 10. Final Integration and Documentation
- [ ] 10.1 Integrate lineup management with existing navigation
  - Add lineup management links to main navigation menu
  - Create breadcrumb navigation for lineup pages
  - Integrate with existing team and match selection patterns
  - _Requirements: 6.1, 6.2_

- [ ] 10.2 Create comprehensive error handling and user feedback
  - Implement consistent error messaging across all components
  - Add loading states and progress indicators for all operations
  - Create user guidance and help text for complex interactions
  - _Requirements: 1.4, 2.4, 3.6_