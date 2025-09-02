# Implementation Plan

- [x] 1. Database Schema Setup and Core Infrastructure
  - Create database migration for new tables (default_lineups, position_zones)
  - Add new columns to existing lineup table (pitch_x, pitch_y, substitution_reason)
  - Populate position_zones table with initial football pitch zone definitions
  - Update Prisma schema to include new models and relationships
  - _Requirements: 1.1, 1.4, 4.1, 4.3, 6.3_

- [ ] 2. Backend Service Foundation
- [x] 2.1 Create DefaultLineupService with core CRUD operations
  - Implement DefaultLineupService class with save, get, and delete methods
  - Add formation data validation and JSON schema handling
  - Create unit tests for default lineup operations
  - _Requirements: 1.2, 1.4, 6.3_

- [x] 2.2 Create PositionCalculatorService for pitch zone calculations
  - Implement position zone calculation logic based on pitch coordinates
  - Create methods for validating player positions and formations
  - Write unit tests for position calculation algorithms
  - _Requirements: 2.3, 2.4, 2.5_

- [x] 2.3 Enhance existing LineupService with new functionality
  - Add methods for current lineup calculation and substitution handling
  - Implement time-based player queries for match state integration
  - Create unit tests for enhanced lineup operations
  - _Requirements: 3.1, 3.4, 3.5, 4.2_

- [ ] 3. API Endpoints for Lineup Management
- [x] 3.1 Create default lineup API endpoints
  - Implement POST /api/v1/default-lineups for saving formations
  - Implement GET /api/v1/default-lineups/:teamId for retrieving formations
  - Add validation schemas and error handling for default lineup operations
  - _Requirements: 1.2, 1.4, 5.2_

- [x] 3.2 Enhance lineup API endpoints with positioning data
  - Update existing lineup endpoints to handle pitch_x and pitch_y coordinates
  - Add substitution-specific endpoints for live match integration
  - Create API tests for enhanced lineup functionality
  - _Requirements: 3.4, 3.5, 4.1, 4.2_

- [x] 3.3 Create position calculation API endpoints
  - Implement GET /api/v1/positions/zones for retrieving pitch zones
  - Implement POST /api/v1/positions/calculate for position determination
  - Add validation and error handling for position calculations
  - _Requirements: 2.3, 2.4_

- [ ] 4. Core Frontend Components
- [x] 4.1 Create VisualPitchInterface component
  - Implement SVG-based football pitch rendering with proper proportions
  - Create drag and drop functionality for player positioning
  - Add real-time position feedback and zone highlighting
  - Implement touch and mouse event handling for cross-platform support
  - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8_

- [x] 4.2 Create PlayerSelectionPanel component
  - Implement player list grouped by preferred positions
  - Add drag initiation functionality for player positioning
  - Create player selection state management and visual indicators
  - _Requirements: 1.2, 2.1_

- [x] 4.3 Create PositionSelectorModal component

  - Create modal component with overlay and centered dialog for position selection
  - Implement position grid layout showing available positions (GK, CB, LB, RB, CM, LM, RM, CAM, ST, etc.)
  - Add position filtering logic to show only valid positions based on current formation and pitch areas
  - Create visual position previews with mini pitch diagrams showing where each position is located
  - Implement click handlers for position selection with immediate feedback
  - Add search/filter functionality to quickly find specific positions
  - Create keyboard navigation support (arrow keys, enter to select, escape to close)
  - Add loading states for when position data is being fetched
  - Implement error handling for failed position calculations or network issues
  - Create responsive design that works on mobile and desktop
  - Add accessibility features (ARIA labels, focus management, screen reader support)
  - Integrate with existing modal patterns and styling from the application
  - _Requirements: 3.3, 3.4_

- [ ] 5. Lineup Management Page Implementation
- [x] 5.1 Create LineupManagementPage main component
  - Create page structure mirroring LineupDemoPage with IonPage, IonHeader, IonToolbar, IonContent
  - Implement team selection dropdown using GET /api/v1/teams (non-deleted teams user created) with oldest team (created_at) as default
  - Add localStorage integration to remember last selected team on page refresh
  - Create page layout with: Header bar, Pitch view section, Team selector dropdown + Save button, Player selection panel
  - Integrate VisualPitchInterface and PlayerSelectionPanel components from demo page
  - Add navigation integration with IonBackButton and existing app navigation patterns
  - Implement team roster loading via GET /api/v1/teams/:id/players when team is selected
  - Add loading state that shows until both team data and default lineup are loaded (whole page ready)
  - Create "Save Layout" button that calls the default lineup API to persist formation
  - Auto-load existing default lineup for selected team when available
  - _Requirements: 1.1, 1.2, 5.1, 5.2_

- [x] 5.1.1 Fix issues with LineupManagementPage

  - The page should have the MatchMaster header like every other page, containing the back arrow and the dark mode theme toggle
  - The "Lineup Management" header background should then be inside the page, with the same format as every other (Like Matches)
  - The "Lineup Management" page header should match the color of the Ion Card on the home page. We have a lot of repeated colors on the homepage, suggest another color that could be used and works well in light or dark mode
  - The "Team Squad" header should be the same background color as the main page header
  - The "Team Squad" section should always be under the Pitch Interface no matter how wide the screen is
  - The "Team" selector is poor. It should be a simple drop down list that states the name of the team and the number of players assigned to that team. We could re-use the selector from the player page as it shows the current number of players in each team and has the colors of each team shown and is a good style. The downside is it's not a filter, it's a selector so would need some refactoring to use in both places
  - The current page appears to be constantly in dark mode, even when you haven't entered the page in dark mode. The "dark mode" feature of it also seems to neglect the background of the pitch interfacew and the "team squad" section
  - The player list just doesn't work at the moment, a team that has 2 players assigned shows 0 available
  - There is a 400 bad request for default-lineups when testing it. Presumably because a default lineup for the team does not exist. We should account for the case where it's the first time you go to set a default lineup. This causes the load for players to also fail as they are wrapped in same promise.
  - The "Save Layout" button should be under the pitch interface
  - The "status-section" saying the number of players on the pitch isn't necessary... it's on the pitch interface


- [ ] 5.2 Implement formation state management with React Context
  - Create React Context for managing current formation data (players, positions, team selection)
  - Implement dirty state tracking to detect when formation has been modified from saved state
  - Add unsaved changes warning prompt when user tries to navigate away or change teams
  - Create context methods for: loading default lineup, updating player positions, adding/removing players
  - Implement manual save-only workflow (no auto-save) - changes only persist when user clicks Save
  - Add loading states for team data fetching and default lineup loading (page-level loading until ready)
  - Create error states for failed API calls (team loading, player loading, lineup saving)
  - _Requirements: 1.4, 5.2, 5.3_

- [ ] 5.3 Add formation validation and error handling
  - Implement minimum 1 player validation (grey out save button if no players on pitch)
  - Implement maximum 11 player validation (prevent adding more than 11 players)
  - Keep save button always enabled (except during loading states)
  - Add network error handling for team API calls, player API calls, and default lineup save operations
  - Create user feedback using toast messages for validation errors and save status
  - Add save status feedback using toast messages (success/error messages after save attempts)
  - Implement simple overwrite strategy for concurrent saves (latest save wins)
  - Add graceful handling of missing default lineup data (empty pitch state)
  - Create error recovery options (retry failed saves, reload team data)
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