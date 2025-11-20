# Offline‑First + Sync — Current Design and Status

This document summarizes the current state of the app’s offline‑first behavior, outbox design, background sync, guest mode, and how these pieces interact.

## Overview
- Local‑first storage using IndexedDB/Dexie.
- Outbox queue records all writes when realtime/API calls are unavailable.
- Background sync flushes the outbox when connectivity returns.
- Guest Mode enables full exploration without an account, with quotas.
- Authenticated users also get offline write support; edits sync later.

## Data Flow
- Event creation: realtime‑first → if socket/API fails, add to outbox → UI updates immediately → background sync replays to server.
- Teams/Players: create/update/delete → if API fails (offline), store locally + outbox.
- Matches/Seasons: create/update/delete → same offline fallback + outbox.
- Default Lineups: store locally in `settings` for guests; for authenticated users, fallback to local + outbox when offline.
- Formations (live changes): saved as a formation_change event when offline (guest or authenticated), including a JSON `notes` payload with `{ reason, formation, prevFormation }` so the timeline remains useful.

## Outbox Tables and Commands
- `events`: INSERT (includes minute/second or clockMs, kind, teamId, playerId, notes, sentiment)
- `teams`: INSERT
- `players`: INSERT
- `seasons`: INSERT/UPDATE/DELETE (normalized fields)
- `matches`: INSERT (quickStart), UPDATE, DELETE
- `default_lineups`: UPDATE/DELETE (idempotent saveDefaultLineup; deleteDefaultLineup)
- `match_commands`: INSERT commands to replay live state ops:
  - `start_match`, `pause`, `resume`, `start_period` (regular|extra_time|penalty_shootout), `end_period`, `complete`

## Background Sync
- Location: `frontend/src/services/syncService.ts`
- Triggers: periodic timer (default 15s), `online` event.
- Routing:
  - events → `eventsApi.create`
  - teams → `teamsApi.createTeam`
  - players → `playersApi.createPlayer`
  - seasons → `seasonsApi.createSeason|updateSeason|deleteSeason`
  - matches → `matchesApi.quickStart|updateMatch|deleteMatch`
  - default_lineups → `defaultLineupsApi.saveDefaultLineup|deleteDefaultLineup`
  - match_commands → calls appropriate `matchesApi.*` endpoints; for `end_period`, fetches current periods to find the open one before ending it.

## Guest Mode (capsule)
- Guest identity: `guest_id` in localStorage.
- Quotas (enforced client‑side):
  - Teams: 1
  - Matches: 1
  - Players per team: 15
  - Non‑scoring events per match: 50 (goals/own_goals unlimited)
  - Formation changes per match: 10
- Default lineup stored under `settings` as `default_lineup:<teamId>`.
- Formation changes recorded as `formation_change` events.

## Visual Indicators
- Guest banner (per page) shows quota usage and has a Sign Up CTA.
- Offline sync indicator (header) shows offline status and pending outbox count.

## Import “Guest Data” After Signup
- Post‑login prompt offers “Import my data”.
- Orchestrator order: seasons → teams → players → matches → events (later: default_lineups).
- Matches are created via quickStart with a heuristic to choose your “my team”; events are replayed for the new matches.
- Opponent dedup: opponent search merges server+local and sync checks server by name before creating teams.
- We intentionally prompt rather than auto‑import to:
  - Avoid accidental duplication.
  - Allow users to review and confirm.
  - Give control in case network is constrained.

## Current Status
- DONE
  - Local quick match (guest) and offline live view.
  - Guest quotas enforced across teams/players/events/formations.
  - Default lineup offline save + sync (authenticated), and local for guests.
  - Background sync for events/teams/players/matches/seasons/default_lineups/match_commands.
  - Formation changes offline (guest+auth) with rich timeline notes.
- IN PROGRESS / NEXT
  - “Import my data” orchestrator & prompt UX.
  - Optional: outbox + sync for apply‑to‑match of default lineups (if desired).

## Testing Notes
- Toggle network down and perform edits: indicator shows pending; upon restoring network, changes replay to server.
- For live match state, perform Kick Off, Pause/Resume, End Period offline: timeline updates immediately; commands sync to backend later.
- Formation changes offline: timeline renders formation details via the JSON notes payload.
