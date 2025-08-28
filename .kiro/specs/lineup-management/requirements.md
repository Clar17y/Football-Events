# Requirements Document

## Introduction

The lineup management system enables coaches to create and manage default team lineups and make real-time substitutions during matches. The system provides a visual football pitch interface for intuitive player positioning, supports flexible formations without rigid position constraints, and integrates with the live match system for seamless substitution management. The system accommodates different team sizes across age groups while maintaining statistical accuracy through precise timing data.

## Requirements

### Requirement 1

**User Story:** As a coach, I want to create and manage a default lineup for my team, so that I have a consistent starting formation that I can customize for each match.

#### Acceptance Criteria

1. WHEN a coach accesses the lineup page THEN the system SHALL display a list of teams they manage with the oldest created team selected by default
2. WHEN a coach selects a team THEN the system SHALL display all players on that team grouped by their preferred position (GK, defenders, midfielders, strikers)
3. WHEN a coach creates a default lineup THEN the system SHALL allow up to 11 players to be positioned on the pitch regardless of age group restrictions
4. WHEN a default lineup is saved THEN the system SHALL persist the formation for future use and match preparation
5. IF no default lineup exists for a team THEN the system SHALL provide an empty pitch interface for initial setup

### Requirement 2

**User Story:** As a coach, I want to position players on a visual football pitch interface, so that I can intuitively create formations and see the tactical setup.

#### Acceptance Criteria

1. WHEN the lineup interface loads THEN the system SHALL display a top-down view of a football pitch
2. WHEN a coach drags a player onto the pitch THEN the system SHALL allow free positioning without snapping to fixed locations
3. WHEN a player is positioned in a specific area of the pitch THEN the system SHALL automatically determine and display their position code based on pitch sections
4. WHEN a coach moves a player around the pitch THEN the system SHALL show real-time position updates as they drag
5. WHEN multiple players are placed in similar areas THEN the system SHALL allow flexible formations (e.g., two left midfielders) without position conflicts
6. WHEN a player is placed in the goal area THEN the system SHALL automatically assign them the GK position
7. WHEN the pitch interface is used on mobile THEN the system SHALL support touch-based drag and drop functionality
8. WHEN the pitch interface is used on desktop THEN the system SHALL support mouse-based drag and drop functionality

### Requirement 3

**User Story:** As a coach, I want to make substitutions during live matches through the existing match interface, so that I can manage my team without switching between different screens.

#### Acceptance Criteria

1. WHEN a live match loads THEN the system SHALL check the default lineup and lineup table to determine current on-pitch players
2. WHEN the live match interface displays players THEN the system SHALL show current on-pitch players as "On Pitch" and others as available for substitution
3. WHEN a coach clicks to substitute a player on THEN the system SHALL prompt for position selection before confirming the substitution
4. WHEN a substitution is confirmed THEN the system SHALL create a lineup record with start_min set to current match time and end_min as null
5. WHEN a coach substitutes a player off THEN the system SHALL update the existing lineup record to set the end_min to current match time
6. WHEN substitutions occur THEN the system SHALL create separate timeline events for "Player X off" and "Player Y on"
7. IF a page refresh occurs during live match THEN the system SHALL maintain accurate on-pitch status based on lineup data

### Requirement 4

**User Story:** As a coach, I want the system to accurately track playing time for statistical purposes, so that I can analyze player performance and manage squad rotation effectively.

#### Acceptance Criteria

1. WHEN a player is added to the lineup THEN the system SHALL record precise start_min timing
2. WHEN a player is substituted off THEN the system SHALL record precise end_min timing
3. WHEN calculating playing time THEN the system SHALL use match_period duration_seconds for accurate time calculations
4. WHEN multiple lineup changes occur THEN the system SHALL maintain data integrity with the unique constraint on match_id, player_id, and start_min
5. IF a match period ends with players on pitch THEN the system SHALL handle end_min calculations appropriately for statistical accuracy

### Requirement 5

**User Story:** As a coach, I want to modify my default lineup for specific matches, so that I can adapt my tactics based on opponents or player availability.

#### Acceptance Criteria

1. WHEN preparing for a match THEN the system SHALL load the default lineup as a starting point
2. WHEN a coach modifies the lineup for a specific match THEN the system SHALL allow changes without affecting the default lineup
3. WHEN match-specific changes are made THEN the system SHALL clearly indicate modifications from the default formation
4. WHEN a match begins THEN the system SHALL use the match-specific lineup if modified, otherwise use the default lineup
5. IF a coach wants to save match modifications as new default THEN the system SHALL provide an option to update the default lineup

### Requirement 6

**User Story:** As a system administrator, I want the lineup system to integrate seamlessly with existing match and player data, so that coaches have a unified experience across all team management functions.

#### Acceptance Criteria

1. WHEN accessing lineup management THEN the system SHALL use existing authentication and team access controls
2. WHEN displaying players THEN the system SHALL show current team roster with accurate preferred positions
3. WHEN creating lineup records THEN the system SHALL maintain referential integrity with match, player, and user tables
4. WHEN soft delete functionality is used THEN the system SHALL respect deleted_at and is_deleted fields consistently
5. WHEN lineup data is queried THEN the system SHALL follow established patterns for created_by and updated tracking