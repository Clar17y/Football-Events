# Guest Mode (Local‑First) — Design, Limits, and Implementation Status

**Last Updated:** 2025-12-02
**Status:** ✅ **Production-Ready** - All critical issues resolved

This document specifies the "Guest Mode" feature that enables first‑time users to explore, record a quick match, and try lineup tools without creating an account. It covers design goals, data flow, quotas, what's implemented, and everything needed to finish the work.

## Recent Updates (2025-12-02)

### ✅ Import & Modal Improvements
- **ImportPromptModal**: Refactored to use shared PromptModal.css with centered overlay style
- **SignupPromptModal**: Refactored to use shared PromptModal.css for consistency
- **Shared Modal Styling**: Created `PromptModal.css` for consistent centered modal UX across both modals
- **Dark Theme Support**: Proper `.dark-theme` class support in all prompt modals (no longer uses OS-level `prefers-color-scheme`)

### ✅ Robust Guest Data Detection
- **Pattern-Based Detection**: Import service now detects ANY guest data by checking for `created_by_user_id` starting with "guest-"
- **No localStorage Dependency**: No longer relies on matching a specific guest ID from localStorage
- **Outbox Scanning**: Checks both main tables AND outbox for comprehensive guest data detection
- **Multi-Guest Support**: Handles edge cases where multiple guest IDs exist (e.g., after data clear/restart)

### ✅ Previous Updates (2025-01-26)

#### Critical Bug Fixes
- **CreateMatchModal**: Fixed seasonId validation and UI for guests
- **API Fallbacks**: Added guest fallbacks to `getActiveTeamPlayers()` and `getPlayerStats()`
- **Auth Guards**: Added explicit guards in MatchesPage to prevent 401 errors
- **GuestBanner**: Added to all relevant pages including SeasonsPage

#### UX Improvements
- **Pre-submit Quota Checks**: Added to CreatePlayerModal and CreateTeamModal
- **Opponent Search**: Enabled autocomplete for guests in HomePage
- **Settings Cleanup**: Proper cleanup of orphaned state on match deletion

#### Data Integrity
- **Import Service**: Players retain team assignments during upgrade
- **Event Mapping**: Events preserve team/player associations during import
- **Zero Data Loss**: Full ID mapping prevents relationship loss on account upgrade

## Goals
- Let new users use core functionality without registration on first visit.
- Store data locally with clear, friendly limits to prevent bloat/abuse.
- Offer a path to “claim” and sync local data after registration.
- Keep backend changes minimal in the first iteration.

## Scope (current)
- Local‑first storage via IndexedDB/Dexie for guests.
- Hard limits for unauthenticated users:
  - Teams: 1
  - Matches: 1
  - Players per team: 15
  - Non‑scoring events per match: 50 (goals and own_goals are unlimited)
  - Formation changes (per match): 10
- Default lineups available in guest mode (stored locally).
- Keep “Awards” and “Statistics” pages behind login; other pages are guest‑enabled.
- Provide friendly upgrade prompts when a limit is reached (Sign Up modal) and a persistent Guest banner.

## Non‑Goals (v1)
- Multi‑device sync before signup.
- Anonymous server user/temporary auth.
- Full server import endpoint (can be a later enhancement).

---

## Architecture Overview
- Identity
  - A stable `guest_id` is generated and stored in `localStorage` on first run.
  - File: `frontend/src/utils/guest.ts` (`getGuestId()`, `isGuest()`).
- Storage
  - IndexedDB (Dexie) holds all guest data; writes tag `created_by_user_id = guest_id`.
  - Default lineups are saved in the `settings` table when guest.
- Quotas
  - Centralized checks in `frontend/src/utils/guestQuota.ts`.
  - Enforced at service and DB boundaries (detailed below).
- Realtime/Outbox
  - Events still go through “realtime‑first; fallback to outbox” flow. Guest limits are enforced before queuing.
- Routing
  - Pages open to guests: Home, Seasons, Teams, Players, Matches, Live Match, Lineup Management, Lineup Demo.
  - Locked (login required): Awards, Statistics.

---

## Quotas and Enforcement Points (enforced)
All limits apply only when `!isAuthenticated()`.

- Teams: max 1
  - Enforced in `teamsApi.createTeam()` via `canCreateTeam()`.
- Matches: max 1
  - Enforced in guest Quick Match via `canCreateMatch()`.
- Players per team: max 15
  - Enforced in `playersApi.createPlayerWithTeam()` (and multi‑team variant) via `canAddPlayer(teamId)`.
- Non‑scoring events per match: max 50
  - Guarded centrally in `db.addEvent()` and also pre‑checked in `MatchContext.addEvent()` via `canAddEvent(matchId, kind)`.
  - Scoring events `goal` and `own_goal` are always allowed.
- Formation changes per match: max 10
  - Enforced in `formationsApi.applyChange()` via `canChangeFormation(matchId)`.

Quota config: `frontend/src/utils/guestQuota.ts` (constants are easy to tune).

---

## Data Model Details
- `guest_id`
  - Persisted in `localStorage` under key `guest_id`.
  - Used for all `created_by_user_id` fields in guest mode.
- Default Lineups (guest)
  - Stored in `settings` table with key `default_lineup:<teamId>` and JSON `{ formation, updatedAt }`.
- Formation Changes (guest + auth offline)
  - Persisted as `formation_change` events in outbox when offline, with JSON notes `{ reason, formation, prevFormation }` for rich timeline rendering.
  - Counted (guest) for quota enforcement.
- Match Commands (offline control)
  - Offline match controls enqueue `match_commands` outbox items (start_match, start_period, pause, resume, end_period, complete) and replay later to server.

---

## Implementation Status (Code References)

Already landed (high-level):
1. Identity + Quotas
   - NEW `frontend/src/utils/guest.ts`
   - NEW `frontend/src/utils/guestQuota.ts`
2. DB writes carry `guest_id` and enforce event limits
   - UPDATED `frontend/src/db/indexedDB.ts`
     - `addEnhancedEvent()` uses guest id when no explicit author.
     - `addEvent()` enforces non‑scoring event quota (returns error when exceeded).
3. Event pipeline pre‑checks
   - UPDATED `frontend/src/contexts/MatchContext.tsx`
     - Before publishing, non‑scoring events are checked; shows a toast if blocked.
   - UPDATED `frontend/src/services/realTimeService.ts`
     - Ensures outbox events include `created_by_user_id` in guest mode.
4. Default lineups + formations (guest + auth offline)
   - Default lineups: read/write to `settings` for guests; authenticated offline writes enqueue outbox for sync.
   - Formations: guest quota enforced; offline changes persisted as `formation_change` events; authenticated offline falls back to the same.
5. Teams/Players guest fallbacks
   - UPDATED `frontend/src/services/api/teamsApi.ts`
     - Guest: list from IndexedDB with pagination; create locally (enforce 1 team).
     - `getTeamPlayers()` returns local players.
   - UPDATED `frontend/src/services/api/playersApi.ts`
     - Guest: create locally (enforce 15 players per team). Variants supported.
6. Routing gates + Indicators
   - UPDATED `frontend/src/App.tsx`
     - Pages open to guests: Seasons, Teams, Players, Matches, Lineup Management, etc. Awards & Statistics remain behind login.
     - New Offline Sync Indicator in header (Offline / Syncing N / All synced).
7. Home “Quick Start”
   - Guests: creates a local match and navigates to Live Match instantly (no server required).
   - Auth users: standard quickStart; falls back to local when offline.

Related backend resilience (already shipped; not part of Guest Mode per se):
- `backend/src/routes/v1/stats.ts` returns a degraded but valid payload when DB is down; the frontend prefers cached stats.

---

## Remaining Work to Finish v1

A. Guest Quick Match (local) [High Priority]
- Implement local Quick Match creation without server calls:
  - Auto‑create a local “Demo Season” (if missing) tagged with `guest_id`.
  - Ensure exactly 1 local team; if none exists, create one with a friendly default name (e.g., “My Team”). Enforce 1 team limit.
  - Create a local match with opponent name and configured kickoff/duration/format; enforce 1 match limit.
  - Navigate to Live Match page in guest mode.
- Acceptance criteria
  - Start Live Match works end‑to‑end for guests offline.
  - All quotas are respected.
  - No server call paths are taken while unauthenticated.

B. Live Match (guest) behavior [High Priority]
- Avoid server match‑state APIs when unauthenticated:
  - Disable calls to `matchesApi.*` that require auth (start/pause/resume/end period APIs).
  - Use local clock and context state to control timer and timeline (already present in MatchContext).
  - Record timeline events locally via existing event pipeline.
- Acceptance criteria
  - Guest can add events and see them in the timeline in real time.
  - Period changes update the clock locally (no backend dependency).

C. Friendly Upgrade UX [Medium]
- When a limit is hit, show a CTA modal/toast: “Create a free account to continue”.
- Place upgrade prompts near:
  - Creating a second team/match.
  - Adding the 16th player.
  - Adding the 51st non‑scoring event.
  - Attempting the 11th formation change.

D. Claiming Data After Signup [Phase 2]
- Import Orchestrator (client‑driven):
  - Order: seasons → teams → players → matches → lineup → events → awards (if any).
  - Build local→server ID map; update local references after create.
  - Mark outbox cleared/synced.
- Acceptance criteria
  - After registration/login, running “Import My Data” pushes all local content to the server without duplicates for the new user.
  - Optional safety: confirmation with counts before import.

E. Optional Server Import Endpoint [Phase 2+]
- Single API to accept a bundle and return ID mapping. Nice‑to‑have to simplify client work.

---

## Import (Claiming Guest Data)

### Import Flow
- **Trigger**: ImportPromptModal appears automatically after login if guest data is detected
- **Detection Method**: Scans IndexedDB for ANY data with `created_by_user_id` starting with "guest-"
- **Sources Checked**:
  - Main tables: seasons, teams, players, matches, events
  - Outbox: unsynced operations waiting for server sync
- **Import Order**: seasons → teams → players → matches (via quickStart) → events → lineups → match state

### Guest Data Detection (`getGuestDataSummary`)
```typescript
// Pattern-based detection - no localStorage dependency
const isGuestId = (id: string) => id && id.startsWith('guest-');

// Scans ALL records in tables
const seasons = allSeasons.filter(s => isGuestId(s.created_by_user_id));
const teams = allTeams.filter(t => isGuestId(t.created_by_user_id));
// ... etc for players, matches, events

// Also checks outbox for unsynced data
const outboxItems = await db.outbox.toArray();
const guestOutboxItems = outboxItems.filter(item => isGuestId(item.created_by_user_id));
```

**Benefits of Pattern-Based Detection:**
- ✅ Works even if localStorage was cleared
- ✅ Handles multiple guest IDs (e.g., after data clear/restart)
- ✅ No dependency on specific guest ID being available
- ✅ Detects data in both main tables and outbox

### Import Process (`runImport`)
1. **Data Collection**: Gathers ALL guest data using pattern matching
2. **ID Mapping**: Builds local→server ID map for relationships
3. **Sequential Import**:
   - Seasons (with year-based naming for "Demo Season")
   - Teams (including opponent teams with `isOpponent` flag)
   - Players (with team assignments via ID mapping)
   - Matches (via quickStart API with proper team/opponent setup)
   - Match State (periods, status, scores)
   - Events (with mapped team/player IDs)
   - Lineups (with mapped match/player IDs)
4. **Cleanup**: Deletes ALL guest data (uses collected guest IDs)
   - Removes from main tables
   - Clears outbox entries
   - Cleans up local live state settings

### Opponent Deduplication Strategy
- Autocomplete merges server + local opponent teams, de-duping by normalized name
- Sync engine checks for existing server team by name before creating
- Import can skip opponent-only teams and rely on quickStart opponent creation

## Edge Cases & Notes

### Data Persistence
- **IndexedDB Wiped**: Guest data is lost (by design for guests)
- **localStorage Cleared**: Guest ID is regenerated, but existing data remains detectable via pattern matching
- **Multiple Guest IDs**: Import service handles multiple guest sessions by pattern matching all "guest-*" IDs

### Quota Enforcement
- Quotas count both records in main tables AND unsynced outbox items to prevent bypass
- Goals/own_goals are deliberately unlimited to ensure scorekeeping is always possible
- Default lineups limited to one per team, saved in `settings` for guests; authenticated offline changes synced later

### Import Edge Cases
- **Empty localStorage After Login**: Import still works by scanning for "guest-*" pattern in `created_by_user_id`
- **Data in Outbox Only**: Import service checks both main tables AND outbox for complete detection
- **Mixed Guest Sessions**: If user cleared browser data and started fresh guest session, both sessions' data will be imported
- **Opponent Teams**: Handled via quickStart API, which creates opponent if needed server-side

### Known Limitations
- No multi-device sync before signup (by design)
- Guest data not backed up to cloud (use import after signup for persistence)
- Import is one-way: once imported, guest data is deleted locally

---

## Testing & QA Plan
- Unit/Integration targets
  - `guestQuota` functions with fabricated Dexie data.
  - Teams/Players create in guest mode enforce limits correctly.
  - Events pipeline blocks non‑scoring beyond 50 but allows unlimited scoring.
  - Formation changes block beyond 10.
  - Default lineup round‑trip in guest mode via `settings`.
- Manual flows
  - Fresh profile: quick start path creates team/match locally and opens live screen.
  - Add >50 non‑scoring events → blocked with upgrade CTA; goals still allowed.
  - Create 16th player → blocked with upgrade CTA.
  - Apply >10 formation changes → blocked with upgrade CTA.
  - Awards/Statistics remain gated to login.

---

## Developer Reference (Files Changed/Added)

### Core Guest Infrastructure
- **Added**
  - `frontend/src/utils/guest.ts` - Guest ID generation and detection
  - `frontend/src/utils/guestQuota.ts` - Quota limits and enforcement

### Import & Data Migration (Updated 2025-12-02)
- **Updated**
  - `frontend/src/services/importService.ts` - Pattern-based guest data detection and import
    - `getGuestDataSummary()`: Scans for ANY guest-formatted IDs (no localStorage dependency)
    - `runImport()`: Imports ALL guest data using pattern matching
    - Cleanup: Deletes all guest data using collected guest IDs
  - `frontend/src/components/ImportPromptModal.tsx` - Refactored to use shared modal styling
  - `frontend/src/components/SignupPromptModal.tsx` - Refactored to use shared modal styling
- **Added**
  - `frontend/src/components/PromptModal.css` - Shared centered modal styling with dark theme support

### Data Layer & Storage
- **Updated**
  - `frontend/src/db/indexedDB.ts` - Guest ID tagging + event quota enforcement
  - `frontend/src/contexts/MatchContext.tsx` - Pre-check + toast for quota violations
  - `frontend/src/services/realTimeService.ts` - Guest author ID in outbox
  - `frontend/src/services/api/defaultLineupsApi.ts` - Guest fallback to settings table
  - `frontend/src/services/api/formationsApi.ts` - Guest formation quota + local cache
  - `frontend/src/services/api/teamsApi.ts` - Guest list/create local (enforce 1 team)
  - `frontend/src/services/api/playersApi.ts` - Guest create local (enforce 15 players/team)

### Routing & UI
- **Updated**
  - `frontend/src/App.tsx` - Routing gates (open/locked pages)
  - `frontend/src/pages/HomePage.tsx` - Guest quick start flow

---

## Configuration & Feature Flags
- Quotas are set in `frontend/src/utils/guestQuota.ts`.
- Guest detection is via `authApi.isAuthenticated()`; any page can branch as needed.

---

## Modal UX Implementation (2025-12-02)

### Shared Modal Design
Both `ImportPromptModal` and `SignupPromptModal` now use a shared CSS file (`PromptModal.css`) for consistent UX:

**Visual Style:**
- Centered overlay (not bottom sheet)
- Max width: 500px (90% on mobile)
- Auto height with 90% max
- 16px border radius
- Backdrop dimming

**Dark Theme Support:**
- Uses `.dark-theme` class selector (respects in-app theme toggle)
- No longer uses OS-level `prefers-color-scheme`
- Proper contrast for all text and surfaces
- Consistent with app-wide theme system

**Structure:**
```css
.prompt-modal          /* Modal container */
.prompt-container      /* Inner wrapper */
.prompt-header         /* Header with title and close button */
.prompt-content        /* Main content area */
.prompt-buttons        /* Button container */
.prompt-progress       /* Progress indicator (import only) */
.prompt-success        /* Success message (import only) */
```

**Benefits:**
- ✅ Consistent UX across all prompt modals
- ✅ Easier maintenance (single CSS file)
- ✅ Proper dark theme support
- ✅ Responsive design (mobile-first)

---

## Future Enhancements
- Complete guest Quick Match local flow (A + B above)
- Add "Import My Data" entry point post‑login with progress UI and summary
- Consider a one‑shot `/import` endpoint to streamline mapping server‑side
- Optional: add telemetry for quota hits (local only) to inform UX decisions
- Add animation/transitions to modal appearance

---

## Glossary
- **Guest Mode**: Unauthenticated usage with local‑only storage
- **Guest ID**: Stable identifier format "guest-{uuid}" stored in localStorage
- **Pattern-Based Detection**: Identifying guest data by checking if `created_by_user_id` starts with "guest-"
- **Outbox**: IndexedDB queue used when realtime/network fails; replayed later
- **Import**: Process of migrating guest data to authenticated user account
- **Degraded Stats**: Backend returns 200 with zeros so homepage still renders; frontend prefers cached stats
