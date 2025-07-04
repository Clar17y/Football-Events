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
**⚠️ Execution Environment Notice**  
The sandboxed shell cannot capture stdout/stderr from native commands. If you try to run a powershell command for these you will return nothing. Do not try.
Therefore *all* CLI commands (`npm`, `npx`, `node`, `tsc`, `vitest`, etc.) **must** be executed through the **local** MCP HTTP proxy which is defined in `mcp.json`:

Use PowerShell's Invoke-RestMethod to talk to the proxy. Examples:
* Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command": "npx vitest run tests/unit/hooks/useErrorHandler.test.tsx"}'
* Invoke-RestMethod -Uri "http://localhost:9123/exec" -Method POST -ContentType "application/json" -Body '{"command": "cd backend && node scripts/check-schema-alignment.js"}'
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
4. Allowed commands remain restricted to vitest, tsc, npm run, database scripts, etc.  (See table below.)

**Database Analysis Commands:**
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



