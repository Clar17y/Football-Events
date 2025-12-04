# Offline Sync Architecture Refactor

## Overview

This document outlines the plan to refactor the offline sync architecture from an outbox-based approach to a local-tables-with-synced-flag approach.

**Status:** In Progress - Milestones 1-3 Complete (3/8 milestones)
**Started:** 2025-12-03
**Last Updated:** 2025-12-03

### Progress Summary

| Milestone | Status | Completed Date |
|-----------|--------|----------------|
| 1. Schema & Types | ✅ Complete | 2025-12-03 |
| 2. Event Storage | ✅ Complete | 2025-12-03 |
| 3. Match State Storage | ✅ Complete | 2025-12-03 |
| 4. Import Updates | ⏳ Not Started | - |
| 5. Sync Service | ⏳ Not Started | - |
| 6. Caching | ⏳ Not Started | - |
| 7. Migration | ⏳ Not Started | - |
| 8. Cleanup | ⏳ Not Started | - |

### Current Problems

1. **Events not imported**: Guest mode events go to outbox only, but import reads from events table
2. **Match commands use wrong user ID**: Created with `temp-user-id` instead of guest user ID
3. **Period timestamps lost**: Import calls APIs that timestamp as "now", losing original times
4. **Inconsistent storage**: Some data in tables, some only in outbox
5. **No proper caching strategy**: No distinction between reference data and temporal data

### Target Architecture

- **Local tables = source of truth** for offline operation
- **Synced flag** on each record instead of separate outbox
- **Reference data** (teams, players, seasons) cached indefinitely
- **Temporal data** (matches, events) cached for 30 days
- **Match state** stored in dedicated `match_periods` and `match_state` tables

---

## Data Flow Diagrams

### Guest Mode (New)

```
User creates event
    ↓
Write to events table (synced: false, created_by_user_id: 'guest-xxx')
    ↓
UI updates immediately
    ↓
[No sync attempt - user not authenticated]
```

### Logged In Mode (New)

```
User creates event
    ↓
Write to events table (synced: false, created_by_user_id: user.id)
    ↓
UI updates immediately
    ↓
Background sync worker processes unsynced items
    ↓
POST to /api/events
    ↓
Mark synced: true
```

### Import Flow (New)

```
User logs in
    ↓
Check for guest data in local tables (created_by_user_id starts with 'guest-')
    ↓
Read ALL guest data from LOCAL TABLES
    ↓
Push to server with ID mapping
    ↓
Clear local tables
    ↓
Reload page → fetch fresh from server
```

---

## Implementation Phases

### Phase 1: Schema Updates

Add `synced` field to all relevant tables and create new match state tables.

**Files to modify:**
- `frontend/src/db/schema.ts`
- `frontend/src/db/indexedDB.ts`
- `frontend/src/types/database.ts`

#### 1.1 Add synced field to schema types

```typescript
// In types/database.ts - add to base interface
interface SyncableRecord {
  synced: boolean;  // false = needs sync, true = synced to server
  synced_at?: number;  // timestamp of last successful sync
}

// Update each Enhanced* interface to extend SyncableRecord
interface EnhancedEvent extends SyncableRecord {
  // ... existing fields
}

interface EnhancedMatch extends SyncableRecord {
  // ... existing fields
}

// etc for: EnhancedTeam, EnhancedPlayer, EnhancedSeason, EnhancedLineup
```

#### 1.2 Create match_periods table

```typescript
// In types/database.ts
interface LocalMatchPeriod {
  id: string;  // UUID
  match_id: string;
  period_number: number;
  period_type: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT';
  started_at: number;  // timestamp - PRESERVE ORIGINAL
  ended_at?: number;   // timestamp - PRESERVE ORIGINAL
  duration_seconds?: number;
  created_by_user_id: string;
  synced: boolean;
  synced_at?: number;
}
```

#### 1.3 Create match_state table

```typescript
// In types/database.ts
interface LocalMatchState {
  match_id: string;  // Primary key
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  current_period_id?: string;
  timer_ms: number;  // elapsed time
  last_updated_at: number;
  created_by_user_id: string;
  synced: boolean;
  synced_at?: number;
}
```

#### 1.4 Update IndexedDB schema version

```typescript
// In indexedDB.ts - add new version migration
db.version(X).stores({
  // Existing tables - add synced index
  events: '++id, match_id, player_id, team_id, kind, sentiment, created_by_user_id, synced, [match_id+synced]',
  matches: '++id, season_id, home_team_id, away_team_id, created_by_user_id, synced, [created_by_user_id+synced]',
  teams: '++id, name, created_by_user_id, synced',
  players: '++id, team_id, name, created_by_user_id, synced',
  seasons: '++id, label, created_by_user_id, synced',
  lineup: '[match_id+player_id+start_min], match_id, player_id, synced',

  // New tables
  match_periods: '++id, match_id, period_number, created_by_user_id, synced, [match_id+synced]',
  match_state: 'match_id, status, created_by_user_id, synced',

  // Keep outbox for migration period only
  outbox: '++id, table_name, record_id, synced, created_by_user_id'
});
```

---

### Phase 2: Update Event Creation

Change guest mode to write events to events table instead of outbox.

**Files to modify:**
- `frontend/src/pages/LiveMatchPage.tsx`
- `frontend/src/db/indexedDB.ts`

#### 2.1 Create new addEventToTable function

```typescript
// In db/indexedDB.ts
export async function addEventToTable(event: Partial<EnhancedEvent>): Promise<string> {
  const id = event.id || uuid();

  await db.events.add({
    id,
    match_id: event.match_id,
    team_id: event.team_id,
    player_id: event.player_id,
    kind: event.kind,
    minute: event.minute,
    second: event.second,
    period: event.period,
    clock_ms: event.clock_ms,
    sentiment: event.sentiment,
    data: event.data || {},
    created_at: Date.now(),
    created_by_user_id: event.created_by_user_id,
    synced: false,  // Key change: mark as unsynced
    is_deleted: false
  });

  return id;
}
```

#### 2.2 Update LiveMatchPage event creation

```typescript
// In LiveMatchPage.tsx - handleSubmitEvent function
// BEFORE (guest mode):
const result = await db.addEvent({...});  // Adds to outbox

// AFTER (guest mode):
const { addEventToTable } = await import('../db/indexedDB');
const eventId = await addEventToTable({
  id: uuid(),
  kind: payload.kind,
  match_id: payload.matchId,
  team_id: payload.teamId,
  player_id: payload.playerId,
  minute: Math.floor((payload.clockMs || 0) / 60000),
  second: Math.floor(((payload.clockMs || 0) % 60000) / 1000),
  clock_ms: payload.clockMs,
  period: payload.periodNumber,
  sentiment: payload.sentiment,
  data: payload.notes ? { notes: payload.notes } : {},
  created_by_user_id: guestUserId,  // Pass the actual guest ID
  synced: false
});
```

---

### Phase 3: Update Match Commands

Store match periods and state in dedicated tables instead of outbox + settings.

**Files to modify:**
- `frontend/src/pages/LiveMatchPage.tsx`
- `frontend/src/db/indexedDB.ts`

#### 3.1 Create match period helper functions

```typescript
// In db/indexedDB.ts
export async function createMatchPeriod(period: Partial<LocalMatchPeriod>): Promise<string> {
  const id = period.id || uuid();

  await db.match_periods.add({
    id,
    match_id: period.match_id!,
    period_number: period.period_number!,
    period_type: period.period_type || 'REGULAR',
    started_at: period.started_at || Date.now(),  // Preserve original timestamp
    ended_at: period.ended_at,
    duration_seconds: period.duration_seconds,
    created_by_user_id: period.created_by_user_id!,
    synced: false
  });

  return id;
}

export async function endMatchPeriod(
  matchId: string,
  periodId: string,
  endedAt: number
): Promise<void> {
  const period = await db.match_periods.get(periodId);
  if (!period) return;

  const durationSeconds = Math.floor((endedAt - period.started_at) / 1000);

  await db.match_periods.update(periodId, {
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    synced: false  // Mark as needing sync again
  });
}

export async function getMatchPeriods(matchId: string): Promise<LocalMatchPeriod[]> {
  return db.match_periods.where('match_id').equals(matchId).toArray();
}
```

#### 3.2 Create match state helper functions

```typescript
// In db/indexedDB.ts
export async function updateMatchState(
  matchId: string,
  updates: Partial<LocalMatchState>
): Promise<void> {
  const existing = await db.match_state.get(matchId);

  if (existing) {
    await db.match_state.update(matchId, {
      ...updates,
      last_updated_at: Date.now(),
      synced: false
    });
  } else {
    await db.match_state.add({
      match_id: matchId,
      status: updates.status || 'NOT_STARTED',
      current_period_id: updates.current_period_id,
      timer_ms: updates.timer_ms || 0,
      last_updated_at: Date.now(),
      created_by_user_id: updates.created_by_user_id!,
      synced: false
    });
  }
}

export async function getMatchState(matchId: string): Promise<LocalMatchState | undefined> {
  return db.match_state.get(matchId);
}
```

#### 3.3 Update LiveMatchPage - handleKickOff

```typescript
// BEFORE:
await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', {
  matchId: selectedId,
  cmd: 'start_match'
});
await db.settings.put({ key: `local_live_state:${selectedId}`, value: JSON.stringify({...}) });

// AFTER:
const { createMatchPeriod, updateMatchState } = await import('../db/indexedDB');

// Create first period with ACTUAL timestamp
const periodId = await createMatchPeriod({
  match_id: selectedId,
  period_number: 1,
  period_type: 'REGULAR',
  started_at: Date.now(),  // Preserved!
  created_by_user_id: guestUserId
});

// Update match state
await updateMatchState(selectedId, {
  status: 'LIVE',
  current_period_id: periodId,
  timer_ms: 0,
  created_by_user_id: guestUserId
});
```

#### 3.4 Update LiveMatchPage - handleEndPeriod

```typescript
// BEFORE:
await addToOutbox('match_commands', `cmd-${Date.now()}`, 'INSERT', {
  matchId: selectedId,
  cmd: 'end_period',
  periodId: currentPeriod.id
});

// AFTER:
const { endMatchPeriod, updateMatchState } = await import('../db/indexedDB');

// End period with ACTUAL timestamp
await endMatchPeriod(selectedId, currentPeriod.id, Date.now());

// Update match state
await updateMatchState(selectedId, {
  status: 'PAUSED',
  current_period_id: undefined,
  timer_ms: timerMs
});
```

#### 3.5 Update LiveMatchPage - hydration on load

```typescript
// BEFORE:
const rec = await db.settings.get(`local_live_state:${matchId}`);
const parsed = JSON.parse(rec.value);

// AFTER:
const { getMatchState, getMatchPeriods } = await import('../db/indexedDB');

const matchState = await getMatchState(matchId);
const periods = await getMatchPeriods(matchId);

if (matchState) {
  setStatus(matchState.status);
  setPeriods(periods.map(p => ({
    id: p.id,
    periodNumber: p.period_number,
    periodType: p.period_type,
    startedAt: new Date(p.started_at).toISOString(),
    endedAt: p.ended_at ? new Date(p.ended_at).toISOString() : undefined,
    durationSeconds: p.duration_seconds
  })));

  // Recalculate timer based on current period's startedAt
  if (matchState.status === 'LIVE' && matchState.current_period_id) {
    const currentPeriod = periods.find(p => p.id === matchState.current_period_id);
    if (currentPeriod) {
      const elapsed = Date.now() - currentPeriod.started_at;
      setTimerMs(elapsed);
    }
  } else {
    setTimerMs(matchState.timer_ms);
  }
}
```

---

### Phase 4: Update Import Service

Read from local tables instead of outbox.

**Files to modify:**
- `frontend/src/services/importService.ts`

#### 4.1 Update hasGuestData

```typescript
// Check all tables for unsynced guest data
export async function hasGuestData(): Promise<boolean> {
  const isGuestId = (id: string) => id && id.startsWith('guest-');

  // Check main tables
  const [seasons, teams, players, matches, events, lineups, periods, states] = await Promise.all([
    db.seasons.filter(s => isGuestId(s.created_by_user_id)).count(),
    db.teams.filter(t => isGuestId(t.created_by_user_id)).count(),
    db.players.filter(p => isGuestId(p.created_by_user_id)).count(),
    db.matches.filter(m => isGuestId(m.created_by_user_id)).count(),
    db.events.filter(e => isGuestId(e.created_by_user_id)).count(),
    db.lineup.filter(l => isGuestId(l.created_by_user_id)).count(),
    db.match_periods.filter(p => isGuestId(p.created_by_user_id)).count(),
    db.match_state.filter(s => isGuestId(s.created_by_user_id)).count()
  ]);

  return (seasons + teams + players + matches + events + lineups + periods + states) > 0;
}
```

#### 4.2 Update runImport - read events from table

```typescript
// BEFORE:
const allEvents = await db.events.toArray();  // Was empty for guest mode!

// AFTER (events already in table):
const allEvents = await db.events.toArray();
const guestEvents = allEvents.filter(e => isGuestId(e.created_by_user_id));
```

#### 4.3 Update runImport - read periods from table

```typescript
// BEFORE:
const liveStateRec = await db.settings.get(`local_live_state:${m.id}`);
const liveState = JSON.parse(liveStateRec.value);
const periods = liveState.periods || [];

// For each period, call API which loses timestamps:
for (const p of periods) {
  await matchesApi.startPeriod(serverMatchId, p.periodType);  // NEW timestamp!
}

// AFTER:
const localPeriods = await db.match_periods
  .where('match_id').equals(m.id)
  .toArray();

// Import periods with ORIGINAL timestamps using direct API
for (const p of localPeriods) {
  await matchesApi.createPeriodWithTimestamp(serverMatchId, {
    periodNumber: p.period_number,
    periodType: p.period_type,
    startedAt: new Date(p.started_at).toISOString(),  // Original!
    endedAt: p.ended_at ? new Date(p.ended_at).toISOString() : undefined,
    durationSeconds: p.duration_seconds
  });
}
```

#### 4.4 Add backend endpoint for period import

```typescript
// In backend/src/routes/matches.ts
// New endpoint to import periods with preserved timestamps
router.post('/:id/periods/import', async (req, res) => {
  const { id } = req.params;
  const { periodNumber, periodType, startedAt, endedAt, durationSeconds } = req.body;

  const period = await prisma.matchPeriod.create({
    data: {
      match_id: id,
      period_number: periodNumber,
      period_type: periodType,
      started_at: new Date(startedAt),
      ended_at: endedAt ? new Date(endedAt) : null,
      duration_seconds: durationSeconds
    }
  });

  res.json(period);
});
```

#### 4.5 Update cleanup phase

```typescript
// Add cleanup for new tables
await db.match_periods.where('created_by_user_id').startsWithAnyOf(guestIds).delete();
await db.match_state.where('created_by_user_id').startsWithAnyOf(guestIds).delete();

// Remove old settings cleanup (no longer needed)
// REMOVE: await db.settings.where('key').startsWith('local_live_state:').delete();
```

---

### Phase 5: Update Sync Service

Process unsynced items from tables instead of outbox.

**Files to modify:**
- `frontend/src/services/syncService.ts`

#### 5.1 New sync approach

```typescript
// In syncService.ts
export async function flushOnce(): Promise<void> {
  if (!navigator.onLine) return;
  if (!apiClient.isAuthenticated()) return;

  // Check for guest data that needs import first
  const needsImport = await hasGuestData();
  if (needsImport) {
    window.dispatchEvent(new CustomEvent('import:needed'));
    return;
  }

  // Sync unsynced items from each table
  await syncEvents();
  await syncMatchPeriods();
  await syncMatchState();
  await syncLineups();
}

async function syncEvents(): Promise<void> {
  const unsynced = await db.events
    .where('synced').equals(false)
    .and(e => !e.created_by_user_id.startsWith('guest-'))  // Only sync authenticated user's data
    .limit(50)
    .toArray();

  for (const event of unsynced) {
    try {
      await eventsApi.create({
        matchId: event.match_id,
        kind: event.kind,
        periodNumber: event.period,
        clockMs: event.clock_ms || (event.minute * 60000 + event.second * 1000),
        teamId: event.team_id,
        playerId: event.player_id,
        sentiment: event.sentiment
      });

      await db.events.update(event.id, {
        synced: true,
        synced_at: Date.now()
      });
    } catch (error) {
      console.error('Failed to sync event:', event.id, error);
    }
  }
}

async function syncMatchPeriods(): Promise<void> {
  const unsynced = await db.match_periods
    .where('synced').equals(false)
    .and(p => !p.created_by_user_id.startsWith('guest-'))
    .toArray();

  for (const period of unsynced) {
    try {
      // Use appropriate API based on whether period is complete
      if (period.ended_at) {
        await matchesApi.createPeriodWithTimestamp(period.match_id, {
          periodNumber: period.period_number,
          periodType: period.period_type,
          startedAt: new Date(period.started_at).toISOString(),
          endedAt: new Date(period.ended_at).toISOString(),
          durationSeconds: period.duration_seconds
        });
      } else {
        // Period still in progress - just start it
        await matchesApi.startPeriod(period.match_id, period.period_type);
      }

      await db.match_periods.update(period.id, {
        synced: true,
        synced_at: Date.now()
      });
    } catch (error) {
      console.error('Failed to sync period:', period.id, error);
    }
  }
}
```

---

### Phase 6: Implement Caching Strategy

Different retention policies for reference vs temporal data.

**Files to modify:**
- `frontend/src/services/cacheService.ts` (new file)
- `frontend/src/App.tsx` or main entry point

#### 6.1 Create cache service

```typescript
// New file: frontend/src/services/cacheService.ts

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Reference data: Always keep locally for offline access
 * - Teams (yours + opponents)
 * - Players (your roster)
 * - Seasons (current + recent)
 * - Positions
 */
export async function refreshReferenceData(): Promise<void> {
  if (!navigator.onLine) return;

  const [teams, players, seasons, positions] = await Promise.all([
    teamsApi.getTeams(),
    playersApi.getPlayers(),
    seasonsApi.getSeasons(),
    positionsApi.getPositions()
  ]);

  // Replace synced data, keep unsynced
  await db.transaction('rw', [db.teams, db.players, db.seasons], async () => {
    // Delete synced reference data
    await db.teams.where('synced').equals(true).delete();
    await db.players.where('synced').equals(true).delete();
    await db.seasons.where('synced').equals(true).delete();

    // Add fresh server data (already synced)
    await db.teams.bulkAdd(teams.map(t => ({ ...t, synced: true, synced_at: Date.now() })));
    await db.players.bulkAdd(players.map(p => ({ ...p, synced: true, synced_at: Date.now() })));
    await db.seasons.bulkAdd(seasons.map(s => ({ ...s, synced: true, synced_at: Date.now() })));
  });
}

/**
 * Temporal data: Only keep recent (30 days) + unsynced
 * - Matches
 * - Events
 * - Match periods
 * - Match state
 * - Lineups
 */
export async function cleanupOldTemporalData(): Promise<void> {
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  await db.transaction('rw', [db.matches, db.events, db.match_periods, db.match_state, db.lineup], async () => {
    // Delete old synced matches
    await db.matches
      .where('synced').equals(true)
      .filter(m => m.kickoff_ts < cutoff)
      .delete();

    // Delete old synced events
    await db.events
      .where('synced').equals(true)
      .filter(e => e.created_at < cutoff)
      .delete();

    // Delete old synced periods
    await db.match_periods
      .where('synced').equals(true)
      .filter(p => p.started_at < cutoff)
      .delete();

    // Delete old synced match state (check associated match)
    const oldMatches = await db.matches
      .filter(m => m.kickoff_ts < cutoff)
      .primaryKeys();
    await db.match_state
      .where('match_id').anyOf(oldMatches)
      .filter(s => s.synced)
      .delete();

    // Delete old synced lineups
    await db.lineup
      .where('synced').equals(true)
      .filter(l => {
        // Need to check match date
        // This is a simplification - might need join logic
        return true;
      })
      .delete();
  });
}

/**
 * Fetch recent matches for offline cache
 */
export async function cacheRecentMatches(): Promise<void> {
  if (!navigator.onLine) return;

  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const recentMatches = await matchesApi.getMatches({
    startDate: cutoff,
    limit: 100
  });

  // Add to local cache
  for (const match of recentMatches) {
    const existing = await db.matches.get(match.id);
    if (!existing || existing.synced) {
      await db.matches.put({ ...match, synced: true, synced_at: Date.now() });
    }
    // Don't overwrite unsynced local data
  }
}

/**
 * Main refresh function - call on app load when online
 */
export async function refreshCache(): Promise<void> {
  if (!navigator.onLine) return;
  if (!apiClient.isAuthenticated()) return;

  // First sync any unsynced local data
  await flushOnce();

  // Then refresh cache
  await refreshReferenceData();
  await cleanupOldTemporalData();
  await cacheRecentMatches();
}
```

#### 6.2 Integrate into app lifecycle

```typescript
// In App.tsx or main entry point
useEffect(() => {
  if (isAuthenticated && navigator.onLine) {
    // Refresh cache on app load
    refreshCache().catch(console.error);
  }
}, [isAuthenticated]);

// Also refresh when coming back online
useEffect(() => {
  const handleOnline = () => {
    if (isAuthenticated) {
      refreshCache().catch(console.error);
    }
  };

  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}, [isAuthenticated]);
```

---

### Phase 7: Migration

Migrate existing outbox data to new table structure.

**Files to modify:**
- `frontend/src/db/indexedDB.ts` (version upgrade handler)

#### 7.1 Migration script in version upgrade

```typescript
// In indexedDB.ts - add migration in version upgrade
db.version(X).stores({
  // ... new schema
}).upgrade(async tx => {
  // Migrate events from outbox to events table
  const outboxEvents = await tx.table('outbox')
    .where('table_name').equals('events')
    .toArray();

  for (const item of outboxEvents) {
    const data = item.data || item.payload;
    if (!data) continue;

    await tx.table('events').add({
      id: data.id || item.record_id,
      match_id: data.match_id,
      team_id: data.team_id,
      player_id: data.player_id,
      kind: data.kind,
      minute: data.minute,
      second: data.second,
      clock_ms: data.clock_ms,
      period: data.period || data.period_number,
      sentiment: data.sentiment,
      data: data.data || {},
      created_at: item.created_at,
      created_by_user_id: item.created_by_user_id,
      synced: item.synced === 1,
      is_deleted: false
    });
  }

  // Migrate match commands to match_periods and match_state
  const matchCommands = await tx.table('outbox')
    .where('table_name').equals('match_commands')
    .toArray();

  // Group by match and process in order
  const byMatch = groupBy(matchCommands, c => c.data?.matchId);

  for (const [matchId, commands] of Object.entries(byMatch)) {
    // Sort by created_at
    const sorted = commands.sort((a, b) => a.created_at - b.created_at);

    let periodNumber = 0;
    let currentPeriodId: string | undefined;

    for (const cmd of sorted) {
      const data = cmd.data;

      switch (data.cmd) {
        case 'start_period':
          periodNumber++;
          currentPeriodId = uuid();
          await tx.table('match_periods').add({
            id: currentPeriodId,
            match_id: matchId,
            period_number: periodNumber,
            period_type: data.periodType || 'REGULAR',
            started_at: cmd.created_at,
            created_by_user_id: cmd.created_by_user_id,
            synced: cmd.synced === 1
          });
          break;

        case 'end_period':
          if (currentPeriodId) {
            await tx.table('match_periods').update(currentPeriodId, {
              ended_at: cmd.created_at
            });
          }
          break;

        case 'complete':
          await tx.table('match_state').put({
            match_id: matchId,
            status: 'COMPLETED',
            timer_ms: 0,
            last_updated_at: cmd.created_at,
            created_by_user_id: cmd.created_by_user_id,
            synced: cmd.synced === 1
          });
          break;
      }
    }
  }

  // Migrate local_live_state settings to match_state
  const liveStateSettings = await tx.table('settings')
    .filter(s => s.key.startsWith('local_live_state:'))
    .toArray();

  for (const setting of liveStateSettings) {
    const matchId = setting.key.replace('local_live_state:', '');
    const state = JSON.parse(setting.value);

    // Only migrate if not already migrated from commands
    const existing = await tx.table('match_state').get(matchId);
    if (!existing) {
      await tx.table('match_state').add({
        match_id: matchId,
        status: state.status,
        timer_ms: state.timerMs || 0,
        last_updated_at: state.lastUpdatedAt || Date.now(),
        created_by_user_id: 'migrated',  // Unknown original user
        synced: false
      });
    }
  }

  console.log('Migration complete: outbox data moved to local tables');
});
```

---

### Phase 8: Deprecate Outbox

After migration is stable, remove outbox usage.

**Files to modify:**
- `frontend/src/db/utils.ts` - remove or deprecate addToOutbox
- `frontend/src/services/syncService.ts` - remove outbox processing
- `frontend/src/services/importService.ts` - remove outbox cleanup

#### 8.1 Mark addToOutbox as deprecated

```typescript
/**
 * @deprecated Use direct table writes with synced: false instead
 */
export async function addToOutbox(...): Promise<void> {
  console.warn('addToOutbox is deprecated. Write directly to tables with synced: false');
  // Keep working for backwards compatibility during migration
}
```

#### 8.2 Remove outbox from sync service

```typescript
// Remove all outbox-related code from flushOnce()
// Use table-based sync instead (Phase 5)
```

---

## Implementation Order

### Milestone 1: Schema & Types (Phase 1) ✅ COMPLETED
- [x] Add synced field to type definitions
- [x] Add LocalMatchPeriod and LocalMatchState types
- [x] Update IndexedDB schema with new tables and indexes
- [x] Test schema migration

**Completed:** 2025-12-03
**Files Modified:**
- `frontend/src/db/schema.ts` - Added SyncableRecord interface, LocalMatchPeriod, LocalMatchState types, updated all Enhanced* interfaces
- `frontend/src/db/indexedDB.ts` - Added Version 9 migration with new tables and synced field initialization
- `frontend/src/db/migrations.ts` - Added synced field to default season creation
- `frontend/src/services/guestQuickMatch.ts` - Added synced field to all record creation
- `frontend/src/services/api/playersApi.ts` - Added synced field to player creation (3 locations)

### Milestone 2: Event Storage (Phase 2) ✅ COMPLETED
- [x] Create addEventToTable function
- [x] Update LiveMatchPage guest mode event creation
- [x] Verify events appear in events table
- [x] Test event retrieval and display

**Completed:** 2025-12-03
**Files Modified:**
- `frontend/src/db/indexedDB.ts` - Added addEventToTable() function that writes directly to events table with synced: false
- `frontend/src/pages/LiveMatchPage.tsx` - Updated guest mode event creation to use addEventToTable() instead of addEvent()

**Key Changes:**
- Events now written directly to `events` table instead of `outbox`
- All new events created with `synced: false` flag
- Guest user ID properly propagated to events
- Quota enforcement preserved in new function
- Removed `season_id` from events schema to match backend (season derived through match relationship)

### Milestone 3: Match State Storage (Phase 3)
- [x] Create match period helper functions
- [x] Create match state helper functions
- [x] Update handleKickOff to use new tables
- [x] Update handleEndPeriod to use new tables
- [x] Update handlePause/Resume/Complete
- [x] Update handleStartNextPeriod for extra time
- [x] Update hydration on page load
- [x] Update clearAllData to include new tables
- [ ] Test full match lifecycle in guest mode

**Completed:** 2025-12-03
**Files Modified:**
- `frontend/src/db/indexedDB.ts` - Added match period and state helper functions:
  - `createMatchPeriod()` - Creates periods with preserved timestamps
  - `endMatchPeriod()` - Ends periods and calculates duration
  - `getMatchPeriods()` - Retrieves all periods for a match
  - `updateMatchState()` - Creates/updates match state
  - `getMatchState()` - Retrieves match state
  - Updated `clearAllData()` to clear new tables
- `frontend/src/pages/LiveMatchPage.tsx` - Updated all match lifecycle handlers:
  - `handleKickOff()` - Uses `createMatchPeriod()` and `updateMatchState()` for both first kickoff and resuming from pause
  - `handleEndPeriod()` - Uses `endMatchPeriod()` with actual timestamp and updates state to PAUSED
  - `handlePause()` - Uses `updateMatchState()` to mark match as PAUSED
  - `handleResume()` - Uses `updateMatchState()` to mark match as LIVE
  - `handleComplete()` - Ends open periods and marks state as COMPLETED
  - `handleStartNextPeriod()` - Uses new helpers for extra time periods
  - `hydrateGuestState()` - Reads from `match_state` and `match_periods` tables instead of JSON in settings

**Key Changes:**
- Match periods now stored in dedicated `match_periods` table with preserved timestamps (`started_at`, `ended_at`)
- Match state tracked in `match_state` table with status (NOT_STARTED, LIVE, PAUSED, COMPLETED)
- All timestamps preserved as actual milliseconds (not "now" timestamps)
- Guest user ID properly propagated via `getGuestId()`
- Removed JSON storage in settings table
- Removed outbox commands for match operations
- All database operations return `DatabaseResult<T>` with success/error info

### Milestone 4: Import Updates (Phase 4)
- [ ] Update hasGuestData to check all tables
- [ ] Update runImport to read events from table
- [ ] Add backend endpoint for period import with timestamps
- [ ] Update runImport to use new period import
- [ ] Update cleanup to include new tables
- [ ] Test full import flow

### Milestone 5: Sync Service (Phase 5)
- [ ] Implement table-based sync for events
- [ ] Implement table-based sync for periods
- [ ] Implement table-based sync for match state
- [ ] Remove outbox-based sync
- [ ] Test authenticated user sync flow

### Milestone 6: Caching (Phase 6)
- [ ] Create cacheService.ts
- [ ] Implement reference data refresh
- [ ] Implement temporal data cleanup
- [ ] Implement recent matches caching
- [ ] Integrate into app lifecycle
- [ ] Test offline/online transitions

### Milestone 7: Migration (Phase 7)
- [ ] Write migration script
- [ ] Test migration with existing data
- [ ] Handle edge cases (partial data, corrupted entries)
- [ ] Deploy with monitoring

### Milestone 8: Cleanup (Phase 8)
- [ ] Deprecate addToOutbox
- [ ] Remove outbox processing from sync
- [ ] Remove outbox cleanup from import
- [ ] Consider removing outbox table in future version

---

## Testing Checklist

### Guest Mode
- [ ] Create event → appears in events table with synced: false
- [ ] Start match → period created in match_periods with actual timestamp
- [ ] End period → period updated with ended_at timestamp
- [ ] Complete match → match_state shows COMPLETED
- [ ] Page reload → state correctly hydrated from tables
- [ ] Timer continues correctly after reload

### Import Flow
- [ ] Login with guest data → import prompt appears
- [ ] Import → all events uploaded to server
- [ ] Import → periods uploaded with original timestamps
- [ ] Import → local data cleaned up
- [ ] Page reload → shows server data only

### Sync Flow (Authenticated)
- [ ] Create event while online → synced to server
- [ ] Create event while offline → stored locally
- [ ] Come back online → event synced automatically
- [ ] Network failure → retry on next sync

### Caching
- [ ] Reference data always available offline
- [ ] Old match data (>30 days) cleaned up
- [ ] Unsynced data never deleted
- [ ] Fresh data fetched on app load when online

---

## Rollback Plan

If issues are discovered after deployment:

1. **Schema rollback**: Keep outbox table and old sync code as fallback
2. **Feature flag**: Add flag to switch between old/new sync behavior
3. **Data recovery**: Migration stores original data, can reverse if needed

---

## Performance Considerations

- **Index on synced field**: Queries for unsynced items should be fast
- **Batch operations**: Sync in batches of 50 to avoid overwhelming server
- **Lazy cleanup**: Run cleanup in background, not blocking UI
- **Transaction batching**: Use Dexie transactions for atomic operations

---

## Security Notes

- Guest data identified by `created_by_user_id` prefix only
- Sync service validates authentication before processing
- Server validates all incoming data (no trust of client timestamps for non-import flows)
- Import endpoint requires authentication and validates ownership
