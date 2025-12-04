# Requirements Document

## Introduction

This specification addresses the gap where authenticated users lose network connectivity (offline or bad signal) while using the application. Currently, the app assumes authenticated users are always online, causing API calls to fail without local fallbacks. This spec implements a "local-first" architecture for authenticated users, allowing them to continue working offline with automatic sync when connectivity is restored.

The architecture follows the same pattern as guest mode: write to local IndexedDB tables with `synced: false`, then sync to server when online. The key difference is that authenticated users have a user ID instead of a guest ID.

## Glossary

- **Authenticated User**: A user who has logged in with valid credentials
- **Offline Mode**: State where the device has no network connectivity or poor signal
- **Local-First**: Architecture where data is written locally first, then synced to server
- **Synced Flag**: Boolean field indicating whether a record has been synchronized to the server
- **Network Detection**: Mechanism to detect online/offline state using `navigator.onLine` and network events

## Requirements

### Requirement 1

**User Story:** As an authenticated user with poor connectivity, I want to create events during a live match, so that I don't lose important match data due to network issues.

#### Acceptance Criteria

1. WHEN an authenticated user creates an event while offline THEN the Events_API SHALL write the event to the local events table with synced equals false
2. WHEN an authenticated user creates an event while offline THEN the Events_API SHALL return the locally created event without throwing a network error
3. WHEN the device comes back online THEN the Sync_Service SHALL automatically sync the locally created events to the server
4. WHEN the event is successfully synced THEN the Sync_Service SHALL update the local record with synced equals true and synced_at timestamp

### Requirement 2

**User Story:** As an authenticated user with poor connectivity, I want to manage match state (start, pause, resume, complete), so that I can track match progress even without network.

#### Acceptance Criteria

1. WHEN an authenticated user starts a match while offline THEN the Matches_API SHALL create local match_state and match_periods records with synced equals false
2. WHEN an authenticated user pauses or resumes a match while offline THEN the Matches_API SHALL update local match_state with synced equals false
3. WHEN an authenticated user completes a match while offline THEN the Matches_API SHALL update local match_state to COMPLETED with synced equals false
4. WHEN the device comes back online THEN the Sync_Service SHALL sync match state changes in chronological order

### Requirement 3

**User Story:** As an authenticated user, I want to create teams, players, seasons, and matches while offline, so that I can set up and manage matches even without network connectivity.

#### Acceptance Criteria

1. WHEN an authenticated user creates a team while offline THEN the Teams_API SHALL write the team to the local teams table with synced equals false
2. WHEN an authenticated user creates a player while offline THEN the Players_API SHALL write the player to the local players table with synced equals false
3. WHEN an authenticated user creates a season while offline THEN the Seasons_API SHALL write the season to the local seasons table with synced equals false
4. WHEN an authenticated user creates a match while offline THEN the Matches_API SHALL write the match to the local matches table with synced equals false
5. WHEN the device comes back online THEN the Sync_Service SHALL sync tables in dependency order: seasons, teams, players, matches, lineups, events
6. WHEN a record is successfully synced THEN the local record SHALL be updated with synced equals true and synced_at timestamp

### Requirement 4

**User Story:** As an authenticated user, I want clear feedback about my connectivity status, so that I understand when my data is being saved locally vs synced to the server.

#### Acceptance Criteria

1. WHEN the device goes offline THEN the System SHALL display a visual indicator showing offline status
2. WHEN data is saved locally while offline THEN the System SHALL show a toast notification indicating local save
3. WHEN the device comes back online THEN the System SHALL show sync progress indicator
4. WHEN sync completes THEN the System SHALL show confirmation that data has been synced

### Requirement 5

**User Story:** As an authenticated user, I want my offline-created data to be properly attributed to my account, so that it appears correctly when synced.

#### Acceptance Criteria

1. WHEN an authenticated user creates data while offline THEN the record SHALL have created_by_user_id set to the authenticated user's ID (not a guest ID)
2. WHEN offline data is synced THEN the server SHALL associate the data with the authenticated user's account
3. WHEN viewing data after sync THEN the user SHALL see their offline-created data alongside server data

### Requirement 6

**User Story:** As an authenticated user, I want the app to gracefully handle intermittent connectivity, so that I don't lose data during brief network interruptions.

#### Acceptance Criteria

1. WHEN an API call fails due to network error THEN the System SHALL automatically fall back to local storage
2. WHEN network connectivity is intermittent THEN the System SHALL queue failed operations for retry
3. WHEN the Sync_Service retries a failed operation THEN it SHALL use exponential backoff to avoid overwhelming the server
4. WHEN a sync operation fails repeatedly THEN the System SHALL preserve the local data and notify the user

