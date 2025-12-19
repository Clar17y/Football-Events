# Implementation Plan

- [ ] 1. Remove outbox table and types from schema
  - [ ] 1.1 Remove `DbOutboxEvent` interface from `frontend/src/db/schema.ts`
    - Remove the interface definition and `EnhancedOutboxEvent` type alias
    - Remove outbox from `DatabaseSchema` interface
    - Remove outbox indexes from `SCHEMA_INDEXES`
    - _Requirements: 2.1, 2.4_
  - [ ] 1.2 Write property test for schema (outbox table does not exist)
    - **Property 3: No outbox writes occur**
    - **Validates: Requirements 1.4, 2.1**

- [ ] 2. Remove outbox utilities and Dexie hooks
  - [ ] 2.1 Remove `addToOutbox` function from `frontend/src/db/utils.ts`
    - Remove the function and any imports of `DbOutboxEvent`
    - _Requirements: 2.2_
  - [ ] 2.2 Remove outbox Dexie hooks from `frontend/src/db/indexedDB.ts`
    - Remove the `creating`, `updating`, `deleting` hooks on events table that call `addToOutbox`
    - Remove the `addToOutbox` import
    - Remove outbox-related methods: `addEvent`, `getUnsyncedEvents`, `markEventSynced`, `markEventSyncFailed`
    - _Requirements: 2.3_
  - [ ] 2.3 Remove outbox table definition from GrassrootsDB class
    - Remove `outbox` table from Dexie stores
    - _Requirements: 2.1_

- [ ] 3. Update RealTimeService to write directly to events table
  - [ ] 3.1 Replace `addToOutbox` with direct events table write
    - Remove `OutboxEventPayload` interface
    - Update `addToOutbox` method to write to `db.events` with `synced: false`
    - Rename method to `storeEventLocally`
    - _Requirements: 3.1, 1.1_
  - [ ] 3.2 Write property test for local event storage
    - **Property 1: Local writes set synced to false**
    - **Validates: Requirements 1.1, 3.1**
  - [ ] 3.3 Update `syncOutboxEvents` to query events table
    - Query `db.events.where('synced').equals(false)`
    - Remove outbox-specific logic and type conversions
    - Rename method to `syncUnsyncedEvents`
    - _Requirements: 3.2_
  - [ ] 3.4 Write property test for sync query
    - **Property 6: Sync query finds all unsynced records**
    - **Validates: Requirements 3.2**
  - [ ] 3.5 Update sync success/failure handling
    - On success: set `synced: true` and `syncedAt` to ISO string
    - On failure: keep `synced: false`
    - _Requirements: 3.3, 3.4_
  - [ ] 3.6 Write property test for sync flag updates
    - **Property 4: Successful sync updates flags**
    - **Property 5: Failed sync preserves unsynced state**
    - **Validates: Requirements 3.3, 3.4**

- [ ] 4. Update matchesApi for offline match creation
  - [ ] 4.1 Replace outbox write with direct matches table write
    - Update `matchesApi.ts` to write to matches table with `synced: false`
    - Remove `addToOutbox` import and call
    - _Requirements: 4.1_
  - [ ] 4.2 Write property test for offline match creation
    - **Property 1: Local writes set synced to false** (for matches)
    - **Validates: Requirements 4.1**

- [ ] 5. Add generic sync utilities
  - [ ] 5.1 Add `getUnsyncedRecords` method to GrassrootsDB
    - Generic method to query any table for `synced === false`
    - _Requirements: 3.2, 4.2_
  - [ ] 5.2 Add `markRecordSynced` method to GrassrootsDB
    - Generic method to set `synced: true` and `syncedAt` on any table
    - _Requirements: 3.3, 4.3_
  - [ ] 5.3 Write property test for ISO date format
    - **Property 7: Date fields use ISO string format**
    - **Validates: Requirements 5.1, 5.3**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Clean up tests and remove outbox test files
  - [ ] 7.1 Remove outbox-specific test files
    - Remove `frontend/tests/unit/database/outboxSync.test.ts`
    - Update `frontend/tests/unit/services/realTimeService.test.ts` to remove outbox mocks
    - _Requirements: 2.1_
  - [ ] 7.2 Update any remaining tests that reference outbox
    - Search for `outbox` references in test files and update
    - _Requirements: 2.1_

- [ ] 8. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
