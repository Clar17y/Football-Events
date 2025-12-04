# Requirements Document

## Introduction

This specification covers the remaining milestones (4-8) of the offline sync architecture refactor. The refactor transitions from an outbox-based approach to a local-tables-with-synced-flag approach. Milestones 1-3 (Schema & Types, Event Storage, Match State Storage) have been completed. This spec covers:

- **Milestone 4**: Import Updates - Reading from local tables instead of outbox
- **Milestone 5**: Sync Service - Processing unsynced items from tables
- **Milestone 6**: Caching - Different retention policies for reference vs temporal data
- **Milestone 7**: Migration - Migrating existing outbox data to new structure
- **Milestone 8**: Cleanup - Deprecating and removing outbox usage

## Glossary

- **Synced Flag**: A boolean field on each record indicating whether it has been synchronized to the server (true = synced, false = needs sync)
- **Reference Data**: Relatively static data that should be cached indefinitely (teams, players, seasons, positions)
- **Temporal Data**: Time-sensitive data with limited retention (matches, events, periods, match state, lineups)
- **Guest User ID**: A user identifier prefixed with `guest-` indicating data created in guest mode
- **Import Service**: The service responsible for uploading guest data to the server when a user logs in
- **Sync Service**: The service responsible for background synchronization of authenticated user data
- **Cache Service**: The service responsible for managing local data retention and refresh policies
- **Outbox**: The legacy table used to queue operations for later sync (being deprecated)
- **Match Period**: A segment of a match (e.g., first half, second half, extra time)
- **Match State**: The current status of a match (NOT_STARTED, LIVE, PAUSED, COMPLETED)

## Requirements

### Requirement 1

**User Story:** As a guest user who logs in, I want my locally created data to be imported to the server with preserved timestamps, so that my match history accurately reflects when events actually occurred.

#### Acceptance Criteria

1. WHEN a user logs in with existing guest data THEN the Import_Service SHALL detect guest data by checking all local tables for records where created_by_user_id starts with 'guest-'
2. WHEN the Import_Service reads guest events THEN the Import_Service SHALL retrieve events directly from the events table instead of the outbox
3. WHEN the Import_Service reads guest match periods THEN the Import_Service SHALL retrieve periods from the match_periods table with their original started_at and ended_at timestamps
4. WHEN the Import_Service uploads match periods to the server THEN the Backend SHALL accept periods with preserved timestamps via a dedicated import endpoint
5. WHEN the import completes successfully THEN the Import_Service SHALL clear guest data from all local tables including match_periods and match_state
6. IF the import fails for any record THEN the Import_Service SHALL preserve the failed records locally and report the failure to the user

### Requirement 2

**User Story:** As an authenticated user, I want my locally created data to sync automatically to the server, so that my data is backed up and accessible from other devices.

#### Acceptance Criteria

1. WHEN an authenticated user creates an event THEN the Sync_Service SHALL process unsynced events from the events table where synced equals false
2. WHEN an authenticated user creates match periods THEN the Sync_Service SHALL process unsynced periods from the match_periods table
3. WHEN an authenticated user updates match state THEN the Sync_Service SHALL process unsynced state from the match_state table
4. WHEN the Sync_Service successfully syncs a record THEN the Sync_Service SHALL update the record with synced equals true and synced_at equals the current timestamp
5. WHEN the Sync_Service encounters a network failure THEN the Sync_Service SHALL retry on the next sync cycle without data loss
6. WHILE processing sync operations THEN the Sync_Service SHALL exclude records where created_by_user_id starts with 'guest-' to prevent guest data from syncing

### Requirement 3

**User Story:** As a user with limited device storage, I want old synced data to be automatically cleaned up while keeping recent and unsynced data, so that the app does not consume excessive storage.

#### Acceptance Criteria

1. WHEN the Cache_Service performs cleanup THEN the Cache_Service SHALL delete synced temporal data older than 30 days
2. WHILE performing cleanup THEN the Cache_Service SHALL preserve all records where synced equals false regardless of age
3. WHEN the Cache_Service manages reference data THEN the Cache_Service SHALL retain teams, players, and seasons indefinitely for offline access
4. WHEN the app loads while online THEN the Cache_Service SHALL refresh reference data from the server
5. WHEN the app transitions from offline to online THEN the Cache_Service SHALL trigger a cache refresh after sync completes

### Requirement 4

**User Story:** As a user upgrading from the old app version, I want my existing outbox data to be migrated to the new table structure, so that I do not lose any unsynchronized data.

#### Acceptance Criteria

1. WHEN the database schema upgrades THEN the Migration_Script SHALL move events from the outbox table to the events table with synced status preserved
2. WHEN the Migration_Script processes match commands from the outbox THEN the Migration_Script SHALL reconstruct match_periods records with original timestamps from command creation times
3. WHEN the Migration_Script processes match commands THEN the Migration_Script SHALL create match_state records reflecting the final state of each match
4. WHEN the Migration_Script encounters corrupted or incomplete data THEN the Migration_Script SHALL log the issue and continue processing remaining records
5. WHEN the migration completes THEN the Migration_Script SHALL log a summary of migrated records for verification

### Requirement 5

**User Story:** As a developer maintaining the codebase, I want the legacy outbox system to be deprecated and removed, so that the codebase is simpler and easier to maintain.

#### Acceptance Criteria

1. WHEN the addToOutbox function is called THEN the System SHALL log a deprecation warning directing developers to use direct table writes
2. WHEN the Sync_Service processes sync operations THEN the Sync_Service SHALL use table-based sync exclusively without reading from the outbox
3. WHEN the Import_Service cleans up after import THEN the Import_Service SHALL not reference the outbox table
4. WHEN all migrations are complete THEN the System SHALL mark the outbox table for removal in a future version

### Requirement 6

**User Story:** As a user working offline, I want to be able to access my reference data (teams, players, seasons) even without network connectivity, so that I can continue managing matches.

#### Acceptance Criteria

1. WHILE the device is offline THEN the System SHALL serve teams, players, and seasons from local cache
2. WHEN the user requests reference data while offline THEN the System SHALL return cached data without network errors
3. WHEN the app loads while online THEN the Cache_Service SHALL update local reference data with server data while preserving unsynced local changes
4. WHEN refreshing reference data THEN the Cache_Service SHALL replace synced records and preserve unsynced records

### Requirement 7

**User Story:** As a backend developer, I want an API endpoint that accepts match periods with preserved timestamps, so that imported guest data maintains accurate timing information.

#### Acceptance Criteria

1. WHEN the import endpoint receives a period with startedAt timestamp THEN the Backend SHALL store the period with the provided startedAt value
2. WHEN the import endpoint receives a period with endedAt timestamp THEN the Backend SHALL store the period with the provided endedAt value
3. WHEN the import endpoint receives a period with durationSeconds THEN the Backend SHALL store the calculated duration
4. IF the import endpoint receives invalid timestamp data THEN the Backend SHALL return a validation error with status 400
5. WHEN the import endpoint processes a request THEN the Backend SHALL validate that the authenticated user owns the match
