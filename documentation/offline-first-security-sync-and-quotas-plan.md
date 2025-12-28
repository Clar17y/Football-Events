# Offline‑First Security, Sync Resilience, and Subscription Quotas — Implementation Plan

**Last updated:** 2025-12-26  
**Audience:** Engineering + Product  
**Scope:** Backend validation/limits, sync retry/backoff + quarantine, per‑user quotas (Free vs Premium), and UX for limits/issues.

---

## 1) Why this matters (threat model in one page)

In an offline‑first app, **IndexedDB is attacker‑controlled**. Anyone can edit local tables in DevTools and your sync engine will attempt to upload whatever it finds. This is not a reason to abandon offline‑first; it simply means:

- **The server must be the security boundary** (auth + ownership + validation + quotas).
- **The client must be resilient** (avoid retry storms, quarantine permanently failing records, show actionable UX).

### Primary abuse/impact scenarios to design for

1) **Tampered local rows** (e.g., event kind/fields out of range, huge notes payload, invalid IDs).
2) **Unauthorized references** (e.g., local record references a `matchId` or `teamId` that user doesn’t own).
3) **Retry storms**: one bad record causes repeated 400/403 every sync tick (battery + API load + noisy logs).
4) **Mass local creation** (e.g., “1 million teams”) that later tries to sync and overwhelms server/client.
5) **Batch payload abuse** (large arrays, deep objects) that can degrade server performance.

### Guardrails already present in this repo (baseline)

- Global JSON body size limit: `10mb` (`backend/src/app.ts`).
- Basic IP rate limiting under `/api/` (disabled in tests).
- Many endpoints use Zod validation (`backend/src/validation/schemas.ts`).
- Client sync processes at most `BATCH_SIZE = 50` records per table per flush (`frontend/src/services/syncService.ts`).
- Guest mode already enforces quotas locally (`frontend/src/utils/guestQuota.ts`).

### Biggest gaps to close

- Some endpoints rely on ad-hoc validation (e.g., formation change route) instead of Zod schemas.
- Batch schemas don’t cap operation counts (potentially huge arrays).
- Sync retries have **no per‑record backoff/quarantine**, so permanent failures can hammer the API indefinitely.
- No authoritative per‑user quotas/subscription enforcement on the server.

---

## 2) High‑level approach

Implement **defense in depth**:

1) **Backend hardening (authoritative)**
   - Strict schemas, payload size caps, per‑route limits.
   - Ownership checks everywhere.
   - Per‑user quotas tied to plan (Free/Premium; extensible for Club/Lifetime).

2) **Sync resilience (client)**
   - Classify errors as transient vs permanent.
   - Exponential backoff + jitter for transient failures.
   - Quarantine permanently failing records; don’t auto-delete.
   - UX for “blocked items” with retry/discard/export/upgrade actions.

3) **UX + client‑side quotas (non‑security, but prevents accidental bloat)**
   - Show limits early, enforce in UI while offline where possible.
   - Fetch plan/limits from server on login; cache locally.

---

## 3) Subscription tiers (initial proposal)

### Recommended pricing
- **Premium:** **£3.99/month** or **£35/year** (~2 months free)

### Tier breakdown

| Feature | Free | Premium (£3.99/mo) |
|---|---:|---:|
| Teams | 1 (your own team) | 5 |
| Players per team | 20 | 40 |
| Seasons | 5 | Unlimited |
| Matches per season | 30 | Unlimited |
| Event types | Core only (6 types) | All 12 types |
| Events per match | 40 | 150 |
| Formation changes | 5 per match | 20 per match |
| Match sharing links | 1 active | Unlimited |
| Analytics dashboard | ❌ | ✅ |
| Data export (CSV) | ❌ | ✅ |

### Event type split

Free (Core — “track the scoreline”):
- `goal` / `own_goal` — **always unlimited**
- `penalty`
- `foul`
- `free_kick`
- `ball_out`

Premium (Analytics depth — “track how it happened”):
- `assist`
- `key_pass`
- `save`
- `interception`
- `tackle`
- `formation_change` (tactical)

### Additional revenue ideas (optional later)
- Lifetime: **£99 one‑time**
- Club: **£29.99/month** for 10+ teams
- Pay‑per‑season: **£9.99/season**

---

## 4) Workstreams and concrete implementation plan

### Workstream A — Backend payload validation + abuse caps (must‑have)

**Goal:** The server rejects malformed/abusive data cheaply and consistently.

1) **Bring all write endpoints under Zod validation**
   - Add Zod schemas for endpoints currently doing manual checks (e.g. `POST /matches/:id/formation-changes`).
   - Ensure every write endpoint validates:
     - required fields, enums
     - numeric bounds (e.g., `clockMs`, coordinates)
     - string length caps (`notes`, `reason`)
     - array length caps (formation players, batch operations)

2) **Cap batch operation sizes**
   - Update `eventBatchSchema` / `lineupBatchSchema` to cap arrays, e.g.:
     - `create.max(50)`, `update.max(50)`, `delete.max(50)` (or cap total ops).
   - Consider rejecting if `(create+update+delete) > MAX_BATCH_OPS`.

3) **Tighten formation payloads**
   - For formation changes:
     - Validate `formation.players.length <= 11`
     - Validate player IDs are UUIDs, positions are valid codes, pitch coords 0–100, etc.
     - Cap nested object depth/size where possible (avoid arbitrary JSON blobs).

4) **Unknown key stripping**
   - Update `validateRequest` middleware to assign `req.body = schema.parse(req.body)` so unknown keys are stripped.
   - Ensure schemas include all legitimate keys first to avoid breaking clients.

5) **Route-level request size limits (optional, recommended)**
   - Keep global `10mb`, but add smaller limits for typical JSON routes (e.g., 256kb–1mb) and allow bigger only where necessary.

**Acceptance criteria**
- All write routes have schema validation and deterministic 400s on invalid payloads.
- Batch endpoints reject oversized arrays.
- Formation changes reject oversized/deep payloads.

---

### Workstream B — Server‑side quotas + plan enforcement (authoritative)

**Goal:** A user cannot exceed plan limits by manipulating the client.

1) **Data model**
   - Add `subscriptions` (or `user.plan`) to the backend (Prisma) with:
     - `planType` (`free`, `premium`, later `club`, `lifetime`)
     - `status` (`active`, `past_due`, `cancelled`, etc.)
     - optional `currentPeriodEnd`, etc.
   - Add a stable “effective plan” resolver: team owner vs coach inheritance (if you implement multi‑coach teams later).

2) **Quota definition**
   - Create a single source of truth: `QuotaService.getLimits(userId)` returning:
     - numeric caps (teams, seasons, etc.)
     - feature flags (analytics, export, sharing)
     - allowed event kinds
     - special rules: goals unlimited, etc.

3) **Quota enforcement points (examples)**
   - `POST /teams`: enforce max teams (excluding opponents if applicable).
   - `POST /players-with-team`: enforce players/team (and/or playerTeams constraints).
   - `POST /seasons`: enforce max seasons.
   - `POST /matches`: enforce matches/season (and/or overall).
   - `POST /events` + match formation change endpoint:
     - enforce allowed event kinds by plan
     - enforce events per match caps (excluding `goal`/`own_goal` if “always unlimited”)
     - enforce formation changes per match
   - Viewer links:
     - enforce max active links.

4) **Return machine-readable errors**
   - Standardize an error shape for quota issues, e.g.:
     - `status: 402` or `403` (pick one; `402` is semantically nice but not universally used)
     - `{ code: 'QUOTA_EXCEEDED', limit, current, entity, planType }`
   - Client uses this to quarantine and show upgrade CTA.

5) **Per-user rate limiting (additive)**
   - Keep IP limiter, add user-keyed limiter for expensive endpoints (batch routes, share link minting).

**Acceptance criteria**
- Server prevents creating/syncing beyond plan limits even if IndexedDB is tampered.
- Clear quota error responses are emitted consistently.

---

### Workstream C — Client sync resilience: retries, backoff, quarantine (must‑have)

**Goal:** Prevent retry storms and protect UX/battery when records can’t sync.

1) **Create per-record sync attempt tracking**
   - Preferred: new Dexie table (e.g., `syncFailures`) keyed by `[tableName+recordId]`:
     - `attemptCount`
     - `lastAttemptAt`
     - `nextRetryAt`
     - `lastStatus`
     - `lastError`
     - `permanent` boolean
     - `reasonCode` (e.g. `VALIDATION`, `ACCESS_DENIED`, `QUOTA_EXCEEDED`)
   - Alternative: reuse `syncMetadata` table (but it’s currently “last synced”, not “sync failure”).

2) **Classify errors**
   - `401`: stop syncing; trigger token refresh/relogin.
   - `429`: backoff globally (respect `Retry-After`).
   - Network/`5xx`: transient → exponential backoff.
   - `400/403/404/409`:
     - treat as permanent for that record unless there’s a known “fixable” case.
     - quarantine and surface to user.

3) **Backoff algorithm**
   - `delay = min(MAX, BASE * 2^attemptCount) + jitter`
   - Example: `BASE=30s`, `MAX=24h`, jitter ±20%.
   - Respect server `Retry-After` if present.

4) **Quarantine behavior**
   - Don’t retry quarantined items automatically.
   - Show a “Sync Issues” UI listing blocked items with actions:
     - Retry now (clears quarantine / resets attempt count)
     - Discard local change (soft-delete or delete local-only record)
     - Export (copy JSON/CSV for support or manual recovery)
     - Upgrade (if `QUOTA_EXCEEDED`)

5) **Keep sync bounded**
   - Keep `BATCH_SIZE`, but also bound per-flush request count:
     - Prefer batch endpoints where available (events/lineups), reducing request volume.
   - Consider pausing sync if too many items are quarantined (avoid noise).

**Acceptance criteria**
- Permanent failures do not retry every 15s.
- Transient failures back off.
- UI shows blocked counts and offers actions.

---

### Workstream D — Client quota UX + offline guardrails (prevents “local million rows”)

**Goal:** Prevent accidental huge local creation and make limits clear.

1) **Expose plan/limits from server**
   - Add `GET /api/v1/me/limits` returning:
     - plan type, limits, allowed event kinds, features
     - “current usage” counts (optional but useful)

2) **Cache limits locally**
   - Store in Dexie `settings` so it works offline.
   - Update on login and periodically when online.

3) **Enforce in UI and local writes (best-effort)**
   - For authenticated users offline:
     - enforce local limits using local counts (scoped to `createdByUserId`)
     - if the device is stale vs server counts, be conservative (warn user).
   - Keep the server authoritative; client is UX.

4) **Upgrade prompts**
   - When a local action would exceed limits:
     - show “limit reached” modal (with “upgrade”, “manage data”, “cancel”).
   - When sync hits quota errors:
     - quarantine + banner “Some items can’t sync due to plan limits”.

**Acceptance criteria**
- Users can’t accidentally create huge local datasets without being warned/stopped.
- Limits are visible and understandable.

---

### Workstream E — Rollout, testing, and operations

1) **Feature flags**
   - Roll out quotas and quarantine behind flags:
     - server: `ENABLE_QUOTAS`
     - client: `ENABLE_SYNC_QUARANTINE`

2) **Testing**
   - Backend tests:
     - formation-change schema rejects invalid payloads
     - batch caps enforced
     - quota enforcement returns correct codes
   - Frontend tests:
     - error classification → backoff/quarantine
     - quota UI blocks creation and shows correct messaging

3) **Observability**
   - Log quota denials with `userId`, `entity`, `limit/current` (avoid logging full payloads).
   - Add basic metrics (counts of quarantined items, quota denials, sync failures by status).

---

## 5) Suggested implementation order (minimize risk)

1) **Backend validation + batch caps** (fast win, reduces risk immediately)
2) **Client sync quarantine/backoff** (stops retry storms)
3) **Server quotas (initially high/lenient)** + error codes
4) **Client quota UX** (limits + upgrade prompts)
5) **Subscription plumbing** (billing, plan management) if/when needed

---

## 6) Implementation offer (next step)

If you want this implemented in the codebase next, the work can be staged as:

1) Add server schemas/caps + formation-change validation
2) Add sync failure tracking + quarantine/backoff in `frontend/src/services/syncService.ts`
3) Add quota service + enforcement in backend services/routes
4) Add `GET /api/v1/me/limits` + frontend prompts/UI
5) Add subscription model + admin tooling (later)

---

## Implemented (2025-12-27)

### Backend
- **Strict Zod validation** for all write routes; `POST /api/v1/matches/:id/formation-changes` now uses `validateRequest(...)` with `matchFormationChangeSchema`.
- **Batch abuse caps**: all batch endpoints (`events`, `lineups`, `players`, `player-teams`, `awards`, `match-awards`) cap each operation array to `50` and enforce a `create+update+delete <= 50` total cap.
- **Unknown key stripping**: `validateRequest` assigns `req.body = schema.parse(req.body)` so only validated fields reach handlers.
- **Plan + quotas (server-authoritative)**:
  - Added `User.subscription_tier` (`free`/`premium`) with default `free` and a migration.
  - Added `QuotaService` as the single source of truth for limits, allowed event kinds, feature flags, and hard safety caps.
  - Enforced quotas across team/player/season/match/event creation paths, formation changes, and viewer link minting (sync paths included).
  - Standardized machine-readable errors with `code` (`QUOTA_EXCEEDED`, `FEATURE_LOCKED`, etc.) and structured `details`.
- **Usage performance**: `GET /me/limits` usage counting avoids per-team N+1 queries (grouped player counts per team).
- **Limits API**: `GET /api/v1/me/limits` returns `{ planType, limits, allowedEventKinds, features, usage }`.
- **Feature flag**: `ENABLE_QUOTAS=false` disables plan quotas while keeping hard safety caps.
- **Operational safety**:
  - Quota/feature-lock responses use HTTP `402` (Payment Required) with a `Retry-After` hint header.
  - Error logging omits request bodies for quota denials and truncates other request bodies to avoid log abuse.

### Frontend
- **Per-record sync failure tracking** in IndexedDB via a new Dexie table `syncFailures` (schema bumped to v14).
- **Sync resilience**: `syncService` now classifies errors, applies exponential backoff + jitter, and quarantines permanent failures to avoid retry storms.
- **UX for blocked items**:
  - `OfflineSyncIndicator` shows a blocked/issues count.
  - `OfflineSyncIndicator` shows an approximate “retry in …” time when all pending items are in backoff.
  - Added `/sync-issues` page with actions: retry now / retry all, discard local change / discard all, export JSON, and upgrade CTA for quota-related failures.
- **Authenticated limits as UX**: fetch/caches `/me/limits` on login and periodically; best-effort local guardrails while offline; quick-event UI hides disallowed kinds on Free.
- **Shared constants**: Free/core allowed event kinds are shared via `shared/types/limits.ts` (used for guest/UX defaults).
- **Feature flag**: `VITE_ENABLE_SYNC_QUARANTINE=false` disables quarantine/backoff behavior (legacy retry loop).

### Tests
- Added focused backend unit tests for payload caps + quota behavior that do not require a database (`backend/tests/unit/quotas-and-validation.test.ts`).
- Updated frontend tests to account for `syncFailures` and to avoid requiring a running backend.
- Added frontend unit tests for sync quarantine classification/backoff, `/sync-issues` batch actions, and `useMeLimits` defaults.

### Deviations / notes
- Backend DB-backed integration tests are **gated behind** `RUN_DB_TESTS=true` due to sandbox/network constraints in this environment; when enabled, they still require a reachable Postgres and compatible Prisma engines.
- Per-user rate limiting and dedicated metrics were not added; existing IP rate limiting remains.
- Live match quick-event UI adds an optional “Show Premium events” toggle for Free users to reveal disabled premium-only event types (for discoverability).
