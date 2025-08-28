# Requirements Document

## Introduction

The Live Match Management Backend System provides the foundational real-time match state tracking and control functionality for grassroots football matches. This backend system enables the core data management and API infrastructure needed to track match progress through different periods, manage timing, and maintain accurate records of match state transitions. The system builds upon the existing matches infrastructure to add dynamic state management capabilities that will support future frontend interfaces and user controls.

**Note**: This specification covers only the backend infrastructure. A separate specification will be needed for the frontend user interface components, live match control pages, and real-time display features.

## Requirements

### Requirement 1

**User Story:** As a coach, I want to start a match and track its current state, so that I can manage the match timing and know which period we're currently in.

#### Acceptance Criteria

1. WHEN I start a match THEN the system SHALL create a match_state record with status "live"
2. WHEN a match is started THEN the system SHALL record the actual start timestamp
3. WHEN a match is live THEN the system SHALL track the current period number and type
4. WHEN a match is live THEN the system SHALL calculate and display total elapsed time
5. WHEN a match state changes THEN the system SHALL update the match_state record with current information

### Requirement 2

**User Story:** As a coach, I want to manage match periods (quarters, halves, or whole match), so that I can accurately track timing and transitions between periods.

#### Acceptance Criteria

1. WHEN a match period starts THEN the system SHALL create a match_periods record with start timestamp
2. WHEN a match period ends THEN the system SHALL update the match_periods record with end timestamp and actual duration
3. WHEN transitioning between periods THEN the system SHALL update the current_period in match_state
4. WHEN a period is active THEN the system SHALL track the period as "regular", "extra_time", or "penalty_shootout"
5. WHEN managing periods THEN the system SHALL support the match's configured period_format (quarter/half/whole)

### Requirement 3

**User Story:** As a coach, I want to pause and resume matches, so that I can handle interruptions like injuries, weather delays, or other stoppages.

#### Acceptance Criteria

1. WHEN I pause a match THEN the system SHALL update match_state status to "paused"
2. WHEN I pause a match THEN the system SHALL record the pause timestamp
3. WHEN I resume a paused match THEN the system SHALL update match_state status back to "live"
4. WHEN resuming a match THEN the system SHALL continue timing from where it was paused
5. WHEN calculating elapsed time THEN the system SHALL exclude paused time from total duration

### Requirement 4

**User Story:** As a coach, I want to complete a match and finalize its state, so that the match is properly recorded as finished with accurate timing information.

#### Acceptance Criteria

1. WHEN I complete a match THEN the system SHALL update match_state status to "completed"
2. WHEN a match is completed THEN the system SHALL record the final end timestamp
3. WHEN a match is completed THEN the system SHALL finalize all active match_periods records
4. WHEN a match is completed THEN the system SHALL calculate and store total match duration
5. WHEN a match is completed THEN the system SHALL prevent further state modifications

### Requirement 5

**User Story:** As a coach, I want to handle special match scenarios like extra time and penalty shootouts, so that I can manage matches that extend beyond regular time.

#### Acceptance Criteria

1. WHEN entering extra time THEN the system SHALL create new match_periods records with period_type "extra_time"
2. WHEN entering penalty shootout THEN the system SHALL create a match_periods record with period_type "penalty_shootout"
3. WHEN in extra time THEN the system SHALL continue period numbering appropriately
4. WHEN managing special periods THEN the system SHALL track timing separately from regular periods
5. WHEN special periods end THEN the system SHALL properly transition to match completion

### Requirement 6

**User Story:** As a coach, I want to cancel or postpone matches, so that I can handle situations where matches cannot be completed as scheduled.

#### Acceptance Criteria

1. WHEN I cancel a match THEN the system SHALL update match_state status to "cancelled"
2. WHEN I postpone a match THEN the system SHALL update match_state status to "postponed"
3. WHEN cancelling or postponing THEN the system SHALL record the reason for the change
4. WHEN a match is cancelled/postponed THEN the system SHALL preserve any existing timing data
5. WHEN a match is cancelled/postponed THEN the system SHALL prevent further live match operations

### Requirement 7

**User Story:** As a system administrator, I want match state and period data to support soft delete functionality, so that I can maintain data integrity and audit trails.

#### Acceptance Criteria

1. WHEN deleting match state records THEN the system SHALL use soft delete with is_deleted flag
2. WHEN deleting match period records THEN the system SHALL use soft delete with is_deleted flag
3. WHEN soft deleting records THEN the system SHALL record deleted_at timestamp and deleted_by_user_id
4. WHEN querying active records THEN the system SHALL exclude soft deleted records by default
5. WHEN needed for audit THEN the system SHALL provide access to soft deleted records

### Requirement 8

**User Story:** As a frontend developer, I want APIs that provide match status information, so that I can integrate live match data with user interfaces.

#### Acceptance Criteria

1. WHEN querying match status THEN the system SHALL provide current match state information via API
2. WHEN a match is live THEN the system SHALL return "live" status with current period information
3. WHEN a match is paused THEN the system SHALL return "paused" status with elapsed time data
4. WHEN a match is completed THEN the system SHALL return "completed" status with final timing data
5. WHEN providing status data THEN the system SHALL include all necessary information for frontend display

### Requirement 9

**User Story:** As a developer, I want comprehensive APIs for match state management, so that I can build user interfaces and integrate with other systems.

#### Acceptance Criteria

1. WHEN implementing APIs THEN the system SHALL provide endpoints for starting, pausing, resuming, and completing matches
2. WHEN implementing APIs THEN the system SHALL provide endpoints for managing match periods
3. WHEN implementing APIs THEN the system SHALL provide real-time match state queries
4. WHEN implementing APIs THEN the system SHALL include proper error handling and validation
5. WHEN implementing APIs THEN the system SHALL maintain consistency with existing API patterns

### Requirement 10

**User Story:** As a quality assurance engineer, I want comprehensive test coverage for match state functionality, so that I can ensure the system works reliably under all conditions.

#### Acceptance Criteria

1. WHEN testing match state THEN the system SHALL include unit tests for all state transitions
2. WHEN testing timing THEN the system SHALL include tests for period management and duration calculations
3. WHEN testing edge cases THEN the system SHALL include tests for pause/resume scenarios
4. WHEN testing data integrity THEN the system SHALL include tests for soft delete functionality
5. WHEN testing integration THEN the system SHALL include tests for API endpoints and database operations