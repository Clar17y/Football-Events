# Investigation: Migrate IndexedDB Schema from snake_case to camelCase

## Background

Currently, the frontend IndexedDB schema uses snake_case field names to mirror the PostgreSQL database schema. This creates a transform chain:

```
PostgreSQL (snake_case)
    ↓ Prisma
Backend transform (snake → camel)
    ↓ API response (camelCase)
cacheService transform (camel → snake)  ← could be eliminated
    ↓ IndexedDB (snake_case)
Frontend transform (snake → camel)      ← could be simplified
    ↓ React (camelCase)
```

If IndexedDB used camelCase (matching API responses), we could potentially eliminate or simplify multiple transform layers.

## Investigation Tasks

### 1. Analyze Current IndexedDB Schema
- [ ] Read `frontend/src/db/schema.ts` - count all snake_case fields
- [ ] Read `frontend/src/db/indexedDB.ts` - understand table definitions and indexes
- [ ] List all tables: events, matches, teams, players, seasons, lineup, match_notes, match_periods, match_state, default_lineups, player_teams, outbox, sync_metadata, settings

### 2. Analyze Transform Layer Impact
- [ ] `frontend/src/db/transforms/` - which transforms could be eliminated vs simplified?
- [ ] `frontend/src/services/cacheService.ts` - could `serverXxxToDb` transforms be removed?
- [ ] `frontend/src/services/syncService.ts` - could `dbXxxToServerPayload` transforms be removed?
- [ ] `frontend/src/services/api/*.ts` - how would API services change?

### 3. Analyze Direct IndexedDB Access
Search for all direct IndexedDB field access patterns:
```bash
# Find all snake_case field access on db objects
grep -r "\.home_team_id\|\.away_team_id\|\.season_id\|\.match_id\|\.player_id\|\.team_id" frontend/src/
grep -r "\.full_name\|\.squad_number\|\.preferred_pos\|\.current_team" frontend/src/
grep -r "\.color_primary\|\.color_secondary\|\.away_color" frontend/src/
grep -r "\.kickoff_ts\|\.duration_mins\|\.period_format\|\.home_score\|\.away_score" frontend/src/
grep -r "\.clock_ms\|\.period_number\|\.is_deleted\|\.created_at\|\.updated_at" frontend/src/
grep -r "\.synced_at\|\.created_by_user_id" frontend/src/
```

### 4. Analyze Index Definitions
- [ ] Check `SCHEMA_INDEXES` in schema.ts - all index field names would need updating
- [ ] Compound indexes like `[match_id+player_id]` would become `[matchId+playerId]`

### 5. Migration Complexity Assessment

For each area, estimate:
- Number of files affected
- Risk level (low/medium/high)
- Whether it's mechanical (find-replace) or requires logic changes

Areas to assess:
1. Schema type definitions (`schema.ts`)
2. Database initialization (`indexedDB.ts`)
3. Transform layer (`transforms/*.ts`)
4. Cache service (`cacheService.ts`)
5. Sync service (`syncService.ts`)
6. API services (`api/*.ts`)
7. Components with direct DB access
8. Hooks with direct DB access
9. Test files

### 6. Data Migration Strategy
- [ ] How to handle existing IndexedDB data in users' browsers?
- [ ] Options: version bump with migration, clear and re-sync, or hybrid approach
- [ ] Consider Dexie's upgrade mechanism

### 7. Deliverables

Create a summary with:
1. **Scope**: Total files affected, lines of code estimated
2. **Risk Assessment**: What could break?
3. **Effort Estimate**: Rough hours/complexity
4. **Recommendation**: Is this worth doing? What's the ROI?
5. **Migration Plan**: If proceeding, what's the safest order of operations?

## Key Files to Examine

```
frontend/src/db/
├── schema.ts              # Type definitions (snake_case interfaces)
├── indexedDB.ts           # Dexie setup, table schemas, indexes
├── transforms/            # All transform functions
│   ├── index.ts
│   ├── teams.ts
│   ├── players.ts
│   ├── seasons.ts
│   ├── matches.ts
│   ├── events.ts
│   ├── lineups.ts
│   ├── matchState.ts
│   ├── playerTeams.ts
│   └── defaultLineups.ts

frontend/src/services/
├── cacheService.ts        # Server → IndexedDB (uses serverXxxToDb)
├── syncService.ts         # IndexedDB → Server (uses dbXxxToServerPayload)
├── dataLayer.ts           # Local writes to IndexedDB
└── api/                   # API services reading from IndexedDB
    ├── teamsApi.ts
    ├── playersApi.ts
    ├── seasonsApi.ts
    ├── matchesApi.ts
    ├── eventsApi.ts
    ├── lineupsApi.ts
    └── ...
```

## Success Criteria

After migration:
- [ ] All 93+ transform tests pass (or are updated)
- [ ] Frontend builds without TypeScript errors
- [ ] Existing data migrates correctly (or clean re-sync works)
- [ ] Sync to server still works
- [ ] Cache from server still works
- [ ] Reduced transform code complexity
