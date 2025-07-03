# Grassroots PWA - Development Roadmap

## Overview
This document provides a high-level view of all planned improvements and their current status. Detailed documentation for each task can be found in the `documentation/` folder.

**⚠️ Execution Environment Notice**  
The sandboxed shell cannot capture stdout/stderr from native commands. If you try to run a powershell command for these you will return nothing. Do not try.
Therefore *all* CLI commands (`npm`, `npx`, `node`, `tsc`, `vitest`, etc.) **must** be executed through the **local** MCP HTTP proxy which is defined in `mcp.json`:

Use PowerShell's Invoke-RestMethod to talk to the proxy. Examples:
* Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command" "npx vitest run tests/unit/hooks/useErrorHandler.test.tsx"}'
* $response = Invoke-RestMethod -Uri "http://localhost:9123/logs/mclytcbu-dlol4q.err?b64=1";[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($response.base64))

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
4. Allowed commands remain restricted to vitest, tsc, npm run, etc.  (See table below.)

> **Date sanity check**  
> When you need the current date or time, first call  
> `{ "command": "date +'%Y-%m-%d'" }` via MCP and use that value. Never infer “today” from prior context.

### 🔒 Allowed CLI commands (enforced by MCP)

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

If a future task needs a new command, **ask the user first** before attempting to run it.


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


## Status Legend
- ❌ **Not Started** - Task not yet begun
- 🔄 **In Progress** - Currently being worked on  
- ✅ **Completed** - Task finished and tested
- ⏸️ **Paused** - Task started but temporarily halted
- 🔍 **Review** - Task completed, awaiting review

---

## Task Summary

| Phase | Task ID | Task Name | Priority | Status | Estimated Hours | Actual Hours | Completion Date |
|-------|---------|-----------|----------|--------|----------------|--------------|-----------------|
| 1 | 1.1 | Type Safety & Data Models | Critical | ✅ | 2-3 | 4 | 2025-06-28 |
| 1 | 1.2 | Error Handling & Validation | Critical | ✅ | 3-4 | 4 | 2025-06-28 |
| 1 | 1.3 | Enhanced Database Schema & Migrations | Critical | ✅ | 2-3 | 3 | 2025-06-28 |
| 1 | 1.4 | Testing Infrastructure | Critical | ✅ | 4-5 | 3 | 2025-06-28 |
| 1 | 1.5 | TypeScript Error Resolution | Critical | ✅ | 6-8 | 2 | 2025-06-28 |
| 2 | 2.1 | Advanced State Management | High | ❌ | 3-4 | - | - |
| 2 | 2.2 | Component Optimization & Memoization | High | ❌ | 2-3 | - | - |
| 2 | 2.3 | Advanced Offline Sync Strategy | High | ❌ | 4-5 | - | - |
| 3 | 3.1 | Advanced Match Features | Medium | ❌ | 5-6 | - | - |
| 3 | 3.2 | Data Export & Analytics | Medium | ❌ | 3-4 | - | - |
| 3 | 3.3 | Enhanced UI/UX Components | Medium | ❌ | 4-5 | - | - |
| 3 | 3.4 | Enhanced Match Console & Live Management | Critical | ❌ | 6-8 | - | - |
| 4 | 4.1 | Accessibility Improvements | Medium | ❌ | 3-4 | - | - |
| 4 | 4.2 | Configuration Management | Low | ❌ | 2 | - | - |
| 4 | 4.3 | Security Enhancements | Medium | ❌ | 2-3 | - | - |
| 4 | 4.4 | Monitoring & Analytics | Low | ❌ | 3-4 | - | - |
| 5 | 5.1 | Team Management System | High | ❌ | 4-5 | - | - |
| 5 | 5.2 | Player Management & Profiles | High | ❌ | 5-6 | - | - |
| 5 | 5.3 | Team Formations & Tactics | Medium | ❌ | 3-4 | - | - |
| 6 | 6.1 | Match Creation & Scheduling | High | ❌ | 4-5 | - | - |
| 6 | 6.2 | Season & Tournament Management | High | ❌ | 5-6 | - | - |
| 6 | 6.3 | Pre-Match Setup & Configuration | Medium | ❌ | 3-4 | - | - |
| 7 | 7.1 | Player Performance Analytics | Medium | ❌ | 4-5 | - | - |
| 7 | 7.2 | Team Statistics & Trends | Medium | ❌ | 3-4 | - | - |
| 7 | 7.3 | Advanced Reporting & Export | Medium | ❌ | 4-5 | - | - |
| 8 | 8.1 | Multi-User Support & Roles | High | ❌ | 5-6 | - | - |
| 8 | 8.2 | Real-Time Collaboration | Medium | ❌ | 4-5 | - | - |
| 8 | 8.3 | Notifications & Alerts | Medium | ❌ | 3-4 | - | - |
| 9 | 9.1 | Cloud Synchronization | High | ❌ | 6-7 | - | - |
| 9 | 9.2 | Third-Party Integrations | Medium | ❌ | 4-5 | - | - |
| 9 | 9.3 | Advanced Data Import/Export | Low | ❌ | 3-4 | - | - |

## Phase Progress

| Phase | Name | Tasks Complete | Total Tasks | Progress |
|-------|------|----------------|-------------|----------|
| 1 | Critical Infrastructure & Type Safety | 5 | 5 | 100% |
| 2 | Performance & State Management | 0 | 3 | 0% |
| 3 | Feature Enhancements | 0 | 4 | 0% |
| 4 | Quality & Accessibility | 0 | 4 | 0% |
| 5 | Team & Player Management | 0 | 3 | 0% |
| 6 | Match & Tournament Management | 0 | 3 | 0% |
| 7 | Analytics & Reporting | 0 | 3 | 0% |
| 8 | Collaboration & User Experience | 0 | 3 | 0% |
| 9 | Integration & Synchronization | 0 | 3 | 0% |

## Overall Progress
**Total Tasks:** 34  
**Completed:** 5  
**In Progress:** 0  
**Not Started:** 29  
**Overall Completion:** 15%

---

## Quick Links

### Phase 1: Critical Infrastructure
- [Task 1.1 - Type Safety & Data Models](documentation/task-1-1-type-safety.md) ✅
- [Task 1.2 - Error Handling & Validation](documentation/task-1-2-error-handling.md) ✅
- [Task 1.3 - Enhanced Database Schema](documentation/task-1-3-database-schema.md) ✅
- [Task 1.4 - Testing Infrastructure](documentation/task-1-4-testing.md) ✅
- [Task 1.5 - TypeScript Error Resolution](documentation/task-1-5-typescript-errors.md) ✅

### Phase 3: Core Features (Critical)
- [Task 3.4 - Enhanced Match Console & Live Management](documentation/task-3-4-enhanced-match-console.md) ❌

### Phase 5: Team & Player Management
- [Task 5.1 - Team Management System](documentation/task-5-1-team-management.md) ❌
- [Task 5.2 - Player Management & Profiles](documentation/task-5-2-player-management.md) ❌
- [Task 5.3 - Team Formations & Tactics](documentation/task-5-3-formations-tactics.md) ❌

### Phase 6: Match & Tournament Management  
- [Task 6.1 - Match Creation & Scheduling](documentation/task-6-1-match-scheduling.md) ❌
- [Task 6.2 - Season & Tournament Management](documentation/task-6-2-tournament-management.md) ❌
- [Task 6.3 - Pre-Match Setup & Configuration](documentation/task-6-3-prematch-setup.md) ❌

## Feature Categories Overview

### 🏗️ **Phase 1-4: Foundation & Infrastructure** (Current Focus)
Essential technical infrastructure for a robust application:
- Type safety, error handling, database optimization
- Testing, performance, accessibility, security

### 👥 **Phase 5: Team & Player Management** (High Priority)
Core team management functionality:
- **Team Creation & Management**: Full CRUD operations, branding, settings
- **Player Profiles & Rosters**: Comprehensive player data, statistics, availability
- **Formations & Tactics**: Team setup, positioning, strategic planning

### ⚽ **Phase 6: Match & Tournament Management** (High Priority)  
Match lifecycle management:
- **Match Scheduling**: Calendar system, venue booking, opponent management
- **Tournament System**: Seasons, leagues, cup competitions, fixtures
- **Pre-Match Setup**: Lineups, officials, logistics, notifications

### 📊 **Phase 7: Analytics & Reporting** (Medium Priority)
Data insights and performance tracking:
- **Player Analytics**: Performance metrics, trends, comparisons
- **Team Statistics**: Match analysis, season summaries, league tables
- **Advanced Reporting**: PDF exports, custom reports, data visualization

### 🤝 **Phase 8: Collaboration & User Experience** (Medium Priority)
Multi-user functionality and enhanced UX:
- **User Roles**: Coaches, players, parents, officials with appropriate permissions
- **Real-Time Features**: Live match updates, collaborative editing
- **Communication**: Notifications, alerts, messaging system

### 🔄 **Phase 9: Integration & Synchronization** (Future)
External connectivity and data management:
- **Cloud Sync**: Multi-device synchronization, backup, restore
- **Third-Party Integration**: League systems, social media, calendar apps
- **Data Exchange**: Import/export, API integrations, migration tools

## Recommended Implementation Order

### **Immediate Priority** (Next 2-3 sprints)
1. **Complete Phase 1** - Finish database schema and testing infrastructure
2. **Task 3.4** - Enhanced Match Console (fix the core user experience)
3. **Task 5.1** - Team Management System (enables all other features)
4. **Task 5.2** - Player Management & Profiles (core functionality)

### **Short Term** (Next 1-2 months)
5. **Task 6.1** - Match Creation & Scheduling (essential workflow)
6. **Task 6.2** - Season & Tournament Management (organizational structure)
7. **Task 7.1** - Basic Player Analytics (value-add feature)

### **Medium Term** (Next 3-6 months)
8. **Phase 8** - Multi-user support and collaboration features
9. **Phase 7** - Advanced analytics and reporting
10. **Phase 9** - Cloud sync and integrations

## Recent Updates
- **2025-07-03:** 🔧 **Error Handling Tests Fixed** - Resolved all 11 failing tests in useErrorHandler.test.tsx, achieving 100% test pass rate (90/90 tests passing)
- **2025-07-03:** 🛠️ **TypeScript Validation** - Fixed ValidationError constructor calls and verified type safety in error handling components
- **2025-07-03:** ✅ **Test Suite Health** - Full project test suite running successfully with comprehensive error handling coverage
- **2025-07-02:** Created MCP server to allow agent to run commands needed like npm / npx with documentation in mpc.json
- **2025-07-01:** Updated AI workflow - Command execution now requires user actions with output files in `.ai-outputs/`
- **2025-06-28:** 🎉 **Phase 1 COMPLETE** - All critical infrastructure tasks finished
- **2025-06-28:** Task 1.4 completed successfully - Testing infrastructure established
- **2025-06-28:** Task 1.5 completed successfully - All TypeScript compilation errors resolved
- **2025-06-28:** Added Task 3.4 - Enhanced Match Console (critical UX improvement)
- **2025-06-28:** Expanded roadmap with 18 new features across 5 phases
- **2025-06-28:** Task 1.2 completed successfully - Comprehensive error handling system implemented
- **2025-06-28:** Task 1.1 completed successfully - Application compiles and runs without errors
- **2025-06-28:** Restructured documentation into separate files for better organization