# AI Execution and Coding Rules
## AI Coding Guidelines

1. **KISS – Keep It Simple, Straightforward**  
   * Implement the simplest solution that satisfies the requirement.  
   * Avoid unnecessary abstractions, premature optimisation, and over-engineering.

2. **DRY – Don’t Repeat Yourself**  
   * Re-use existing utilities, hooks, and components instead of duplicating logic.  
   * When duplication is unavoidable, extract shared code into well-named helpers.

3. **Single Responsibility & Cohesion**  
   * Every module, component, hook, or function must have one clear purpose.

4. **Type-Safety & Build Checks (via MCP server)**  
   * New or modified code **must compile without TypeScript errors**.  
   * Run a type-check by posting:  
     ```http
     { "command": "npx tsc path/to/file.tsx --noEmit" }
     ```  
    * If `success:false`, echo `stderr`, propose next steps, and wait for user input.

5. **Project Consistency**  
   * Follow existing folder structure, naming conventions, and ESLint / Prettier rules.  
   * Use declarative React patterns and idiomatic TypeScript.

6. **Error Visibility & Interactive Debugging**  
   * On unexpected output (failed test, runtime error, etc.):  
     1. Send the failing command through the MCP server **with verbose flags**.  
     2. Echo the full `stderr` / relevant `stdout` to the user.  
     3. Propose concise, numbered next-step options and **pause** until the user selects one.  
   * **Never loop indefinitely**—check in with the user after any corrective action that produces new output.

7. **Lean Context for TypeScript Fixes**  
   * When fixing type errors, **drop all unrelated prior diffs and commentary**.  
   * Include only:  
     * the minimal code snippet being patched,  
     * the specific compiler error,  
     * the planned correction.  
   * This minimises token usage and prevents runaway context growth.

8. **Testing & Build Verification (via MCP)**  
   * All tests must pass or be explicitly marked as known failures.  
   * Execute the suite:  
     ```http
     { "command": "npx vitest run --reporter=json --outputFile=- --no-silent" }
     ```  
   * Parse the JSON reporter output in `stdout`; if any test fails, enter the debugging flow (see §6).

9. **Self-Documenting Code & Minimal Comments**  
   * Use descriptive names; comment **why**, not what.  
   * Avoid verbose boilerplate that inflates context.

10. **Token Discipline, Context Hygiene & User Check-ins**
    * **Context hygiene** – before starting any new action (type-fix, refactor,
      test run, etc.), discard all prior conversation content that is not
      needed for that specific task. Keep only:
      1. The immediate code fragment(s) being modified
      2. The relevant error message or requirement
      3. The guideline snippets you must follow
    * **Progress summaries** – after each MCP command (type-check, test, build),
      summarise the result in ≤ 50 tokens.
    * **Check-ins** – if more than ~200 tokens have been emitted since the last
      user reply, pause and ask the user how to proceed before generating more
      output.
    * When full logs are required, fetch them via `/logs/<file>` **then summarise**; do not paste the entire file into the conversation.


> **If any change violates these guidelines, revise until all checks pass—no exceptions.**

# AI Execution Guidelines

## 🚀 **Enhanced MCP Server v2.0 - Integrated Development Workflow**

**⚠️ Execution Environment Notice**  
The sandboxed shell cannot capture stdout/stderr from native commands. However, we now have a **powerful Enhanced MCP Server v2.0** that provides integrated development server management and API testing capabilities.

### **🔧 Enhanced MCP Server Capabilities:**

#### **🚀 Server Management Functions:**
```javascript
// Start development servers with enhanced logging and operation tracking
POST /startDevServer     - Start backend/frontend with structured logging (detached: true)
POST /stopDevServer      - Graceful shutdown with process group kill + timing metrics
POST /getServerStatus    - Health checks, uptime, performance metrics
POST /stopAllServers     - Emergency cleanup with detailed stop logging
POST /listManagedServers - List all managed servers with status
```

#### **📝 Enhanced Logging & Monitoring Functions:**
```javascript
// Advanced logging with operation tracking and performance monitoring
POST /getRecentLogs        - Get recent logs from memory (fast access, level filtering)
POST /searchLogs           - Search logs with regex patterns (powerful debugging)
POST /getPerformanceMetrics - Real-time memory usage, operations in progress
POST /listLogFiles         - List all log files (main, error, debug) with metadata
POST /getLogFile           - Get log file content with filtering options
```

#### **🧪 API Testing Functions:**
```javascript
// Test APIs without external tools
POST /testApiEndpoint    - Make HTTP requests with detailed response analysis
POST /testApiWorkflow    - Test multiple endpoints in sequence with context
POST /testCrudEndpoints  - Test complete CRUD workflows with timing
POST /checkPortStatus    - Check if port is available
```

### **🎯 Enhanced Development Workflow with Advanced Logging:**

#### **1. Start Backend Server with Enhanced Logging:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/startDevServer" -Method POST -ContentType "application/json" -Body '{"project": "backend", "options": {"timeout": 10000}}'
```

#### **2. Monitor Real-time Performance:**
```powershell
# Get performance metrics (memory usage, operations in progress)
Invoke-RestMethod -Uri "http://localhost:9123/getPerformanceMetrics" -Method POST -ContentType "application/json" -Body '{"project": "backend"}'
```

#### **3. Get Recent Logs (Fast Memory Access):**
```powershell
# Get recent logs with level filtering
Invoke-RestMethod -Uri "http://localhost:9123/getRecentLogs" -Method POST -ContentType "application/json" -Body '{"project": "backend", "lines": 20, "level": "ERROR"}'
```

#### **4. Search Logs for Debugging:**
```powershell
# Search for specific patterns in logs
Invoke-RestMethod -Uri "http://localhost:9123/searchLogs" -Method POST -ContentType "application/json" -Body '{"project": "backend", "query": "server.*running", "options": {"limit": 10}}'
```

#### **5. Test API Endpoints with Enhanced Monitoring:**
```powershell
# Test GET endpoint (now includes response timing and detailed analysis)
Invoke-RestMethod -Uri "http://localhost:9123/testApiEndpoint" -Method POST -ContentType "application/json" -Body '{"method": "GET", "url": "http://localhost:3001/api/v1/teams"}'

# Test POST endpoint with structured logging
Invoke-RestMethod -Uri "http://localhost:9123/testApiEndpoint" -Method POST -ContentType "application/json" -Body '{"method": "POST", "url": "http://localhost:3001/api/v1/teams", "body": {"name": "Test FC", "homePrimary": "#FF0000"}}'
```

#### **6. Monitor Server Status with Health Checks:**
```powershell
# Get detailed server status (now includes health, uptime, log files)
Invoke-RestMethod -Uri "http://localhost:9123/getServerStatus" -Method POST -ContentType "application/json" -Body '{"project": "backend"}'
```

#### **7. List and Access Log Files:**
```powershell
# List all log files (main, error, debug) with metadata
Invoke-RestMethod -Uri "http://localhost:9123/listLogFiles" -Method POST -ContentType "application/json" -Body '{"project": "backend"}'

# Get specific log file with filtering
Invoke-RestMethod -Uri "http://localhost:9123/getLogFile" -Method POST -ContentType "application/json" -Body '{"filename": "backend-2025-07-10-07-35-59-errors.log", "level": "ERROR"}'
```

### **🔄 Legacy Command Execution (Still Available):**
For traditional CLI commands, use the original exec endpoint:
```powershell
Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command": "npx vitest run tests/unit/hooks/useErrorHandler.test.tsx"}'
```

The response is small and contains:  
* `success`, `exitCode` – status codes  
* `stdoutPreview`, `stderrPreview` – first 1 000 printable chars  
* `stdoutFile`, `stderrFile` – download URLs for the **full logs** (`/logs/<id>.out` / `.err`)

**Workflow:**  
1. Check `success` + the previews.  
2. If more detail is required, fetch the full log via:
	`GET http://localhost:9123/logs/<file>?b64=1`  
	and base-64-decode the `base64` field.
3. Never embed multi-KB logs directly in the conversation; reference the file instead.  
4. Allowed commands remain restricted to vitest, tsc, npm run, database scripts, etc.  (See table below.)

### **🎯 Key Benefits of Enhanced MCP Server:**
- ✅ **No Temporary Files** - Clean, integrated testing without creating test scripts
- ✅ **Real-time Server Management** - Start/stop servers programmatically
- ✅ **Integrated API Testing** - Direct HTTP requests without external tools
- ✅ **File-based Logging** - Persistent logs with easy retrieval
- ✅ **Performance Monitoring** - Response times and health checks
- ✅ **Workflow Automation** - Multi-step API testing with context passing

### **📊 Current Infrastructure Status:**
- ✅ **Backend Testing Suite**: 149+ tests passing (8 entities complete)
- ✅ **API Framework**: Express.js with v1 versioning, 8 complete APIs operational
- ✅ **Enhanced MCP Server**: v2.1 with advanced logging, operation tracking, performance monitoring + process group management
- ✅ **Database Integration**: Complete Prisma ↔ Frontend transformation layer
- ✅ **UUID Validation**: Robust middleware preventing route conflicts across all APIs
- ✅ **Process Management**: Persistent PID tracking with proper cleanup (no more port conflicts)

### **🚀 Complete API Endpoints (All Operational):**

#### **Core Entity APIs:**
```javascript
// Teams API - Full CRUD + Roster Management
GET    /api/v1/teams              - List teams (pagination, search)
POST   /api/v1/teams              - Create new team
GET    /api/v1/teams/:id          - Get team by ID (UUID validated)
PUT    /api/v1/teams/:id          - Update team
DELETE /api/v1/teams/:id          - Delete team
GET    /api/v1/teams/:id/players  - Get team roster

// Players API - Full CRUD + Team Association
GET    /api/v1/players            - List players (pagination, search, filters)
POST   /api/v1/players            - Create new player
GET    /api/v1/players/:id        - Get player by ID (UUID validated)
PUT    /api/v1/players/:id        - Update player
DELETE /api/v1/players/:id        - Delete player

// Seasons API - Full CRUD
GET    /api/v1/seasons            - List seasons (pagination, search)
POST   /api/v1/seasons            - Create new season
GET    /api/v1/seasons/:id        - Get season by ID (UUID validated)
PUT    /api/v1/seasons/:id        - Update season
DELETE /api/v1/seasons/:id        - Delete season

// Positions API - Full CRUD + Code Lookup
GET    /api/v1/positions          - List positions (pagination, search)
POST   /api/v1/positions          - Create new position
GET    /api/v1/positions/:id      - Get position by code (UUID validated)
GET    /api/v1/positions/code/:code - Get position by code string
PUT    /api/v1/positions/:id      - Update position
DELETE /api/v1/positions/:id      - Delete position

// Matches API - Full CRUD + Advanced Filtering
GET    /api/v1/matches            - List matches (pagination, search, filters)
POST   /api/v1/matches            - Create new match
GET    /api/v1/matches/:id        - Get match by ID (UUID validated)
PUT    /api/v1/matches/:id        - Update match (scores, notes, etc.)
DELETE /api/v1/matches/:id        - Delete match
GET    /api/v1/matches/team/:teamId    - Get matches for specific team
GET    /api/v1/matches/season/:seasonId - Get matches for specific season

// Awards API - Dual Entity System (Season + Match Awards)
GET    /api/v1/awards             - List season awards (pagination, search)
POST   /api/v1/awards             - Create season award
GET    /api/v1/awards/:id         - Get season award by ID (UUID validated)
PUT    /api/v1/awards/:id         - Update season award
DELETE /api/v1/awards/:id         - Delete season award

GET    /api/v1/awards/match-awards - List match awards (pagination, search)
POST   /api/v1/awards/match-awards - Create match award
GET    /api/v1/awards/match-awards/:id - Get match award by ID (UUID validated)
PUT    /api/v1/awards/match-awards/:id - Update match award
DELETE /api/v1/awards/match-awards/:id - Delete match award

// Helper Routes
GET    /api/v1/awards/player/:playerId - Get all awards for player
GET    /api/v1/awards/season/:seasonId - Get all awards for season
GET    /api/v1/awards/match-awards/:matchId/list - Get awards for specific match

// Events API - Real-time Match Events + Batch Sync
GET    /api/v1/events             - List events (pagination, search, filters)
POST   /api/v1/events             - Create new event
GET    /api/v1/events/:id         - Get event by ID (UUID validated)
PUT    /api/v1/events/:id         - Update/upsert event
DELETE /api/v1/events/:id         - Delete event
GET    /api/v1/events/match/:matchId    - Get events for specific match
GET    /api/v1/events/season/:seasonId  - Get events for specific season
GET    /api/v1/events/player/:playerId  - Get events for specific player
POST   /api/v1/events/batch       - Batch create/update/delete operations

// Lineups API - Player Substitution Management + Batch Sync
GET    /api/v1/lineups                                    - List lineups (pagination, search, filters)
POST   /api/v1/lineups                                    - Create new lineup entry
GET    /api/v1/lineups/:matchId/:playerId/:startMinute    - Get lineup by composite key
PUT    /api/v1/lineups/:matchId/:playerId/:startMinute    - Update lineup (add endMinute)
DELETE /api/v1/lineups/:matchId/:playerId/:startMinute    - Delete lineup entry
GET    /api/v1/lineups/match/:matchId     - Get all lineups for specific match
GET    /api/v1/lineups/player/:playerId   - Get lineup history for specific player
GET    /api/v1/lineups/position/:position - Get lineups for specific position
POST   /api/v1/lineups/batch              - Batch create/update/delete operations
```

#### **API Features:**
- ✅ **UUID Validation**: All ID parameters validated with proper error messages
- ✅ **Request Validation**: Zod schemas for all create/update operations
- ✅ **Error Handling**: Consistent HTTP status codes (400, 404, 500)
- ✅ **Pagination**: Configurable page size with metadata
- ✅ **Search & Filtering**: Text search and entity-specific filters
- ✅ **Foreign Key Validation**: Proper database relationships enforced
- ✅ **Type Safety**: Complete TypeScript integration with transformers
- ✅ **Batch Operations**: Multi-event sync for offline-first mobile workflow
- ✅ **Upsert Support**: Update or create with partial data for real-time events
- ✅ **Composite Key Support**: Complex primary keys for lineup substitution tracking
- ✅ **Substitution Management**: Complete player entry/exit history per match
- ✅ **Performance**: Response times 2-40ms depending on complexity
- ✅ **Comprehensive Constraint Validation**: Complete foreign key and unique constraint validation across all APIs
- ✅ **Shared Validation Patterns**: Reusable test framework eliminating code duplication
- ✅ **Prisma Error Handling**: Converts database errors to meaningful HTTP responses (400 for FK violations, 409 for unique constraints)
- ✅ **Position API Routing Fixed**: Resolved UUID vs string code routing issues

#### **Constraint Validation Framework:**
- ✅ **`shared-validation-patterns.ts`**: Reusable test utilities for all constraint types
- ✅ **`prismaErrorHandler.ts`**: Centralized Prisma error to HTTP response conversion
- ✅ **Foreign Key Validation**: All APIs return 400 Bad Request for invalid references
- ✅ **Unique Constraint Validation**: All APIs return 409 Conflict for duplicates
- ✅ **Complete Coverage**: Players (FK+Unique), Matches (FK), Awards (FK), Lineups (FK)
- ✅ **Meaningful Error Messages**: Field-specific constraint violation details
- ✅ **Zero Code Duplication**: Shared patterns across all API test suites

**Database Analysis Commands (Legacy):**
* Schema introspection: `cd backend && node scripts/check-schema-alignment.js`
* Prisma schema check: `cd backend && node scripts/check-schema-with-prisma.js`
* Connection test: `cd backend && node scripts/test-prisma-connection.js`

> **Date sanity check**  
> When you need the current date or time, first call  
> `{ "command": "date +'%Y-%m-%d'" }` via MCP and use that value. Never infer “today” from prior context.

## 🔒 Allowed CLI commands (enforced by MCP)

The MCP proxy accepts **only** the patterns below; any other command is rejected with HTTP 403:

| Category                 | Allowed pattern (shell examples)         | Regex used in allow-list |
|--------------------------|------------------------------------------|--------------------------|
| **Unit tests**           | `npx vitest run …`                       | `/^npx\s+vitest\b/i` |
| **Type-checks**          | `npx tsc … --noEmit`                     | `/^npx\s+tsc\b.*--noEmit\b/i` |
| **Package install / add**| `npm install …`                          | `/^npm\s+install\b/i` |
| **Project scripts**      | `npm run <script>` (any script)          | `/^npm\s+run\b/i` |
| **Package info**         | `npm list …`                             | `/^npm\s+list\b/i` |
| **Diagnostics**          | `node -v` or `node --version`            | `/^node\s+-v(?:ersion)?$/i` |
| **Directory listing**    | `ls -la …` (read-only exploration)       | `/^ls\b/i` |
| **ORM Commands**		   | `npx prisma generate / format / validate / migrate dev / migrate status / db pull` | `/^npx\s+prisma\s+(generate|format|validate|migrate\s+(dev|status)|db\s+pull)\b/i` |
| **Database Scripts**     | `cd backend && node scripts/<script>.js` | `/^cd\s+backend\s+&&\s+node\s+scripts\/[\w\-]+\.js$/i` | 

*You may prepend a single relative `cd <dir> &&` to any allowed command if the toolchain expects to run inside that sub-folder. The working directory resets between calls, so plan each command independently.*

*Destructive Prisma commands (`db drop`, `migrate reset`, `db push --force-reset`) are blocked by MCP.*
If a future task needs a new command, **ask the user first** before attempting to run it.



