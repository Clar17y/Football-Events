# Touchline redesign verification

final result: passed

The selected first design is implemented across the existing MatchMaster application. Daylight/dark visual checks, the accepted behavior repairs, final browser checks and integrated validation passed. The local preview server was stopped at the user's request after verification; deployment was outside this task.

## Visual truth and comparison

- Source: [touchline-reference.png](documentation/design/touchline-reference.png), the first displayed generated option selected by the user. Original853×1844 pixels, SHA256 `8182df95aa372212c69b185018434b6f695b32875d32626bab939a001d1fc5ab`.
- Implementation: `http://127.0.0.1:5173`, screenshot `documentation/design/touchline-live.png`,390×844 pixels at390×844 CSS pixels.
- State: light appearance, guest, Q2 LIVE,1–0, tracked player9. Real fixture names and clock differ from the concept: Sideline Test FC, Riverside Juniors, Jamie Demo,23:22. No reference text or match state is hardcoded.
- Normalization: proportional resampling of the853×1844 source into390×844, with at most1px padding. The implementation is already1:1. No phone chrome is present in either image. The production Ionic app is retained; no mobile prototype runtime was substituted.
- Full comparison inspected together: [touchline-comparison.png](documentation/design/touchline-comparison.png).
- Focused comparisons inspected together: [score and clock](documentation/design/touchline-comparison-score.png) and [recording controls](documentation/design/touchline-comparison-recording.png). These make team wrapping, clock hierarchy, action labels and latest-moment placement readable. The final capture retains the same accepted layout as v2 after the behavior repairs.

## Required fidelity surfaces

| Surface | Assessment |
| --- | --- |
| Fonts and typography | Inter and the existing system fallback stack are applied to the actual controls. Tabular score/clock numbers, a strong Goal label and quieter supporting copy preserve the reference hierarchy. Real two-line team names remain readable. Minor differences in optical weight and icon size are acceptable P3 refinements. |
| Spacing and layout rhythm | Open score/clock surface, child row, team select,110px Goal,56px paired actions and58px More events follow the reference. Actual Goal top406.9px and Undo bottom816.4px fit the844px live viewport. Native browser scrollbar accounts for the narrower335px content width. |
| Colours and tokens | Off-white `#f8faf7`, ink `#14231d`, forest `#12392d`, white surface and quiet borders are shared across the site. Red/yellow cards, warnings, kit colours and pitch positions retain meaning. Light reference contrast: ink15.54:1, muted5.93:1, white/forest12.74:1. Dark controls use foreground accent `#9cdebf` on dark surfaces (at least9.50:1); solid green remains `#2e7d62` with white labels (4.97:1). Real browser Resume/Change player/Undo computed the intended accent, and the dark player sheet retains readable selected/clear/cancel controls. |
| Image quality and assets | The reference consists of native UI and standard football/action icons. Existing Ionicons remain crisp vector assets; no screenshot is used as a working interface. Library substitutions for the boot/foul/shirt artwork are accepted. There are no photographic or custom illustration assets requiring generation. |
| Copy and content | Real teams, player, period, score and captured time are shown. The status says “On this device” because the guest mode has no positive write acknowledgement to justify the mock's unconditional saved claim. Back and More options retain production navigation and appearance controls. |

## Comparison and repair history

| Earlier finding | Repair and post-fix evidence |
| --- | --- |
| P1: duplicated branding/status and overlarge quota content pushed recording down the phone screen. | A single shared header remains; quota belongs in secondary controls. Compare `04-interim-live-fit.png` with the final full comparison. |
| P2: away name split mid-word and paused status repeated instead of showing the period. | Real names wrap normally; Q2 and one Paused/Live status are distinct. Final live comparison and paused browser state confirm. |
| P2: shared header CSS initially stacked across three rows. | Loaded scoped grid preserves the full wordmark, status and44px options button. `06-interim-header-stack.png` is the before evidence; final live, Teams and account captures show the corrected row. |
| P2: latest-moment Undo extended below the844px live viewport. | Reduced excess mobile spacing, preserving control heights and text sizes. Earlier `final-live-comparison.png` versus `final-live-v2-comparison.png`; measured Undo now ends at816.4px. |
| P1: More options failed to open because Ionic interpolated React's colon-containing ID into an invalid CSS selector. | Selector-safe ID; real browser opened the labelled Page options surface and changed appearance in both directions. The previous exception does not represent a successful menu test. |
| P2: coloured form toolbar titles inherited page ink and became unreadable. | Toolbar title foreground now inherits its toolbar contrast; actual Create Season title computed white on forest, confirmed in `documentation/design/touchline-form.png`. The owning selector was audited across ten coloured-toolbar uses. |
| P2: seven calendar columns clipped on a narrow phone; dark today number had weak contrast. | Removed the conflicting minimum width, tightened mobile padding and used readable dark text. Actual360px browser targets measured44.42–44.44px square, all seven columns visible. `matches-360-dark.png` and `touchline-matches-dark.png` show the repair. |
| P2: green active labels on dark console surfaces had insufficient contrast. | Separated foreground accent from solid green fill. `touchline-live-dark.png` and `touchline-player-sheet-dark.png` show the repair; real computed control foreground is rgb(156,222,191) on rgb(24,40,33). |
| P1: recovery and saved callbacks could bypass the current phase boundary. | Current permissions, numbering and recovery inputs are read together. Tests reject saved starts after the configured final regular period, second extra-time period and ended shootout; the same saved extra-time callback correctly starts ET2. Partial starts retain their original type, number, ID and start time. |

## Browser interactions and surrounding pages

Verified through the application UI, using the existing local demo fixture:

- Clear/reselect the tracked child, reopen the match, and retain score1–0 and timeline count1. Preference changes do not create an event.
- Tap Goal at22:12, save later at22:44 with Jamie Demo, see score2–0 and the original captured22:12 moment.
- Pause, reload, Undo the displayed latest moment, return to1–0/count1, then reload again and retain the correction.
- After the preference repair, tap Goal at23:05 and Save without player: score becomes2–0 and Jamie Demo remains tracked. Pause at23:18, reload and retain the unattributed goal and tracked child. Undo this temporary goal, reload again, and retain1–0/count1 and Jamie Demo. The original13:01 goal remains. Evidence: `team-event-preference-reload.png` and `undo-preference-reload.png` in the scratch evidence directory. The final screenshot was captured at23:22 before pausing the fixture again.
- Expand More events: permitted core actions remain present; premium actions and paused recording remain disabled as appropriate.
- Open shared More options and use appearance controls. Backdrop dismissal returned focus to the More options trigger in the browser. Native Ionic overlay defaults remain enabled. Automated Escape input was unavailable in this browser adapter, so keyboard dismissal/focus cycling are not claimed as runtime proof.
- Visit Home, Matches, Teams, Players, Seasons, landing, sign-in and registration. Open unsaved Player and Season forms, use the Player date picker, select a date and cancel without creating data.
- Inspect390×844 daylight/dark recorder and player sheet,360×844 narrow/dark calendar, and1440×1000 desktop landing/Home/recorder layouts.

Screenshots are in `documentation/design/`. Desktop captures and additional narrow/calendar evidence are named in `.llm-output/ui-redesign-2026-10-16/`.

## Codex review repairs

Both Codex findings on PR #17 are repaired. Viewer snapshots now include the current `activeSince` anchor, so reconnecting after a pause/resume reconstructs playing time without counting the pause again. Tests exercise the serialized backend payload and the viewer's initial, repeated, later, paused and completed snapshots.

A successful complete authenticated refresh now removes clean cached events absent from the server response and imports the authoritative saved score in the same guarded local transaction. Pending changes, acknowledged tombstones, ownership, account generation, recording/score revisions and route changes retain their protections. Invalid or failed responses leave the cache intact; injected failures after each write stage prove transaction rollback. Local-first match reads remain unchanged, and score is never inferred from a potentially partial local timeline.

The repaired candidate passed 1,120 frontend tests across 72 files (2 existing skips), 215 backend tests across 12 files with database setup explicitly disabled, strict frontend source type checking, and frontend/backend production builds. This includes all 62 hydration tests. The earlier 103 shared tests and shared build remain applicable because shared sources and build inputs did not change. The eight-file code/test repair delta against `2ea312906e85847cddd6dd4e49c678dfb77ea5dd` has SHA256 `51b22bad79160b8a66bd10fe11183068385961bf76e0db88537b10f9a82ca5a1`; source hashes, commands and logs are recorded under `.llm-output/pr17-codex-repairs-2026-10-16/`.

Jev's matching advisory is partial because of operation-budget and oversized-hunk limits. Root inspected the coordination, persistence, cancellation and ownership focus areas against the source and regression cases; the advisory is not an independent approval or test result. No styles or visual assets changed, so the accepted visual captures above remain applicable. No preview server was restarted. These repairs were checked with mocked transport/Prisma and real IndexedDB transaction semantics through fake IndexedDB, without new real-database or multi-device cloud verification. Separate HTTP endpoints do not provide a server-wide atomic snapshot; simultaneous edits from another device remain outside the proved cases.

## Checks and limits

At the original published design checkpoint, the integrated frontend run passed71 files /1075 tests, with2 existing skips. The focused live/clock run passed138 tests before the final style-only cleanup. Strict source TypeScript checking and the production PWA build passed. That Touchline code diff is SHA256 `20745b706e4d82f758b1a6217da317079b6704067c25b6f1feedef03ee0da2e3` against comparison base `4e18cd35b7b8c7a500f90f3098f5ec405958a36f`. At that checkpoint, all24 protected recording, authentication, sync, quota, timing and backend input hashes matched their baseline. The later authorized Codex repairs intentionally change snapshot hydration and the backend snapshot producer, as documented above. Original commands, input hashes and log paths are recorded under `.llm-output/ui-simplify-2026-10-16/`; earlier visual/behavior evidence remains under `.llm-output/ui-redesign-2026-10-16/`.

The requested simplify pass used one fresh read-only audit across reuse, quality and efficiency. It removed the redundant Home toolbar block already provided by shared header CSS and MUI button properties already inherited from theme typography/shape. The44px button minimum remains. Installed MUI source and shared CSS confirm identical resulting values, so the accepted browser captures remain applicable. Full frontend tests, source checking and build were rerun after this cleanup. Broader palette unification and live state-machine restructuring were not justified as behavior-preserving simplifications.

The PR also contains nine earlier local sideline reliability commits. Publication checks passed211 backend tests across11 files with database setup explicitly disabled,103 shared tests across4 files, and backend/shared builds. The default backend suite excludes database API/integration folders. Earlier actual HTTP/PostgreSQL acceptance is documented in [the sideline assessment](documentation/SIDELINE_RECORDING_AUDIT_2026-10-14.md); those external scenarios were not rerun for this style-only cleanup.

Development console inspection identified the repaired popover exception. Final source reload and shared-menu checks at18:00 UTC retained the original1–0 goal and tracked child, and opened/dismissed More successfully. The returned error log contained the existing MobileDebugger/AppRoutes render warning; no new popover selector exception or other redesign exception appeared. App.tsx and MobileDebugger are outside this diff. Existing local real-time transport warnings also remain; no claim of a completely silent development console is made. The viewport override was reset and the preview retained.

One independent medium static review ran through Muse after the Claude route failed authentication and the OpenAI static session could not inspect source under its available read interface. Its accepted LIVE/end-period recovery, tracked preference and correction-readiness findings were repaired as one live batch. The authenticated import-needed warning is again outside the optional menu, with one existing import component and unchanged import/auth logic. Root inspected the repair delta, closed the adjacent type-aware period boundary and checked matching tests and browser evidence. The root rejected speculative per-period deletion checks (authoritative ownership/idempotency already exists in the data layer) and missing Premium labels for primary actions (all five are core events in every current tier). Ordinary quota disclosure is intentional; actual refusal errors remain visible.

Final Jev advisory evidence is bound to the final Touchline diff above, with partial coverage due hunk, operation-budget and oversized-hunk limits; zero focus signals do not establish absence of defects. The full combined PR code diff also received an attempted advisory, but exceeds the helper's1MiB input limit even with reduced context. That attempt is incomplete, rather than a successful whole-PR scan. The substantive earlier reliability and UI reviews, root repair acceptance and simplify audit remain separate evidence. Findings, adjudication, coverage and limits are retained in the local review records.

This is browser and automated-test evidence, not physical sideline-device, direct sunlight, screen-reader, exhaustive accessibility, signed-in private-screen or multi-device cloud verification. Delayed preference A→B→A and every native overlay keyboard combination remain unproved beyond source review and the named tests.

The React source pass checked stable hook order, effect cleanup/context invalidation, typed component inputs, semantic primary buttons, labelled selects, and reuse of the existing theme/data/timing helpers. No new frontend package or alternative state store was introduced. The large live page remains an existing maintenance constraint; splitting its state machine during a visual redesign would expand the change beyond this delivery.

## Acceptance checklist

- [x] Exact selected reference resolved and inspected.
- [x] Same-state full and focused daylight comparisons inspected together.
- [x] Core recording, preference and persisted correction exercised in browser.
- [x] Shared management/public/forms and phone/desktop layouts checked.
- [x] Full frontend suite, source typing and production build passed.
- [x] Dark active foreground repair and browser confirmation.
- [x] Accepted live behavior and import visibility repair batch with focused validation.
- [x] Final candidate binding, independent review adjudication and console check.

P3 follow-ups: closer standard-icon silhouettes and lighter optical weights; existing unnamed management icon actions and complete native keyboard/screen-reader coverage can receive a separate accessibility pass.
