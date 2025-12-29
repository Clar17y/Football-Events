# Implementation Plan

## Note on Sync Service Gap

The current sync service (from offline-sync-refactor) only syncs:
- events
- match_periods  
- match_state

But these tables also have `synced` flags and need sync support:
- teams
- players
- seasons
- matches
- lineup
- default_lineups

This spec will add sync support for all tables.

---

- [x] 1. Network Detection Utilities
  - [x] 1.1 Create network utility module
    - Create `frontend/src/utils/network.ts`
    - Implement `isOnline()` function using `navigator.onLine`
    - Implement `shouldUseOfflineFallback(error)` to detect network errors
    - _Requirements: 6.1_
  - [x] 1.2 Create auth user ID utility
    - Add `getAuthUserId()` function to get current authenticated user's ID
    - Return user ID from auth context/token
    - _Requirements: 5.1_

- [x] 2. Sync Service - Add Missing Table Sync Functions
  - [x] 2.1 Add syncTeams() function
    - Query teams table where `synced` equals false
    - Exclude guest records
    - POST to teams API endpoint
    - Update `synced` to true on success
    - _Requirements: 3.1, 3.3_
  - [x] 2.2 Add syncPlayers() function
    - Query players table where `synced` equals false
    - Exclude guest records
    - POST to players API endpoint
    - Update `synced` to true on success
    - _Requirements: 3.2, 3.3_
  - [x] 2.3 Add syncSeasons() function
    - Query seasons table where `synced` equals false
    - Exclude guest records
    - POST to seasons API endpoint
    - Update `synced` to true on success
    - _Requirements: 3.3_
  - [x] 2.4 Add syncMatches() function
    - Query matches table where `synced` equals false
    - Exclude guest records
    - POST to matches API endpoint
    - Update `synced` to true on success
    - _Requirements: 3.3_
  - [x] 2.5 Add syncLineups() function
    - Query lineup table where `synced` equals false
    - Exclude guest records
    - POST to lineups API endpoint
    - Update `synced` to true on success
    - _Requirements: 3.3_
  - [x] 2.6 Add syncDefaultLineups() function
    - Query default_lineups table where `synced` equals false
    - Exclude guest records
    - POST to default-lineups API endpoint
    - Update `synced` to true on success
    - _Requirements: 3.3_
  - [x] 2.7 Update flushOnce() with correct sync order
    - Sync in order: seasons → teams → players → matches → lineups → default_lineups → events → match_periods → match_state
    - This ensures referential integrity (parent records synced before children)
    - _Requirements: 3.3, 3.4_
  - [x] 2.8 Add sync progress tracking
    - Track number of pending items per table
    - Emit events for UI to display progress
    - _Requirements: 4.3_

- [x] 3. Events API Offline Fallback
  - [x] 3.1 Add offline fallback to eventsApi.create()
    - Check `isOnline()` before API call
    - On network error, write to local events table with `synced: false`
    - Use authenticated user ID for `created_by_user_id`
    - Return transformed local event
    - _Requirements: 1.1, 1.2, 5.1_
  - [x] 3.2 Add offline fallback to eventsApi.update()
    - Similar pattern to create
    - Update local record if exists
    - _Requirements: 1.1_
  - [x] 3.3 Add offline fallback to eventsApi.delete()
    - Mark local record as deleted
    - _Requirements: 1.1_

- [x] 4. Matches API Offline Fallback
  - [x] 4.1 Add offline fallback to matchesApi.startMatch()
    - Create local match_state with status LIVE
    - Create first match_period record
    - _Requirements: 2.1_
  - [x] 4.2 Add offline fallback to matchesApi.pauseMatch()
    - Update local match_state to PAUSED
    - _Requirements: 2.2_
  - [x] 4.3 Add offline fallback to matchesApi.resumeMatch()
    - Update local match_state to LIVE
    - _Requirements: 2.2_
  - [x] 4.4 Add offline fallback to matchesApi.completeMatch()
    - Update local match_state to COMPLETED
    - End any open periods
    - _Requirements: 2.3_
  - [x] 4.5 Add offline fallback to matchesApi.startPeriod()
    - Create local match_periods record
    - _Requirements: 2.1_
  - [x] 4.6 Add offline fallback to matchesApi.endPeriod()
    - Update local match_periods with ended_at
    - _Requirements: 2.1_

- [x] 5. Teams API Offline Fallback
  - [x] 5.1 Add offline fallback to teamsApi.createTeam()
    - Write to local teams table with `synced: false`
    - Use authenticated user ID
    - _Requirements: 3.1, 5.1_
  - [x] 5.2 Add offline fallback to teamsApi.updateTeam()
    - Update local record
    - _Requirements: 3.1_

- [x] 6. Players API Offline Fallback
  - [x] 6.1 Add offline fallback to playersApi.createPlayer()
    - Write to local players table with `synced: false`
    - Use authenticated user ID
    - _Requirements: 3.2, 5.1_
  - [x] 6.2 Add offline fallback to playersApi.updatePlayer()
    - Update local record
    - _Requirements: 3.2_

- [x] 7. Lineups API Offline Fallback
  - [x] 7.1 Add offline fallback to lineupsApi.create()
    - Write to local lineup table with `synced: false`
    - Use authenticated user ID for `created_by_user_id`
    - Return transformed local lineup
    - _Requirements: 3.3, 5.1_
  - [x] 7.2 Add offline fallback to lineupsApi.update()
    - Update local lineup record if exists
    - Mark as `synced: false`
    - _Requirements: 3.3_
  - [x] 7.3 Add offline fallback to lineupsApi.delete()
    - Mark local lineup record as deleted (soft delete)
    - _Requirements: 3.3_
  - [x] 7.4 Add offline fallback to lineupsApi.makeSubstitution()
    - Update local lineup records for player off (set end_min)
    - Create local lineup record for player on
    - Mark both as `synced: false`
    - _Requirements: 3.3_
  - [x] 7.5 Add offline fallback to lineupsApi.batch()
    - Process batch create/update/delete operations locally
    - Mark all affected records as `synced: false`
    - _Requirements: 3.3_

- [x] 8. Checkpoint - Verify API Fallbacks
  - Ensure all API services have offline fallbacks
  - Test each API in offline mode

- [x] 9. Offline Status UI
  - [x] 9.1 Create OfflineIndicator component
    - Show offline status when `navigator.onLine` is false
    - Show sync progress when coming back online
    - We already have a sync icon in header, use it
    - _Requirements: 4.1, 4.3_
  - [x] 9.2 Add offline toast notifications
    - Show toast when data is saved locally
    - Show toast when sync completes
    - _Requirements: 4.2, 4.4_
  - [x] 9.3 Integrate OfflineIndicator into app layout
    - Add to main app layout
    - Position appropriately for mobile/desktop
    - _Requirements: 4.1_

- [ ] 10. Checkpoint - Verify Offline UI
  - Test offline indicator visibility
  - Test toast notifications

- [ ] 11. Error Handling and Retry Logic
  - [ ] 11.1 Implement exponential backoff for sync retries
    - Start with 1 second delay
    - Double delay on each retry up to max 5 minutes
    - _Requirements: 6.3_
  - [ ] 11.2 Add max retry limit with user notification
    - After 5 failed retries, notify user
    - Preserve local data
    - _Requirements: 6.4_
  - [ ] 11.3 Distinguish network errors from validation errors
    - Only fall back to local for network errors
    - Show validation errors to user immediately
    - _Requirements: 6.1_

- [ ] 12. Final Checkpoint - Full Integration Test
  - Test complete offline/online cycle
  - Test intermittent connectivity
  - Verify data integrity after sync

