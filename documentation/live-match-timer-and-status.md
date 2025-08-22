# Live Match – Timer and Status Notes

This note captures implementation details for the timer and status chip in the Live Match page.

## Status Chip
- Source: `/matches/:id/state` (requires auth) via `matchesApi.getMatchState`.
- Display:
  - LIVE → chip color `success`
  - PAUSED → `warning`
  - COMPLETED → `tertiary`
  - Others (SCHEDULED/CANCELLED/POSTPONED) → `medium`
- Score visibility: hidden when `status === 'SCHEDULED'` (shows `vs`).

## Timer Behavior
- Goal: Show correct elapsed time for the current open period after reload.
- Inputs:
  - `MatchState.totalElapsedSeconds` (cumulative seconds played across all periods).
  - `MatchPeriod[]` from `/matches/:id/periods` (ended periods include `durationSeconds`; the current open period has `startedAt` and `endedAt = null`).
- Base calculation on load:
  - `endedMs = sum(period.durationSeconds * 1000 for periods with endedAt)`
  - `baseMs = (totalElapsedSeconds * 1000) - endedMs`
  - Fallback: if `baseMs <= 0` and state is LIVE and there is an open period with `startedAt`, use `Date.now() - startedAt`.
  - Clamp to `>= 0`.
- Ticking:
  - When `status === 'LIVE'`, start a `requestAnimationFrame` loop incrementing from `baseMs`.
  - When `status !== 'LIVE'`, stop ticking and keep the last computed value.
- Controls adjust timer as follows:
  - Kick Off (SCHEDULED): start match, refresh periods, compute base, start ticking.
  - Pause: call `/pause`, refresh periods and state, compute base, stop ticking.
  - Resume: call `/resume`, refresh periods, compute base, start ticking.
  - End Period: end open period, refresh periods, reset timer to 00:00; match stays paused.
  - Start Next / Extra Time: start period, refresh periods, compute base, resume match, start ticking.

## Future Enhancements
- Add server-provided `currentPeriodElapsedSeconds` to avoid base reconstruction.
- Poll `/matches/:id/state` for viewers (no auth) once public endpoint or SSE is available.
- Display period label (e.g., 1st Half, Q3, ET1) next to timer.
