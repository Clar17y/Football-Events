# Local-First Architecture Refactor - Continuation Guide for Claude Code

## ⚠️ CRITICAL ISSUE: Missing Initial Sync on Page Load

**Problem**: When an authenticated user loads a page with an empty IndexedDB, the page shows empty instead of fetching data from the server.

**Current behavior**:
```
Page loads → useLiveQuery reads empty IndexedDB → Shows nothing
```

**Expected behavior**:
```
Page loads → useLiveQuery reads IndexedDB (may be empty)
          → Triggers cache refresh from server (non-blocking)
          → Server data written to IndexedDB
          → useLiveQuery auto-updates UI
```

**Fix needed**: Each page needs to trigger an initial sync for authenticated users on mount:

```typescript
// Option 1: In each page
useEffect(() => {
  if (authApi.isAuthenticated()) {
    refreshCache().catch(console.warn); // Non-blocking
  }
}, []);

// Option 2: Create a shared hook
// src/hooks/useInitialSync.ts
export function useInitialSync() {
  const [syncing, setSyncing] = useState(false);
  
  useEffect(() => {
    if (authApi.isAuthenticated()) {
      setSyncing(true);
      refreshCache().finally(() => setSyncing(false));
    }
  }, []);
  
  return { syncing };
}

// Usage in pages:
const { syncing } = useInitialSync();
const { players, loading } = useLocalPlayers();
// Show spinner if syncing && players.length === 0
```

**Files to modify**: All refactored pages need this initial sync trigger added:
- `PlayersPage.tsx`
- `TeamsPage.tsx`
- `SeasonsPage.tsx`
- `MatchesPage.tsx`

---

## Project Context

**Project**: Grassroots PWA Starter (Football/Soccer team management app)
**Location**: `D:/Code/grassroots_pwa_starter/frontend`
**Tech Stack**: React, TypeScript, Ionic Framework, Dexie (IndexedDB), Vite

## Overview

This is a major refactoring effort to convert a PWA from **server-first-with-IndexedDB-fallback** to a true **local-first architecture** where IndexedDB is the source of truth for the UI, with background sync handling server communication.

### Target Architecture

```
UI Components → useLiveQuery hooks → IndexedDB (source of truth)
                                          ↓
                                    synced: false
                                          ↓
                              Background Sync Service → Server API
                                          ↓
                              Cache Refresh → IndexedDB (synced: true)
```

### Key Architectural Decisions Made

- ✅ Client-generated UUIDs (already implemented)
- ✅ Last-write-wins conflict resolution (based on `updated_at`)
- ✅ Reactive UI with Dexie's `useLiveQuery`
- ✅ Unified guest/auth write path (same code for both)
- ✅ All writes set `synced: false` and `updated_at: Date.now()`
- ✅ Background sync pushes to server when online
- ✅ Soft deletes: mark `is_deleted: true` locally, sync service handles server notification

---

## Progress Status

### ✅ Phase 1: Core Local-First Data Layer - COMPLETE

Created files:
- `src/services/dataLayer.ts` - Unified data layer with CRUD for all entities
- `src/hooks/useLocalData.ts` - Reactive hooks using `useLiveQuery`

The dataLayer provides:
- `teamsDataLayer` - create, update, delete, getById, getAll
- `playersDataLayer` - create, update, delete, getById, getAll
- `seasonsDataLayer` - create, update, delete, getById, getAll
- `matchesDataLayer` - create, update, delete, getById, getAll
- `eventsDataLayer` - create, update, delete, getByMatch
- `lineupsDataLayer` - create, update, delete, getByMatch
- `matchStateDataLayer` - upsert, get
- `matchPeriodsDataLayer` - create, endPeriod, getByMatch
- `defaultLineupsDataLayer` - save, getByTeam, delete

The useLocalData hooks provide:
- `useLocalTeams(options?)` - reactive teams list
- `useLocalPlayers(options?)` - reactive players list  
- `useLocalSeasons(options?)` - reactive seasons list
- `useLocalMatches(options?)` - reactive matches list
- `useLocalEvents(matchId)` - reactive events for a match
- `useLocalLineups(matchId)` - reactive lineups for a match
- `useLocalMatchState(matchId)` - reactive match state
- `useLocalMatchPeriods(matchId)` - reactive match periods
- `useLocalDefaultLineup(teamId)` - reactive default lineup
- `useLocalSyncStatus()` - counts of unsynced records

### ✅ Phase 2: Refactor API Services - COMPLETE

All API services refactored to local-first writes:
- ✅ `teamsApi.ts` - createTeam, updateTeam, deleteTeam
- ✅ `playersApi.ts` - createPlayer, updatePlayer, updatePlayerWithTeams, deletePlayer
- ✅ `seasonsApi.ts` - createSeason, updateSeason, deleteSeason
- ✅ `matchesApi.ts` - updateMatch, deleteMatch
- ✅ `lineupsApi.ts` - create, update, delete
- ✅ `eventsApi.ts` - create, update, delete
- ✅ `defaultLineupsApi.ts` - saveDefaultLineup, updateDefaultLineup, deleteDefaultLineup
- ✅ `formationsApi.ts` - applyChange

### 🔄 Phase 3: Refactor Pages to Use Reactive Queries - IN PROGRESS

Completed pages:
- ✅ `PlayersPage.tsx` - uses `useLocalPlayers()`
- ✅ `TeamsPage.tsx` - uses `useLocalTeams()`
- ✅ `SeasonsPage.tsx` - uses `useLocalSeasons()`
- ✅ `MatchesPage.tsx` - uses `useLocalMatches()`, `useLocalTeams()`

**Remaining pages:**
- ⏳ `LiveMatchPage.tsx` - Complex page with SSE, timers, viewer mode. Needs local-first refactor for:
  - `handleKickOff` - currently has `if (!isAuthenticated)` branching
  - `handlePause` - needs unification
  - `handleResume` - needs unification
  - `handleEndPeriod` - needs unification
  - `handleStartNextPeriod` - needs unification
  - `handleComplete` - needs unification
  
- ⏳ `LineupManagementPage.tsx` - default lineups management

- ⏳ Modals/Components that load data:
  - `CreateMatchModal.tsx` - may need to use `useLocalTeams()` instead of API
  - Other modals loading teams/players/seasons

### ❌ Phase 4: Remove Network Error UI - NOT STARTED

Tasks:
- [ ] Remove error toasts for network failures across all pages
- [ ] Remove "Network error" message displays
- [ ] Remove "Try Again" buttons for network errors
- [ ] Keep sync indicator in header as only connectivity feedback
- [ ] Add optional "Last synced: X mins ago" display

Files to modify:
- `MatchesPage.tsx` - remove `setError()`, `setShowErrorToast()` in catch blocks
- `PlayersPage.tsx` - remove error state and toast notifications
- `TeamsPage.tsx` - remove error handling for network failures
- `SeasonsPage.tsx` - remove error handling for network failures
- Search for `showErrorToast` across codebase and remove network error toasts
- Keep validation/input error toasts (those are still useful)

### ❌ Phase 5: Update Sync Service - NOT STARTED

Tasks:
- [ ] Implement proper soft delete handling in syncService.ts:
  ```typescript
  // If record.is_deleted && !record.synced_at -> just delete locally (never synced)
  // If record.is_deleted && record.synced_at -> tell server, then delete locally
  ```
- [ ] Ensure last-write-wins using `updated_at` during sync
- [ ] Add sync triggers: after local writes via dataLayer
- [ ] Add "Last synced" timestamp tracking in cacheService.ts

### ❌ Phase 6: Cleanup and Testing - NOT STARTED

Tasks:
- [ ] Remove remaining `if (!authApi.isAuthenticated())` conditionals in API services
- [ ] Remove `try { await apiClient.get() } catch { /* fallback */ }` patterns
- [ ] Remove `showOfflineToast()` calls
- [ ] Update existing tests
- [ ] Add new tests for local-first behavior

---

## LiveMatchPage Refactor Details

The `LiveMatchPage.tsx` is the most complex page to refactor. Current state:

| Operation | Guest Mode | Authenticated Mode |
|-----------|------------|-------------------|
| Kick Off | ✅ IndexedDB direct | ❌ API call (blocks) |
| Pause | ✅ IndexedDB direct | ❌ API call (blocks) |
| Resume | ✅ IndexedDB direct | ❌ API call (blocks) |
| End Period | ✅ IndexedDB direct | ❌ API call (blocks) |
| Start Next Period | ✅ IndexedDB direct | ❌ API call (blocks) |
| Complete Match | ✅ IndexedDB direct | ❌ API call (blocks) |
| Add Event | ✅ IndexedDB direct | ✅ Via eventsApi (local-first) |

**Solution**: Remove `if (!isAuthenticated)` branching. All users should follow same flow:
1. Write to IndexedDB with `synced: false`
2. Update UI state immediately
3. Trigger background sync

**Recommended approach**: Create a `matchSyncService.ts` for dedicated match state/period sync handling.

---

## Key Files Reference

### Core Services (already created)
- `src/services/dataLayer.ts` - All local-first write operations
- `src/hooks/useLocalData.ts` - Reactive query hooks

### API Services (already refactored)
- `src/services/api/teamsApi.ts`
- `src/services/api/playersApi.ts`
- `src/services/api/seasonsApi.ts`
- `src/services/api/matchesApi.ts`
- `src/services/api/lineupsApi.ts`
- `src/services/api/eventsApi.ts`
- `src/services/api/defaultLineupsApi.ts`
- `src/services/api/formationsApi.ts`

### Pages (status varies)
- `src/pages/PlayersPage.tsx` - ✅ Refactored
- `src/pages/TeamsPage.tsx` - ✅ Refactored
- `src/pages/SeasonsPage.tsx` - ✅ Refactored
- `src/pages/MatchesPage.tsx` - ✅ Refactored
- `src/pages/LiveMatchPage.tsx` - ⏳ Needs refactor
- `src/pages/LineupManagementPage.tsx` - ⏳ Needs refactor

### Sync/Cache Services
- `src/services/syncService.ts` - Needs soft delete handling update
- `src/services/cacheService.ts` - Needs "Last synced" tracking

### Database
- `src/db/indexedDB.ts` - Dexie database definition
- `src/db/schema.ts` - TypeScript type definitions for enhanced records

---

## How to Continue

1. **Start by reviewing current state**:
   ```bash
   cd frontend
   grep -r "useLocalTeams\|useLocalPlayers\|useLocalMatches\|useLocalSeasons" src/pages/
   ```

2. **For LiveMatchPage refactor**, look for:
   ```bash
   grep -n "!isAuthenticated\|!authApi.isAuthenticated" src/pages/LiveMatchPage.tsx
   ```

3. **Run tests**:
   ```bash
   cd frontend && npm test
   ```

4. **Start dev server**:
   ```bash
   cd frontend && npm run dev
   ```

---

## Pattern to Follow for Local-First Writes

```typescript
// In API service (e.g., teamsApi.ts)
async createTeam(teamData: TeamCreateRequest): Promise<TeamResponse> {
  // Import dataLayer
  const { teamsDataLayer } = await import('../dataLayer');
  
  // Write locally first - this always succeeds
  const team = await teamsDataLayer.create({
    name: teamData.name,
    // ... other fields
  });
  
  // Trigger data change event for sync service
  try { window.dispatchEvent(new CustomEvent('data:changed')); } catch { }
  
  // Return immediately - background sync handles server
  return {
    data: { id: team.id, name: team.name, /* ... */ },
    success: true,
    message: 'Team created'
  };
}
```

## Pattern for Reactive Queries in Pages

```typescript
// In page component
import { useLocalTeams, useLocalPlayers } from '../hooks/useLocalData';

const MyPage: React.FC = () => {
  // Data automatically updates when IndexedDB changes
  const { teams, loading: teamsLoading } = useLocalTeams();
  const { players, loading: playersLoading } = useLocalPlayers({ teamId: selectedTeam });
  
  // No useEffect needed for data fetching!
  // No manual refresh needed - data auto-updates
  
  if (teamsLoading) return <Spinner />;
  
  return (
    <div>
      {teams.map(team => (
        <TeamCard key={team.id} team={team} />
      ))}
    </div>
  );
};
```

---

## Dependencies

Ensure these are installed:
- `dexie` - IndexedDB wrapper
- `dexie-react-hooks` - For `useLiveQuery`

```bash
npm install dexie dexie-react-hooks
```

---

## Testing Scenarios

### Manual Test 1: Offline Player Creation
1. Log in, clear IndexedDB
2. Create player while online → Check IndexedDB for `synced: false`
3. Refresh → Player should appear from IndexedDB
4. Wait for sync → Check `synced: true`

### Manual Test 2: Offline Match Creation
1. Create team/player while online
2. Go offline (DevTools → Network → Offline)
3. Navigate to Matches → Should NOT show "Network error"
4. Create match → Should succeed (stored locally)
5. Go online → Watch sync indicator

### Manual Test 3: Data Consistency
1. Create player while online
2. Go offline
3. Edit player's name
4. Refresh → Edited name persists
5. Go online → Wait for sync
6. Hard refresh → Name still correct

---

## Notes

- The sync indicator in the header should show pending items when offline
- Guest mode users don't sync to server (they have no account) but use same local-first path
- Use `window.dispatchEvent(new CustomEvent('data:changed'))` after writes to trigger sync
- All records have `synced`, `created_at`, `updated_at`, `is_deleted`, `created_by_user_id` fields
