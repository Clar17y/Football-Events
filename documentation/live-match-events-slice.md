# Live Match – Events Slice (Quick Add)

Scope
- Add quick‑add pad for core event kinds and a simple sentiment/undo snackbar.
- Team selector (Home/Away) to assign team_id.
- Use current period and clock to populate period_number and clock_ms.

Implementation
- Route: Reuses `LiveMatchPage` and renders Events pad under controls for now (tabs to follow).
- API: `frontend/src/services/api/eventsApi.ts` with `create` and `delete`.
- Create payload (EventCreateRequest): matchId, periodNumber, clockMs, kind, teamId, playerId (null), sentiment (default 0).
- Undo: calls DELETE `/events/:id` if the server returned an id.
- Sentiment: v1 UI shows [-][0][+] HUD; storing custom value is deferred (defaults to 0 on create).

Notes
- Opponent events allow `playerId = null`.
- Requires authentication to create; buttons disabled for anonymous viewers.
- Future: add player picker, assist CTA, offline queue with IndexedDB, timeline with grouping, and scoreboard derivation.
