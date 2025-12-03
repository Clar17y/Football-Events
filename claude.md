# AI Execution and Coding Rules

## AI Coding Guidelines

1. **KISS – Keep It Simple, Straightforward**  
   * Implement the simplest solution that satisfies the requirement.  
   * Avoid unnecessary abstractions, premature optimisation, and over-engineering.

2. **DRY – Don't Repeat Yourself**  
   * Re-use existing utilities, hooks, and components instead of duplicating logic.  
   * When duplication is unavoidable, extract shared code into well-named helpers.

3. **Single Responsibility & Cohesion**  
   * Every module, component, hook, or function must have one clear purpose.

4. **Type-Safety & Build Checks**  
   * New or modified code **must compile without TypeScript errors**.  
   * Run a type-check: `npx tsc path/to/file.tsx --noEmit`
   * If errors occur, fix them before proceeding.

5. **Project Consistency**  
   * Follow existing folder structure, naming conventions, and ESLint / Prettier rules.  
   * Use declarative React patterns and idiomatic TypeScript.

6. **Error Visibility & Interactive Debugging**  
   * On unexpected output (failed test, runtime error, etc.):  
     1. Run the failing command with verbose flags.  
     2. Echo the relevant error to the user.  
     3. Propose concise, numbered next-step options and **pause** until the user selects one.  
   * **Never loop indefinitely**—check in with the user after any corrective action.

7. **Lean Context for TypeScript Fixes**  
   * When fixing type errors, **drop all unrelated prior diffs and commentary**.  
   * Include only:  
     * the minimal code snippet being patched,  
     * the specific compiler error,  
     * the planned correction.

8. **Testing & Build Verification**  
   * All tests must pass or be explicitly marked as known failures.  
   * Run tests: `npx vitest run` or `npx vitest run path/to/test.tsx`
   * If any test fails, enter the debugging flow (see §6).

9. **Self-Documenting Code & Minimal Comments**  
   * Use descriptive names; comment **why**, not what.  
   * Avoid verbose boilerplate that inflates context.

10. **Token Discipline, Context Hygiene & User Check-ins**
    * **Context hygiene** – before starting any new action, discard all prior conversation content not needed for that specific task.
    * **Progress summaries** – after each command, summarise the result in ≤ 50 tokens.
    * **Check-ins** – if more than ~200 tokens have been emitted since the last user reply, pause and ask the user how to proceed.

> **If any change violates these guidelines, revise until all checks pass—no exceptions.**

---

## MCP Server (Dev Server Management)

This project includes an MCP server for managing long-running development servers. Claude Code connects to it automatically via the `.mcp.json` config in the project root.

### Why It Exists

Claude Code can run bash commands directly, but has limitations with long-running processes:
- `npm run dev` blocks until terminated
- No way to track background processes
- Can't read server output after backgrounding
- Port conflicts are hard to debug

### Available MCP Tools

**Server Management:**
| Tool | Description |
|------|-------------|
| `start_dev_server` | Start backend or frontend in background |
| `stop_dev_server` | Stop a running server gracefully |
| `get_server_status` | Check if server is running, health, uptime |
| `list_managed_servers` | List all managed servers |
| `stop_all_servers` | Stop everything at once |

**Port Management:**
| Tool | Description |
|------|-------------|
| `check_port_status` | Check if a port is available |
| `force_kill_port` | Kill whatever is using a port |

**Logging:**
| Tool | Description |
|------|-------------|
| `get_recent_logs` | Recent log entries from memory (fast) |
| `get_server_logs` | Logs from file with filtering |
| `search_logs` | Search logs with regex |
| `list_log_files` | List available log files |
| `get_log_file` | Get specific log file content |

### Typical Workflows

**Starting development:**
```
User: "Start the backend server"
→ Use start_dev_server with project: "backend"
```

**Checking status:**
```
User: "Is the backend running?"
→ Use get_server_status with project: "backend"
```

**Debugging:**
```
User: "Show me recent errors from the backend"
→ Use get_recent_logs with project: "backend", level: "ERROR"
```

**Restarting after code changes:**
```
User: "Restart the backend"
→ Use stop_dev_server then start_dev_server
```

**Port conflicts:**
```
User: "Something is using port 3001"
→ Use force_kill_port with port: 3001
```

### Server Configuration

| Project | Port | Health Check |
|---------|------|--------------|
| backend | 3001 | `/api/health` |
| frontend | 5173 | `/` |

---

## Project Infrastructure

### Backend Testing Suite
- **149+ tests passing** across 8 entities
- Run all tests: `npx vitest run`
- Run specific test: `npx vitest run tests/unit/path/to/test.tsx`

### Database Commands
- Schema introspection: `cd backend && node scripts/check-schema-alignment.js`
- Prisma schema check: `cd backend && node scripts/check-schema-with-prisma.js`
- Connection test: `cd backend && node scripts/test-prisma-connection.js`
- Generate Prisma client: `npx prisma generate`
- Run migrations: `npx prisma migrate dev`

### Date/Time
When you need the current date, run `date +'%Y-%m-%d'` and use that value. Never infer "today" from prior context.

---

## API Reference

### Core Entity APIs

All APIs use UUID validation, request validation (Zod), and consistent error handling.

**Teams API:**
```
GET    /api/v1/teams              - List teams (pagination, search)
POST   /api/v1/teams              - Create new team
GET    /api/v1/teams/:id          - Get team by ID
PUT    /api/v1/teams/:id          - Update team
DELETE /api/v1/teams/:id          - Delete team
GET    /api/v1/teams/:id/players  - Get team roster
```

**Players API:**
```
GET    /api/v1/players            - List players (pagination, search, filters)
POST   /api/v1/players            - Create new player
GET    /api/v1/players/:id        - Get player by ID
PUT    /api/v1/players/:id        - Update player
DELETE /api/v1/players/:id        - Delete player
```

**Seasons API:**
```
GET    /api/v1/seasons            - List seasons
POST   /api/v1/seasons            - Create new season
GET    /api/v1/seasons/:id        - Get season by ID
PUT    /api/v1/seasons/:id        - Update season
DELETE /api/v1/seasons/:id        - Delete season
```

**Positions API:**
```
GET    /api/v1/positions          - List positions
POST   /api/v1/positions          - Create new position
GET    /api/v1/positions/:id      - Get position by ID
GET    /api/v1/positions/code/:code - Get position by code string
PUT    /api/v1/positions/:id      - Update position
DELETE /api/v1/positions/:id      - Delete position
```

**Matches API:**
```
GET    /api/v1/matches            - List matches (pagination, filters)
POST   /api/v1/matches            - Create new match
GET    /api/v1/matches/:id        - Get match by ID
PUT    /api/v1/matches/:id        - Update match
DELETE /api/v1/matches/:id        - Delete match
GET    /api/v1/matches/team/:teamId     - Get matches for team
GET    /api/v1/matches/season/:seasonId - Get matches for season
```

**Awards API (Season + Match Awards):**
```
GET    /api/v1/awards             - List season awards
POST   /api/v1/awards             - Create season award
GET    /api/v1/awards/:id         - Get season award by ID
PUT    /api/v1/awards/:id         - Update season award
DELETE /api/v1/awards/:id         - Delete season award

GET    /api/v1/awards/match-awards     - List match awards
POST   /api/v1/awards/match-awards     - Create match award
GET    /api/v1/awards/match-awards/:id - Get match award by ID
PUT    /api/v1/awards/match-awards/:id - Update match award
DELETE /api/v1/awards/match-awards/:id - Delete match award

GET    /api/v1/awards/player/:playerId - Get all awards for player
GET    /api/v1/awards/season/:seasonId - Get all awards for season
```

**Events API:**
```
GET    /api/v1/events             - List events (pagination, filters)
POST   /api/v1/events             - Create new event
GET    /api/v1/events/:id         - Get event by ID
PUT    /api/v1/events/:id         - Update/upsert event
DELETE /api/v1/events/:id         - Delete event
GET    /api/v1/events/match/:matchId   - Get events for match
GET    /api/v1/events/season/:seasonId - Get events for season
GET    /api/v1/events/player/:playerId - Get events for player
POST   /api/v1/events/batch       - Batch operations
```

**Lineups API:**
```
GET    /api/v1/lineups            - List lineups
POST   /api/v1/lineups            - Create lineup entry
GET    /api/v1/lineups/:matchId/:playerId/:startMinute - Get by composite key
PUT    /api/v1/lineups/:matchId/:playerId/:startMinute - Update lineup
DELETE /api/v1/lineups/:matchId/:playerId/:startMinute - Delete lineup
GET    /api/v1/lineups/match/:matchId   - Get lineups for match
GET    /api/v1/lineups/player/:playerId - Get lineup history for player
POST   /api/v1/lineups/batch      - Batch operations
```

### API Features
- **UUID Validation**: All ID parameters validated
- **Request Validation**: Zod schemas for create/update
- **Error Handling**: Consistent HTTP status codes (400, 404, 409, 500)
- **Pagination**: Configurable page size with metadata
- **Search & Filtering**: Text search and entity-specific filters
- **Foreign Key Validation**: Database relationships enforced
- **Batch Operations**: Multi-record sync for offline-first mobile
- **Response Times**: 2-40ms depending on complexity
