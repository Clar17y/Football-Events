# AI Prompt: Local-First READ Operations Refactor

Use this prompt with Claude Code or another AI coding assistant to systematically refactor the READ operations.

---

## Prompt

I'm working on a PWA (Progressive Web App) at `D:/Code/grassroots_pwa_starter/frontend` that has been partially refactored to a local-first architecture. The WRITE operations now use a dataLayer that writes to IndexedDB first with `synced: false`, and a background sync service pushes changes to the server.

However, the READ operations in the API services still have `isAuthenticated` branching:
- Guests read from IndexedDB
- Authenticated users read from server API

I need to refactor ALL READ operations to be local-first: everyone reads from IndexedDB, and the `useInitialSync` hook (already implemented) keeps data fresh from the server.

## Context Files to Read First

1. `frontend/src/services/dataLayer.ts` - Existing local-first write layer
2. `frontend/src/hooks/useLocalData.ts` - Reactive hooks using Dexie's useLiveQuery
3. `frontend/src/hooks/useInitialSync.ts` - Triggers refreshCache() on page load
4. `frontend/src/db/schema.ts` - IndexedDB schema definitions

## Files to Refactor

Refactor these API services to remove `isAuthenticated` checks from READ operations:

1. **`seasonsApi.ts`** - `getSeasons`, `getSeasonById`
2. **`teamsApi.ts`** - `getTeams`, `getTeamById`, `getTeamPlayers`
3. **`playersApi.ts`** - `getPlayers`, `getPlayerById`
4. **`matchesApi.ts`** - `getMatchesBySeason`, `getMatchesByTeam`, `getUpcoming`, `getRecent`, `getMatchById`
5. **`defaultLineupsApi.ts`** - `getDefaultLineup`, `getTeamsWithDefaults`

## Pattern to Follow

**Before (branching):**
```typescript
async getTeams(): Promise<Team[]> {
  if (!authApi.isAuthenticated()) {
    const { db } = await import('../../db/indexedDB');
    const teams = await db.teams.filter(t => !t.is_deleted).toArray();
    return teams.map(transformLocalToApi);
  }
  const response = await apiClient.get('/teams');
  return response.data;
}
```

**After (local-first):**
```typescript
async getTeams(): Promise<Team[]> {
  // Local-first: always read from IndexedDB
  const { db } = await import('../../db/indexedDB');
  const teams = await db.teams.filter(t => !t.is_deleted).toArray();
  return teams.map(t => ({
    id: t.id,
    name: t.name,
    // ... transform to API format
  }));
}
```

## Important Notes

1. **Keep quota checks** - `isAuthenticated` checks for guest quotas (in createTeam, createPlayer, etc.) should remain
2. **Keep the transform logic** - The guest path already has correct transforms from local schema to API format
3. **Remove server calls from READ paths** - The sync service handles server communication
4. **Filter out soft-deleted records** - Always add `.filter(r => !r.is_deleted)` or `.and(r => !r.is_deleted)`

## Refactor Order

Refactor in dependency order:
1. seasonsApi.ts (no dependencies)
2. teamsApi.ts (no dependencies)
3. playersApi.ts (may reference teams)
4. matchesApi.ts (references seasons, teams)
5. defaultLineupsApi.ts (references teams, players)

## Verification Steps

After each file:
1. Run `npx tsc --noEmit` to check for TypeScript errors
2. Run `npm run build` to verify build passes

## Deliverables

1. Refactored API services with local-first READ operations
2. No `isAuthenticated` branching in READ paths
3. Quota checks preserved in WRITE paths
4. Build passes successfully

Please start by reading the context files, then refactor one API service at a time, verifying the build after each change.
