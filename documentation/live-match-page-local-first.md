# LiveMatchPage — Local‑First (Offline‑First) Behavior

This document describes how `frontend/src/pages/LiveMatchPage.tsx` works after the local‑first refactor: what data is stored in IndexedDB (Dexie), how the timer/timeline are derived, and how background sync keeps the server up to date.

## Goals and Core Rules

- **IndexedDB (Dexie) is the UI source of truth** for live match state in coach/auth and guest modes.
- **All writes go to Dexie first** and are marked `synced: false`.
- **Background sync pushes unsynced rows** to the backend when online/authenticated.
- **Sync code must call the server directly** (via `apiClient`) and must *not* call local‑first APIs (like `eventsApi.create`) to avoid “sync creates more local rows” feedback loops.

## Operating Modes

### 1) Authenticated coach (writer)

- **Reads:** Dexie tables via `useLiveQuery` hooks (`frontend/src/hooks/useLocalData.ts`).
- **Writes:** local‑first data layers/APIs:
  - events: `eventsApi.create|update|delete` → writes `db.events`
  - match state: `matchStateDataLayer.upsert` → writes `db.match_state`
  - periods: `matchPeriodsDataLayer.create|endPeriod` → writes `db.match_periods`
  - formation changes: `formationsApi.applyChange` → writes a local `formation_change` row into `db.events`
- **Sync:** `frontend/src/services/syncService.ts` periodically flushes `synced:false` rows to the server.
- **Server pull (snapshot):** on match selection, `LiveMatchPage` fetches server `match_state`, `match_periods`, and `events` and caches them into Dexie to support “join on another device” and reloads.

### 2) Guest (local‑only writer)

- **Reads/Writes:** Dexie only.
- **No background sync** to the server until an explicit “import guest data” flow exists (guests are excluded from sync by `created_by_user_id` prefix checks).

### 3) Viewer link (read‑only, SSE)

- **Does not use Dexie for live state.** Viewer mode uses an SSE `EventSource` (`viewerApi.openEventSource`) that streams a `snapshot` plus incremental events/state updates.
- Viewer mode is a “server‑real‑time feed”, not offline‑first.

## Local Tables Used by LiveMatchPage

All are in the `grassroots_db` IndexedDB database (Dexie).

### `events`

Key fields used by LiveMatchPage:
- `id` (UUID, local‑generated)
- `match_id`
- `period_number`
- `clock_ms`
- `kind` (includes regular kinds like `goal` and also `formation_change`)
- `team_id`, `player_id`, `notes`, `sentiment`
- `synced` + `synced_at`
- soft delete fields (`is_deleted`, `deleted_at`, `deleted_by_user_id`)

### `match_periods`

Key fields:
- `id` (currently local UUID for local‑created periods)
- `match_id`
- `period_number`, `period_type`
- `started_at`, `ended_at`, `duration_seconds`
- `synced` + `synced_at`

### `match_state`

Key fields:
- `match_id` (primary key)
- `status`: `NOT_STARTED | LIVE | PAUSED | COMPLETED`
- `current_period_id`
- `timer_ms` (see timer model below)
- `last_updated_at` (timestamp used to “catch up” time after reload)
- `synced` + `synced_at`

## How the Page Gets Timer + Timeline Data

### Reactive reads (local‑first)

In coach/auth and guest modes, `LiveMatchPage` subscribes to Dexie via:
- `useLocalMatchState(selectedId)`
- `useLocalMatchPeriods(selectedId)`
- `useLocalEvents(selectedId)`

When any of these tables change (local write or background sync), `useLiveQuery` re-runs and React updates automatically.

### Timer model (important)

The timer shown on the page is derived from `match_state`:

- `match_state.timer_ms` is the **base clock** saved at `match_state.last_updated_at`.
- When `status === 'LIVE'`, the displayed clock is:
  - `timer_ms + (Date.now() - last_updated_at)`
- When `status !== 'LIVE'`, the displayed clock is just:
  - `timer_ms`

The UI ticks with `requestAnimationFrame`, but it does **not** persist the timer every frame. Instead, the app persists `timer_ms` on state transitions (kickoff/pause/resume/end period/complete), and reconstructs the live clock on reload using `last_updated_at`.

### Timeline model

The timeline feed is built from:
- Local `events` rows for the match
- Synthetic “system” items derived from `match_periods` (period started/ended)

For viewers, the timeline is driven by SSE snapshots + incremental SSE events.

## Initial “Hydration” / Pull from Server (Authenticated Coach)

There are two distinct pull mechanisms:

1) App‑wide cache refresh (reference data)
- `useInitialSync()` triggers `refreshCache()` when online and authenticated.
- This populates/refreshes reference tables (teams/players/seasons/player_teams/default_lineups) and caches recent matches.

2) Match‑specific live snapshot (temporal data)
- When a match is selected (and not in viewer mode), `LiveMatchPage` calls:
  - `matchesApi.getMatchState(matchId)`
  - `matchesApi.getMatchPeriods(matchId)`
  - `eventsApi.getByMatch(matchId)`
- The responses are **written into Dexie** (`match_state`, `match_periods`, `events`) so the local‑first UI can render from IndexedDB.
- To avoid clobbering offline edits, the snapshot write **skips overwriting** local rows that are currently `synced: false` (but see “Known Limitations” for period IDs).

This snapshot pull is a one‑time seed on match selection; it is not a continuous real‑time subscription for coaches.

## How Writes Happen (Local‑First)

### Events (goal, etc.)

Authenticated:
- `eventsApi.create(payload)` writes an event row to `db.events` with `synced:false` and returns immediately.

Guest:
- Writes directly via `db.addEventToTable(...)` (still `synced:false`).

Duplicate prevention:
- The quick‑add flow has a re‑entry guard (`addingEventRef`) to prevent double‑submits creating two local UUID events.

### Match lifecycle (kickoff/pause/resume/end period/complete)

All match lifecycle actions in `LiveMatchPage` write to Dexie via:
- `matchPeriodsDataLayer.create|endPeriod`
- `matchStateDataLayer.upsert`

This enables full offline operation:
- UI updates immediately
- sync later pushes the state transitions/periods to the server

### Formation changes (LineupManagementModal)

- `formationsApi.applyChange(...)` writes a local `formation_change` event into `db.events`.
- The event `notes` contains JSON (`{ reason, formation, prevFormation }`) so the timeline can remain informative offline.
- Background sync has a special case for `formation_change` events that calls `POST /matches/:id/formation-changes` on the server.

## Background Sync (Push to Server)

### When sync runs

- `syncService.start()` runs a periodic flush (default 15s) and also flushes on the browser `online` event.
- `flushOnce()` is **single‑flight** (guarded by an in‑memory lock) to prevent parallel flushes.
- Sync only runs when:
  - `navigator.onLine === true`
  - `apiClient.isAuthenticated() === true`
  - and guest data import is not pending

### Event sync and UUID parity (no reconciliation)

Events are local UUIDs. To avoid “server created a different ID”, the backend now supports client‑provided IDs:

- Create:
  - `POST /events` accepts optional `id` (UUID)
  - If `id` already exists (and not deleted), the backend returns the existing event (idempotent)
- Upsert:
  - `PUT /events/:id` supports “create if missing” when the request body includes the full required fields (notably `matchId`)

Sync uses:
- UUID ids → `PUT /events/:id` (idempotent, supports retries)
- Non‑UUID legacy ids → falls back to `POST /events` (best‑effort)

### Formation change sync idempotency

For `formation_change` events:
- Sync calls `POST /matches/:id/formation-changes` and passes `eventId` (the local UUID).
- The backend treats `eventId` as an idempotency key:
  - If an event already exists with that id, it returns success without reapplying the formation.

## Investigation Findings (Bugs and Fixes)

### 1) “Sync created a ton of events in IndexedDB”

Root cause:
- `SyncService.syncEvents()` was calling the **local‑first** `eventsApi.create()`.
- That wrote a brand new local event row during sync, which then triggered another sync, causing runaway growth and duplicate events.

Fix:
- `syncEvents()` now calls server endpoints directly through `apiClient` and only marks the existing local row as synced on success.

### 2) “Goal event inserted twice locally”

Root cause:
- The quick‑add confirm flow could be entered twice (double tap / modal re-entry), generating two UUID events with the same logical content.

Fix:
- Added a re‑entry guard (`addingEventRef`) around the confirm handler.

### 3) Parallel flushes

Root cause:
- The sync “running” lock was set too late, allowing two `flushOnce()` calls to overlap and amplify issues.

Fix:
- `flushOnce()` sets the lock immediately at the start.

## Known Limitations / Follow‑Ups

### Match periods do not yet have ID parity

- Local‑created periods use a local UUID (`matchPeriodsDataLayer.create`).
- Server endpoints that start/import periods currently create their own server ids.
- When the authenticated snapshot pull runs, it upserts server periods by **server id**, which can lead to **duplicate `match_periods` rows** locally after reload (same `period_number`, different `id`).

Recommended fix options:
- Add client period IDs end‑to‑end (backend accepts `id`, sync sends it), or
- Deduplicate server periods into local ones by a natural key (e.g., `match_id + period_number + period_type + started_at`) during snapshot caching.

### Coach mode is not real‑time multi‑user yet

- Authenticated coach UI currently does not subscribe to server updates (no SSE/WS “pull” like viewer mode).
- Another device’s edits will not appear until a snapshot pull occurs (reload / reselect match / future polling).

## Future Multi‑User Concept (What Would Need to Change)

Events:
- With UUID ids + idempotent server create/upsert, concurrent event creation is fundamentally safe (no ID collisions).
- Missing piece is “pull”: SSE/WS or polling to apply remote events into Dexie (with dedupe by `id`).

Match state + periods:
- Multi‑writer conflicts are likely (two users pausing/resuming/ending periods).
- A future-safe approach is to make the server authoritative using operation sequencing (commands) + versioning, and stream the authoritative state to all clients (SSE/WS).

## Debugging Tips

- Inspect IndexedDB: DevTools → Application → IndexedDB → `grassroots_db` → `events`, `match_periods`, `match_state`.
- Look for pending work: filter for `synced === false` rows.
- If tables are missing after schema changes, a hard reload / clearing IndexedDB may be required to re-run Dexie migrations.

