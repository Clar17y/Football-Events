# Live Match – First Implementation Slice

This document tracks the initial code slice for the Live Match feature: route wiring, header with match switcher, read‑only page scaffold.

## Scope
- Add `LiveMatchPage` with branded header and match switcher.
- Parse navigation for `/live/:matchId` and `/live` defaults.
- Load upcoming matches for switcher; select nearest upcoming when no `matchId`.
- Render read‑only controls scaffold (no actions yet) to validate layout.

## Routing & Navigation Notes
- App uses simple in‑app navigation (no react‑router). We extended it to understand:
  - `onNavigate('/live/:id')` → sets page to `live` and stores `currentMatchId`.
  - `onNavigate('live')` or `onNavigate('/live')` → sets page to `live` with no id and selects nearest upcoming.
- URL is updated via `history.pushState` for shareability.

## API
- Added `matchesApi.getMatch(id)` helper (for future detailed view).
- Use `matchesApi.getUpcoming(limit)` to populate the switcher list.

## Components
- `pages/LiveMatchPage.tsx`:
  - PageHeader (MatchMaster branding and theme toggle).
  - Header card: home team | 0 - 0 | away team; venue • competition.
  - Switcher: chevrons to move within upcoming list and update URL.
  - Read‑only controls scaffold: timer placeholder and disabled action buttons.

## Auth Behavior
- This slice renders read‑only UI for everyone; controls are disabled.
- Next slices will show controls only for authorized users.

## Next Slices (planned)
- Wire timer and match/period state transitions.
- Build Events tab: quick‑add pad + sentiment snackbar.
- Timeline with grouping by period and gestures (swipe sentiment/delete).
- Offline queue extensions for match/period actions.
- Completion flow and score persistence.

## Notes for Future Work
- Once match_state is available on the frontend, hide score for `SCHEDULED` and show status chip.
- Add bottom‑sheet match picker for long upcoming lists.
- Add `/live` viewer polling; SSE/WebSockets later.
- Integrate player rosters and assist CTA after goal.

### Backend alignment note
- Quick‑start match creation now upserts an initial `match_state` row with `SCHEDULED` to avoid 404s from `/matches/:id/state` on new matches.
