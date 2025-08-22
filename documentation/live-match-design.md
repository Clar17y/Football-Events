# Live Match – Mobile UX, Flows, and Data

This document captures the agreed UX, flows, offline behavior, and component breakdown for the Live Match feature.

## Key Decisions

- Sentiment range: -3 .. +3 (default 0).
- `player_id` may be null for opponent events (no dummy needed).
- Notes: editable before and after completion.
- Deletion: allowed until match COMPLETED; blocked afterward (soft-delete API).
- Final scores: client submits `our_score`/`opponent_score` with `/complete`.
- On-pitch ordering: local-only per match (until dedicated lineups).
- Viewers: start with polling; SSE/WebSockets later.

## Information Architecture

- Single route: `/live/:matchId` (or `/live` → nearest upcoming).
- Tabs (mobile):
  1) Controls – timer, state/period controls, switcher, basic context.
  2) Events – quick-add pad + reverse-chronological timeline.
  3) Overview – location, competition, kickoff, period format.
- Anonymous/unauthorized users: read-only UI + polling, no controls.

## Header & Match Switcher

- Header: home logo+name | large score | away logo+name. Status chip underneath.
- Sub-row: venue • competition • kickoff datetime.
- Stoppage badge: show "+x" when elapsed > regulation minutes in a period (display-only).
- Switcher: left/right chevrons for upcoming list; tap center title opens bottom-sheet picker.

## State, Periods, and Timer

- Kick Off → POST `/api/v1/matches/:id/start` (server creates first period); timer starts.
- Pause → POST `/pause`; Resume → POST `/resume`.
- End Period → POST `/periods/end`; timer resets to 00:00.
- Start Next Period → POST `/periods/start` (auto type by `period_format`, or `EXTRA_TIME`).
- After final regulation period (paused): show Extra Time and Complete.
- Extra Time: default 2 periods; option to select 1 if needed.
- Complete → POST `/complete` with `{ our_score, opponent_score }`.

## Events – Quick Add, Sentiment, Notes

- Team selector: sticky Home/Away pills.
- Quick-add grid (one-tap creates with sentiment 0): key_pass, save, interception, tackle, foul, free_kick, ball_out.
- Detail sheets:
  - Goal / Own goal: optional player picker; own_goals increment opponent UI score.
  - Penalty: represents taker; converted pen is a separate Goal (existing linking associates with Foul).
  - Assist: separate event; surface "Add assist?" CTA in goal snackbar.
- Sentiment:
  - Snackbar after add: [-] [0] [+] to set quickly; Undo included (5s).
  - Swipe on timeline chip: left=-1, right=+1 (bounded -3..+3).
  - Details sheet slider: -3..+3.
- Notes: editable in details sheet anytime (pre/post completion).
- Opponent events: allow `player_id = null`.

## Timeline

- Reverse chronological; grouped by period (e.g., 1st Half, 2nd Half, ET1).
- Each chip: icon, minute, team color accent, player (if any), sentiment badge (if != 0).
- Actions (authorized): delete (blocked after COMPLETED), edit notes, adjust sentiment.

## Offline & Sync

- IndexedDB queues per match (FIFO): state changes, period start/end, event create/delete.
- Optimistic apply; replace temp_ids on sync success.
- Conflict examples: resuming after completion ⇒ reject with toast, refresh server state.
- Timekeeping: store `period_local_start_at` + `pause_offset_ms`; compute `clock_ms` at event creation.

## Data Contracts (Client → Server)

- Event create:
  - `match_id: uuid`
  - `period_number: integer`
  - `clock_ms: integer` (ms since period start)
  - `kind: event_kind`
  - `team_id: uuid`
  - `player_id: uuid | null`
  - `notes?: string`
  - `sentiment: integer` (-3..+3, default 0)
  - `temp_id: string`
- Event delete: `DELETE /api/v1/events/:id` (server soft-deletes).
- Match lifecycle:
  - `POST /start`, `POST /pause`, `POST /resume`, `POST /periods/start`, `POST /periods/end`,
  - `POST /complete` with `{ our_score, opponent_score }`.

## Components (Client)

- `LiveMatchPage` (route handler, tabs, data fetching)
- `MatchHeader` (logos, names, score, status, stoppage)
- `MatchSwitcher` (chevrons + bottom-sheet)
- `MatchTimer` (server-synced base, pause/resume, stoppage display)
- `ControlsBar` (Kick Off, Pause/Resume, End Period, Extra Time, Complete)
- `EventsQuickPad` (team pills, event grid)
- `EventPlayerPickerSheet` (roster, on-pitch toggle, sort)
- `SentimentSnackbar` ([-][0][+], Undo)
- `EventsTimeline` (grouped list, swipe sentiment/delete)
- `EventDetailSheet` (notes, slider -3..+3, delete)

## Low-Fi Wireframes (ASCII)

Controls Tab

  [MatchMaster]                          [Profile ⚫︎] [🌙]
  [Home Logo] Home      0 - 0     Away [Away Logo]
         [LIVE]   Venue • Competition • Kickoff

  [Period: 1st Half]         [+2]
  [      12:34      ]  (large timer)

  [ Kick Off ]  [ Pause/Resume ]  [ End Period ]
  [ Extra Time ] [ Complete ]   (contextual visibility)

Events Tab

  [ Home ]  [ Away ]  (team selector)

  [ goal ] [ assist ] [ key_pass ] [ save ]
  [ tackle ] [ intercept ] [ foul ] [ free_kick ]
  [ ball_out ] [ own_goal ] [ penalty ]

  Snackbar:  Event added  [ - ] [ 0 ] [ + ]   [Undo]

  Timeline (reverse):
   ET2  03'  ⚽  Goal — Player A (H)    [ +1 ]
   90+2' 🟨 Foul — Player B (A)         [ -1 ]
   87'   🎯 Key pass — Player C (H)     [  0 ]

Overview Tab

  Venue, Address
  Competition: …
  Kickoff: …
  Format: Halves / Quarters, duration

## Task Slices & Acceptance Criteria

1) Routing & Access
   - `/live` and `/live/:matchId`, default nearest upcoming. Read-only for anonymous.
   - AC: Anonymous sees polling updates; no controls visible.

2) Header & Switcher
   - Header with score/status/stoppage; chevrons + bottom-sheet picker.
   - AC: Switching updates all tabs without reload.

3) Controls Scaffold
   - Timer UI + contextual buttons (no wiring yet).
   - AC: State-driven enabling/visibility matches spec.

4) Timer & State Wiring
   - Wire start/pause/resume/periods/create/end/complete.
   - AC: Timer behavior conforms; transitions optimistic with rollback.

5) Events Quick Pad + Snackbar
   - One-tap creation, team pills, sentiment snackbar [-][0][+], Undo.
   - AC: Event appears instantly; own_goal updates opponent score.

6) Player Picker & Assist CTA
   - Optional player select; assist prompt after goal.
   - AC: Opponent events work with `player_id=null`.

7) Timeline (Grouped) + Gestures
   - Reverse chronological, group by period; swipe sentiment/delete.
   - AC: Bounds -3..+3; delete blocked after COMPLETED.

8) Offline Queue Extensions
   - IndexedDB actions for match/period/events; FIFO per match.
   - AC: Airplane-mode session syncs correctly on reconnect.

9) Completion & Score Persist
   - Compute totals; send with `/complete`; reflect persisted values.
   - AC: Header shows stored `our_score`/`opponent_score` after completion.

10) Viewer Polling
   - Foreground 5–10s, background 10–15s with backoff.
   - AC: Updates within interval; minimal load.

