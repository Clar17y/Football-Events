# Live Viewer Streaming (SSE) – Design and Implementation Guide

This guide specifies how to add Server‑Sent Events (SSE) for anonymous/live viewers of a match. It is self‑contained so you can start from a clean prompt with no prior context.

## Goals

- Provide real‑time, read‑only updates for ~50+ concurrent viewers per match without login.
- Keep implementation simple and robust behind common proxies/CDNs.
- Preserve privacy and access control via time‑limited viewer tokens.
- Reuse existing persisted data (events, periods, match state); avoid new DB tables unless needed later.

## Why SSE (vs WebSockets)

- One‑way streaming fits spectators: server → client updates only.
- Easier to deploy (no sticky sessions), resilient to proxies, auto‑reconnect built‑in.
- Lightweight: a single Node process comfortably handles hundreds of SSE clients.

If you need two‑way interactivity (chat, reactions), WebSocket is fine; you can add it later or run both side by side.

## High‑Level Architecture

- Authenticated recorder uses normal APIs to create events and change match state.
- SSE Publisher: server broadcasts match updates to listeners subscribed to `/api/v1/matches/:id/stream?view=<viewer_token>`.
- Viewer Token: short‑lived, match‑scoped JWT grants read‑only access to specific public GET endpoints.
- Client (anonymous viewer): connects to stream, renders a merged timeline (events + period/state markers) and live score.

## Endpoints

1) Mint Viewer Token (auth required)
- POST `/api/v1/matches/:id/share`
- Request: `{ expiresInMinutes?: number }` (optional; default e.g. 480)
- Response: `{ viewer_token: string, expiresAt: string }`
- Claims: `{ matchId, scope: 'viewer', exp }`

2) Snapshot (public/read with token)
- GET `/api/v1/matches/:id/summary?view=<token>`
  - Returns: `{ matchId, status, currentPeriod, currentPeriodType, score: { home, away }, homeTeam, awayTeam, kickoffTime }`
- GET `/api/v1/matches/:id/periods?view=<token>`
  - Returns: `{ periods: Array<{ id, periodNumber, periodType, startedAt, endedAt, durationSeconds }> }`
- GET `/api/v1/events/match/:id?view=<token>`
  - Returns: `{ events: Event[] }` (sanitized fields only; no PII)

3) SSE Stream (public/read with token)
- GET `/api/v1/matches/:id/stream?view=<token>`
  - Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  - On connect: send an initial `event: snapshot` with summary + recent events (e.g., latest 100) + periods.
  - Then push typed events: see Message Schema below.

4) Optional: Combined Timeline (server‑derived)
- GET `/api/v1/matches/:id/timeline?view=<token>`
  - Server merges periods + events into a ready‑to‑render list (useful for SSR or SEO previews).

## Message Schema (SSE Data)

Send newline‑separated frames like:

```
event: <type>
id: <monotonic-id-or-ts>
data: <json string>

```

Types and payloads:

- `snapshot`
  - `{ summary, periods, events }`
- `event_created`
  - `{ event: { id, kind, teamId, playerId, periodNumber, clockMs, sentiment, createdAt } }`
- `event_deleted`
  - `{ id }`
- `period_started`
  - `{ period: { id, periodNumber, periodType, startedAt } }`
- `period_ended`
  - `{ period: { id, periodNumber, periodType, endedAt, durationSeconds } }`
- `state_changed`
  - `{ status: 'SCHEDULED'|'LIVE'|'PAUSED'|'COMPLETED'|'CANCELLED'|'POSTPONED', currentPeriod?, currentPeriodType?, matchStartedAt?, matchEndedAt? }`
- `score_update` (optional if you derive on client)
  - `{ home, away }`
- `heartbeat`
  - `{ ts: ISOString }`

Notes:
- Keep payloads minimal; the client already knows `matchId` from the URL.
- Use ISO timestamps for times; client converts as needed.

## Security & Auth

- Viewer token is a JWT limited to a single match and read‑only scope.
- Validate `view` token in middleware for public endpoints.
- Rate‑limit public endpoints by IP + token; add CORS (only allow your frontend domains).
- Token TTL (8–24h) balances privacy and convenience; refresh by minting a new token.

## Backend Implementation Plan (Express)

1) Token minting
- Add a route: POST `/api/v1/matches/:id/share` (auth required).
- Validate user permission on that match (owner/admin).
- Sign JWT with payload `{ matchId: req.params.id, scope: 'viewer', exp }` using server secret.

2) Viewer middleware
- `authenticateViewerToken` reads `?view=token` and verifies:
  - Signature, `exp`, `scope==='viewer'`, and `matchId` === `req.params.id`.
- Allow access if viewer token OR authenticated user; else 401.

3) SSE stream route
- Maintain an in‑memory `Map<matchId, Set<Response>>` of connected clients.
- On connect: set headers, write initial `snapshot`, register `res` in map, and `req.on('close')` to remove.
- Broadcast helper: `broadcast(matchId, { type, data })` writes frames to each client `res` in the set.

4) Publish events after DB writes
- After successful persistence in services:
  - Event create/delete → broadcast `event_created` / `event_deleted`.
  - Period start/end → broadcast `period_started` / `period_ended`.
  - Match state start/pause/resume/complete → broadcast `state_changed`.
  - Optionally compute and emit `score_update`.

5) Heartbeats & cleanup
- Send `heartbeat` every 15–30 seconds to all clients.
- On write error, drop the client from the set.

6) Snapshot route(s)
- Add read‑only controllers returning current summary, periods, and events. Sanitize fields: no internal IDs beyond what’s necessary, no PII.

### Express SSE Sample (sketch)

```ts
router.get('/matches/:id/stream', authenticateViewerOrUser, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const matchId = req.params.id;
  subscribers.add(matchId, res);

  // Initial snapshot
  const payload = await buildSnapshot(matchId);
  send(res, 'snapshot', payload);

  req.on('close', () => subscribers.remove(matchId, res));
});

function send(res, type, data) {
  res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
```

## Frontend Implementation Plan

1) Connect if viewer token present
- Parse `?view=token` from URL for `/live/:matchId` route.
- If present, hit snapshot endpoints once to render initial state.
- Open `EventSource(/api/v1/matches/:id/stream?view=token)`.
- Register `onmessage` handlers by `event` type; update timeline/score.
- On `error`, backoff and reconnect; fallback to polling if stream fails repeatedly.

2) Merge logic
- Maintain a feed array merging:
  - System rows derived from periods/state: Kick Off, End of Half/Q/ET, Completed.
  - Gameplay events: goal, own_goal, assist, etc.
- For score, derive from events (goal/own_goal) or accept `score_update` if emitted.
- Preload rosters (two teams) to resolve player names.

3) UI
- Show a subtle “live” indicator (blinking dot or LIVE chip).
- If not connected, show “Reconnecting…” and switch to polling.

## Data Model & Persistence

- No DB schema changes required to ship SSE.
- Optional: Add a `match_state_transitions` table if you need exact pause/resume auditing later:
  - `id, match_id, from_status, to_status, occurred_at, created_by_user_id`.

## Performance & Scaling

- 50 viewers per match is trivial: SSE holds an open HTTP response per client; memory cost is small.
- Keep snapshots bounded (e.g., latest 100–200 events) to avoid passing huge payloads.
- If you scale horizontally, you’ll need pub/sub (e.g., Redis) to fan‑out messages across instances.

## Security & Privacy

- Limit viewer tokens to single match and read‑only scope; short TTL.
- Sanitized payloads only (no emails, internal IDs beyond what’s needed, etc.).
- Rate‑limit snapshot endpoints; require `view` or user auth for reads.
- CORS configured to allow your viewer domains only.

## Testing Checklist

- Unit: token creation/validation, middleware accepting user OR viewer token.
- Integration: snapshot endpoints return expected shape with viewer token.
- SSE: connect, receive snapshot, receive event/period/state updates, heartbeat.
- Client: reconnect logic, timeline merges correctly, score updates, player name resolution.
- Load: simulate 50–100 viewers; verify CPU/memory and no leaks.

## Rollout Plan

1) Backend: token minting + snapshot endpoints
2) Backend: SSE broadcaster + hooks in services
3) Frontend: viewer mode (token), snapshot + SSE client, timeline merge
4) QA: live match sanity, anon viewer UX, reconnection, mobile
5) Optional: add `/timeline` combined endpoint and/or audit table later

## Example Payloads

- snapshot
```json
{
  "summary": {
    "matchId": "uuid",
    "status": "LIVE",
    "currentPeriod": 1,
    "currentPeriodType": "REGULAR",
    "score": { "home": 1, "away": 0 },
    "homeTeam": { "id": "uuid", "name": "Home" },
    "awayTeam": { "id": "uuid", "name": "Away" },
    "kickoffTime": "2025-08-22T10:00:00Z"
  },
  "periods": [ { "id": "uuid", "periodNumber": 1, "periodType": "REGULAR", "startedAt": "...", "endedAt": null } ],
  "events": [ { "id":"uuid", "kind":"goal", "teamId":"uuid", "playerId":"uuid", "periodNumber":1, "clockMs":420000, "createdAt":"..." } ]
}
```

- event_created
```json
{ "event": { "id":"uuid", "kind":"goal", "teamId":"uuid", "playerId":"uuid", "periodNumber":1, "clockMs":420000, "sentiment":1, "createdAt":"..." } }
```

- period_ended
```json
{ "period": { "id":"uuid", "periodNumber":1, "periodType":"REGULAR", "endedAt":"...", "durationSeconds":2700 } }
```

- state_changed
```json
{ "status": "PAUSED", "currentPeriod":1, "currentPeriodType":"REGULAR" }
```

## Open Questions

- Do we want to expose `/timeline` combined endpoint now or derive on client for the first release?
- Token TTL policy and whether minting invalidates previous tokens for the same match.
- Whether to expose player names publicly or send anonymized initials for viewers.

---
This document is sufficient to brief an engineer to implement SSE for live viewers, including backend endpoints, auth, message schema, client integration, and rollout plan.
