# Guest Mode (Local‑First) — Design, Limits, and Implementation Status

**Last Updated:** 2025-01-26
**Status:** ✅ **Production-Ready** - All critical issues resolved

This document specifies the "Guest Mode" feature that enables first‑time users to explore, record a quick match, and try lineup tools without creating an account. It covers design goals, data flow, quotas, what's implemented, and everything needed to finish the work.

## Recent Updates (2025-01-26)

### ✅ Critical Bug Fixes
- **CreateMatchModal**: Fixed seasonId validation and UI for guests
- **API Fallbacks**: Added guest fallbacks to `getActiveTeamPlayers()` and `getPlayerStats()`
- **Auth Guards**: Added explicit guards in MatchesPage to prevent 401 errors
- **GuestBanner**: Added to all relevant pages including SeasonsPage

### ✅ UX Improvements
- **Pre-submit Quota Checks**: Added to CreatePlayerModal and CreateTeamModal
- **Opponent Search**: Enabled autocomplete for guests in HomePage
- **Settings Cleanup**: Proper cleanup of orphaned state on match deletion

### ✅ Data Integrity
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
- Import orchestrator (post-login prompt) now available.
- Order: seasons → teams → players → matches (via quickStart heuristic) → events (replayed for new matches).
- Opponent dedup strategy:
  - Autocomplete merges server + local opponent teams and de‑dups by normalized name to avoid creating duplicates.
  - Sync engine checks for existing server team by name before creating offline teams.
  - Import can optionally skip opponent‑only teams and rely on quickStart opponent creation.

## Edge Cases & Notes
- If local storage is wiped, guest data is lost (by design for guests).
- Quotas count both events in events table and unsynced outbox items to prevent bypass.
- Goals/own_goals are deliberately unlimited to ensure scorekeeping is always possible.
- Default lineups are limited to one per team (by implementation choice) and saved in `settings` for guests; authenticated offline changes are synced later.

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
- Added
  - `frontend/src/utils/guest.ts`
  - `frontend/src/utils/guestQuota.ts`
- Updated
  - `frontend/src/db/indexedDB.ts` (guest id + event quota enforcement)
  - `frontend/src/contexts/MatchContext.tsx` (pre‑check + toast)
  - `frontend/src/services/realTimeService.ts` (guest author id in outbox)
  - `frontend/src/services/api/defaultLineupsApi.ts` (guest fallback to settings)
  - `frontend/src/services/api/formationsApi.ts` (guest formation quota + local cache)
  - `frontend/src/services/api/teamsApi.ts` (guest list/create local)
  - `frontend/src/services/api/playersApi.ts` (guest create local; enforce limits)
  - `frontend/src/App.tsx` (routing gates)
  - `frontend/src/pages/HomePage.tsx` (guest quick start currently opens lineup demo)

---

## Configuration & Feature Flags
- Quotas are set in `frontend/src/utils/guestQuota.ts`.
- Guest detection is via `authApi.isAuthenticated()`; any page can branch as needed.

---

## Future Enhancements
- Complete guest Quick Match local flow (A + B above).
- Add “Import My Data” entry point post‑login with progress UI and summary.
- Consider a one‑shot `/import` endpoint to streamline mapping server‑side.
- Optional: add telemetry for quota hits (local only) to inform UX decisions.

---

## Glossary
- Guest Mode: Unauthenticated usage with local‑only storage.
- Outbox: IndexedDB queue used when realtime/network fails; replayed later.
- Degraded Stats: Backend returns 200 with zeros so homepage still renders; frontend prefers cached stats (separate resiliency feature).
