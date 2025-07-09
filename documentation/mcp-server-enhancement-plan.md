# MCP Server Enhancement Plan

**Created:** 2025-07-08  
**Status:** APPROVED  
**Phase:** API Development Infrastructure  
**Priority:** High (Enables efficient API testing and development)

## 🎯 **Overview**

Enhance the existing MCP server to provide integrated development server management and API testing capabilities. This eliminates the need for temporary test files and provides a seamless development workflow.

## 🚀 **Goals**

### **Primary Objectives:**
- **Integrated Server Management** - Start/stop backend and frontend dev servers programmatically
- **Efficient API Testing** - Direct HTTP request capabilities without external tools
- **Process Safety** - Proper cleanup and conflict detection
- **Development Workflow** - Streamlined testing and debugging process

### **Secondary Benefits:**
- **No Temporary Files** - Eliminate need for temporary JavaScript test files
- **Real-time Feedback** - Immediate server status and API responses
- **Automated Workflows** - Enable complex multi-step API testing
- **Resource Management** - Proper process lifecycle management

## 📋 **Technical Specifications**

### **New MCP Functions**

#### **Server Management:**
```javascript
startDevServer(project, options?)
// Starts npm run dev for backend or frontend
// Returns: { success, pid, port, status, message }

stopDevServer(project)
// Gracefully stops managed server
// Returns: { success, message }

getServerStatus(project)
// Checks server health and status
// Returns: { running, pid, port, uptime, health, logs }

stopAllServers()
// Emergency cleanup - stops all managed servers
// Returns: { stopped: [projects], errors: [...] }
```

#### **API Testing:**
```javascript
testApiEndpoint(method, url, body?, headers?)
// Makes HTTP requests to running servers
// Returns: { status, headers, body, responseTime }

checkPortStatus(port)
// Checks if port is available or in use
// Returns: { available, inUse, process? }

listManagedServers()
// Lists all servers under MCP management
// Returns: { servers: {...}, count }
```

#### **Logging & Debugging:**
```javascript
getServerLogs(project, lines?)
// Retrieves recent server logs
// Returns: { project, logFile, logs: [...], totalLines }

listLogFiles(project?)
// Lists available log files
// Returns: { files: [...], directory }

getLogFile(filename)
// Gets specific log file content
// Returns: { filename, content, size, modified }
```

### **Project Support**
- **Backend**: Node.js/Express server (`npm run dev` in `/workspace/backend`)
- **Frontend**: Vite development server (`npm run dev` in `/workspace/frontend`)

### **Process Management Strategy**

#### **Server Registry:**
```javascript
const managedServers = {
  "backend": {
    pid: 12345,
    port: 3001,
    startTime: "2025-07-08T15:30:00Z",
    status: "running",
    command: ["npm", "run", "dev"],
    cwd: "/workspace/backend",
    logFile: "logs/backend-2025-07-08-15-30-01.log"
  },
  "frontend": {
    pid: 12346,
    port: 5173,
    // ... similar structure
  }
}
```

#### **Startup Detection Patterns:**
```javascript
const startupPatterns = {
  backend: {
    readyRegex: /Server running on port (\d+)/,
    healthCheck: (port) => `http://localhost:${port}/api/health`,
    expectedResponse: 'json',
    timeout: 5000
  },
  frontend: {
    readyRegex: /Local:\s+http:\/\/localhost:(\d+)\//,
    healthCheck: (port) => `http://localhost:${port}/`,
    expectedResponse: 'html',
    timeout: 5000
  }
};
```

### **Logging Strategy**

#### **File-Based Logging:**
```
mcp-server/logs/
├── backend-2025-07-08-15-30-01.log
├── frontend-2025-07-08-15-30-01.log
├── backend-2025-07-08-16-45-22.log
└── mcp-server.log
```

#### **Log Levels:**
- **INFO**: Normal startup/shutdown messages
- **WARN**: Non-critical issues (port conflicts, slow startup)
- **ERROR**: Critical failures (startup failed, process crashed)
- **DEBUG**: Detailed process information

#### **Log Format:**
```
2025-07-08T15:30:01.123Z [INFO] [BACKEND] Server starting on port 3001
2025-07-08T15:30:02.456Z [INFO] [BACKEND] Database connected successfully
2025-07-08T15:30:03.789Z [INFO] [BACKEND] Server running on port 3001
2025-07-08T15:30:04.012Z [WARN] [BACKEND] Rate limiting enabled
```

### **Error Handling**

#### **Port Conflict Detection:**
```javascript
{
  success: false,
  error: "PORT_CONFLICT",
  message: "Port 3001 is already in use by an external process",
  port: 3001,
  suggestion: "Stop the existing server or check 'lsof -i :3001'"
}
```

#### **Startup Failures:**
```javascript
{
  success: false,
  error: "START_FAILED",
  message: "Backend server failed to start",
  details: "npm run dev exited with code 1",
  logFile: "logs/backend-2025-07-08-15-30-01.log"
}
```

#### **Health Check Failures:**
```javascript
{
  success: false,
  error: "HEALTH_CHECK_FAILED",
  message: "Server started but health check failed",
  port: 3001,
  healthUrl: "http://localhost:3001/api/health",
  response: "Connection refused"
}
```

### **Security Constraints**

#### **Allowed Commands:**
- ✅ `npm run dev` (in workspace subdirectories only)
- ✅ `npm run build` (if needed for testing)
- ✅ `npm run test` (if needed for validation)

#### **Process Restrictions:**
- ✅ Only kill PIDs spawned by MCP server
- ✅ Only operate in `/workspace/backend` and `/workspace/frontend`
- ❌ No arbitrary process killing
- ❌ No commands outside workspace

#### **Network Restrictions:**
- ✅ HTTP requests to localhost only (for API testing)
- ✅ Standard development ports (3000-5173 range)
- ❌ No external network requests

### **Cleanup Strategy**

#### **MCP Server Shutdown:**
```javascript
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function cleanup() {
  console.log('Cleaning up managed servers...');
  for (const [project, server] of Object.entries(managedServers)) {
    if (server.pid) {
      try {
        // Graceful shutdown
        process.kill(server.pid, 'SIGTERM');
        await wait(3000);
        
        // Force kill if still running
        if (isProcessRunning(server.pid)) {
          process.kill(server.pid, 'SIGKILL');
        }
      } catch (err) {
        // Process already terminated
      }
    }
  }
}
```

## 🛠 **Implementation Structure**

### **File Organization:**
```
mcp-server/
├── server.js                    # Main MCP server (existing)
├── lib/
│   ├── processManager.js        # Core process management
│   ├── apiTester.js            # HTTP request handling
│   ├── healthChecker.js        # Server health validation
│   ├── logger.js               # File-based logging
│   └── portChecker.js          # Port availability checking
├── logs/                       # Server log files
│   ├── backend-*.log
│   ├── frontend-*.log
│   └── mcp-server.log
└── config/
    └── serverPatterns.js       # Startup detection patterns
```

### **Core Classes:**

#### **ProcessManager:**
```javascript
class ProcessManager {
  constructor()
  async startServer(project, options = {})
  async stopServer(project)
  async getServerStatus(project)
  async stopAllServers()
  isProcessRunning(pid)
  cleanup()
}
```

#### **ServerLogger:**
```javascript
class ServerLogger {
  constructor(project)
  createLogFile()
  pipe(process)
  tail(lines = 50)
  getLogFiles()
}
```

#### **ApiTester:**
```javascript
class ApiTester {
  async makeRequest(method, url, body, headers)
  async testEndpoint(config)
  formatResponse(response)
}
```

#### **HealthChecker:**
```javascript
class HealthChecker {
  async checkHealth(project, port)
  async waitForReady(project, timeout = 5000)
  parseStartupLogs(logs, pattern)
}
```

## 📊 **Usage Examples**

### **Basic Server Management:**
```javascript
// Start backend server
const result = await startDevServer("backend");
// Returns: { success: true, pid: 12345, port: 3001, status: "starting" }

// Wait for ready and check health
const status = await getServerStatus("backend");
// Returns: { running: true, port: 3001, health: "healthy", uptime: 45 }

// Stop server
await stopDevServer("backend");
```

### **API Testing Workflow:**
```javascript
// 1. Start server
await startDevServer("backend");

// 2. Test endpoints
const teams = await testApiEndpoint("GET", "http://localhost:3001/api/v1/teams");
const newTeam = await testApiEndpoint("POST", "http://localhost:3001/api/v1/teams", {
  name: "Test FC",
  homePrimary: "#FF0000"
});

// 3. Verify creation
const teamsList = await testApiEndpoint("GET", "http://localhost:3001/api/v1/teams");

// 4. Cleanup
await stopDevServer("backend");
```

### **Debugging and Logging:**
```javascript
// Get recent logs
const logs = await getServerLogs("backend", 20);

// List all log files
const logFiles = await listLogFiles("backend");

// Get specific log file
const fullLog = await getLogFile("backend-2025-07-08-15-30-01.log");
```

## 🎯 **Success Criteria**

### **Phase 1: Basic Implementation**
- ✅ Start/stop backend and frontend servers
- ✅ Process tracking and cleanup
- ✅ Basic health checks
- ✅ File-based logging

### **Phase 2: API Testing**
- ✅ HTTP request capabilities
- ✅ Response parsing and formatting
- ✅ Error handling and timeouts
- ✅ Integration with server management

### **Phase 3: Advanced Features**
- ✅ Log file management and retrieval
- ✅ Port conflict detection
- ✅ Comprehensive error handling
- ✅ Performance monitoring

## 🚀 **Integration with API Development**

### **Development Workflow Enhancement:**
1. **Rapid Prototyping** - Quick server start/test/stop cycles
2. **Automated Testing** - Programmatic API validation
3. **Debugging Support** - Easy access to server logs
4. **Resource Management** - Proper cleanup prevents port conflicts

### **API Development Benefits:**
- **Faster Iteration** - No manual server management
- **Consistent Testing** - Standardized API testing approach
- **Better Debugging** - Integrated logging and error reporting
- **Cleaner Development** - No temporary files or external tools needed

## 📅 **Implementation Timeline**

### **Week 1: Core Infrastructure**
- **Days 1-2**: ProcessManager and basic server start/stop
- **Days 3-4**: Health checking and startup detection
- **Day 5**: File-based logging system

### **Week 2: API Testing & Integration**
- **Days 1-2**: HTTP request handling and API testing
- **Days 3-4**: Error handling and edge cases
- **Day 5**: Integration testing and documentation

### **Week 3: Polish & Advanced Features**
- **Days 1-2**: Log management and retrieval
- **Days 3-4**: Performance optimization
- **Day 5**: Final testing and deployment

**Total Estimated Time:** 10-15 development days

---

**Status:** Ready for implementation  
**Dependencies:** Existing MCP server infrastructure  
**Next Step:** Begin Phase 1 implementation with ProcessManager