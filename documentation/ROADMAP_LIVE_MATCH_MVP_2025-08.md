# Live Match MVP Roadmap (Aug 2025)

Owner: YOU (primary user, mobile-first)
Scope: Backend is functional; frontend has Seasons, Teams, Players. This roadmap re-centers the app on rapid live event capture during matches, while keeping the existing look/feel, components, and themes.

## Primary Goal
Enable a coach to start recording match events on the touchline in under 30 seconds, with minimal prerequisites.

## Progress Update (2025-08-11)

Delivered
- Home Quick Start card: collapsible header with “Click here to get started…”, centered layout (max width ~560px), reduced surrounding padding, removed redundant section title above the card, and bold headings with inputs underneath to mirror ContextMenu styling.
- New fields: Duration (mins, default 50) and Periods (Quarters/Halves). Payload now includes durationMinutes and periodFormat.
- Kickoff UX: switched to MUI DatePicker + TimePicker, and merge to a single ISO timestamp for the API (consistent with our CreateSeasonModal date usage).
- CreateTeamModal callback: onCreated now returns the created team to parents; Home Quick Start uses it to auto-insert and select the new team immediately.
- Opponent teams groundwork: Added backend GET /api/v1/teams/opponents (search optional, returns only is_opponent=true for the current user) and frontend teamsApi.getOpponentTeams(). Home page Opponent input converted to a freeSolo Autocomplete that we’ll wire to this endpoint next.
- Backend Quick Start extensions: matchQuickStartSchema accepts durationMinutes and periodFormat. MatchService.createQuickStartMatch persists these values with sensible defaults.

Proposed Follow-ups
- Opponent Autocomplete wiring
  - Debounced search to /teams/opponents as user types; show options and loading states; allow selection or free text. Only return opponents (is_opponent=true). If free text doesn't match, treat as new opponent.
- My Team input consistency
  - Replace native select with MUI Select or Autocomplete for consistent rounded corners, keyboard support, and shared styling with ContextMenu.
- Venue/Home-Away and layout polish
  - Ensure Venue heading is bold and lay Venue + Periods on the same row with consistent spacing. Consider MUI ToggleButtonGroup for Home/Away while keeping current behavior, or keep IonButtons with adjusted styles for parity.
- Kickoff polish
  - Unify MUI pickers’ theme with design tokens; consider 12/24-hour setting; prevent mobile keyboard pop; basic validation (e.g., warn if kickoff in the past when scheduling).
- Card chrome alignment
  - Mirror ContextMenu chrome exactly (border thickness/color across light/dark), extract shared CSS variables/utilities so both components use the same tokens.
- Testing
  - Add integration tests for Quick Start flow, including payload composition, date/time merge logic, and navigation to live console. Add unit tests for Autocomplete behavior (debounce, option selection vs free text).
- Future (not required now)
  - Opponent colors (editing and display), optional opponent players, and “Start without signing in” offline quick match mode.

## Core Decisions (Updated)
- Matches require both home_team_id and away_team_id referencing Team.id. Events can reference team_id and player_id but do not have to.
- Introduce Team.is_opponent (boolean, default false):
  - true = opponent team created from match flow; do not show on Teams management page
  - false = team you manage; appears in Teams management
- Team.name is NOT globally unique in the database (and shouldn’t be). Multiple users can have their own "Arsenal".
  - We will not suffix names (no "(ext)").
  - For find-or-create behavior, we scope by created_by_user_id for teams you manage, and also scope opponent teams to the current user.
- History and stats should always show the proper opponent name. Because we create real Team rows for opponents, you can later filter match history vs a specific team.
- We will reuse the existing MatchContext as the foundation for the Live Match Console v1 and build the polished UI on top of it.

## Local "Quick Match" (Offline-first)
- When not logged in, allow "Start without signing in" from the Home page:
  - Store a local-only match in IndexedDB (with a temp local ID, full opponent name, clock state, events, etc.).
  - Use existing outbox/sync utilities to queue events.
  - On sign-in, a sync job will:
    1) Find-or-create your managed team (if created inline) with is_opponent=false
    2) Find-or-create the opponent team (is_opponent=true)
    3) Create the match in the backend with real UUIDs
    4) Transform and upload queued local events with new IDs
    5) Reconcile local IDs and mark as synced

## Product Experience Changes

### 1) Home Page Reframe (mobile-first)
- Top: Quick Start a Live Match
  - Primary CTA: "Start Live Match"
  - Sub-actions: "Schedule a Match" and "Open Calendar"
- Second: Upcoming & In-Progress (cards sorted by kickoff time; grouped Today/This Week/Future; actions: Start/Resume/View)
- Third: Management (Seasons, Teams, Players, Awards, Statistics) — consistent theme tokens

### 2) Quick Start Flow (30-second path)
- Minimal form:
  - My Team: dropdown (required) + inline create (name only)
  - Opponent: free text (optional; default: "Unknown Opponent")
  - Home/Away: toggle
  - Kickoff: defaults to now (editable)
  - Season: auto-current if present; otherwise offer quick create (e.g., "2025-2026")
- Submit → Create match (auto-creating opponent team with is_opponent=true for you) → Navigate to Live Match Console
- If logged out → Create local-only match in IndexedDB and go straight to Live Console; sync later on login

### 3) Match Calendar Page
- Month grid at top, list below
  - Click date → quick match dialog prefilled with date/time
  - Color stripes for your teams (theme tokens)
  - List shows upcoming then past, infinite scroll/pagination as needed
- Filters: Team, Season, Competition
- Row actions: Start/Resume, Edit, View

### 4) Live Match Console v1 (reusing MatchContext)
- Header: Scoreboard (Home v Away, time/period controls)
- Two team columns:
  - Your team: big buttons by positional grouping; long press/gestures for alternates
  - Opponent: big buttons for common events (goal, foul, shot) — player optional
- Timeline bottom sheet: recent events, UNDO last, quick edit
- Player picker: search + quick add inline (defaults; details later)
- Utility: voice-to-text notes (reuse useSpeechToText)
- Offline-first: queue events and show sync status

## Backend Additions

### A) Quick Start Match API
- Endpoint: POST /api/v1/matches/quick-start
- Body:
  - myTeamId?: string
  - myTeamName?: string (create managed team if id not provided; is_opponent=false)
  - opponentName?: string (default "Unknown Opponent", is_opponent=true)
  - isHome: boolean (required)
  - kickoffTime?: string (ISO; default now)
  - seasonId?: string (or auto-detect current)
  - competition?: string
  - venue?: string
- Behavior:
  1) Resolve myTeam: if myTeamId, verify ownership; else find-or-create managed team for current user
  2) Resolve opponent: find-or-create opponent team by name for current user (is_opponent=true)
  3) Assign home/away by isHome
  4) Determine season (supplied or current)
  5) Create match and return details

### B) Convenience Feeds
- GET /api/v1/matches/upcoming?limit=10&teamId=...
- GET /api/v1/matches/recent?limit=10&teamId=...
- Backed by MatchService.getUpcomingMatches and getRecentMatches

### C) Team listing behavior
- TeamService.getTeams: default filter to is_deleted=false AND is_opponent=false.
- Optionally allow includeOpponents=true for admin/debug tools later.

## Frontend Additions

### A) API client methods
- matchesApi.quickStartMatch(payload)
- matchesApi.getUpcomingMatches({ limit, teamId })
- matchesApi.getRecentMatches({ limit, teamId })

### B) HomePage updates
- Quick Start card + Upcoming/In-Progress using new endpoints
- "Start without signing in" → local-only mode

### C) Match Calendar page
- Route: /calendar (month grid + list, click-to-create)

### D) Live Match Console v1
- Route: /live/:matchId
- Components: ScoreboardHeader, TeamColumn, EventTimeline, PlayerQuickAddModal
- Uses existing MatchContext as state backbone

## Handling Opponent Players
- MVP: Opponent events can omit playerId to avoid cluttering your managed Players.
- Later: Allow opponent players to be created with is_opponent flags as well, if you want persistent tracking per opponent.

## Schema Notes
- Team.is_opponent boolean (default false)
- Team.name is not unique globally (and should not be). We find-or-create teams per user where appropriate.
- No reliance on soft delete to hide opponents; is_opponent handles visibility intent clearly.

## Risks & Mitigations
- Duplicate names across users (e.g., many "Arsenal")
  - Mitigation: Scope opponent/managed creation to current user; in UI, allow optional disambiguators (badge, created date, or context)
- Ambiguity in filters when users have multiple identically-named opponents
  - Mitigation: Support filtering by teamId and surface name + subtle context when needed
- Mobile UI complexity
  - Mitigation: Large targets, minimal taps, progressive disclosure

## Implementation Plan (Phased)

Phase 0 — Prep (schema + service alignment)
- [ ] Add Team.is_opponent to Prisma/DB (if not already present); ensure Team.name is not unique in Prisma
- [ ] Update transformers and types to map is_opponent
- [ ] TeamService.getTeams to filter is_opponent=false by default
- [ ] Add endpoints: GET /matches/upcoming, GET /matches/recent
- [ ] Draft POST /matches/quick-start

Phase 1 — Quick Start & Home
- [ ] Frontend: add quickStartMatch API
- [ ] Home: Quick Start card, Upcoming section
- [ ] Logged-out local-only quick match → Live Console route

Phase 2 — Calendar
- [ ] New Calendar page with month grid + list
- [ ] Click-to-create flow

Phase 3 — Live Console v1
- [ ] Scoreboard/time controls
- [ ] Team columns with big action buttons
- [ ] Timeline with UNDO
- [ ] Quick event posting; offline queue

Phase 4 — Polishing
- [ ] Theming cohesion
- [ ] Performance and gestures
- [ ] Telemetry for event latency and error rates

## Acceptance Criteria (MVP)
- Can start a match from Home in < 30 seconds and record immediately
- Opponent teams do not appear on Teams page (is_opponent=true)
- Recorded events persist locally and to cloud (when authenticated)
- Upcoming matches appear on Home and Calendar
- iOS PWA friendly; offline-tolerant with queued events and later sync

## Appendix: API Specs

1) POST /api/v1/matches/quick-start
Request:
{
  "myTeamId": "uuid" | null,
  "myTeamName": "string" | null,
  "opponentName": "string" | null,
  "isHome": true,
  "kickoffTime": "2025-08-10T10:00:00Z" | null,
  "seasonId": "uuid" | null,
  "competition": "string" | null,
  "venue": "string" | null
}
Response: Match

2) GET /api/v1/matches/upcoming?limit=10&teamId=uuid
Response: Match[]

3) GET /api/v1/matches/recent?limit=10&teamId=uuid
Response: Match[]

Notes:
- All endpoints require auth for cloud-backed operations; local-only quick match works offline and syncs on login.
