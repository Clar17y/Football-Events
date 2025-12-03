# Grassroots Dev Server - MCP Server v3.0

A proper MCP (Model Context Protocol) server for Claude Code that manages development servers, handles logging, and provides utilities that Claude Code can't do natively.

## Why This Exists

Claude Code can run bash commands, but it has limitations with long-running processes:

| Problem | Solution |
|---------|----------|
| `npm run dev` blocks Claude Code | `start_dev_server` runs it in background |
| No way to track running servers | `list_managed_servers` shows all |
| Can't read server output after starting | `get_recent_logs`, `get_server_logs` |
| No graceful shutdown | `stop_dev_server` handles cleanup |
| Port conflicts are confusing | `check_port_status`, `force_kill_port` |

## Installation

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Configure Claude Code

**Option A: Project-level config (recommended)**

Copy `.mcp.json` to your project root (not inside mcp-server, but the parent directory):

```json
{
  "mcpServers": {
    "grassroots-dev": {
      "command": "node",
      "args": ["./mcp-server/server.js"]
    }
  }
}
```

**Option B: Add via CLI**

```bash
claude mcp add-json grassroots-dev '{"command":"node","args":["./mcp-server/server.js"]}'
```

**Option C: Global config (~/.claude.json)**

```json
{
  "mcpServers": {
    "grassroots-dev": {
      "command": "node",
      "args": ["/absolute/path/to/your/project/mcp-server/server.js"]
    }
  }
}
```

### 3. Restart Claude Code

After adding the config, restart Claude Code. You can verify the connection by running `/mcp` in Claude Code.

## Available Tools

### Server Management

| Tool | Description |
|------|-------------|
| `start_dev_server` | Start backend or frontend in background |
| `stop_dev_server` | Stop a running dev server gracefully |
| `get_server_status` | Check if server is running, health, uptime |
| `list_managed_servers` | List all managed servers and their status |
| `stop_all_servers` | Stop all running servers at once |

### Port Management

| Tool | Description |
|------|-------------|
| `check_port_status` | Check if a port is available or in use |
| `force_kill_port` | Kill whatever process is using a port |

### Logging

| Tool | Description |
|------|-------------|
| `get_recent_logs` | Get recent log entries from memory (fast) |
| `get_server_logs` | Get logs from file with optional filtering |
| `search_logs` | Search logs using regex patterns |
| `list_log_files` | List all available log files |
| `get_log_file` | Get contents of a specific log file |

## Usage Examples

### Starting a dev server

```
Claude, start the backend server
```

Claude will use `start_dev_server` with `project: "backend"`.

### Checking server status

```
Is the frontend running?
```

Claude will use `get_server_status` with `project: "frontend"`.

### Debugging issues

```
Show me recent error logs from the backend
```

Claude will use `get_recent_logs` with `project: "backend"` and `level: "ERROR"`.

### Restarting after changes

```
Restart the backend server
```

Claude will use `stop_dev_server` then `start_dev_server`.

### Dealing with port conflicts

```
Something is using port 3001, can you kill it?
```

Claude will use `force_kill_port` with `port: 3001`.

## Testing the Server

You can test the MCP server using the official MCP inspector:

```bash
npm run inspect
```

This opens an interactive UI where you can test each tool.

## Project Configuration

The server is pre-configured for these projects:

| Project | Port | Health Check | Ready Pattern |
|---------|------|--------------|---------------|
| backend | 3001 | `/api/health` | "Server running on port" |
| frontend | 5173 | `/` | "Local: http://localhost:" |

To modify these (or add more projects), edit `lib/processManager.js` in the `getProjectConfig()` method:

```javascript
getProjectConfig(project) {
  const configs = {
    backend: {
      port: 3001,
      timeout: 30000,
      readyPattern: /Server running on port (\d+)/,
      healthPath: '/api/health',
      env: {}
    },
    frontend: {
      port: 5173,
      timeout: 30000,
      readyPattern: /Local:\s+http:\/\/localhost:(\d+)\//,
      healthPath: '/',
      env: {}
    }
    // Add more projects here
  };
  return configs[project] || null;
}
```

## What Was Removed (vs v2.x)

The old Express-based server had features that Claude Code can do natively:

| Removed Feature | Why | Alternative |
|-----------------|-----|-------------|
| `/exec` endpoint | Claude Code runs bash directly | Just ask Claude to run commands |
| `testApiEndpoint` | Claude Code can use curl | `curl http://localhost:3001/api/...` |
| `testApiWorkflow` | Claude can orchestrate | Sequential curl commands |
| `testCrudEndpoints` | Claude can do this manually | Manual API testing |
| Express server | MCP uses stdio | Native MCP SDK |

## Troubleshooting

### Server not showing up in Claude Code

1. Ensure `.mcp.json` is in the project root (not inside mcp-server)
2. Restart Claude Code completely
3. Run `/mcp` to see connected servers
4. Check for errors: `claude mcp get grassroots-dev`

### "Server not found" errors when getting logs

The server must be running before you can get its logs:

```
start_dev_server with project: "backend"
```

### Port already in use

```
force_kill_port with port: 3001
```

Then try starting the server again.

### Server starts but shows unhealthy

Check if your backend has a health endpoint at `/api/health`. If not, update `getProjectConfig()` in `processManager.js`.

## File Structure

```
mcp-server/
├── server.js              # MCP server entry point (stdio transport)
├── package.json           # Dependencies (@modelcontextprotocol/sdk + zod)
├── .mcp.json              # Sample Claude Code config (copy to project root)
├── pids.json              # Persisted process IDs
├── lib/
│   ├── processManager.js  # Process management (start/stop/status)
│   └── enhancedLogger.js  # Structured logging system
├── logs/                  # Log files directory (auto-created)
└── README.md              # This file
```

## Requirements

- Node.js >= 18.0.0
- npm

## License

Part of the Grassroots PWA project.
