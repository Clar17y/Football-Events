# Implementation Plan

- [x] 1. Set up core page structure and routing
  - Create MatchesPage component with consistent header structure following TeamsPage/PlayersPage pattern
  - Add routing configuration for /matches path
  - Implement basic page layout with header, content sections, and navigation integration
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 2. Research and evaluate calendar component options
  - Evaluate third-party calendar libraries (react-calendar, react-big-calendar, react-datepicker)
  - Assess feasibility of customizing existing solutions for 14+ day view and team color indicators
  - Compare custom implementation vs third-party integration complexity
  - Make technical decision and document rationale
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Implement calendar date utilities and logic
  - Create date utility functions for calculating 14+ day ranges spanning months
  - Implement calendar grid data structure with date cells and match positioning
  - Add date formatting and today highlighting logic
  - Write unit tests for date calculations and edge cases
  - _Requirements: 1.2, 1.3_

- [x] 4. Build MatchesCalendar component (custom or third-party integration)
  - Create MatchesCalendar component with responsive 7-column grid layout (if custom)
  - OR integrate chosen third-party calendar with custom rendering (if third-party)
  - Implement calendar cell rendering with date display and today highlighting
  - Add basic click handling for empty dates and match indicators
  - Style calendar with grassroots design system variables and responsive breakpoints
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 5. Implement match indicators and team color integration
  - Add match indicator rendering within calendar cells using team colors
  - Implement home/away color logic using team's homeKit/awayKit colors
  - Create visual indicators that are accessible and clearly visible
  - Add fallback colors for teams without defined colors
  - _Requirements: 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 6. Create CreateMatchModal component
  - Build CreateMatchModal following the existing CreateTeamModal pattern
  - Implement form fields for match details (teams, date, time, venue, duration, period format)
  - Add form validation and error handling consistent with existing modals
  - Integrate with matchesApi for match creation
  - _Requirements: 2.1, 2.2, 2.4, 2.5_

- [x] 7. Implement calendar click interactions
  - Add click handlers to distinguish between empty dates and match indicators
  - Implement CreateMatchModal opening with pre-populated date for empty date clicks
  - Add match indicator click handling for navigation to match details
  - Handle multiple matches on same date with appropriate selection mechanism
  - _Requirements: 2.1, 2.3, 2.1.1, 2.1.3, 2.1.4, 2.1.5_

- [x] 8. Build UpcomingMatchesList component
  - Create UpcomingMatchesList component with full-width collapsible match items
  - Implement chronological sorting with most recent first
  - Add expand/collapse functionality for match details
  - Style match items to span full page width (not cards)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 9. Implement CompletedMatchesList component
  - Leverage existing UpcomingMatchesList component and refactor to use the same styling through the whole page
  - Create CompletedMatchesList component with result indicators
  - Add win/loss/draw color coding (green/red/amber) based on match results
  - Implement immediate score visibility in collapsed state
  - Instead of "Live Match" button, change to "Show Match Events", this will take you to the Live Events page (to be created in future) showing the events of the match
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 10. Add calendar-to-list navigation functionality
  - Implement scroll-to-match functionality when calendar match indicators are clicked
  - Add match highlighting/flashing animation when navigated to from calendar
  - Handle navigation for both upcoming and completed matches sections
  - Ensure smooth scrolling and proper focus management
  - _Requirements: 2.1.1, 2.1.2_

- [ ] 11. Integrate filtering and organization features
  - Add filtering options for upcoming matches (team, competition, date range)
  - Implement search functionality across match details
  - Add sorting options for match lists
  - Create filter UI components consistent with existing pages
  - _Requirements: 3.6_

- [x] 12. Implement data fetching and state management
  - Replace TODO stub in loadMatches() with actual matchesApi.getMatches() call to fetch all user matches
  - Add loading state protection to prevent multiple concurrent API calls
  - Implement proper error handling with user-friendly error messages
  - Update handleMatchCreated() to use optimistic updates (add new match to existing array immediately)
  - Ensure matches appear on calendar immediately after creation without additional API calls
  - Add proper loading states for initial data fetch and error states for failed requests
  - Verify calendar displays created matches and click interactions work with real data
  - Test pull-to-refresh functionality calls loadMatches() correctly
  - _Requirements: 2.4, 2.5, 2.3_

- [x] 13. Integrate team colors and logos in match display
  - Update backend matches API to include team color and logo data in match responses
  - Modify MatchService to join team data (homeKitPrimary, homeKitSecondary, awayKitPrimary, awayKitSecondary, logoUrl) when fetching matches
  - Update frontend Match type to include nested team color and logo properties
  - Replace hardcoded colors in calendarUtils.ts createMatchIndicator function with actual team data
  - Update getMatchIndicatorColors function to use real team colors from API response
  - Add fallback colors for teams without defined kit colors (current hardcoded values as defaults)
  - Test calendar match indicators display correct team colors for home/away matches
  - Prepare logo display infrastructure for future match list implementations
  - _Requirements: 2.1, 2.2, 4.1_

- [ ] 14. Add responsive design and mobile optimization
  - Implement responsive calendar grid for mobile, tablet, and desktop
  - Optimize match list layouts for different screen sizes
  - Ensure modal responsiveness across devices
  - Add touch-friendly interactions for mobile users
  - _Requirements: 5.5_

- [ ] 14. Implement theme support and styling consistency
  - Apply grassroots design system variables throughout all components
  - Add dark theme support for calendar and match lists
  - Ensure consistent typography and spacing with existing pages
  - Implement proper color contrast and accessibility standards
  - _Requirements: 5.2, 5.4_

- [ ] 15. Add comprehensive error handling and loading states
  - Implement skeleton loaders for calendar and match lists
  - Add error boundaries and graceful error handling
  - Create empty states for no matches scenarios
  - Add retry mechanisms for failed API calls
  - _Requirements: 5.1_

- [ ] 16. Write comprehensive tests
  - Create unit tests for calendar date utilities and match positioning logic
  - Add component tests for MatchesCalendar, match lists, and modal interactions
  - Implement integration tests for calendar-to-list navigation flow
  - Add E2E tests for complete match creation and management workflow
  - _Requirements: All requirements validation_

- [ ] 17. Final integration and polish
  - Integrate MatchesPage into main navigation and routing
  - Add page transitions and loading animations
  - Perform accessibility audit and implement improvements
  - Optimize performance and add any necessary memoization
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_