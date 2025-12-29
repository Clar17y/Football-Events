# Claude Code Initial Prompt - Local-First Refactor Continuation

Copy and paste this prompt into Claude Code to continue the refactoring work:

---

I'm working on a major refactoring of a PWA (Progressive Web App) from server-first to local-first architecture. The project is a football/soccer team management app at `D:/Code/grassroots_pwa_starter/frontend`.

## ⚠️ CRITICAL BUG TO FIX FIRST

The refactored pages don't sync with the backend on load. When an authenticated user with empty IndexedDB loads a page, it shows empty instead of fetching from the server.

**Current (broken)**:
```
Page loads → useLiveQuery reads empty IndexedDB → Shows nothing
```

**Expected**:
```
Page loads → useLiveQuery reads IndexedDB → ALSO triggers refreshCache()
          → Server data populates IndexedDB → UI auto-updates
```

**Fix**: Add initial sync trigger to all refactored pages:
```typescript
useEffect(() => {
  if (authApi.isAuthenticated()) {
    refreshCache().catch(console.warn); // Non-blocking background sync
  }
}, []);
```

Or create a `useInitialSync()` hook and add it to: PlayersPage, TeamsPage, SeasonsPage, MatchesPage.

---

## What's Already Done

**Phase 1 (COMPLETE)**: Core local-first data layer created:
- `src/services/dataLayer.ts` - Wraps all IndexedDB writes with `synced: false` and `updated_at`
- `src/hooks/useLocalData.ts` - Reactive hooks using Dexie's `useLiveQuery`

**Phase 2 (COMPLETE)**: All API services refactored to local-first:
- teamsApi, playersApi, seasonsApi, matchesApi, lineupsApi, eventsApi, defaultLineupsApi, formationsApi

**Phase 3 (IN PROGRESS)**: Pages refactored to use reactive queries:
- ✅ PlayersPage, TeamsPage, SeasonsPage, MatchesPage - using useLocalData hooks
- ❌ LiveMatchPage - needs refactor (complex, has `if (!isAuthenticated)` branching)
- ❌ LineupManagementPage - needs refactor

**Phase 4-6 (NOT STARTED)**:
- Remove network error UI (rely on sync indicator only)
- Update sync service for proper soft delete handling
- Cleanup and testing

## What I Need Help With

Please help me continue the refactoring. Priority order:

### 🔴 Priority 1: Fix Initial Sync (CRITICAL BUG)
The refactored pages don't fetch data from server on load. Create a `useInitialSync()` hook and add it to all refactored pages (PlayersPage, TeamsPage, SeasonsPage, MatchesPage). For authenticated users with empty IndexedDB, we need to trigger `refreshCache()` on mount so server data populates the local DB.

### 🟡 Priority 2: LiveMatchPage.tsx refactor
Remove the `if (!isAuthenticated)` branching in handlers like `handleKickOff`, `handlePause`, `handleResume`, `handleEndPeriod`, `handleStartNextPeriod`, `handleComplete`. Make all users use the same local-first path (write to IndexedDB first, background sync handles server).

### 🟡 Priority 3: LineupManagementPage.tsx refactor
Update to use reactive queries from useLocalData.ts

### 🟢 Priority 4: Remove network error UI
Search for `showErrorToast`, `setError`, "Network error" displays across the codebase and remove them. Keep only validation/input errors.

### 🟢 Priority 5: Update syncService.ts
Add proper soft delete handling (if `is_deleted && !synced_at` → delete locally only; if `is_deleted && synced_at` → tell server then delete locally)

## Architecture Pattern

```typescript
// API services write locally first:
async createSomething(data) {
  const { someDataLayer } = await import('../dataLayer');
  const record = await someDataLayer.create(data); // IndexedDB with synced: false
  window.dispatchEvent(new CustomEvent('data:changed'));
  return { success: true, data: record };
}

// Pages use reactive hooks:
const { teams, loading } = useLocalTeams();
// No useEffect for fetching - data auto-updates!
```

## Full Documentation

I've placed a detailed documentation file in the project root:

**`LOCAL_FIRST_REFACTOR_CONTINUATION.md`**

Please read this file first - it contains:
- Complete architecture details and diagrams
- Full progress status for all 6 phases
- LiveMatchPage refactor specifics
- Implementation patterns to follow
- Testing scenarios

Run: `cat LOCAL_FIRST_REFACTOR_CONTINUATION.md` to read it.

## Key Source Files to Reference
- `src/services/dataLayer.ts` - See the pattern for local-first writes
- `src/hooks/useLocalData.ts` - See the reactive hooks implementation
- `src/pages/MatchesPage.tsx` - Example of a page already refactored

---

Please start by reading `LOCAL_FIRST_REFACTOR_CONTINUATION.md`, then create a `useInitialSync()` hook and add it to the refactored pages to fix the critical initial sync bug.

---
