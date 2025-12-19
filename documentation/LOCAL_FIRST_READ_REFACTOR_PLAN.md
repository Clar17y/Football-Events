# Local-First READ Operations Refactor Plan

## Overview

The current codebase has `isAuthenticated` checks in API service READ operations that branch between:
- **Guest**: Read from IndexedDB only
- **Authenticated**: Read from server API

For a true local-first architecture, ALL users should read from IndexedDB, with background sync keeping data fresh.

## Current State

### Files Requiring Refactor

| File | Occurrences | Functions |
|------|-------------|-----------|
| `matchesApi.ts` | 6 | `getMatchesBySeason`, `getMatchesByTeam`, `getUpcoming`, `getRecent`, `getMatchById`, `createMatch` |
| `teamsApi.ts` | 6 | `getTeams`, `getTeamById`, `createTeam`, `updateTeam`, `deleteTeam`, `getTeamPlayers` |
| `seasonsApi.ts` | 2 | `getSeasons`, `getSeasonById` |
| `playersApi.ts` | 1+ | `getPlayers`, `getPlayerById`, etc. |
| `defaultLineupsApi.ts` | 3 | `getDefaultLineup`, `getTeamsWithDefaults`, `applyDefaultToMatch` |

### Pattern to Replace

**Current (branching):**
```typescript
async getMatchesBySeason(seasonId: string): Promise<Match[]> {
  if (!authApi.isAuthenticated()) {
    // Guest: read from IndexedDB
    const { db } = await import('../../db/indexedDB');
    const matches = await db.matches.where('season_id').equals(seasonId).toArray();
    return matches.map(transformToApiFormat);
  }
  // Authenticated: read from server
  const response = await apiClient.get(`/matches/season/${seasonId}`);
  return response.data;
}
```

**Target (local-first):**
```typescript
async getMatchesBySeason(seasonId: string): Promise<Match[]> {
  // Always read from IndexedDB (local-first)
  const { db } = await import('../../db/indexedDB');
  const matches = await db.matches
    .where('season_id')
    .equals(seasonId)
    .filter(m => !m.is_deleted)
    .toArray();
  return matches.map(transformToApiFormat);
  // Background sync (useInitialSync) keeps IndexedDB fresh from server
}
```

## Implementation Strategy

### Phase 1: Audit & Document (1-2 hours)
1. List every `isAuthenticated` check in API services
2. Categorize as: READ, WRITE, QUOTA, or OTHER
3. Document the transformation function for each entity

### Phase 2: Create Shared Transform Utilities (1 hour)
Create `src/services/transforms.ts`:
```typescript
export function localMatchToApi(m: LocalMatch): Match { ... }
export function localTeamToApi(t: LocalTeam): Team { ... }
export function localPlayerToApi(p: LocalPlayer): Player { ... }
export function localSeasonToApi(s: LocalSeason): Season { ... }
```

### Phase 3: Refactor READ Operations (3-4 hours)
For each API service, in dependency order:
1. `seasonsApi.ts` - no dependencies
2. `teamsApi.ts` - no dependencies
3. `playersApi.ts` - depends on teams
4. `matchesApi.ts` - depends on seasons, teams
5. `defaultLineupsApi.ts` - depends on teams, players

### Phase 4: Update Reactive Hooks (1 hour)
Ensure `useLocalData.ts` hooks cover all query patterns:
- `useLocalMatchesBySeason(seasonId)`
- `useLocalMatchesByTeam(teamId)`
- `useLocalTeamPlayers(teamId)`
- etc.

### Phase 5: Testing & Verification (1-2 hours)
1. Test offline mode for all pages
2. Test sync after coming online
3. Verify no regressions in authenticated flow

## Files to Modify

```
frontend/src/services/api/
├── matchesApi.ts      # 6 READ functions
├── teamsApi.ts        # 6 READ functions
├── seasonsApi.ts      # 2 READ functions
├── playersApi.ts      # ~4 READ functions
├── defaultLineupsApi.ts # 3 READ functions
└── eventsApi.ts       # Already local-first (verify)

frontend/src/services/
├── transforms.ts      # NEW - shared transform utilities
└── dataLayer.ts       # May need additional query methods

frontend/src/hooks/
└── useLocalData.ts    # May need additional hooks
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data staleness | useInitialSync triggers refresh on page load |
| Missing data on first load | Show loading state, then data appears after sync |
| Transform inconsistencies | Create single source of truth in transforms.ts |
| Breaking existing functionality | Refactor one service at a time, test thoroughly |

## Success Criteria

1. All API READ operations read from IndexedDB first
2. No `isAuthenticated` checks in READ paths (only WRITE quotas remain)
3. App works fully offline after initial sync
4. No regression in authenticated user experience
5. Build passes with no new TypeScript errors

## Estimated Effort

| Phase | Hours |
|-------|-------|
| Audit & Document | 1-2 |
| Transform Utilities | 1 |
| Refactor READ Ops | 3-4 |
| Update Hooks | 1 |
| Testing | 1-2 |
| **Total** | **7-10** |
