# Requirements Document

## Introduction

This feature removes the redundant outbox table from the IndexedDB schema and simplifies the offline-first sync architecture. Currently, the system double-tracks sync state: once via the `synced` flag on each entity table (events, matches, teams, players, etc.) and again via a separate outbox table that logs operations. This creates unnecessary complexity, data duplication, and type conversion issues.

The simplified architecture writes directly to entity tables with `synced: false` and uses a sync service that queries unsynced records from each table.

## Glossary

- **Outbox**: A separate IndexedDB table that logs INSERT/UPDATE/DELETE operations for later sync to the server
- **SyncableRecord**: Base interface with `synced: boolean` and `syncedAt?: IsoDateTimeString` fields present on all entity tables
- **Entity Table**: IndexedDB tables for domain entities (events, matches, teams, players, seasons, lineup, playerTeams, matchState, matchPeriods)
- **Sync Service**: Service responsible for pushing unsynced local records to the server
- **Real-Time Service**: Service handling WebSocket communication for live match events

## Requirements

### Requirement 1

**User Story:** As a developer, I want a single source of truth for sync state, so that the codebase is simpler and easier to maintain.

#### Acceptance Criteria

1. WHEN a record is created locally THEN the System SHALL store it in the appropriate entity table with `synced` set to `false`
2. WHEN a record is updated locally THEN the System SHALL update the entity table record and set `synced` to `false`
3. WHEN a record is deleted locally THEN the System SHALL set `isDeleted` to `true` and `synced` to `false` on the entity table record
4. THE System SHALL NOT write to an outbox table for any entity operations

### Requirement 2

**User Story:** As a developer, I want the outbox table and related code removed, so that there is no dead code or unused schema.

#### Acceptance Criteria

1. THE System SHALL NOT include an outbox table in the IndexedDB schema
2. THE System SHALL NOT include the `addToOutbox` function or any outbox-related utilities
3. THE System SHALL NOT include Dexie hooks that write to the outbox table
4. THE System SHALL NOT include the `DbOutboxEvent` type or related type aliases

### Requirement 3

**User Story:** As a user, I want my offline events to sync when connectivity is restored, so that my data is not lost.

#### Acceptance Criteria

1. WHEN the real-time service fails to publish an event THEN the System SHALL write the event to the events table with `synced` set to `false`
2. WHEN connectivity is restored THEN the System SHALL query the events table for records where `synced` equals `false`
3. WHEN an unsynced event is successfully transmitted THEN the System SHALL set `synced` to `true` and `syncedAt` to the current ISO timestamp
4. IF an event sync fails THEN the System SHALL retain the event with `synced` set to `false` for retry

### Requirement 4

**User Story:** As a user, I want offline match creation to work without an outbox, so that I can start matches while offline.

#### Acceptance Criteria

1. WHEN a match is created offline THEN the System SHALL write the match to the matches table with `synced` set to `false`
2. WHEN connectivity is restored THEN the System SHALL sync unsynced matches to the server
3. WHEN a match is successfully synced THEN the System SHALL set `synced` to `true` on the matches table record

### Requirement 5

**User Story:** As a developer, I want consistent date/time handling across all sync operations, so that there are no type conversion errors.

#### Acceptance Criteria

1. THE System SHALL use ISO strings for all date/time fields in entity tables
2. THE System SHALL NOT convert between timestamps and ISO strings during sync operations
3. WHEN storing `syncedAt` THEN the System SHALL use ISO string format
